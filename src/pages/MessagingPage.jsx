import { useEffect, useRef, useState } from 'react'
import { useMessages } from '../hooks/useMessages'
import { useConversations } from '../hooks/useConversations'
import { useAgentInbox } from '../hooks/useAgentInbox'
import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'
import MessageBubble from '../components/messaging/MessageBubble'
import MessageInput from '../components/messaging/MessageInput'
import ChatSidebar from '../components/hub/ChatSidebar'
import ChatThread from '../components/hub/ChatThread'
import { subscribeToIncomingMentions } from '../firebase/firestore'
import { RiRobot2Line, RiSignalWifiLine, RiMessage3Line, RiMailLine, RiCheckLine, RiLoader4Line } from 'react-icons/ri'
import './MessagingPage.css'

const TABS = [
  { id: 'personal', label: 'My Agent',   icon: RiRobot2Line      },
  { id: 'hub',      label: 'Agent Hub',  icon: RiSignalWifiLine  },
]

export default function MessagingPage() {
  const { user, agent } = useAuth()
  const { messages, isTyping, isSending, sendMessage } = useMessages()
  const {
    directConvs, groupConvs,
    selectedConvId, setSelectedConvId,
    selectedConv, selectedMessages,
    activeConvIds, unreadCounts, totalUnread,
    streamingMsgId,
  } = useConversations()

  // Activate real-time inbox listener (auto-replies to incoming @mentions)
  useAgentInbox()

  // Local state for incoming interactions displayed in the Hub
  const [interactions, setInteractions] = useState([])

  const [activeTab, setActiveTab] = useState('personal')
  const feedRef = useRef(null)

  // If no agent yet, redirect to the initialization flow
  if (!agent) return <Navigate to="/bot-settings" replace />

  // Subscribe to incoming mentions for the Hub tab
  useEffect(() => {
    if (!user?.email) return
    const unsub = subscribeToIncomingMentions(user.email, setInteractions)
    return () => unsub()
  }, [user?.email])

  // Auto-scroll in personal chat
  useEffect(() => {
    if (activeTab !== 'personal') return
    const el = feedRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping, activeTab])

  return (
    <div className="msg-page">

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="msg-page-header">
        <div>
          <h1>
            <RiMessage3Line style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
            Messaging Board
          </h1>
          <p>Communicate with your agent or monitor inter-agent activity</p>
        </div>

        {/* Tab selector */}
        <div className="tab-bar" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={activeTab === id}
              className={`tab-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              style={{ position: 'relative' }}
            >
              <Icon style={{ marginRight: '0.375rem', verticalAlign: 'middle' }} />
              {label}
              {/* Hub unread badge on the tab */}
              {id === 'hub' && (totalUnread > 0 || interactions.some(i => i.status === 'pending')) && (
                <span className="tab-unread-badge">
                  {totalUnread + interactions.filter(i => i.status === 'pending').length > 9
                    ? '9+'
                    : totalUnread + interactions.filter(i => i.status === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────── */}
      {activeTab === 'personal' ? (

        /* ─ Personal chat (original) ─ */
        <div className="msg-feed-wrapper">
          {/* Feed header */}
          <div className="msg-feed-header">
            <div className="feed-agent-info">
              <div className="feed-agent-avatar">
                <RiRobot2Line />
              </div>
              <div>
                <div className="feed-agent-name">{agent?.displayName ?? 'Your Agent'}</div>
                <div className="feed-agent-model">{agent?.model ?? 'gemini-2.0-flash'} · RAG enabled</div>
              </div>
            </div>
            <span className={`badge badge-${agent?.status ?? 'offline'}`}>
              <span className="badge-dot" />
              {agent?.status ?? 'offline'}
            </span>
          </div>

          {/* Messages */}
          <div className="msg-feed" ref={feedRef} role="log" aria-live="polite" aria-label="Message feed">
            {messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">💬</div>
                <h3>Start a conversation</h3>
                <p>Your agent is ready. Ask it anything!</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={msg.id ?? i} message={msg} />
            ))}
            {isTyping && (
              <div className="typing-indicator">
                <div className="msg-avatar msg-avatar-bot"><RiRobot2Line /></div>
                <div className="msg-bubble msg-bubble-bot" style={{ padding: '0.625rem 1rem' }}>
                  <div className="msg-meta">
                    <span className="msg-sender-name" style={{ color: 'var(--color-bot)' }}>
                      {agent?.displayName ?? 'Your Agent'}
                    </span>
                  </div>
                  <div className="typing-dots">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <MessageInput onSend={sendMessage} disabled={isTyping || isSending} />
        </div>

      ) : (

        /* ─ Agent Hub ─ 2-pane layout ─ */
        <div className="hub-layout">
          <ChatSidebar
            directConvs={directConvs}
            groupConvs={groupConvs}
            selectedConvId={selectedConvId}
            onSelect={setSelectedConvId}
            activeConvIds={activeConvIds}
            unreadCounts={unreadCounts}
          />
          <div className="hub-right-pane">
            {/* ── Incoming Requests Panel ── */}
            {interactions.length > 0 && (
              <div className="incoming-requests-panel">
                <div className="incoming-requests-header">
                  <RiMailLine />
                  <span>Incoming Agent Requests</span>
                  <span className="incoming-count">{interactions.length}</span>
                </div>
                <div className="incoming-requests-list">
                  {interactions.map(interaction => (
                    <div
                      key={interaction.id}
                      className={`incoming-request-item ${interaction.status === 'pending' ? 'incoming-pending' : 'incoming-replied'}`}
                    >
                      <div className="incoming-request-from">
                        <RiRobot2Line className="incoming-bot-icon" />
                        <strong>{interaction.sender_name}</strong>
                        <span className="incoming-email">({interaction.sender_email})</span>
                        <span className={`incoming-status-badge ${interaction.status}`}>
                          {interaction.status === 'pending'
                            ? <><RiLoader4Line className="spin" /> Processing…</>
                            : <><RiCheckLine /> Replied</>}
                        </span>
                      </div>
                      <div className="incoming-request-body">{interaction.body || interaction.content}</div>
                      {interaction.reply && (
                        <div className="incoming-request-reply">
                          <span className="reply-label">Your agent replied:</span>
                          {interaction.reply}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ChatThread
              conv={selectedConv}
              messages={selectedMessages}
              isActive={selectedConv ? activeConvIds.includes(selectedConv.id) : false}
              streamingMsgId={streamingMsgId}
            />
          </div>
        </div>

      )}
    </div>
  )
}
