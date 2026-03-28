import { RiRobot2Line, RiArrowRightLine, RiCloseLine, RiAlertLine } from 'react-icons/ri'
import './EscalationBanner.css'

/**
 * EscalationBanner
 *
 * Shown in the personal "My Agent" chat when the agent needs human input
 * to answer an incoming B2B message it can't handle autonomously.
 *
 * Props:
 *   escalation — { convId, incomingMsg, senderAgentName, topic, reason }
 *   onDismiss  — callback to dismiss without answering
 */
export default function EscalationBanner({ escalation, onDismiss }) {
  if (!escalation) return null

  const { senderAgentName, topic, incomingMsg, reason } = escalation

  return (
    <div className="escalation-banner" role="alert" aria-live="polite">
      {/* Header */}
      <div className="escalation-header">
        <div className="escalation-icon">
          <RiAlertLine />
        </div>
        <div className="escalation-title-block">
          <span className="escalation-label">Your Agent Needs Help</span>
          <span className="escalation-subtitle">
            Inter-agent escalation · Human-in-the-loop required
          </span>
        </div>
        <button
          className="escalation-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss escalation"
          title="Dismiss"
        >
          <RiCloseLine />
        </button>
      </div>

      {/* Context */}
      <p className="escalation-question">
        I'm talking to{' '}
        <span className="escalation-agent-name">{senderAgentName}</span>{' '}
        about{' '}
        <span className="escalation-topic">{topic}</span>,
        but I don't have this information. What should I tell them?
      </p>

      {/* Quoted B2B message */}
      <div className="escalation-quote">
        <div className="escalation-quote-header">
          <RiRobot2Line />
          <span>{senderAgentName}</span>
          <RiArrowRightLine />
          <span>Your Agent</span>
          <span className="escalation-quote-label">· Agent Hub message</span>
        </div>
        <blockquote className="escalation-quote-body">
          {incomingMsg?.content ?? '(message unavailable)'}
        </blockquote>
      </div>

      {/* Instruction */}
      {reason && (
        <p className="escalation-reason">
          <strong>Why I need your help:</strong> {reason}
        </p>
      )}

      <p className="escalation-instruction">
        ↓ Type your answer below and I'll relay it to {senderAgentName} immediately.
      </p>
    </div>
  )
}
