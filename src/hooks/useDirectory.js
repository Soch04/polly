/**
 * useDirectory.js
 * Fetches + caches the org member directory from Firestore.
 * Only loads once per session — no reads on every keystroke.
 */
import { useState, useEffect, useRef } from 'react'
import { getOrgDirectory } from '../firebase/firestore'
import { USE_MOCK } from '../context/AppConfig'
import { MOCK_ALL_AGENTS } from '../data/mockData'

// Module-level cache so it survives component re-mounts within a session
let _cache = null

export function useDirectory() {
  const [members, setMembers] = useState(_cache ?? [])
  const [loading, setLoading] = useState(!_cache)
  const fetched = useRef(!!_cache)

  useEffect(() => {
    if (fetched.current) return   // already loaded this session
    fetched.current = true

    if (USE_MOCK) {
      const mockDir = (MOCK_ALL_AGENTS ?? []).map((a, i) => ({
        uid:         `mock-${i}`,
        displayName: a.displayName?.replace(/'s Agent$/, '') ?? `User ${i}`,
        email:       `user${i}@borg.org`,
        department:  a.department ?? '',
        avatar:      a.displayName?.[0]?.toUpperCase() ?? '?',
      }))
      _cache = mockDir
      setMembers(mockDir)
      setLoading(false)
      return
    }

    getOrgDirectory()
      .then(docs => {
        const dir = docs.map(d => ({
          uid:         d.uid,
          displayName: d.displayName ?? d.email,
          email:       d.email,
          department:  d.department ?? '',
          avatar:      (d.displayName ?? d.email)?.[0]?.toUpperCase() ?? '?',
        }))
        _cache = dir
        setMembers(dir)
      })
      .catch(err => {
        console.error('[useDirectory] FAILED to fetch org directory:', err.code, err.message)
      })
      .finally(() => setLoading(false))
  }, [])

  /** Filter members by a partial name query (case-insensitive) */
  const search = (query) => {
    if (!query) return members
    const q = query.toLowerCase()
    return members.filter(m =>
      m.displayName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    )
  }

  return { members, loading, search }
}
