import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { USE_MOCK, ENABLE_INTERNAL_MONOLOGUE } from '../context/AppConfig'
import { MOCK_MESSAGES } from '../data/mockData'
import { sendUserMessage, sendBotMessage, subscribeToUserMessages } from '../firebase/firestore'
import { callGemini } from '../agent/gemini'
import {
  buildSystemPrompt,
  buildMonologuePrompt,
  isComplexRequest,
  parseEscalation,
  parseMonologue,
} from '../agent/buildPrompt'

export function useMessages() {
  const { user, agent } = useAuth()
  const [messages,   setMessages]   = useState([])
  const [isTyping,   setIsTyping]   = useState(false)
  const [isSending,  setIsSending]  = useState(false)
  // historyRef stores recent turns for conversation context (not persisted to Firestore)
  const historyRef = useRef([])

  // ── Load messages ──────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK) {
      setMessages(MOCK_MESSAGES.filter(m => m.type !== 'bot-to-bot'))
      return
    }
    if (!user?.uid) return
    const unsub = subscribeToUserMessages(user.uid, (msgs) => {
      const personal = msgs.filter(m => m.type !== 'bot-to-bot')
      setMessages(personal)
      // Re-hydrate historyRef from loaded messages (last 10 turns max)
      historyRef.current = personal.slice(-10).map(m => ({
        role:    m.senderType === 'human' ? 'user' : 'assistant',
        content: m.content,
      }))
    })
    return unsub
  }, [user?.uid])

  // ── Send a message & get agent response ────────────────────
  const sendMessage = async (content) => {
    if (!content.trim() || isSending) return
    setIsSending(true)

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

    // Persist user message to Firestore (if not mock)
    if (!USE_MOCK) {
      await sendUserMessage(user.uid, content, user.displayName).catch(console.error)
    }

    try {
      // ── Build prompt ──────────────────────────────────────
      const systemPrompt = buildSystemPrompt(user, agent)
      const complex      = isComplexRequest(content)
      const fullPrompt   = (complex && ENABLE_INTERNAL_MONOLOGUE)
        ? systemPrompt + '\n\n' + buildMonologuePrompt()
        : systemPrompt

      let responseText

      if (USE_MOCK) {
        // Still use mock in mock mode
        responseText = generateMockResponse(content)
      } else {
        responseText = await callGemini({
          systemPrompt: fullPrompt,
          userMessage:  content,
          history:      historyRef.current,
        })
      }

      // ── Parse escalation guard ────────────────────────────
      const { isEscalation, topic } = parseEscalation(responseText)
      if (isEscalation) {
        const escalationMsg = {
          id:         `esc-${Date.now()}`,
          type:       'escalation',
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
        type:        'bot-response',
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
        { role: 'user',      content },
        { role: 'assistant', content: parsed.finalAnswer },
      ].slice(-20) // keep last 20 turns

      // Persist bot response to Firestore (if not mock)
      if (!USE_MOCK) {
        await sendBotMessage(user.uid, parsed.finalAnswer, agent?.displayName).catch(console.error)
      }

    } catch (err) {
      console.error('[Borg Agent] Gemini call failed:', err)
      const errorMsg = {
        id:         `err-${Date.now()}`,
        type:       'bot-response',
        senderName:  agent?.displayName ?? 'Your Agent',
        senderType: 'agent',
        content:    `I encountered an error processing your request. Please try again.\n\n_Technical: ${err.message}_`,
        timestamp:  new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsTyping(false)
    }
  }

  return { messages, isTyping, isSending, sendMessage }
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
