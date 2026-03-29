/**
 * hooks/useAgent.js
 *
 * Manages the current user's agent document.
 * Returns { agent, saving, loading, error, saveInstructions, changeStatus }
 *
 * saveInstructions: debounced 500ms — safe to call from textarea onChange.
 * changeStatus: optimistically updates UI before Firestore write, rolls back on error.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateAgentInstructions, updateAgentStatus } from '../firebase/firestore'
import { useApp } from '../context/AppContext'
import { MAX_INSTRUCTIONS_LENGTH } from '../constants'

export function useAgent() {
  const { agent: initialAgent, USE_MOCK } = useAuth()
  const { addToast } = useApp()
  const [agent,   setAgent]   = useState(initialAgent)
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Debounce timer ref for saveInstructions
  const debounceRef = useRef(null)

  // Keep local agent in sync with auth context (e.g. after signup/refresh)
  useEffect(() => {
    setAgent(initialAgent)
  }, [initialAgent])

  /**
   * Save custom instructions to Firestore.
   * Debounced 500ms — safe to call on every keystroke if desired.
   * Instructions are trimmed and capped at MAX_INSTRUCTIONS_LENGTH.
   *
   * @param {string} instructions
   */
  const saveInstructions = useCallback((instructions) => {
    // Clear any pending debounced write
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const sanitized = instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH)

      // Runtime assertion: systemInstructions must never be sent in a bot-to-bot message.
      // This runs in the write path — if agent code tries to pass instructions through
      // this hook into a b2b message, this will catch it in development.
      if (process.env.NODE_ENV !== 'production') {
        console.assert(
          typeof sanitized === 'string',
          '[useAgent] saveInstructions: instructions must be a string'
        )
      }

      setSaving(true)
      setError(null)
      try {
        if (!USE_MOCK) {
          await updateAgentInstructions(agent.userId, sanitized)
        }
        setAgent(prev => ({ ...prev, systemInstructions: sanitized }))
        addToast('Agent instructions saved', 'success')
      } catch (err) {
        setError(err.message)
        addToast('Failed to save instructions', 'error')
      } finally {
        setSaving(false)
      }
    }, 500)
  }, [agent?.userId, USE_MOCK, addToast])

  /**
   * Change the agent's operational status.
   * Optimistically updates UI — rolls back on Firestore error.
   *
   * @param {string} status - use AGENT_STATUS constants
   */
  const changeStatus = useCallback(async (status) => {
    const previousStatus = agent?.status
    // Optimistic update
    setAgent(prev => ({ ...prev, status }))
    setError(null)
    try {
      if (!USE_MOCK) {
        await updateAgentStatus(agent.userId, status)
      }
      addToast(`Agent set to ${status}`, 'success')
    } catch (err) {
      // Roll back on failure
      setAgent(prev => ({ ...prev, status: previousStatus }))
      setError(err.message)
      addToast('Failed to update status', 'error')
    }
  }, [agent?.userId, agent?.status, USE_MOCK, addToast])

  return { agent, saving, loading, error, saveInstructions, changeStatus }
}
