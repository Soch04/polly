/**
 * EscalationContext.jsx
 *
 * Shared state for the human-in-the-loop escalation protocol.
 *
 * When an agent cannot answer an incoming B2B message with high confidence,
 * it calls setEscalation() with the context. MessagingPage reads this to:
 *   1. Switch to the personal "My Agent" tab
 *   2. Inject an escalation banner into the personal chat
 *   3. Relay the user's reply back to the B2B conversation thread
 */

import { createContext, useContext, useState, useCallback } from 'react'

const EscalationContext = createContext(null)

export function EscalationProvider({ children }) {
  // escalation: null | {
  //   convId, incomingMsg, senderAgentName, topic,
  //   messageId  — injected into personal chat for tracking
  // }
  const [escalation, setEscalationRaw] = useState(null)

  const setEscalation = useCallback((data) => {
    console.log('[Escalation] Escalation triggered for convId:', data?.convId)
    setEscalationRaw(data)
  }, [])

  const clearEscalation = useCallback(() => {
    console.log('[Escalation] Escalation cleared')
    setEscalationRaw(null)
  }, [])

  return (
    <EscalationContext.Provider value={{ escalation, setEscalation, clearEscalation }}>
      {children}
    </EscalationContext.Provider>
  )
}

export function useEscalation() {
  const ctx = useContext(EscalationContext)
  if (!ctx) throw new Error('useEscalation must be used within EscalationProvider')
  return ctx
}
