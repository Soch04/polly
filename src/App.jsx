import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import { EscalationProvider } from './context/EscalationContext'
import Layout from './components/layout/Layout'

// ── Route-level code splitting ─────────────────────────────────────────────
// AuthPage loads eagerly (it's the entry point for unauthenticated users).
// All other pages are lazy-loaded — they only download on first navigation.
import AuthPage from './pages/AuthPage'
const MessagingPage   = lazy(() => import('./pages/MessagingPage'))
const ProfilePage     = lazy(() => import('./pages/ProfilePage'))
const BotSettingsPage = lazy(() => import('./pages/BotSettingsPage'))
const UserInputPage   = lazy(() => import('./pages/UserInputPage'))
const OrgPage         = lazy(() => import('./pages/OrgPage'))
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard'))

// ── Loading fallback ───────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--color-bg)' }}>
      <div className="spinner" />
    </div>
  )
}

/**
 * Guard that requires authentication.
 * In mock mode (VITE_USE_MOCK=true) → always passes through.
 * In live mode → redirects to /auth if no user.
 */
function AuthRoute({ children }) {
  const { user, loading, USE_MOCK } = useAuth()
  if (loading) return <PageLoader />
  if (!USE_MOCK && !user) return <Navigate to="/auth" replace />
  return children
}

/**
 * Guard that requires the user to be an admin.
 * Redirects non-admins to /messaging.
 * Admin check happens HERE — AdminDashboard itself can assume it's authorized.
 */
function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  return isAdmin ? children : <Navigate to="/messaging" replace />
}

/**
 * Main app router — nested inside AuthProvider and AppProvider.
 */
function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Auth — no sidebar */}
          <Route path="/auth" element={<AuthPage />} />

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/messaging" replace />} />

          {/* Authenticated routes */}
          <Route
            path="/messaging"
            element={<AuthRoute><Layout><MessagingPage /></Layout></AuthRoute>}
          />
          <Route
            path="/profile"
            element={<AuthRoute><Layout><ProfilePage /></Layout></AuthRoute>}
          />
          <Route
            path="/bot-settings"
            element={<AuthRoute><Layout><BotSettingsPage /></Layout></AuthRoute>}
          />
          <Route
            path="/user-input"
            element={<AuthRoute><Layout><UserInputPage /></Layout></AuthRoute>}
          />
          <Route
            path="/org"
            element={<AuthRoute><Layout><OrgPage /></Layout></AuthRoute>}
          />

          {/* Protected admin route */}
          <Route
            path="/admin"
            element={
              <AuthRoute>
                <AdminRoute>
                  <Layout><AdminDashboard /></Layout>
                </AdminRoute>
              </AuthRoute>
            }
          />

          {/* Catch-all → messaging */}
          <Route path="*" element={<Navigate to="/messaging" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <EscalationProvider>
          <AppRoutes />
        </EscalationProvider>
      </AuthProvider>
    </AppProvider>
  )
}
