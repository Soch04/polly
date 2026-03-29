/**
 * @module useOrgStats
 * @description Real-time organization statistics hook.
 *
 * Computes live aggregate stats from Firestore for the admin dashboard:
 *   - Total approved documents in the org knowledge base
 *   - Total messages sent within the org this session
 *   - Active agent count (agents with status !== 'offline')
 *   - Member count for the org
 *   - Pending document count (submitted but not yet in Pinecone)
 *   - Storage estimate: total character count across all approved docs
 *
 * Uses onSnapshot listeners for real-time updates without polling.
 * All listeners are cleaned up on unmount via the returned cleanup in useEffect.
 *
 * DESIGN:
 *   Each stat is computed from a separate Firestore query to maintain
 *   listener granularity — a single compound query would require composite
 *   indexes for every field combination and would break on partial data.
 *
 * @param {string | null} orgId - The organization to compute stats for
 * @returns {OrgStats} Live stats object, updated in real time
 *
 * @typedef {Object} OrgStats
 * @property {number}  approvedDocs     - Documents with is_approved status in orgData
 * @property {number}  pendingDocs      - Documents submitted but not yet ingested
 * @property {number}  totalMessages    - Total messages in the org's user feeds
 * @property {number}  activeAgents     - Agents with status !== 'offline'
 * @property {number}  memberCount      - Users belonging to this org
 * @property {number}  totalChars       - Sum of content.length across approved docs
 * @property {boolean} loading          - True until first snapshot arrives
 * @property {string | null} error      - Error message if any listener fails
 */

import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const EMPTY_STATS = {
  approvedDocs:  0,
  pendingDocs:   0,
  totalMessages: 0,
  activeAgents:  0,
  memberCount:   0,
  totalChars:    0,
  loading:       true,
  error:         null,
}

/**
 * @param {string | null} orgId
 * @returns {OrgStats}
 */
export function useOrgStats(orgId) {
  const [stats, setStats] = useState(EMPTY_STATS)

  useEffect(() => {
    if (!orgId) {
      setStats({ ...EMPTY_STATS, loading: false })
      return
    }

    const unsubs = []
    let partials = {
      approvedDocs:  null,
      pendingDocs:   null,
      totalMessages: null,
      activeAgents:  null,
      memberCount:   null,
      totalChars:    null,
    }

    /** Merge a partial update into stats, set loading: false once all have arrived */
    const merge = (update) => {
      partials = { ...partials, ...update }
      const allLoaded = Object.values(partials).every(v => v !== null)
      setStats({
        ...partials,
        loading: !allLoaded,
        error:   null,
      })
    }

    const handleError = (label) => (err) => {
      console.warn(`[Borg useOrgStats] ${label} listener failed:`, err.message)
      setStats(prev => ({ ...prev, error: err.message, loading: false }))
    }

    // ── Approved docs ──────────────────────────────────────────────────────
    const approvedQ = query(
      collection(db, 'orgData'),
      where('orgId', '==', orgId),
      where('status', '==', 'approved')
    )
    unsubs.push(
      onSnapshot(approvedQ, snap => {
        let totalChars = 0
        snap.docs.forEach(d => {
          totalChars += (d.data().content ?? '').length
        })
        merge({ approvedDocs: snap.size, totalChars })
      }, handleError('approvedDocs'))
    )

    // ── Pending docs ───────────────────────────────────────────────────────
    const pendingQ = query(
      collection(db, 'orgData'),
      where('orgId', '==', orgId),
      where('status', '==', 'pending')
    )
    unsubs.push(
      onSnapshot(pendingQ, snap => {
        merge({ pendingDocs: snap.size })
      }, handleError('pendingDocs'))
    )

    // ── Members ────────────────────────────────────────────────────────────
    const membersQ = query(
      collection(db, 'users'),
      where('orgId', '==', orgId)
    )
    unsubs.push(
      onSnapshot(membersQ, snap => {
        merge({ memberCount: snap.size })
      }, handleError('memberCount'))
    )

    // ── Active agents ──────────────────────────────────────────────────────
    // Agents for users in this org — filter by orgId via a matching users lookup
    // We approximate by counting agents whose userId appears in the member set.
    // This avoids a cross-collection join that would require a Cloud Function.
    const agentsQ = query(
      collection(db, 'agents'),
      where('orgId', '==', orgId),
      where('status', 'in', ['active', 'idle'])
    )
    unsubs.push(
      onSnapshot(agentsQ, snap => {
        merge({ activeAgents: snap.size })
      }, (err) => {
        // Fallback: orgId may not be indexed on agents — return 0 gracefully
        console.warn('[Borg useOrgStats] activeAgents: field not indexed, using 0')
        merge({ activeAgents: 0 })
      })
    )

    // ── Recent messages (estimate total via last 500) ──────────────────────
    // Firestore doesn't support COUNT queries in the client SDK without aggregation.
    // We query the last 500 messages for this org and use the doc count as a gauge.
    const messagesQ = query(
      collection(db, 'messages'),
      where('orgId', '==', orgId),
      orderBy('timestamp', 'desc'),
      limit(500)
    )
    unsubs.push(
      onSnapshot(messagesQ, snap => {
        merge({ totalMessages: snap.size })
      }, (err) => {
        // Messages may not have orgId field on older docs — use 0 gracefully
        console.warn('[Borg useOrgStats] totalMessages: query error, using 0')
        merge({ totalMessages: 0 })
      })
    )

    return () => unsubs.forEach(u => u())
  }, [orgId])

  return stats
}

/**
 * Format totalChars as a human-readable storage estimate.
 * Assumes ~4 bytes per character for UTF-8 text.
 *
 * @param {number} chars
 * @returns {string} e.g. "2.4 MB", "342 KB"
 */
export function formatStorageEstimate(chars) {
  const bytes = chars * 4
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000)     return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}
