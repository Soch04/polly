import { RiRobot2Line, RiUser3Line, RiArrowLeftRightLine } from 'react-icons/ri'
import './MessageBubble.css'

/**
 * Renders a single message bubble.
 * type: 'user' | 'bot-response' | 'bot-to-bot'
 */
export default function MessageBubble({ message }) {
  const { type, senderName, recipientName, content, timestamp } = message

  const timeStr = timestamp
    ? new Date(timestamp?.toDate?.() ?? timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  if (type === 'bot-to-bot') {
    return (
      <div className="msg-bot-to-bot animate-fade-in">
        <div className="msg-bot-to-bot-header">
          <RiArrowLeftRightLine className="msg-b2b-icon" />
          <span className="msg-b2b-route">
            <strong>{senderName}</strong>
            <span className="msg-b2b-arrow"> → </span>
            <strong>{recipientName}</strong>
          </span>
          <span className="msg-timestamp">{timeStr}</span>
        </div>
        <div className="msg-bot-to-bot-body">
          <pre className="msg-b2b-content">{content}</pre>
        </div>
      </div>
    )
  }

  const isUser = type === 'user'
  const isBot  = type === 'bot-response'

  return (
    <div className={`msg-bubble-row ${isUser ? 'msg-row-user' : 'msg-row-bot'} animate-fade-in`}>
      {/* Avatar */}
      {isBot && (
        <div className="msg-avatar msg-avatar-bot" aria-hidden="true">
          <RiRobot2Line />
        </div>
      )}

      <div className={`msg-bubble ${isUser ? 'msg-bubble-user' : 'msg-bubble-bot'}`}>
        {/* Sender label */}
        <div className="msg-meta">
          <span className="msg-sender-name">{senderName}</span>
          <span className="msg-timestamp">{timeStr}</span>
        </div>

        {/* Content — support markdown-like bold */}
        <div className="msg-content">
          {formatContent(content)}
        </div>
      </div>

      {isUser && (
        <div className="msg-avatar msg-avatar-user" aria-hidden="true">
          <RiUser3Line />
        </div>
      )}
    </div>
  )
}

/** Simple renderer: bold **text**, newlines → <br> */
function formatContent(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    const parts = line.split(/\*\*([^*]+)\*\*/g)
    return (
      <span key={i}>
        {parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j}>{part}</strong> : part
        )}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    )
  })
}
