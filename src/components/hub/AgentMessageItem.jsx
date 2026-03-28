import { useState, useEffect } from 'react'
import { RiArrowRightLine, RiCodeLine, RiMessage3Line } from 'react-icons/ri'
import './AgentMessageItem.css'

/**
 * AgentMessageItem — A single message in the Agent Hub thread.
 *
 * Features:
 * - Full sender + receiver metadata display
 * - Context type tag
 * - Protocol messages: formatted as collapsible JSON with syntax highlighting
 * - Natural language messages: plain bubble
 * - Streaming effect: character-by-character reveal animation
 * - "My agent" highlighting: messages from Alex's agent get accent border
 */
export default function AgentMessageItem({ message, isStreaming, isLast }) {
  const { senderName, receiverName, receiverId, contextType, content, isProtocol, timestamp } = message

  const isMyAgent = senderName.startsWith("Alex")
  const isGroupMsg = receiverId === 'all'

  // Streaming: reveal characters progressively when isStreaming
  const [displayContent, setDisplayContent] = useState(isStreaming ? '' : content)
  const [showJson, setShowJson] = useState(false)

  useEffect(() => {
    if (!isStreaming) {
      setDisplayContent(content)
      return
    }
    let i = 0
    setDisplayContent('')
    const interval = setInterval(() => {
      i += 4 // reveal 4 chars at a time for speed
      setDisplayContent(content.slice(0, i))
      if (i >= content.length) clearInterval(interval)
    }, 20)
    return () => clearInterval(interval)
  }, [isStreaming, content])

  // Handle Firestore Timestamp objects, plain Dates, and ISO strings
  const timeStr = (() => {
    if (!timestamp) return '—'
    const d = timestamp?.toDate?.() ?? (timestamp instanceof Date ? timestamp : new Date(timestamp))
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  })()

  // Try to pretty-print JSON protocol messages
  let parsedJson = null
  if (isProtocol) {
    try { parsedJson = JSON.parse(content) } catch { /* raw */ }
  }

  return (
    <div
      className={[
        'agent-msg',
        isMyAgent ? 'agent-msg-mine' : 'agent-msg-other',
        isStreaming ? 'agent-msg-streaming' : '',
        isLast && !isStreaming ? 'agent-msg-last' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* ── Sender avatar ── */}
      <div className="agent-msg-avatar" title={senderName}>
        {senderName[0].toUpperCase()}
      </div>

      <div className="agent-msg-body">
        {/* ── Routing metadata header ── */}
        <div className="agent-msg-meta">
          <span className={`agent-name ${isMyAgent ? 'agent-name-mine' : ''}`}>
            {senderName}
          </span>
          <RiArrowRightLine className="meta-arrow" />
          <span className="agent-name agent-name-receiver">
            {isGroupMsg ? receiverName : receiverName}
          </span>
          <span className="meta-separator">·</span>
          <span className="meta-context">{contextType}</span>
          <span className="meta-time">{timeStr}</span>

          {isProtocol && (
            <span className="meta-protocol-tag">
              <RiCodeLine /> Protocol
            </span>
          )}
          {isStreaming && (
            <span className="meta-streaming-tag">
              ⚡ Streaming
            </span>
          )}
        </div>

        {/* ── Message content ── */}
        {isProtocol ? (
          <div className="agent-msg-protocol">
            <button
              className="protocol-toggle"
              onClick={() => setShowJson(v => !v)}
              aria-expanded={showJson}
            >
              <RiCodeLine />
              {showJson ? 'Hide' : 'View'} Protocol Payload
              ({parsedJson?.type ?? parsedJson?.status ?? 'handshake'})
            </button>
            {showJson && (
              <pre className="protocol-json">
                {parsedJson ? JSON.stringify(parsedJson, null, 2) : displayContent}
              </pre>
            )}
            {/* Always show a summary line from the payload */}
            {parsedJson?.payload?.subject && (
              <div className="protocol-summary">
                <span className="protocol-summary-label">Subject:</span>
                {parsedJson.payload.subject}
              </div>
            )}
            {parsedJson?.payload?.summary && !parsedJson?.payload?.subject && (
              <div className="protocol-summary">
                <span className="protocol-summary-label">Summary:</span>
                {parsedJson.payload.summary}
              </div>
            )}
          </div>
        ) : (
          <div className={`agent-msg-text ${isStreaming ? 'streaming-text' : ''}`}>
            {displayContent}
            {isStreaming && displayContent.length < content.length && (
              <span className="streaming-cursor">▌</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
