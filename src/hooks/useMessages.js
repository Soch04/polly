import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEscalation } from '../context/EscalationContext'
import { USE_MOCK, ENABLE_INTERNAL_MONOLOGUE } from '../context/AppConfig'
import { MOCK_MESSAGES } from '../data/mockData'
import { sendUserMessage, sendBotMessage, subscribeToUserMessages, logBotToBotMessage, setConversationActive } from '../firebase/firestore'
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
  const [isTyping,   setIsTyping]   = useState(false)
  const [isSending,  setIsSending]  = useState(false)
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
  // mentions: Array<{ uid, displayName, email, department }>
  const sendMessage = async (content, mentions = []) => {
    if (!content.trim() || isSending) return
    setIsSending(true)

    const userMsg = {
      id:                `tmp-${Date.now()}`,
      type:              'user',
      senderName:         user?.displayName ?? 'You',
      senderType:        'human',
      content:           content.trim(),
      // Updated message schema — target_user_emails carries mention routing data
      target_user_emails: mentions.map(m => m.email),
      mentions,
      timestamp:         new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setIsTyping(true)
    setIsSending(false)

    // Persist user message to Firestore (if not mock)
    if (!USE_MOCK) {
      await sendUserMessage(user.uid, content, user.displayName).catch(console.error)
    }

    // ── Loop Closure: relay user's answer back to B2B thread ──
    // If there's an active escalation, the user's message IS the answer.
    // Relay it to the requester's agent before processing the personal response.
    const activeEscalation = escalation
    if (!USE_MOCK && activeEscalation?.convId) {
      const myAgentName = agent?.displayName ?? `${user.displayName}'s Agent`
      const relayContent = sanitizeAgentOutput(
        `${myAgentName} relaying answer from ${user.displayName}: ${content.trim()}`
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
        console.log('[useMessages] Escalation relay sent ✅')
      }).catch(err => console.error('[useMessages] Relay failed:', err.message))
      clearEscalation()
    }

    try {
      // ── Build prompt ──────────────────────────────────────
      const systemPrompt = buildSystemPrompt(user, agent, '', mentions)
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
      ].slice(-20)

      // Persist bot response to Firestore (if not mock)
      if (!USE_MOCK) {
        await sendBotMessage(user.uid, parsed.finalAnswer, agent?.displayName).catch(console.error)
      }

      // Fire-and-forget B2B dispatch if @mentions present
      if (mentions.length > 0) {
        const names = mentions.map(m => m.displayName).join(', ')
        const dispatchId = `dispatch-${Date.now()}`

        // Immediately show a "dispatching…" system message
        const dispatchingMsg = {
          id:         dispatchId,
          type:       'system',
          senderType: 'system',
          content:    `📡 Initiating agent-to-agent contact with **${names}'s Agent**…`,
          timestamp:  new Date(),
        }
        setMessages(prev => [...prev, dispatchingMsg])

        if (!USE_MOCK) {
          dispatchAgentMessages({ user, agent, userMessage: content, mentions })
            .then(() => {
              // Replace dispatching msg with success confirmation
              setMessages(prev => prev.map(m =>
                m.id === dispatchId
                  ? {
                      ...m,
                      content: `✅ Message sent to **${names}'s Agent** — open **Agent Hub** to monitor the conversation.`,
                    }
                  : m
              ))
            })
            .catch(err => {
              console.error('[B2B Dispatch]', err)
              setMessages(prev => prev.map(m =>
                m.id === dispatchId
                  ? {
                      ...m,
                      content: `⚠️ Could not reach **${names}'s Agent**: ${err.message ?? 'Unknown error'}`,
                    }
                  : m
              ))
            })
        } else {
          // Mock mode — just show success after a brief delay
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
