import { useState, useEffect, useCallback, useRef } from 'react'
import { MOCK_CONVERSATIONS, MOCK_CONVERSATION_MESSAGES } from '../data/mockData'
import { useAuth } from '../context/AuthContext'
import { USE_MOCK } from '../context/AppConfig'
import { subscribeToConversations, subscribeToConvMessages } from '../firebase/firestore'

/**
 * useConversations — manages the Agent Communication Hub state.
 *
 * Mock mode: returns MOCK_CONVERSATIONS and MOCK_CONVERSATION_MESSAGES.
 * Live mode: subscribes to Firestore conversations + messages in real-time.
 */
export function useConversations() {
  const { user } = useAuth()

  const [conversations,  setConversations]  = useState([])
  const [threadMessages, setThreadMessages] = useState({})
  const [selectedConvId, setSelectedConvIdRaw] = useState(null)
  const [unreadCounts,   setUnreadCounts]   = useState({})
  const [streamingMsgId, setStreamingMsgId] = useState(null)

  // Track per-convId message listeners so we can clean them up
  const msgUnsubsRef = useRef({})

  // ── Load conversations ────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK) {
      setConversations(MOCK_CONVERSATIONS)
      setThreadMessages(MOCK_CONVERSATION_MESSAGES)
      const initial = {}
      MOCK_CONVERSATIONS.forEach(c => { initial[c.id] = c.unreadCount ?? 0 })
      setUnreadCounts(initial)
      return
    }

    if (!user?.uid) return

    // Subscribe to all conversations this user is part of
    const unsubConvs = subscribeToConversations(user.uid, (convs) => {
      setConversations(convs)

      // For each conversation, subscribe to its messages (lazy — only once per convId)
      convs.forEach(conv => {
        if (msgUnsubsRef.current[conv.id]) return  // already subscribed

        const unsubMsgs = subscribeToConvMessages(conv.id, (msgs) => {
          setThreadMessages(prev => ({ ...prev, [conv.id]: msgs }))

          // New message from a conv we're not viewing → increment unread
          setSelectedConvIdRaw(currentId => {
            if (currentId !== conv.id && msgs.length > 0) {
              setUnreadCounts(prev => {
                const existing = prev[conv.id] ?? 0
                const newCount = msgs.length
                if (newCount > existing) {
                  // Flash streaming indicator on the latest message
                  const last = msgs[msgs.length - 1]
                  setStreamingMsgId(last.id)
                  setTimeout(() => setStreamingMsgId(null), 3000)
                  return { ...prev, [conv.id]: newCount }
                }
                return prev
              })
            }
            return currentId
          })
        })

        msgUnsubsRef.current[conv.id] = unsubMsgs
      })
    })

    return () => {
      unsubConvs()
      Object.values(msgUnsubsRef.current).forEach(fn => fn())
      msgUnsubsRef.current = {}
    }
  }, [user?.uid])

  // ── Select conversation — clear unread ───────────────────────
  const setSelectedConvId = useCallback((id) => {
    setSelectedConvIdRaw(id)
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
  }, [])

  // ── Derived ──────────────────────────────────────────────────
  const selectedConv     = conversations.find(c => c.id === selectedConvId) ?? null
  const selectedMessages = selectedConvId ? (threadMessages[selectedConvId] ?? []) : []
  const activeConvIds    = conversations.filter(c => c.isActive).map(c => c.id)
  const totalUnread      = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  const directConvs = conversations.filter(c => c.type === 'direct')
  const groupConvs  = conversations.filter(c => c.type === 'group')

  return {
    conversations,
    directConvs,
    groupConvs,
    selectedConvId,
    setSelectedConvId,
    selectedConv,
    selectedMessages,
    activeConvIds,
    unreadCounts,
    totalUnread,
    streamingMsgId,
  }
}
