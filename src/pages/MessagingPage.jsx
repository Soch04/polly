import { useEffect, useRef, useState } from 'react'
import { useMessages } from '../hooks/useMessages'
import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'
import { subscribeToOrgData } from '../firebase/firestore'
import MessageBubble from '../components/messaging/MessageBubble'
import MessageInput from '../components/messaging/MessageInput'
import { RiRobot2Line, RiMessage3Line, RiFileTextLine, RiSearchEyeLine } from 'react-icons/ri'
import './MessagingPage.css'

export default function MessagingPage() {
  const { user, agent, loading, USE_MOCK } = useAuth()
  const { messages, isTyping, isSending, sendMessage } = useMessages()
  
  const [orgDocs, setOrgDocs] = useState([])
  const feedRef = useRef(null)

  // While auth is still resolving, show a spinner instead of premature redirect
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  )
  // Only redirect if we're sure the user is loaded and there's still no agent doc
  if (!USE_MOCK && user && !agent) return <Navigate to="/bot-settings" replace />
  // Note: if user.orgId is null, they should technically be on /org to create one!
  // But we'll let them stay here and see empty state.

  useEffect(() => {
    if (USE_MOCK || !user?.orgId) return
    const unsub = subscribeToOrgData(user.orgId, setOrgDocs)
    return () => unsub()
  }, [user?.orgId, USE_MOCK])

  // Auto-scroll in personal chat
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="msg-page rag-query-page">
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="msg-page-header">
        <div>
          <h1>
            <RiSearchEyeLine style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
            RAG Query
          </h1>
          <p>Ask your agent questions about your Organization's Knowledge Base</p>
        </div>
      </div>

      <div className="rag-layout">
        {/* LEFT: Query Chat */}
        <div className="rag-chat-pane">
          <div className="msg-feed-wrapper" style={{ height: '100%', borderRight: '1px solid var(--border-color)' }}>
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

            <div className="msg-feed" ref={feedRef} role="log" aria-live="polite">
              {messages.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">🧠</div>
                  <h3>Query your Organization</h3>
                  <p>I have access to all {orgDocs.length} indexed documents. What do you want to know?</p>
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
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <MessageInput onSend={sendMessage} disabled={isTyping || isSending || !user?.orgId} />
          </div>
        </div>

        {/* RIGHT: Document Viewer */}
        <div className="rag-docs-pane" style={{ padding: '1.5rem', overflowY: 'auto' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RiFileTextLine /> Organization Knowledge Base
          </h3>
          
          {!user?.orgId ? (
             <div className="empty-state">
               <p>Create or join an Organization to view and add documents.</p>
             </div>
          ) : orgDocs.length === 0 ? (
            <div className="empty-state" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--border-color)', borderRadius: '1rem' }}>
              <p>No documents found in your organization. Go to the Organization tab to upload policies and FAQs.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {orgDocs.map(doc => (
                <div key={doc.id} className="card-hover" style={{ padding: '1rem', background: 'var(--color-bg-elevated)', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <RiFileTextLine style={{ color: 'var(--color-accent)' }} />
                    {doc.title}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{doc.department}</span>
                    <span>{doc.fileType}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
