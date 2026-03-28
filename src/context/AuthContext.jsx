import { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToAuth } from '../firebase/auth'
import { getAgentDoc, getUserDoc } from '../firebase/firestore'
import { MOCK_USER, MOCK_AGENT } from '../data/mockData'

const AuthContext = createContext(null)

// Set to true to bypass Firebase and use mock data
// Flip to false once you have Firebase keys in .env
const USE_MOCK = true

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(USE_MOCK ? MOCK_USER  : null)
  const [agent,   setAgent]   = useState(USE_MOCK ? MOCK_AGENT : null)
  const [loading, setLoading] = useState(!USE_MOCK)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (USE_MOCK) return   // Skip Firebase listener in mock mode

    const unsub = subscribeToAuth(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Load user + agent docs from Firestore
          const [userSnap, agentSnap] = await Promise.all([
            getUserDoc(firebaseUser.uid),
            getAgentDoc(firebaseUser.uid),
          ])
          setUser({ uid: firebaseUser.uid, ...userSnap.data() })
          setAgent(agentSnap.exists() ? agentSnap.data() : null)
        } else {
          setUser(null)
          setAgent(null)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, agent, loading, error, isAdmin, USE_MOCK }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
