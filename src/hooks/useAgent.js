import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateAgentInstructions, updateAgentStatus } from '../firebase/firestore'
import { useApp } from '../context/AppContext'

export function useAgent() {
  const { agent: initialAgent, USE_MOCK } = useAuth()
  const { addToast } = useApp()
  const [agent,   setAgent]   = useState(initialAgent)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    setAgent(initialAgent)
  }, [initialAgent])

  const saveInstructions = async (instructions) => {
    setSaving(true)
    try {
      if (!USE_MOCK) {
        await updateAgentInstructions(agent.userId, instructions)
      }
      setAgent(prev => ({ ...prev, systemInstructions: instructions }))
      addToast('Agent instructions saved', 'success')
    } catch (err) {
      addToast('Failed to save instructions', 'error')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (status) => {
    try {
      if (!USE_MOCK) {
        await updateAgentStatus(agent.userId, status)
      }
      setAgent(prev => ({ ...prev, status }))
      addToast(`Agent set to ${status}`, 'success')
    } catch (err) {
      addToast('Failed to update status', 'error')
    }
  }

  return { agent, saving, saveInstructions, changeStatus }
}
