import { useApp } from '../../context/AppContext'
import { RiCheckboxCircleLine, RiErrorWarningLine, RiInformationLine, RiCloseLine } from 'react-icons/ri'

const icons = {
  success: <RiCheckboxCircleLine style={{ color: 'var(--color-success)' }} />,
  error:   <RiErrorWarningLine   style={{ color: 'var(--color-danger)'  }} />,
  info:    <RiInformationLine    style={{ color: 'var(--color-accent)'  }} />,
}

export default function ToastContainer() {
  const { toasts, removeToast } = useApp()
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(({ id, message, type }) => (
        <div key={id} className={`toast toast-${type} animate-fade-in`}>
          {icons[type]}
          <span style={{ flex: 1 }}>{message}</span>
          <button
            onClick={() => removeToast(id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
            aria-label="Dismiss"
          >
            <RiCloseLine />
          </button>
        </div>
      ))}
    </div>
  )
}
