import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { RiUser3Line, RiLinkedinBoxFill, RiCalendar2Line, RiMailLine, RiBuildingLine, RiRobot2Line, RiShieldLine, RiBrainLine } from 'react-icons/ri'
import './ProfilePage.css'

export default function ProfilePage() {
  const { user, agent, isAdmin } = useAuth()
  const { addToast } = useApp()

  const initials = user?.displayName
    ?.split(' ').map(n => n[0]).join('').toUpperCase() ?? '??'

  const handleLinkedIn = () =>
    addToast('LinkedIn OAuth coming in Phase 2 — API key required.', 'info')
  const handleCalendar = () =>
    addToast('Google Calendar integration coming in Phase 2.', 'info')

  return (
    <div className="page-content">
    <div className="profile-page animate-fade-in">
      <div className="page-header">
        <h1>Your Profile</h1>
        <p>Manage your identity and connected services</p>
      </div>

      <div className="profile-grid">
        {/* ── Main profile card ── */}
        <div className="card profile-card">
          <div className="profile-card-bg" aria-hidden="true" />
          <div className="profile-card-content">
            {/* Avatar */}
            <div className="profile-avatar-wrap">
              <div className="avatar-placeholder avatar-xl profile-avatar">
                {initials}
              </div>
              {isAdmin && (
                <div className="profile-admin-badge" title="Admin">
                  <RiShieldLine />
                </div>
              )}
            </div>

            {/* Name & meta */}
            <h2 className="profile-name">{user?.displayName ?? 'Unknown User'}</h2>
            <div className="profile-dept">
              <RiBuildingLine />
              {user?.department ?? 'No department'}
            </div>

            <div className="profile-meta">
              <div className="profile-meta-item">
                <RiMailLine className="meta-icon" />
                <span>{user?.email ?? '—'}</span>
              </div>
              {isAdmin && (
                <div className="profile-meta-item">
                  <RiShieldLine className="meta-icon admin-icon" />
                  <span style={{ color: 'var(--color-accent-2)' }}>Admin Access</span>
                </div>
              )}
            </div>

            <div className="divider" />

            {/* Connect buttons */}
            <h4 className="section-label">Connected Services</h4>
            <div className="connect-buttons">
              <button
                id="btn-connect-linkedin"
                className="connect-btn connect-linkedin"
                onClick={handleLinkedIn}
              >
                <RiLinkedinBoxFill className="connect-icon" />
                <div className="connect-btn-text">
                  <span className="connect-label">Connect LinkedIn</span>
                  <span className="connect-status">
                    {user?.linkedIn ? '✓ Connected' : 'Not connected'}
                  </span>
                </div>
              </button>

              <button
                id="btn-add-calendar"
                className="connect-btn connect-calendar"
                onClick={handleCalendar}
              >
                <RiCalendar2Line className="connect-icon" />
                <div className="connect-btn-text">
                  <span className="connect-label">Add Calendar</span>
                  <span className="connect-status">
                    {user?.calendarConnected ? '✓ Connected' : 'Google Calendar'}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ── Agent summary card ── */}
        <div className="card agent-summary-card card-hover">
          <div className="agent-card-header">
            <div className="agent-card-icon">
              <RiRobot2Line />
            </div>
            <div>
              <h3>{agent?.displayName ?? 'Your Agent'}</h3>
              <p style={{ fontSize: '0.8125rem', margin: 0 }}>Your dedicated AI proxy</p>
            </div>
            <span className={`badge badge-${agent?.status ?? 'offline'}`}>
              <span className="badge-dot" />
              {agent?.status ?? 'offline'}
            </span>
          </div>

          <div className="divider" />

          <div className="agent-card-stats">
            <StatItem label="Model" value={agent?.model ?? '—'} />
            <StatItem label="Department" value={agent?.department ?? '—'} />
            <StatItem
              label="Knowledge Scope"
              value={agent?.knowledgeScope?.join(', ') ?? 'global'}
            />
          </div>

          <div className="divider" />

          <div className="agent-card-capability">
            <RiBrainLine className="capability-icon" />
            <div>
              <div className="capability-title">RAG-enabled</div>
              <div className="capability-desc">
                Your agent queries the Org Knowledge Base (Tier 2) and your private docs (Tier 1) on every request.
              </div>
            </div>
          </div>
        </div>


      </div>
    </div>
    </div>
  )
}

function StatItem({ label, value }) {
  return (
    <div className="stat-item">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
