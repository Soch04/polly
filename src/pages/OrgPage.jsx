import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { submitOrgData, subscribeToUserOrgData } from '../firebase/firestore'
import { MOCK_ORG_DATA, DEPARTMENTS } from '../data/mockData'
import { RiBuildingLine, RiUpload2Line, RiFileTextLine, RiTimeLine, RiCheckLine, RiCloseLine } from 'react-icons/ri'
import './OrgPage.css'

export default function OrgPage() {
  const { user, USE_MOCK } = useAuth()
  const { addToast } = useApp()

  const [orgItems, setOrgItems] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [form, setForm] = useState({
    title:      '',
    content:    '',
    department: user?.department ?? '',
    fileType:   'text',
  })

  useEffect(() => {
    if (USE_MOCK) {
      // Show only items submitted by this mock user
      setOrgItems(MOCK_ORG_DATA.filter(d => d.uploaderName === 'Alex Rivera'))
      return
    }
    if (!user?.uid) return
    const unsub = subscribeToUserOrgData(user.uid, setOrgItems)
    return unsub
  }, [user?.uid, USE_MOCK])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) {
      addToast('Please fill in all required fields', 'error')
      return
    }
    setSubmitting(true)
    try {
      if (!USE_MOCK) {
        await submitOrgData(user.uid, user.displayName, form)
      } else {
        // Optimistically add to local state in mock mode
        const mockItem = {
          id:          `org-${Date.now()}`,
          ...form,
          uploaderName: user.displayName,
          status:      'pending',
          createdAt:   { toDate: () => new Date() },
        }
        setOrgItems(prev => [mockItem, ...prev])
      }
      addToast('Organizational data submitted for admin review', 'success')
      setForm({ title: '', content: '', department: user?.department ?? '', fileType: 'text' })
    } catch (err) {
      addToast('Failed to submit data', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-content">
    <div className="org-page animate-fade-in">
      <div className="page-header">
        <h1>
          <RiBuildingLine style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
          Organization
        </h1>
        <p>Submit organizational knowledge for your agents to access. New entries require admin approval.</p>
      </div>

      <div className="org-grid">
        {/* ── Submit Form ── */}
        <div className="card org-form-card">
          <div className="org-form-header">
            <RiUpload2Line className="form-header-icon" />
            <div>
              <h3>Submit Org Data</h3>
              <p className="card-section-desc" style={{ margin: 0 }}>
                Add policies, handbooks, or department knowledge to the shared Knowledge Base.
              </p>
            </div>
          </div>

          <div className="pending-notice">
            <RiTimeLine />
            <span>Submissions are <strong>pending review</strong> until approved by an admin. Agents cannot access pending data.</span>
          </div>

          <form onSubmit={handleSubmit} className="org-form" id="org-data-form">
            <div className="form-group">
              <label className="form-label" htmlFor="org-title">Title *</label>
              <input
                id="org-title"
                className="form-input"
                placeholder="e.g. Remote Work Policy Q2 2024"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="org-dept">Department</label>
                <select
                  id="org-dept"
                  className="form-select"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                >
                  <option value="global">Global (All Departments)</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="org-type">Content Type</label>
                <select
                  id="org-type"
                  className="form-select"
                  value={form.fileType}
                  onChange={e => setForm(f => ({ ...f, fileType: e.target.value }))}
                >
                  <option value="text">Plain Text / Policy</option>
                  <option value="document">Document Reference</option>
                  <option value="faq">FAQ / Q&A</option>
                  <option value="sop">SOP / Procedure</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="org-content">Content *</label>
              <textarea
                id="org-content"
                className="form-textarea"
                placeholder="Paste the full text of the policy, handbook section, or knowledge to be indexed..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={8}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                This content will be chunked and vectorized for RAG retrieval once approved.
              </span>
            </div>

            <div className="file-drop-zone" onClick={() => addToast('File upload coming in Phase 2', 'info')} role="button" tabIndex={0} aria-label="Upload document file">
              <RiUpload2Line style={{ fontSize: '2rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Drop a file or <span style={{ color: 'var(--color-accent)' }}>click to upload</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                PDF, DOCX, TXT — up to 10MB (Phase 2)
              </div>
            </div>

            <button
              type="submit"
              id="btn-submit-org-data"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? <><span className="spinner" style={{ width: 16, height: 16 }} />Submitting...</>
                : <><RiUpload2Line />Submit for Review</>
              }
            </button>
          </form>
        </div>

        {/* ── My Submissions ── */}
        <div className="card org-submissions-card">
          <h3 className="card-section-title">My Submissions</h3>
          <div className="submissions-list">
            {orgItems.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <div className="empty-state-icon">📄</div>
                <h3>No submissions yet</h3>
                <p>Your submitted org data will appear here.</p>
              </div>
            ) : (
              orgItems.map(item => (
                <OrgDataItem key={item.id} item={item} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

function OrgDataItem({ item }) {
  const { title, department, status, fileType, createdAt } = item
  const date = createdAt?.toDate?.()?.toLocaleDateString() ?? '—'

  const statusIcons = {
    pending:  <RiTimeLine  style={{ color: 'var(--color-warning)' }} />,
    approved: <RiCheckLine style={{ color: 'var(--color-success)' }} />,
    rejected: <RiCloseLine style={{ color: 'var(--color-danger)'  }} />,
  }

  return (
    <div className="submission-item card-hover">
      <div className="submission-icon">
        <RiFileTextLine />
      </div>
      <div className="submission-info">
        <div className="submission-title">{title}</div>
        <div className="submission-meta">
          <span>{department}</span>
          <span>·</span>
          <span>{fileType}</span>
          <span>·</span>
          <span>{date}</span>
        </div>
      </div>
      <div className="submission-status">
        {statusIcons[status]}
        <span className={`badge badge-${status}`}>{status}</span>
      </div>
    </div>
  )
}
