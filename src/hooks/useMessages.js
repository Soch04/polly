/**
 * useMessages.js
 *
 * Core messaging hook — orchestrates the full agent response pipeline:
 *
 * 1. Query classification (classifyQuery) — determines intent and optimal RAG params
 *    CONVERSATIONAL → skip Pinecone entirely
 *    ANALYTICAL     → topK=8 for broader source coverage
 *    PROCEDURAL     → topK=4, very low temperature for step accuracy
 *    FACTUAL        → topK=5, standard settings
 *
 * 2. RAG retrieval (queryKnowledgeBase) — org-scoped Pinecone search with
 *    department filtering and is_approved:true server-side metadata enforcement
 *
 * 3. Citation deduplication (buildCitationBlock) — deduplicates chunks from the
 *    same document by docId, scores by cosine similarity, injects numbered citation
 *    index so Gemini can reference documents by [N] notation
 *
 * 4. Gemini response (callGemini) — multi-turn with exponential backoff retry,
 *    classification-tuned temperature, and RAG context in system prompt
 *
 * 5. Response parsing — escalation token detection, monologue section extraction,
 *    MESSAGE_AGENT routing for inter-agent message dispatch
 *
 * 6. Persistence — user + bot messages written to Firestore, history re-hydrated
 *    from Firestore on load for cross-session conversation continuity
 */

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { USE_MOCK, ENABLE_INTERNAL_MONOLOGUE } from '../context/AppConfig'
import { MOCK_MESSAGES } from '../data/mockData'
import { useApp } from '../context/AppContext'
import {
  sendUserMessage, sendBotMessage, subscribeToUserMessages,
  getOrgDirectory, clearUserMessages, sendMention,
} from '../firebase/firestore'
import { callGemini } from '../agent/gemini'
import {
  buildSystemPrompt,
  buildMonologuePrompt,
  buildCitationBlock,
  isComplexRequest,
  parseEscalation,
  parseMonologue,
  parseMessageAgentCommand,
} from '../agent/buildPrompt'
import { queryKnowledgeBase } from '../lib/rag'
import { classifyQuery } from '../agent/queryClassifier'
import { rerankResults } from '../lib/ragReranker'
import { generateHypotheticalDoc, isHyDEBeneficial } from '../lib/hyde'
import { shouldSummarize, summarizeHistory } from '../lib/conversationMemory'

export function useMessages() {
  const { user, agent } = useAuth()
  const { addToast } = useApp()
  const [messages,   setMessages]   = useState([])
  const [isTyping,   setIsTyping]   = useState(false)
  const [isSending,  setIsSending]  = useState(false)
  const historyRef = useRef([])

  // ── Subscribe to messages from Firestore (with cross-session history) ────────
  useEffect(() => {
    if (USE_MOCK) {
      setMessages(MOCK_MESSAGES.filter(m => m.type !== 'bot-to-bot'))
      return
    }
    if (!user?.uid) return

    const unsub = subscribeToUserMessages(user.uid, (msgs) => {
      const personal = msgs.filter(m => m.type !== 'bot-to-bot')
      setMessages(personal)

      // Re-hydrate conversation history from Firestore for cross-session continuity.
      // Slice to last 20 turns (40 messages) to stay within Gemini context limits.
      historyRef.current = personal
        .filter(m => m.type === 'user' || m.type === 'bot-response')
        .slice(-20)
        .map(m => ({
          role:    m.senderType === 'human' ? 'user' : 'assistant',
          content: m.content,
        }))
    })
    return unsub
  }, [user?.uid])

  // ── Send a message through the full agent pipeline ────────────────────────────
  const sendMessage = async (content, mentions = []) => {
    if (!content.trim() || isSending) return
    setIsSending(true)
    let messageCitations = []

    // Optimistic UI update
    const userMsg = {
      id:         `tmp-${Date.now()}`,
      type:       'user',
      senderName:  user?.displayName ?? 'You',
      senderType: 'human',
      content:    content.trim(),
      timestamp:  new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsTyping(true)
    setIsSending(false)

    // Persist user message
    if (!USE_MOCK) {
      await sendUserMessage(user.uid, content, user.displayName).catch(console.error)
    }

    // ── Step 1: Classify query intent ──────────────────────────────────────────
    const intent = classifyQuery(content)

    let directory  = []
    let kbContext  = ''

    if (!USE_MOCK) {
      directory = await getOrgDirectory(user?.orgId).catch(() => [])

      // ── Step 2: RAG retrieval (skip if CONVERSATIONAL) ──────────────────────
      if (user?.orgId && !intent.skipRAG) {
        try {
          const filters = { is_approved: true }
          if (user.department && user.department !== 'Unassigned') {
            filters.department = user.department
          }

          // ── Step 2a: HyDE — generate hypothetical document for embedding ───────────
          // For FACTUAL and PROCEDURAL queries, embed a Gemini-generated hypothetical
          // answer document instead of the raw question. Closes the vector space gap
          // between question syntax and document syntax (Gao et al. 2022).
          const queryForEmbedding = isHyDEBeneficial(intent.type)
            ? await generateHypotheticalDoc(content, '', user?.department)
            : content

          // ── Step 2b: Pinecone retrieval with intent-optimized topK ─────────────
          const rawResults = await queryKnowledgeBase(
            user.orgId,
            queryForEmbedding,
            filters,
            intent.topK
          )

          if (rawResults.length > 0) {
            // ── Step 3a: LLM re-ranking — Gemini scores each chunk 0-10 ─────
            // Filters out topically similar but non-answering chunks that pass
            // embedding similarity but fail query-specific relevance judgment
            const reranked = await rerankResults(content, rawResults)

            // ── Step 3b: Deduplicate + confidence-score citations ────────────
            const { block, citations } = buildCitationBlock(reranked)
            kbContext        = block
            messageCitations = citations.map(c => ({ id: c.id, title: c.title }))
          }
        } catch (kbErr) {
          console.warn('[Borg] Knowledge base query failed:', kbErr)
        }
      }
    }

    try {
      // ── Step 4: Build system prompt + call Gemini ────────────────────
      const systemPrompt = buildSystemPrompt(user, agent, kbContext, directory)
      const complex      = isComplexRequest(content)
      const fullPrompt   = (complex && ENABLE_INTERNAL_MONOLOGUE)
        ? systemPrompt + '\n\n' + buildMonologuePrompt()
        : systemPrompt

      // Compress history if it has grown past the summarization threshold.
      // Replaces oldest turns with a structured [KEY DECISIONS]/[REFERENCED DOCUMENTS]/
      // [CONTEXT] summary to prevent silent context loss in long sessions.
      const activeHistory = shouldSummarize(historyRef.current)
        ? await summarizeHistory(historyRef.current)
        : historyRef.current

      let responseText

      if (USE_MOCK) {
        responseText = generateMockResponse(content)
      } else {
        responseText = await callGemini({
          systemPrompt: fullPrompt,
          userMessage:  content,
          history:      activeHistory,
          temperature:  intent.temperature,
        })
      }

      // ── Step 5a: Check for escalation token ────────────────────────────────
      const { isEscalation, topic } = parseEscalation(responseText)
      if (isEscalation) {
        const escalationMsg = {
          id:         `esc-${Date.now()}`,
          type:       'escalation',
          senderName:  agent?.displayName ?? 'Your Agent',
          senderType: 'agent',
          content:    `I don't have enough information to answer confidently about: **${topic}**.\n\nCould you provide more context, or should I reach out to the relevant team member?`,
          topic,
          timestamp:  new Date(),
        }
        setMessages(prev => [...prev, escalationMsg])
        setIsTyping(false)
        return
      }

      // ── Step 5b: Check for MESSAGE_AGENT routing command ───────────────────
      // Gemini can output [MESSAGE_AGENT: email] message body to trigger
      // an inter-agent interaction request to a colleague's agent
      const { isMessageRequest, targetEmail, messageBody } = parseMessageAgentCommand(responseText)
      if (isMessageRequest && targetEmail && !USE_MOCK) {
        try {
          await sendMention({
            senderUid:   user.uid,
            senderName:  user.displayName,
            senderEmail: user.email,
            recipientEmail: targetEmail,
            body: messageBody,
          })

          const routedMsg = {
            id:         `routed-${Date.now()}`,
            type:       'bot-response',
            senderName:  agent?.displayName ?? 'Your Agent',
            senderType: 'agent',
            content:    `I've sent a message to **${targetEmail}**'s agent on your behalf:\n\n> "${messageBody}"\n\nThey'll receive it in their inbox and their agent will respond autonomously or escalate to them.`,
            timestamp:  new Date(),
            citations:  [],
          }
          setMessages(prev => [...prev, routedMsg])
          if (!USE_MOCK) {
            await sendBotMessage(user.uid, routedMsg.content, agent?.displayName).catch(console.error)
          }
          addToast(`Message dispatched to ${targetEmail}'s agent`, 'success')
        } catch (routeErr) {
          console.error('[Borg] MESSAGE_AGENT routing failed:', routeErr)
          addToast('Failed to route message to agent', 'error')
        }
        setIsTyping(false)
        return
      }

      // ── Step 5c: Parse monologue sections ──────────────────────────────────
      const parsed = (complex && ENABLE_INTERNAL_MONOLOGUE)
        ? parseMonologue(responseText)
        : { finalAnswer: responseText, strategic: null, execution: null }

      const botMsg = {
        id:          `bot-${Date.now()}`,
        type:        'bot-response',
        senderName:   agent?.displayName ?? 'Your Agent',
        senderType:  'agent',
        content:      parsed.finalAnswer,
        monologue:    (parsed.strategic || parsed.execution) ? {
          strategic: parsed.strategic,
          execution: parsed.execution,
        } : null,
        timestamp:   new Date(),
        citations:   messageCitations,
        queryIntent: intent.type,  // Stored for UI/debug transparency
      }

      setMessages(prev => [...prev, botMsg])

      // Update history for next turn (capped at 20 exchanges)
      historyRef.current = [
        ...historyRef.current,
        { role: 'user',      content },
        { role: 'assistant', content: parsed.finalAnswer },
      ].slice(-20)

      // Persist bot response
      if (!USE_MOCK) {
        await sendBotMessage(user.uid, parsed.finalAnswer, agent?.displayName).catch(console.error)
      }

    } catch (err) {
      console.error('[Borg Agent] Pipeline failed:', err)
      const errorMsg = {
        id:         `err-${Date.now()}`,
        type:       'bot-response',
        senderName:  agent?.displayName ?? 'Your Agent',
        senderType: 'agent',
        content:    'I encountered an error processing your request. Please try again.',
        timestamp:  new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsTyping(false)
    }
  }

  // ── Clear all messages for this user ─────────────────────────────────────────
  const handleClearChat = async () => {
    try {
      if (!USE_MOCK && user?.uid) {
        await clearUserMessages(user.uid)
      }
      setMessages([])
      historyRef.current = []
      addToast('Chat cleared', 'success')
    } catch (err) {
      console.error('[Borg] clearUserMessages failed:', err)
      addToast('Failed to clear chat', 'error')
    }
  }

  return { messages, isTyping, isSending, sendMessage, clearChat: handleClearChat }
}

// ── Fallback mock responses ───────────────────────────────────────────────────

function generateMockResponse(userInput) {
  const intent = classifyQuery(userInput)
  if (intent.skipRAG) return "Hello! I'm your Borg agent. Ask me anything about your organization's knowledge base."
  if (intent.type === 'PROCEDURAL') return 'Here are the step-by-step instructions based on your Organization Knowledge Base: (1) Navigate to Settings → Requests → New. (2) Fill in the required fields. (3) Submit for admin review.'
  if (intent.type === 'ANALYTICAL') return 'Comparing the relevant documents from your Knowledge Base: Based on the Q1 target (12%) vs Q2 target (18%), the team is tracking 6 percentage points higher in the second quarter.'
  return "I'm querying your Organization Knowledge Base. Based on the approved documents, here's what I found relevant to your question."
}
