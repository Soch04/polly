import { useState, useEffect, useCallback } from 'react'
import { MOCK_CONVERSATIONS, MOCK_CONVERSATION_MESSAGES } from '../data/mockData'
import { useAuth } from '../context/AuthContext'

/**
 * useConversations — manages the Agent Communication Hub state.
 *
 * Mock mode: returns MOCK_CONVERSATIONS and MOCK_CONVERSATION_MESSAGES.
 * Live mode: subscribes to Firestore conversations collection
 *   filtered by participantIds containing myAgent.userId.
 *
 * State management:
 *   - selectedConvId: which thread is currently open
 *   - unreadCounts: { [convId]: number } — cleared on selection
 *   - activeConvIds: set of convIds where isActive === true (pulse indicator)
 *   - Simulates streaming: the most recent message in an active conv
 *     gets a "streaming" flag for 3s after mount
 */
export function useConversations() {
  const { USE_MOCK } = useAuth()

  const [conversations,  setConversations]  = useState([])
  const [threadMessages, setThreadMessages] = useState({})
  const [selectedConvId, setSelectedConvIdRaw] = useState(null)
  const [unreadCounts,   setUnreadCounts]   = useState({})
  const [streamingMsgId, setStreamingMsgId] = useState(null)

  // ── Load conversations ──────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK) {
      setConversations(MOCK_CONVERSATIONS)
      setThreadMessages(MOCK_CONVERSATION_MESSAGES)

      // initialise unread map from mock data
      const initial = {}
      MOCK_CONVERSATIONS.forEach(c => { initial[c.id] = c.unreadCount ?? 0 })
      setUnreadCounts(initial)
      return
    }
    // TODO (Phase 2): Firestore onSnapshot
    // const q = query(
    //   collection(db, 'conversations'),
    //   where('participantIds', 'array-contains', user.uid),
    //   orderBy('lastActivity', 'desc')
    // )
    // return onSnapshot(q, snap => setConversations(snap.docs.map(...)))
  }, [USE_MOCK])

  // ── Simulate a live "streaming" message on active convs ────
  useEffect(() => {
    const activeConvs = conversations.filter(c => c.isActive)
    if (!activeConvs.length) return

    // Every 8s, pick an active conv and "stream" its last message
    const interval = setInterval(() => {
      const conv = activeConvs[Math.floor(Math.random() * activeConvs.length)]
      const msgs = threadMessages[conv.id] ?? []
      if (!msgs.length) return
      const lastMsg = msgs[msgs.length - 1]
      setStreamingMsgId(lastMsg.id)
      setTimeout(() => setStreamingMsgId(null), 3000)

      // If this conv is not selected, increment unread
      setUnreadCounts(prev => {
        if (selectedConvId === conv.id) return prev
        return { ...prev, [conv.id]: (prev[conv.id] ?? 0) + 1 }
      })
    }, 8000)

    return () => clearInterval(interval)
  }, [conversations, threadMessages, selectedConvId])

  // ── Select conversation — clear unread ─────────────────────
  const setSelectedConvId = useCallback((id) => {
    setSelectedConvIdRaw(id)
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
  }, [])

  // ── Derived ─────────────────────────────────────────────────
  const selectedConv = conversations.find(c => c.id === selectedConvId) ?? null
  const selectedMessages = selectedConvId ? (threadMessages[selectedConvId] ?? []) : []
  const activeConvIds = conversations.filter(c => c.isActive).map(c => c.id)
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

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
