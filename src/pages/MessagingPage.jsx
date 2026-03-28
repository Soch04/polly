import { useEffect, useRef, useState } from 'react'
import { useMessages } from '../hooks/useMessages'
import { useConversations } from '../hooks/useConversations'
import { useAgentInbox } from '../hooks/useAgentInbox'
import { useAuth } from '../context/AuthContext'
import { useEscalation } from '../context/EscalationContext'
import { Navigate } from 'react-router-dom'
import MessageBubble from '../components/messaging/MessageBubble'
import MessageInput from '../components/messaging/MessageInput'
import EscalationBanner from '../components/messaging/EscalationBanner'
import ChatSidebar from '../components/hub/ChatSidebar'
import ChatThread from '../components/hub/ChatThread'
import { RiRobot2Line, RiSignalWifiLine, RiMessage3Line, RiAlertLine } from 'react-icons/ri'
import './MessagingPage.css'

const TABS = [
  { id: 'personal', label: 'My Agent',   icon: RiRobot2Line      },
  { id: 'hub',      label: 'Agent Hub',  icon: RiSignalWifiLine  },
]

export default function MessagingPage() {
  const { agent } = useAuth()
  const { escalation, clearEscalation } = useEscalation()
  const { messages, isTyping, isSending, sendMessage } = useMessages()
  const {
    directConvs, groupConvs,
    selectedConvId, setSelectedConvId,
    selectedConv, selectedMessages,
    activeConvIds, unreadCounts, totalUnread,
    streamingMsgId,
  } = useConversations()

  // Activate inbox listener for this user
  useAgentInbox()

  const [activeTab, setActiveTab] = useState('personal')
  const feedRef = useRef(null)

  // ── When escalation arrives → switch to personal tab ─────────
  useEffect(() => {
    if (escalation) {
      setActiveTab('personal')
    }
  }, [escalation])

  // ── Auto-scroll personal chat ─────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'personal') return
    const el = feedRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping, activeTab, escalation])

  // If no agent yet, redirect to initialization
  if (!agent) return <Navigate to="/bot-settings" replace />

  const hasEscalation = !!escalation

  return (
    <div className="msg-page">

      {/* ── Page header ──────────────────────────────────────── */}
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
              {/* Escalation badge on My Agent tab */}
              {id === 'personal' && hasEscalation && (
                <span className="tab-escalation-badge" title="Your agent needs your input">
                  <RiAlertLine />
                </span>
              )}
              {/* Unread badge on Agent Hub tab */}
              {id === 'hub' && totalUnread > 0 && (
                <span className="tab-unread-badge">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────── */}
      {activeTab === 'personal' ? (

        /* ─ Personal chat ─ */
        <div className="msg-feed-wrapper">
          {/* Feed header */}
          <div className="msg-feed-header">
            <div className="feed-agent-info">
              <div className="feed-agent-avatar">
                <RiRobot2Line />
              </div>
              <div>
                <div className="feed-agent-name">{agent?.displayName ?? 'Your Agent'}</div>
                <div className="feed-agent-model">{agent?.model ?? 'gemini-2.5-flash-lite'} · RAG enabled</div>
              </div>
            </div>
            <span className={`badge badge-${agent?.status ?? 'offline'}`}>
              <span className="badge-dot" />
              {agent?.status ?? 'offline'}
            </span>
          </div>

          {/* Escalation banner — shown above the message feed when human input needed */}
          {hasEscalation && (
            <EscalationBanner
              escalation={escalation}
              onDismiss={clearEscalation}
            />
          )}

          {/* Messages */}
          <div className="msg-feed" ref={feedRef} role="log" aria-live="polite" aria-label="Message feed">
            {messages.length === 0 && !hasEscalation && (
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

          <MessageInput
            onSend={sendMessage}
            disabled={isTyping || isSending}
            escalation={escalation}
          />
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
          <ChatThread
            conv={selectedConv}
            messages={selectedMessages}
            isActive={selectedConv ? activeConvIds.includes(selectedConv.id) : false}
            streamingMsgId={streamingMsgId}
          />
        </div>

      )}
    </div>
  )
}
