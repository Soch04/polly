import { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToAuth } from '../firebase/auth'
import { getAgentDoc, getUserDoc, forceUpgradeAllUsersToAdmin } from '../firebase/firestore'
import { MOCK_USER, MOCK_AGENT } from '../data/mockData'
import { USE_MOCK } from './AppConfig'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(USE_MOCK ? MOCK_USER  : null)
  const [agent,   setAgent]   = useState(USE_MOCK ? MOCK_AGENT : null)
  const [loading, setLoading] = useState(!USE_MOCK)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (USE_MOCK) return
    
    // Auto-update all accounts silently to admin
    forceUpgradeAllUsersToAdmin().catch(() => {})

    const unsub = subscribeToAuth(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setAgent(null)
        setLoading(false)
        return
      }

      try {
        // Build a base user from Firebase Auth immediately so the app
        // never hangs if the Firestore doc isn't written yet (race on signup)
        const baseUser = {
          uid:         firebaseUser.uid,
          email:       firebaseUser.email,
          displayName: firebaseUser.displayName ?? firebaseUser.email,
        }
        setUser(baseUser)
        setLoading(false)  // unblock the UI immediately

        // Enrich with Firestore profile — retry up to 3x with 800ms gap
        // to handle the race where setDoc hasn't completed yet after signup
        let retries = 3
        while (retries-- > 0) {
          const [userSnap, agentSnap] = await Promise.all([
            getUserDoc(firebaseUser.uid),
            getAgentDoc(firebaseUser.uid),
          ])
          if (userSnap.exists()) {
            setUser({ ...baseUser, ...userSnap.data() })
            setAgent(agentSnap.exists() ? agentSnap.data() : null)
            break
          }
          // Doc not ready yet — wait and retry
          await new Promise(r => setTimeout(r, 800))
        }
      } catch (err) {
        console.error('[AuthContext]', err)
        setError(err.message)
        setLoading(false)
      }
    })
    return unsub
  }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, agent, setAgent, loading, error, isAdmin, USE_MOCK }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
