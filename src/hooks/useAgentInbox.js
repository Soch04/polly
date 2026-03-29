/**
 * hooks/useAgentInbox.js
 *
 * Subscribes to incoming Bot-to-Bot messages addressed to the current user's agent.
 *
 * Decision tree per message:
 *   1. Call Gemini with a CONFIDENCE CHECK prompt
 *   2. HIGH confidence → generate and log an autonomous reply (sanitized)
 *   3. LOW confidence  → trigger Escalation Protocol:
 *        - setEscalation({ convId, incomingMsg, senderAgentName, topic })
 *        - MessagingPage switches to personal tab and injects escalation banner
 *        - When user replies, useMessages relays the answer back to the B2B thread
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEscalation } from '../context/EscalationContext'
import { USE_MOCK } from '../context/AppConfig'
import { subscribeToIncomingBotMessages } from '../firebase/firestore'
import {
  logBotToBotMessage,
  setConversationActive,
  updateAgentStatus,
  sendBotMessage,
} from '../firebase/firestore'
import { callGemini } from '../agent/gemini'
import { buildSystemPrompt } from '../agent/buildPrompt'
import { sanitizeAgentOutput } from '../agent/sanitize'
import { parseConfidenceResponse } from '../services/handshake'
import { AGENT_STATUS } from '../constants'

// ── Confidence-check prompt template ─────────────────────────────────────────
function buildConfidencePrompt(myAgentName, senderName, question, agentInstructions) {
  return [
    `You are ${myAgentName}. You received this inter-agent message from ${senderName}:`,
    `"${question}"`,
    ``,
    `Your owner's role and instructions: "${agentInstructions ?? 'No specific instructions provided.'}"`,
    ``,
    `CRITICAL RULES — failure to follow = invalid output:`,
    `• Do NOT write any email headers (no "To:", "From:", "Subject:", "CC:", "Date:")`,
    `• Do NOT use email format at all — write natural conversational language only`,
    `• Do NOT describe what you will do — write the actual content`,
    ``,
    `Can you answer this question with high confidence based on your knowledge?`,
    ``,
    `Reply EXACTLY in this format:`,
    `CONFIDENCE: HIGH`,
    `[Your complete reply message — 3 sentences max — conversational tone — no headers]`,
    ``,
    `OR:`,
    ``,
    `CONFIDENCE: LOW`,
    `[One sentence explaining what specific information you are missing]`,
  ].join('\n')
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAgentInbox() {
  const { user, agent }   = useAuth()
  const { setEscalation } = useEscalation()
  const processedRef      = useRef(new Set())
  const initialLoadRef    = useRef(true)

  useEffect(() => {
    if (USE_MOCK || !user?.uid || !agent?.displayName) return

    const unsubscribe = subscribeToIncomingBotMessages(
      user.uid,
      async (snap) => {
        if (initialLoadRef.current) {
          snap.docs.forEach(d => processedRef.current.add(d.id))
          initialLoadRef.current = false
          return
        }

        for (const change of snap.docChanges()) {
          if (change.type !== 'added') continue
          const msg = { id: change.doc.id, ...change.doc.data() }

          if (processedRef.current.has(msg.id)) continue
          if (msg.senderId === user.uid)         continue
          if (!msg.convId)                       continue

          processedRef.current.add(msg.id)

          handleIncoming({ user, agent, incomingMsg: msg, setEscalation }).catch(() => {
            // Errors are handled inside handleIncoming — this catch prevents
            // unhandled promise rejections from crashing the listener
          })
        }
      }
    )

    return () => unsubscribe()
  }, [user?.uid, agent?.displayName, setEscalation])
}

// ── Decision tree ─────────────────────────────────────────────────────────────

async function handleIncoming({ user, agent, incomingMsg, setEscalation }) {
  const myAgentName = agent.displayName
  const senderName  = sanitizeAgentOutput(incomingMsg.senderName ?? 'Unknown Agent')
  const msgContent  = sanitizeAgentOutput(incomingMsg.content ?? '')

  await updateAgentStatus(user.uid, AGENT_STATUS.IN_CONVERSATION).catch(() => {})
  await setConversationActive(incomingMsg.convId, true).catch(() => {})

  // ── Step 1: Confidence check ──────────────────────────────────────────────
  let confidenceResponse
  try {
    confidenceResponse = await callGemini({
      systemPrompt: buildSystemPrompt(user, agent),
      userMessage:  buildConfidencePrompt(
        myAgentName,
        senderName,
        msgContent,
        agent.systemInstructions,
      ),
      history: [],
    })
  } catch {
    confidenceResponse = 'CONFIDENCE: LOW\nUnable to process — system error.'
  }

  const { isHighConfidence, body } = parseConfidenceResponse(confidenceResponse)
  const sanitizedBody = sanitizeAgentOutput(body)

  if (isHighConfidence) {
    // ── Step 2a: Autonomous reply ─────────────────────────────────────────
    const replyContent = sanitizedBody ||
      `Thank you for reaching out. I'll follow up shortly. — ${myAgentName}`

    await logBotToBotMessage(
      user.uid,
      incomingMsg.senderId,
      myAgentName,
      senderName,
      replyContent,
      agent.department ?? 'General',
      incomingMsg.convId,
    )

    // ── Notify the user in their personal chat ────────────────────────────
    const userNotification = await callGemini({
      systemPrompt: buildSystemPrompt(user, agent),
      userMessage:  [
        `You just received and automatically replied to an inter-agent message.`,
        `The message from ${senderName} was:`,
        `"${msgContent}"`,
        ``,
        `Your reply was:`,
        `"${replyContent}"`,
        ``,
        `Write a SHORT (2-3 sentence) natural language notification for ${user.displayName} summarising:`,
        `1. What ${senderName} told you`,
        `2. Any important information or action the user needs to know about`,
        `3. What you replied`,
        ``,
        `Write directly to ${user.displayName}. Be specific about the actual content.`,
        `CRITICAL: If the message mentions anything being misplaced, missing, or someone needs information — make sure to include that clearly.`,
        `Do NOT use email headers. Write in plain, friendly language.`,
      ].join('\n'),
      history: [],
    }).catch(() =>
      `📨 I received a message from ${senderName} in the Agent Hub: "${msgContent.slice(0, 120)}${msgContent.length > 120 ? '…' : ''}". I replied on your behalf.`
    )

    await sendBotMessage(
      user.uid,
      sanitizeAgentOutput(userNotification),
      myAgentName,
    ).catch(() => {})

  } else {
    // ── Step 2b: Escalation → human-in-the-loop ───────────────────────────
    const topic = deriveTopic(msgContent)

    await sendBotMessage(
      user.uid,
      `📨 I received a message from **${senderName}** in the Agent Hub about **${topic}**. I don't have enough information to answer on your behalf — please check the banner below and tell me what to say.`,
      myAgentName,
    ).catch(() => {})

    setEscalation({
      convId:          incomingMsg.convId,
      incomingMsg:     { ...incomingMsg, content: msgContent, senderName },
      senderAgentName: senderName,
      topic,
      reason:          sanitizedBody,
    })
  }

  await updateAgentStatus(user.uid, AGENT_STATUS.ACTIVE).catch(() => {})
  setTimeout(() => setConversationActive(incomingMsg.convId, false).catch(() => {}), 4000)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveTopic(text) {
  if (!text) return 'the request'
  const t = text.toLowerCase()
  if (t.includes('ai use') || t.includes('ai policy'))   return 'AI Use Policy'
  if (t.includes('misplac') || t.includes('missing'))    return 'Misplaced Document'
  if (t.includes('schedule') || t.includes('meeting'))   return 'Scheduling'
  if (t.includes('budget') || t.includes('cost'))        return 'Budget'
  if (t.includes('policy') || t.includes('compliance'))  return 'Compliance Policy'
  if (t.includes('report') || t.includes('data'))        return 'Data Request'
  const words = text.split(/\s+/).slice(0, 6).join(' ')
  return words.length > 3 ? `"${words}…"` : 'the request'
}
