import { useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  MOCK_BOT_TO_BOT_ALL, MOCK_ORG_DATA, MOCK_ADMIN_STATS,
  MOCK_ALL_AGENTS, DEPARTMENTS, MOCK_ALL_USERS
} from '../data/mockData'
import { updateOrgDataStatus, updateUserRole } from '../firebase/firestore'
import {
  RiShieldLine, RiArrowLeftRightLine, RiDatabase2Line,
  RiRobot2Line, RiCheckLine, RiCloseLine, RiTimeLine,
  RiFilterLine, RiGroupLine,
} from 'react-icons/ri'
import './AdminDashboard.css'

const TABS = [
  { id: 'overview',   label: 'Overview',        icon: RiShieldLine        },
  { id: 'dept-logs',  label: 'Dept Monitor',    icon: RiArrowLeftRightLine },
  { id: 'knowledge',  label: 'Knowledge Base',  icon: RiDatabase2Line     },
  { id: 'agents',     label: 'Agent Network',   icon: RiRobot2Line        },
  { id: 'users',      label: 'User Directory',  icon: RiGroupLine         },
]

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [deptFilter, setDeptFilter] = useState('all')
  const [orgData, setOrgData]     = useState(MOCK_ORG_DATA)
  const { addToast } = useApp()

  const filteredLogs = deptFilter === 'all'
    ? MOCK_BOT_TO_BOT_ALL
    : MOCK_BOT_TO_BOT_ALL.filter(m => m.department === deptFilter)

  const handleOrgDataStatus = async (id, status) => {
    setOrgData(prev => prev.map(d => d.id === id ? { ...d, status } : d))
    try {
      await updateOrgDataStatus(id, status)
    } catch {
      // mock mode — already updated local state
    }
    addToast(`Document ${status === 'approved' ? 'approved' : 'rejected'}`, status === 'approved' ? 'success' : 'error')
  }

  return (
    <div className="page-content">
    <div className="admin-page animate-fade-in">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-badge-wrap">
          <div className="admin-header-icon">
            <RiShieldLine />
          </div>
          <div>
            <h1>Admin Dashboard</h1>
            <p>Monitor agent activity, manage knowledge, and oversee the Borg network</p>
          </div>
        </div>
        <span className="badge badge-approved">
          <span className="badge-dot" />
          Admin Access
        </span>
      </div>

      {/* Tab navigation */}
      <div className="tab-bar admin-tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`admin-tab-${id}`}
            role="tab"
            aria-selected={activeTab === id}
            className={`tab-item ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon style={{ marginRight: '0.375rem', verticalAlign: 'middle' }} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'dept-logs' && (
        <DeptMonitorTab
          logs={filteredLogs}
          deptFilter={deptFilter}
          setDeptFilter={setDeptFilter}
        />
      )}
      {activeTab === 'knowledge' && (
        <KnowledgeBaseTab orgData={orgData} onUpdateStatus={handleOrgDataStatus} />
      )}
      {activeTab === 'agents' && <AgentNetworkTab />}
      {activeTab === 'users' && <UserManagementTab />}
    </div>
    </div>
  )
}

/* ── Overview Tab ── */
function OverviewTab() {
  const stats = MOCK_ADMIN_STATS
  return (
    <div className="overview-grid animate-fade-in">
      {[
        { label: 'Total Agents',      value: stats.totalAgents,     icon: '🤖', color: 'var(--color-accent)' },
        { label: 'Active Now',        value: stats.activeAgents,    icon: '✅', color: 'var(--color-success)' },
        { label: 'Messages (24h)',    value: stats.messagesLast24h, icon: '💬', color: 'var(--color-accent-2)' },
        { label: 'Pending KB Items',  value: stats.pendingOrgData,  icon: '⏳', color: 'var(--color-warning)' },
        { label: 'Departments',       value: stats.deptCount,       icon: '🏢', color: 'var(--color-bot)' },
      ].map(({ label, value, icon, color }) => (
        <div key={label} className="stat-card card card-hover">
          <div className="stat-card-icon" style={{ '--stat-color': color }}>
            {icon}
          </div>
          <div className="stat-card-value">{value.toLocaleString()}</div>
          <div className="stat-card-label">{label}</div>
        </div>
      ))}

      <div className="card overview-info-card">
        <h3>System Health</h3>
        <div className="health-items">
          {[
            { label: 'Firestore', status: 'operational' },
            { label: 'Gemini 2.0 Flash (Routing)', status: 'operational' },
            { label: 'Gemini 2.0 Pro (Synthesis)', status: 'operational' },
            { label: 'Pinecone Vector DB', status: 'not-configured', note: 'Add API key' },
            { label: 'Redis Pub/Sub', status: 'not-configured', note: 'Phase 2' },
          ].map(({ label, status, note }) => (
            <div key={label} className="health-item">
              <span className={`health-dot health-${status}`} />
              <span className="health-label">{label}</span>
              {note && <span className="health-note">{note}</span>}
              <span className="health-status">{status === 'operational' ? 'Operational' : 'Not Configured'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Dept Monitor Tab ── */
function DeptMonitorTab({ logs, deptFilter, setDeptFilter }) {
  return (
    <div className="dept-monitor animate-fade-in">
      <div className="dept-filter-bar">
        <RiFilterLine className="filter-icon" />
        <span className="filter-label">Filter by department:</span>
        <div className="dept-chips">
          <button
            className={`dept-chip ${deptFilter === 'all' ? 'active' : ''}`}
            onClick={() => setDeptFilter('all')}
          >All</button>
          {[...new Set(MOCK_BOT_TO_BOT_ALL.map(m => m.department))].map(dept => (
            <button
              key={dept}
              className={`dept-chip ${deptFilter === dept ? 'active' : ''}`}
              onClick={() => setDeptFilter(dept)}
            >{dept}</button>
          ))}
        </div>
      </div>

      <div className="dept-log-count">
        Showing <strong>{logs.length}</strong> inter-agent messages
        {deptFilter !== 'all' && ` in ${deptFilter}`}
      </div>

      <div className="dept-logs-list">
        {logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>No logs for this department</h3>
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id ?? i} className="dept-log-item card">
              <div className="log-item-header">
                <div className="log-route">
                  <span className="log-agent">{log.senderName}</span>
                  <RiArrowLeftRightLine className="log-arrow" />
                  <span className="log-agent">{log.recipientName}</span>
                </div>
                <div className="log-meta">
                  {log.department && (
                    <span className="dept-tag">{log.department}</span>
                  )}
                  <span className="log-time">
                    {log.timestamp
                      ? new Date(log.timestamp?.toDate?.() ?? log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </span>
                </div>
              </div>
              <pre className="log-content">{log.content}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ── Knowledge Base Manager Tab ── */
function KnowledgeBaseTab({ orgData, onUpdateStatus }) {
  const pending  = orgData.filter(d => d.status === 'pending')
  const approved = orgData.filter(d => d.status === 'approved')
  const rejected = orgData.filter(d => d.status === 'rejected')

  return (
    <div className="kb-tab animate-fade-in">
      <div className="kb-stats-row">
        <div className="kb-stat">
          <span className="kb-stat-value">{approved.length}</span>
          <span className="kb-stat-label">Approved</span>
        </div>
        <div className="kb-stat">
          <span className="kb-stat-value" style={{ color: 'var(--color-warning)' }}>{pending.length}</span>
          <span className="kb-stat-label">Pending Review</span>
        </div>
        <div className="kb-stat">
          <span className="kb-stat-value" style={{ color: 'var(--color-danger)' }}>{rejected.length}</span>
          <span className="kb-stat-label">Rejected</span>
        </div>
      </div>

      {pending.length > 0 && (
        <>
          <h4 className="kb-section-label">⏳ Pending Review</h4>
          {pending.map(item => (
            <KBItem key={item.id} item={item} onUpdateStatus={onUpdateStatus} showActions />
          ))}
        </>
      )}

      <h4 className="kb-section-label">✅ Approved — Live in Knowledge Base</h4>
      {approved.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No approved items yet.</p> : (
        approved.map(item => (
          <KBItem key={item.id} item={item} onUpdateStatus={onUpdateStatus} />
        ))
      )}
    </div>
  )
}

function KBItem({ item, onUpdateStatus, showActions }) {
  const { id, title, content, department, uploaderName, status, fileType, createdAt } = item
  const date = createdAt?.toDate?.()?.toLocaleDateString() ?? '—'

  return (
    <div className="kb-item card card-hover">
      <div className="kb-item-header">
        <div className="kb-item-info">
          <div className="kb-item-title">{title}</div>
          <div className="kb-item-meta">
            <span>{department}</span> · <span>{fileType}</span> · <span>by {uploaderName}</span> · <span>{date}</span>
          </div>
        </div>
        <div className="kb-item-actions">
          <span className={`badge badge-${status}`}>{status}</span>
          {showActions && (
            <>
              <button
                id={`btn-approve-${id}`}
                className="btn btn-sm"
                style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-success)', border: '1px solid rgba(16,185,129,0.2)' }}
                onClick={() => onUpdateStatus(id, 'approved')}
              >
                <RiCheckLine /> Approve
              </button>
              <button
                id={`btn-reject-${id}`}
                className="btn btn-sm btn-danger"
                onClick={() => onUpdateStatus(id, 'rejected')}
              >
                <RiCloseLine /> Reject
              </button>
            </>
          )}
        </div>
      </div>
      {content && (
        <div className="kb-item-preview">{content.substring(0, 160)}{content.length > 160 ? '...' : ''}</div>
      )}
    </div>
  )
}

/* ── Agent Network Tab ── */
function AgentNetworkTab() {
  const [deptFilter, setDeptFilter] = useState('all')
  const filtered = deptFilter === 'all'
    ? MOCK_ALL_AGENTS
    : MOCK_ALL_AGENTS.filter(a => a.department === deptFilter)

  return (
    <div className="agent-network animate-fade-in">
      <div className="dept-filter-bar">
        <RiGroupLine className="filter-icon" />
        <div className="dept-chips">
          <button className={`dept-chip ${deptFilter === 'all' ? 'active' : ''}`} onClick={() => setDeptFilter('all')}>All</button>
          {[...new Set(MOCK_ALL_AGENTS.map(a => a.department))].map(dept => (
            <button key={dept} className={`dept-chip ${deptFilter === dept ? 'active' : ''}`} onClick={() => setDeptFilter(dept)}>{dept}</button>
          ))}
        </div>
      </div>

      <div className="agent-network-grid">
        {filtered.map(agent => (
          <div key={agent.userId} className="agent-network-card card card-hover">
            <div className="agent-network-avatar">
              <RiRobot2Line />
            </div>
            <div className="agent-network-info">
              <div className="agent-network-name">{agent.displayName}</div>
              <div className="agent-network-dept">{agent.department}</div>
            </div>
            <span className={`badge badge-${agent.status}`}>
              <span className="badge-dot" />
              {agent.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── User Management Tab ── */
function UserManagementTab() {
  const { addToast } = useApp()
  const [users, setUsers] = useState(MOCK_ALL_USERS)

  const handleRoleChange = async (uid, newRole) => {
    setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u))
    try {
      await updateUserRole(uid, newRole)
    } catch {
      // mock mode silently proceeds
    }
    addToast(`Role dynamically updated to ${newRole}`, 'success')
  }

  return (
    <div className="agent-network animate-fade-in">
      <div className="agent-network-grid" style={{ gridTemplateColumns: '1fr' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-surface)', borderRadius: '8px', overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '16px' }}>Name</th>
              <th style={{ padding: '16px' }}>Email</th>
              <th style={{ padding: '16px' }}>Department</th>
              <th style={{ padding: '16px' }}>Privilege Level</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.uid} style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                <td style={{ padding: '16px', fontWeight: '500' }}>{user.displayName}</td>
                <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{user.email}</td>
                <td style={{ padding: '16px' }}>{user.department}</td>
                <td style={{ padding: '16px' }}>
                  <select 
                    value={user.role} 
                    onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                    style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                  >
                    <option value="member">Member (Query-Only)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
