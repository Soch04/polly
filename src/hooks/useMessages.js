/**
 * hooks/useMessages.js
 *
 * Manages the personal (user ↔ bot) message stream.
 *
 * Returns: { messages, loading, error, isTyping, isSending, sendMessage }
 * - messages: filtered, sorted array ready to render (no bot-to-bot)
 * - loading:  true while the initial Firestore snapshot is pending
 * - error:    string | null
 * - isTyping: true while waiting for Gemini response
 * - isSending: true while Firestore write is in flight (double-submit guard)
 * - sendMessage(content, mentions): dispatches a message + gets agent response
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEscalation } from '../context/EscalationContext'
import { USE_MOCK, ENABLE_INTERNAL_MONOLOGUE } from '../context/AppConfig'
import { MOCK_MESSAGES } from '../data/mockData'
import {
  sendUserMessage,
  sendBotMessage,
  subscribeToUserMessages,
  logBotToBotMessage,
  setConversationActive,
} from '../firebase/firestore'
import { MESSAGE_TYPES, MAX_MESSAGE_LENGTH } from '../constants'
import { callGemini } from '../agent/gemini'
import { dispatchAgentMessages } from '../agent/agentDispatcher'
import { sanitizeAgentOutput } from '../agent/sanitize'
import {
  buildSystemPrompt,
  buildMonologuePrompt,
  isComplexRequest,
  parseEscalation,
  parseMonologue,
} from '../agent/buildPrompt'

export function useMessages() {
  const { user, agent }                  = useAuth()
  const { escalation, clearEscalation }  = useEscalation()
  const [messages,   setMessages]   = useState([])
  const [loading,    setLoading]    = useState(!USE_MOCK)
  const [error,      setError]      = useState(null)
  const [isTyping,   setIsTyping]   = useState(false)
  const [isSending,  setIsSending]  = useState(false)
  const historyRef = useRef([])

  // ── Load messages ──────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK) {
      // Filter out bot-to-bot messages — personal chat only shows user/bot-response
      setMessages(MOCK_MESSAGES.filter(m => m.type !== MESSAGE_TYPES.BOT_TO_BOT))
      setLoading(false)
      return
    }
    if (!user?.uid) return

    setLoading(true)
    const unsub = subscribeToUserMessages(user.uid, (msgs) => {
      const personal = msgs.filter(m => m.type !== MESSAGE_TYPES.BOT_TO_BOT)
      setMessages(personal)
      setLoading(false)
      // Re-hydrate historyRef from loaded messages (last N turns per CONVERSATION_HISTORY_WINDOW)
      historyRef.current = personal.slice(-10).map(m => ({
        role:    m.senderType === 'human' ? 'user' : 'assistant',
        content: m.content,
      }))
    })
    return unsub
  }, [user?.uid])

  // ── Send a message & get agent response ────────────────────
  // mentions: Array<{ uid, displayName, email, department }>
  const sendMessage = useCallback(async (content, mentions = []) => {
    if (!content.trim() || isSending) return

    // Trim + length cap
    const sanitizedContent = content.trim().slice(0, MAX_MESSAGE_LENGTH)

    setIsSending(true)
    setError(null)

    const userMsg = {
      id:                `tmp-${Date.now()}`,
      type:              MESSAGE_TYPES.USER,
      senderName:        user?.displayName ?? 'You',
      senderType:        'human',
      content:           sanitizedContent,
      target_user_emails: mentions.map(m => m.email),
      mentions,
      timestamp:         new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setIsTyping(true)
    setIsSending(false)

    // Persist user message to Firestore
    if (!USE_MOCK) {
      await sendUserMessage(user.uid, sanitizedContent, user.displayName).catch(err => {
        setError(err.message)
      })
    }

    // ── Loop Closure: relay user's answer back to B2B thread ──
    // If there's an active escalation, the user's message IS the answer.
    const activeEscalation = escalation
    if (!USE_MOCK && activeEscalation?.convId) {
      const myAgentName = agent?.displayName ?? `${user.displayName}'s Agent`
      const relayContent = sanitizeAgentOutput(
        `${myAgentName} relaying answer from ${user.displayName}: ${sanitizedContent}`
      )
      logBotToBotMessage(
        user.uid,
        activeEscalation.incomingMsg.senderId,
        myAgentName,
        activeEscalation.senderAgentName,
        relayContent,
        agent?.department ?? 'General',
        activeEscalation.convId,
      ).then(() => {
        setConversationActive(activeEscalation.convId, false).catch(() => {})
      }).catch(err => setError(err.message))
      clearEscalation()
    }

    try {
      // ── Build prompt ──────────────────────────────────────
      const systemPrompt = buildSystemPrompt(user, agent, '', mentions)
      const complex      = isComplexRequest(sanitizedContent)
      const fullPrompt   = (complex && ENABLE_INTERNAL_MONOLOGUE)
        ? systemPrompt + '\n\n' + buildMonologuePrompt()
        : systemPrompt

      let responseText

      if (USE_MOCK) {
        responseText = generateMockResponse(sanitizedContent)
      } else {
        responseText = await callGemini({
          systemPrompt: fullPrompt,
          userMessage:  sanitizedContent,
          history:      historyRef.current,
        })
      }

      // ── Parse escalation guard ────────────────────────────
      const { isEscalation, topic } = parseEscalation(responseText)
      if (isEscalation) {
        const escalationMsg = {
          id:         `esc-${Date.now()}`,
          type:       MESSAGE_TYPES.ESCALATION,
          senderName:  agent?.displayName ?? 'Your Agent',
          senderType: 'agent',
          content:    `I don't have enough information to answer confidently about: **${topic}**.\n\nCould you provide more context, or should I reach out to the relevant team's agent?`,
          topic,
          timestamp:  new Date(),
        }
        setMessages(prev => [...prev, escalationMsg])
        setIsTyping(false)
        return
      }

      // ── Parse monologue sections (if active) ──────────────
      const parsed = (complex && ENABLE_INTERNAL_MONOLOGUE)
        ? parseMonologue(responseText)
        : { finalAnswer: responseText, strategic: null, execution: null }

      const botMsg = {
        id:          `bot-${Date.now()}`,
        type:        MESSAGE_TYPES.BOT_RESPONSE,
        senderName:   agent?.displayName ?? 'Your Agent',
        senderType:  'agent',
        content:      parsed.finalAnswer,
        monologue:    (parsed.strategic || parsed.execution) ? {
          strategic: parsed.strategic,
          execution: parsed.execution,
        } : null,
        timestamp:   new Date(),
      }

      setMessages(prev => [...prev, botMsg])

      // Update in-memory history for next turn
      historyRef.current = [
        ...historyRef.current,
        { role: 'user',      content: sanitizedContent },
        { role: 'assistant', content: parsed.finalAnswer },
      ].slice(-20)

      // Persist bot response to Firestore
      if (!USE_MOCK) {
        await sendBotMessage(user.uid, parsed.finalAnswer, agent?.displayName).catch(err => {
          setError(err.message)
        })
      }

      // Fire-and-forget B2B dispatch if @mentions present
      if (mentions.length > 0) {
        const names      = mentions.map(m => m.displayName).join(', ')
        const dispatchId = `dispatch-${Date.now()}`

        const dispatchingMsg = {
          id:         dispatchId,
          type:       MESSAGE_TYPES.SYSTEM,
          senderType: 'system',
          content:    `📡 Initiating agent-to-agent contact with **${names}'s Agent**…`,
          timestamp:  new Date(),
        }
        setMessages(prev => [...prev, dispatchingMsg])

        if (!USE_MOCK) {
          dispatchAgentMessages({ user, agent, userMessage: sanitizedContent, mentions })
            .then(() => {
              setMessages(prev => prev.map(m =>
                m.id === dispatchId
                  ? { ...m, content: `✅ Message sent to **${names}'s Agent** — open **Agent Hub** to monitor the conversation.` }
                  : m
              ))
            })
            .catch(err => {
              setMessages(prev => prev.map(m =>
                m.id === dispatchId
                  ? { ...m, content: `⚠️ Could not reach **${names}'s Agent**: ${err.message ?? 'Unknown error'}` }
                  : m
              ))
            })
        } else {
          // Mock mode — show success after brief delay
          setTimeout(() => {
            setMessages(prev => prev.map(m =>
              m.id === dispatchId
                ? { ...m, content: `✅ Message sent to **${names}'s Agent** — open **Agent Hub** to monitor the conversation.` }
                : m
            ))
          }, 1200)
        }
      }

    } catch (err) {
      const errorMsg = {
        id:         `err-${Date.now()}`,
        type:       MESSAGE_TYPES.BOT_RESPONSE,
        senderName:  agent?.displayName ?? 'Your Agent',
        senderType: 'agent',
        content:    `I encountered an error processing your request. Please try again.\n\n_Technical: ${err.message}_`,
        timestamp:  new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
      setError(err.message)
    } finally {
      setIsTyping(false)
    }
  }, [user, agent, escalation, clearEscalation, isSending])

  return { messages, loading, error, isTyping, isSending, sendMessage }
}

// ── Fallback mock response (used when VITE_USE_MOCK=true) ────

function generateMockResponse(userInput) {
  const lower = userInput.toLowerCase()
  if (lower.includes('schedule') || lower.includes('meeting')) {
    return "I've sent handshake requests to the relevant agents to find an open slot. I'll confirm once they respond — usually within 30 seconds."
  }
  if (lower.includes('policy') || lower.includes('hr') || lower.includes('handbook')) {
    return "Querying the Org Knowledge Base… Found 2 matching documents. Synthesizing the relevant sections now."
  }
  if (lower.includes('status') || lower.includes('update') || lower.includes('sprint')) {
    return "Pulling status from the inter-agent network. This may trigger a few agent-to-agent requests — you'll see them in the Agent Hub."
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return "Hello! I'm your Borg agent, ready to coordinate on your behalf. What do you need handled today?"
  }
  return "Understood. I'm processing your request by querying the Knowledge Base and checking agent availability. I'll report back with a consolidated summary."
}
