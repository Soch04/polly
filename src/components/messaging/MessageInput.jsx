import { useState, useRef } from 'react'
import { RiSendPlaneFill, RiMicLine } from 'react-icons/ri'
import './MessageInput.css'

export default function MessageInput({ onSend, disabled }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!value.trim() || disabled) return
    onSend(value)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e) => {
    setValue(e.target.value)
    // Auto-resize
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }

  return (
    <form className="msg-input-form" onSubmit={handleSubmit} aria-label="Send message">
      <div className="msg-input-wrapper">
        <textarea
          ref={textareaRef}
          id="message-input"
          className="msg-input-field"
          placeholder="Message your agent... (Enter to send, Shift+Enter for newline)"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          aria-label="Message input"
        />
        <div className="msg-input-actions">
          <button
            type="button"
            className="btn btn-icon btn-ghost msg-action-btn"
            title="Voice input (coming soon)"
            disabled
            aria-label="Voice input"
          >
            <RiMicLine />
          </button>
          <button
            type="submit"
            id="btn-send-message"
            className="btn btn-primary btn-icon msg-send-btn"
            disabled={!value.trim() || disabled}
            aria-label="Send message"
          >
            <RiSendPlaneFill />
          </button>
        </div>
      </div>
      <p className="msg-input-hint">
        Your agent will query the Org Knowledge Base and coordinate with relevant agents on your behalf.
      </p>
    </form>
  )
}
