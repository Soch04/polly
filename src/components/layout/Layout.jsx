import Sidebar from './Sidebar'
import ToastContainer from '../ui/ToastContainer'
import './Layout.css'

export default function Layout({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="layout-main">
        {children}
      </main>
      <ToastContainer />
    </div>
  )
}
