import { useState } from 'react'
import { useAgent } from '../hooks/useAgent'
import { RiRobot2Line, RiSaveLine, RiPulseLine, RiCodeSSlashLine, RiLockLine } from 'react-icons/ri'
import './BotSettingsPage.css'

const STATUS_OPTIONS = [
  { value: 'active',  label: 'Active',  desc: 'Agent processes all requests automatically', color: 'var(--color-success)' },
  { value: 'idle',    label: 'Idle',    desc: 'Agent pauses inter-agent requests only',     color: 'var(--color-warning)' },
  { value: 'offline', label: 'Offline', desc: 'Agent is fully suspended',                   color: 'var(--color-accent-2)' },
]

export default function BotSettingsPage() {
  const { agent, saving, saveInstructions, changeStatus } = useAgent()
  const [instructions, setInstructions] = useState(agent?.systemInstructions ?? '')
  const [isDirty, setIsDirty]           = useState(false)

  if (!agent) {
    return (
      <div className="empty-state" style={{ height: '60vh' }}>
        <div className="empty-state-icon">🤖</div>
        <h3>No agent found</h3>
        <p>Your agent will be initialized when you complete account setup.</p>
      </div>
    )
  }

  const handleInstructionChange = (val) => {
    setInstructions(val)
    setIsDirty(val !== agent.systemInstructions)
  }

  const handleSave = async () => {
    await saveInstructions(instructions)
    setIsDirty(false)
  }

  return (
    <div className="page-content">
    <div className="bot-page animate-fade-in">
      <div className="page-header">
        <h1>
          <RiRobot2Line style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
          Agent Settings
        </h1>
        <p>Configure your AI proxy's behavior, instructions, and availability</p>
      </div>

      <div className="bot-grid">
        {/* ── Agent Identity Card ── */}
        <div className="card bot-identity-card">
          <div className="bot-identity-header">
            <div className="bot-identity-avatar">
              <RiRobot2Line />
            </div>
            <div className="bot-identity-meta">
              <h3>{agent.displayName}</h3>
              <div className="bot-identity-dept">{agent.department}</div>
            </div>
            <span className={`badge badge-${agent.status}`}>
              <span className="badge-dot" />
              {agent.status}
            </span>
          </div>

          <div className="divider" />

          <div className="bot-config-row">
            <RiCodeSSlashLine className="config-icon" />
            <div>
              <div className="config-label">Model</div>
              <div className="config-value">{agent.model}</div>
            </div>
          </div>

          <div className="bot-config-row">
            <RiPulseLine className="config-icon" />
            <div>
              <div className="config-label">Knowledge Scope</div>
              <div className="config-value">{agent.knowledgeScope?.join(' · ') ?? 'global'}</div>
            </div>
          </div>

          <div className="bot-config-row">
            <RiLockLine className="config-icon" />
            <div>
              <div className="config-label">Protocol Version</div>
              <div className="config-value">borg-agent-handshake-v1</div>
            </div>
          </div>
        </div>

        {/* ── Status Control ── */}
        <div className="card bot-status-card">
          <h3 className="card-section-title">Agent Status</h3>
          <p className="card-section-desc">Control when your agent operates autonomously</p>

          <div className="status-options">
            {STATUS_OPTIONS.map(({ value, label, desc, color }) => (
              <button
                key={value}
                id={`btn-status-${value}`}
                className={`status-option ${agent.status === value ? 'selected' : ''}`}
                onClick={() => changeStatus(value)}
                style={{ '--status-color': color }}
              >
                <div className="status-option-dot" />
                <div className="status-option-text">
                  <div className="status-option-label">{label}</div>
                  <div className="status-option-desc">{desc}</div>
                </div>
                {agent.status === value && (
                  <div className="status-option-check">✓</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Custom Instructions ── */}
        <div className="card bot-instructions-card">
          <div className="instructions-header">
            <div>
              <h3 className="card-section-title" style={{ margin: 0 }}>Custom Instructions</h3>
              <p className="card-section-desc" style={{ margin: 0 }}>
                Define how your agent behaves, what it prioritizes, and its communication style.
                These are injected as the system prompt on every request.
              </p>
            </div>
            {isDirty && (
              <button
                id="btn-save-instructions"
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <RiSaveLine />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>

          <div className="divider" />

          <div className="instructions-info-banner">
            <RiLockLine className="banner-icon" />
            <span>
              Instructions are <strong>Tier 1 private data</strong> — never shared with other agents or included in the global Org Knowledge Base.
            </span>
          </div>

          <textarea
            id="agent-instructions-input"
            className="form-textarea instructions-textarea"
            value={instructions}
            onChange={(e) => handleInstructionChange(e.target.value)}
            placeholder="Describe your agent's behavior, priorities, and communication style..."
            rows={14}
            aria-label="Custom agent instructions"
          />

          <div className="instructions-footer">
            <span className="char-count">{instructions.length} chars</span>
            {isDirty && <span className="unsaved-indicator">● Unsaved changes</span>}
          </div>
        </div>

        {/* ── Read-only Model Config ── */}
        <div className="card bot-model-card">
          <h3 className="card-section-title">System Configuration</h3>
          <p className="card-section-desc" style={{ marginBottom: '1rem' }}>
            These settings are managed by your org admin and require admin approval to change.
          </p>
          <div className="model-config-grid">
            {[
              { key: 'Routing Model',    value: 'gemini-2.0-flash',        note: 'Semantic routing & fast ops' },
              { key: 'Synthesis Model',  value: 'gemini-2.0-pro',          note: 'Complex reasoning & RAG synthesis' },
              { key: 'Vector DB',        value: 'Pinecone',                 note: 'Org Knowledge Base retrieval' },
              { key: 'Agent Protocol',   value: 'Handshake v1',             note: 'Inter-agent communication' },
              { key: 'Max Inter-Agent',  value: '10 req/hour',              note: 'Without human override' },
              { key: 'Context Window',   value: '128k tokens',              note: 'Per conversation turn' },
            ].map(({ key, value, note }) => (
              <div key={key} className="model-config-item">
                <div className="model-config-key">{key}</div>
                <div className="model-config-value">{value}</div>
                <div className="model-config-note">{note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
