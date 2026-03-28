import {
  RiMessage2Line, RiTeamLine, RiSignalWifiLine,
  RiCircleFill, RiArrowRightLine,
} from 'react-icons/ri'
import './ChatSidebar.css'

/**
 * ChatSidebar — Left pane of the Agent Hub.
 * Shows "Direct Missions" (1:1) and "Departmental War Rooms" (group)
 * with live status indicators, unread badges, and context tags.
 */
export default function ChatSidebar({
  directConvs,
  groupConvs,
  selectedConvId,
  onSelect,
  activeConvIds,
  unreadCounts,
}) {
  return (
    <aside className="chat-sidebar" aria-label="Agent conversations">
      {/* ── Header ── */}
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-title">
          <RiSignalWifiLine className="hub-icon" />
          Agent Hub
        </div>
        <div className="hub-live-badge">
          <span className="hub-live-dot" />
          Live
        </div>
      </div>

      {/* ── Direct Missions ── */}
      <SectionHeader
        icon={<RiMessage2Line />}
        label="Direct Missions"
        count={directConvs.length}
      />
      <div className="conv-list" role="listbox" aria-label="Direct missions">
        {directConvs.length === 0 ? (
          <div className="conv-empty">No active 1:1 missions</div>
        ) : (
          directConvs.map(conv => (
            <ConvItem
              key={conv.id}
              conv={conv}
              isSelected={selectedConvId === conv.id}
              isActive={activeConvIds.includes(conv.id)}
              unread={unreadCounts[conv.id] ?? 0}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <div className="conv-section-divider" />

      {/* ── War Rooms ── */}
      <SectionHeader
        icon={<RiTeamLine />}
        label="Departmental War Rooms"
        count={groupConvs.length}
      />
      <div className="conv-list" role="listbox" aria-label="Departmental war rooms">
        {groupConvs.length === 0 ? (
          <div className="conv-empty">No active war rooms</div>
        ) : (
          groupConvs.map(conv => (
            <ConvItem
              key={conv.id}
              conv={conv}
              isSelected={selectedConvId === conv.id}
              isActive={activeConvIds.includes(conv.id)}
              unread={unreadCounts[conv.id] ?? 0}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  )
}

/* ── Section header ── */
function SectionHeader({ icon, label, count }) {
  return (
    <div className="conv-section-header">
      <span className="section-header-icon">{icon}</span>
      <span className="section-header-label">{label}</span>
      <span className="section-header-count">{count}</span>
    </div>
  )
}

/* ── Conversation list item ── */
function ConvItem({ conv, isSelected, isActive, unread, onSelect }) {
  const title = conv.type === 'group'
    ? `${conv.department} War Room`
    : conv.participantNames.filter(n => !n.startsWith("Alex")).join(', ') || conv.participantNames[1]

  const subtitle = conv.type === 'group'
    ? `${conv.participantNames.length} agents`
    : conv.participantNames.join(' · ')

  const timeStr = formatRelativeTime(conv.lastActivity)

  return (
    <button
      id={`conv-item-${conv.id}`}
      role="option"
      aria-selected={isSelected}
      className={`conv-item ${isSelected ? 'conv-item-selected' : ''} ${isActive ? 'conv-item-active' : ''}`}
      onClick={() => onSelect(conv.id)}
    >
      {/* Status dot */}
      <div className="conv-status-col">
        <div className={`conv-status-dot ${isActive ? 'dot-active' : 'dot-idle'}`} />
      </div>

      {/* Avatar */}
      <div className={`conv-avatar ${conv.type === 'group' ? 'conv-avatar-group' : 'conv-avatar-direct'}`}>
        {conv.type === 'group' ? (
          <RiTeamLine />
        ) : (
          <span>{(title[0] ?? '?').toUpperCase()}</span>
        )}
      </div>

      {/* Content */}
      <div className="conv-content">
        <div className="conv-header-row">
          <span className="conv-title">{title}</span>
          <span className="conv-time">{timeStr}</span>
        </div>
        <div className="conv-context-row">
          <span className="conv-context-tag">{conv.contextType}</span>
          {isActive && <span className="conv-processing-text">processing…</span>}
        </div>
        <div className="conv-last-msg">{conv.lastMessage}</div>
      </div>

      {/* Unread badge */}
      {unread > 0 && (
        <div className="conv-unread-badge">{unread > 9 ? '9+' : unread}</div>
      )}
    </button>
  )
}

function formatRelativeTime(date) {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  if (mins < 1)   return 'now'
  if (mins < 60)  return `${mins}m`
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
