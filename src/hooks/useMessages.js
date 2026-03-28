import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { MOCK_MESSAGES } from '../data/mockData'
import { sendUserMessage, sendBotMessage, subscribeToUserMessages } from '../firebase/firestore'

// Simulated bot response delay (ms)
const BOT_THINKING_MS = 1800

export function useMessages() {
  const { user, agent, USE_MOCK } = useAuth()
  const [messages,   setMessages]   = useState([])
  const [isTyping,   setIsTyping]   = useState(false)
  const [isSending,  setIsSending]  = useState(false)

  // Load initial messages
  useEffect(() => {
    if (USE_MOCK) {
      // Only show user ↔ bot messages (not bot-to-bot) in the personal feed
      setMessages(MOCK_MESSAGES.filter(m => m.type !== 'bot-to-bot'))
      return
    }

    if (!user?.uid) return
    const unsub = subscribeToUserMessages(user.uid, (msgs) => {
      setMessages(msgs.filter(m => m.type !== 'bot-to-bot'))
    })
    return unsub
  }, [user?.uid, USE_MOCK])

  /**
   * Send a user message and simulate a bot response.
   */
  const sendMessage = async (content) => {
    if (!content.trim() || isSending) return
    setIsSending(true)

    const userMsg = {
      id:          `tmp-${Date.now()}`,
      type:        'user',
      senderName:  user.displayName,
      senderType:  'human',
      content:     content.trim(),
      timestamp:   new Date(),
    }

    if (USE_MOCK) {
      setMessages(prev => [...prev, userMsg])
      setIsTyping(true)
      setIsSending(false)

      // Simulate bot thinking
      setTimeout(() => {
        const botMsg = {
          id:          `bot-${Date.now()}`,
          type:        'bot-response',
          senderName:  agent?.displayName ?? 'Your Agent',
          senderType:  'agent',
          content:     generateMockResponse(content),
          timestamp:   new Date(),
        }
        setMessages(prev => [...prev, botMsg])
        setIsTyping(false)
      }, BOT_THINKING_MS)
    } else {
      try {
        await sendUserMessage(user.uid, content, user.displayName)
        setIsTyping(true)
        // In production, bot response comes from a Cloud Function triggered by Firestore write
        // For scaffold, we simulate it here
        setTimeout(async () => {
          const response = generateMockResponse(content)
          await sendBotMessage(user.uid, response, agent?.displayName)
          setIsTyping(false)
          setIsSending(false)
        }, BOT_THINKING_MS)
      } catch (err) {
        console.error('Failed to send message:', err)
        setIsSending(false)
        setIsTyping(false)
      }
    }
  }

  return { messages, isTyping, isSending, sendMessage }
}

// ── Mock response simulator ─────────────────────────────────
// Replace with actual Gemini API call in Phase 2

function generateMockResponse(userInput) {
  const lower = userInput.toLowerCase()

  if (lower.includes('schedule') || lower.includes('meeting') || lower.includes('time')) {
    return 'Initiating scheduling negotiation with relevant agents...\n\nI\'ve sent handshake requests to the agents of all required attendees. I\'ll confirm a slot once I receive responses — typically within 30 seconds. Want me to set any constraints on the meeting time?'
  }
  if (lower.includes('policy') || lower.includes('hr') || lower.includes('handbook')) {
    return 'Querying Org Knowledge Base (Tier 2 — Global)...\n\nRetrieved 2 matching documents from the Knowledge Base. I\'ll synthesize the relevant sections and return a summary. One moment...'
  }
  if (lower.includes('status') || lower.includes('update') || lower.includes('sprint')) {
    return 'Pulling real-time status from the Inter-Agent Intelligence layer (Tier 4)...\n\nI\'ve queried the active agents in your department. Compiling their latest status reports now. This may trigger a few bot-to-bot requests — you\'ll see them in the System Log tab.'
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return `Hello! I'm your Borg agent, ready to coordinate on your behalf. I have access to the Org Knowledge Base, your calendar context, and the inter-agent network. What do you need me to handle today?`
  }
  return `Understood. I\'m processing your request by querying the Org Knowledge Base and checking relevant agent availability.\n\nI\'ll coordinate with the appropriate parties and report back with a consolidated summary. No action needed from you.`
}
