import { useEffect, useRef } from 'react'
import AgentMessageItem from './AgentMessageItem'
import {
  RiRobot2Line, RiTeamLine, RiLockLine,
  RiLoader4Line,
} from 'react-icons/ri'
import './ChatThread.css'

/**
 * ChatThread — Right pane of the Agent Hub.
 * Renders the full message history for the selected conversation,
 * with auto-scroll and a streaming indicator for active convs.
 */
export default function ChatThread({ conv, messages, isActive, streamingMsgId }) {
  const feedRef = useRef(null)

  // Auto-scroll on new messages
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingMsgId])

  if (!conv) {
    return (
      <div className="thread-empty-state">
        <div className="thread-empty-icon">
          <RiRobot2Line />
        </div>
        <h3>Select a conversation</h3>
        <p>Choose a Direct Mission or War Room from the left panel to monitor your agent's activity.</p>
        <div className="thread-empty-hint">
          <RiLockLine />
          All agent communications are end-to-end private within your organization.
        </div>
      </div>
    )
  }

  const isGroup = conv.type === 'group'
  const title = isGroup
    ? `${conv.department} War Room`
    : conv.participantNames.filter(n => !n.startsWith("Alex")).join(', ') || conv.participantNames.join(' · ')

  return (
    <div className="chat-thread">
      {/* ── Thread header ── */}
      <div className="thread-header">
        <div className="thread-header-left">
          <div className={`thread-avatar ${isGroup ? 'thread-avatar-group' : 'thread-avatar-direct'}`}>
            {isGroup ? <RiTeamLine /> : <RiRobot2Line />}
          </div>
          <div className="thread-meta">
            <div className="thread-title">{title}</div>
            <div className="thread-subtitle">
              {isGroup
                ? `${conv.participantNames.length} agents · ${conv.contextType}`
                : conv.participantNames.join(' · ')}
            </div>
          </div>
        </div>

        <div className="thread-header-right">
          <span className="context-badge">{conv.contextType}</span>
          {isActive ? (
            <span className="thread-status-badge thread-status-active">
              <RiLoader4Line className="status-spin" />
              Processing
            </span>
          ) : (
            <span className="thread-status-badge thread-status-idle">Idle</span>
          )}
          <div className="thread-readonly-badge" title="This feed is agent-driven — your agent operates autonomously here">
            <RiLockLine />
            Read-only
          </div>
        </div>
      </div>

      {/* ── Participants strip ── */}
      <div className="thread-participants-strip">
        <span className="participants-label">Participants:</span>
        {conv.participantNames.map((name, i) => (
          <span key={i} className="participant-chip">
            <span className="participant-initial">{name[0]}</span>
            {name}
          </span>
        ))}
      </div>

      {/* ── Message feed ── */}
      <div
        className="thread-feed"
        ref={feedRef}
        role="log"
        aria-live="polite"
        aria-label={`${title} message feed`}
      >
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>No messages yet</h3>
            <p>Agent-to-agent messages will stream here in real time.</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            // Normalize Firestore B2B schema to what AgentMessageItem expects
            const normalized = {
              ...msg,
              receiverName: msg.receiverName ?? msg.recipientName ?? 'Unknown Agent',
              contextType:  msg.contextType  ?? msg.department   ?? 'General',
            }
            return (
              <AgentMessageItem
                key={msg.id}
                message={normalized}
                isStreaming={msg.id === streamingMsgId}
                isLast={i === messages.length - 1}
              />
            )
          })
        )}

        {/* Active processing indicator */}
        {isActive && (
          <div className="thread-processing-row">
            <div className="processing-dot-track">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span className="processing-label">
              {conv.participantNames[0]} is processing a request…
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
