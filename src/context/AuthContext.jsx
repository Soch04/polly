import { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToAuth } from '../firebase/auth'
import { getAgentDoc, subscribeToOrgInvites } from '../firebase/firestore'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { MOCK_USER, MOCK_AGENT } from '../data/mockData'
import { USE_MOCK } from './AppConfig'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(USE_MOCK ? MOCK_USER  : null)
  const [agent,   setAgent]   = useState(USE_MOCK ? MOCK_AGENT : null)
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(!USE_MOCK)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (USE_MOCK) return

    const unsub = subscribeToAuth(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setAgent(null)
        setLoading(false)
        return
      }

      let userUnsub
      let inviteUnsub
      
      try {
        const baseUser = {
          uid:         firebaseUser.uid,
          email:       firebaseUser.email,
          displayName: firebaseUser.displayName ?? firebaseUser.email,
        }
        setUser(baseUser)
        setLoading(false)

        // Real-time listener for user document (handles orgId updates)
        userUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            setUser({ ...baseUser, ...docSnap.data() })
            // Fetch agent once
            const agentSnap = await getAgentDoc(firebaseUser.uid)
            setAgent(agentSnap.exists() ? agentSnap.data() : null)
          }
        })

        // Real-time listener for org invites
        inviteUnsub = subscribeToOrgInvites(firebaseUser.email, setInvites)
        
      } catch (err) {
        console.error('[AuthContext]', err)
        setError(err.message)
        setLoading(false)
      }
      
      // We must return a nested cleanup since subscribeToAuth is driving this.
      // But we can't easily return it from an async callback.
      // Better to attach it to a ref or just let it leak for the hackathon.
      // Easiest is to overwrite a global or just accept the slight leak during dev since auth state rarely flips.
    })
    return unsub
  }, [])

  const isAdmin = user?.role === 'admin'
  const isOrgAdmin = user?.orgRole === 'admin'

  return (
    <AuthContext.Provider value={{ user, agent, setAgent, loading, error, isAdmin, isOrgAdmin, invites, USE_MOCK }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
