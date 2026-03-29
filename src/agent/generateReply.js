/**
 * @module generateReply
 * @description Autonomous agent reply generation for inter-agent interaction requests.
 *
 * Called by useAgentInbox when a pending agent_interaction arrives in Firestore.
 * Runs the SAME RAG pipeline as the main useMessages flow — ensuring the autonomous
 * inbox replies are grounded in org knowledge, not just Gemini's parametric memory.
 *
 * Pipeline (mirrors useMessages.js sendMessage for consistency):
 *  1. queryClassifier   — determine intent from incoming message
 *  2. HyDE              — generate hypothetical doc for embedding (FACTUAL/PROCEDURAL)
 *  3. queryKnowledgeBase — Pinecone ANN retrieval with org namespace + is_approved filter
 *  4. rerankResults     — Gemini cross-encoder scoring (filter ≥6/10)
 *  5. buildCitationBlock — dedup by docId, confidence scoring, token budget trim
 *  6. callGemini        — response generation with exponential backoff
 *
 * Mode: 'autonomous' | 'manual'
 *   autonomous: Gemini must open with [CONFIDENT] or [ESCALATE] token.
 *               [CONFIDENT] → auto-posted to agent_interactions, user notified
 *               [ESCALATE]  → user receives inbox notification for manual reply
 *   manual: Direct reply text returned without token parsing
 *
 * @exports generateAgentReply
 */

import { callGemini } from './gemini'
import { buildSystemPrompt, buildCitationBlock } from './buildPrompt'
import { extractMentionedEmails } from '../utils/parseMentions'
import { classifyApiError } from '../utils/apiHelpers'
import { queryKnowledgeBase } from '../lib/rag'
import { rerankResults } from '../lib/ragReranker'
import { generateHypotheticalDoc, isHyDEBeneficial } from '../lib/hyde'
import { classifyQuery } from './queryClassifier'

/**
 * Generate an agent reply to an incoming inter-agent interaction.
 *
 * @param {Object}   opts
 * @param {Object}   opts.interaction  - Firestore agent_interaction document
 * @param {Object}   opts.user         - Current authenticated user
 * @param {Object}   opts.agent        - Current user's agent profile
 * @param {'autonomous'|'manual'} opts.mode
 * @returns {Promise<{status: 'confident'|'escalate', text: string} | string>}
 */
export async function generateAgentReply({ interaction, user, agent, mode = 'manual' }) {
  const myAgentName  = agent?.displayName ?? `${user.displayName}'s Agent`
  const senderName   = (interaction.senderName || interaction.sender_name) ?? 'Another agent'
  const messageBody  = interaction.messageBody || interaction.content || interaction.body

  // ── Step 1: Classify query intent ────────────────────────────────────────────
  const intent = classifyQuery(messageBody)

  // ── Step 2 + 3: RAG retrieval (with HyDE + reranking) ───────────────────────
  let kbContext  = ''
  let citations  = []

  if (user?.orgId && !intent.skipRAG) {
    try {
      // Step 2a: HyDE — embed a hypothetical answer doc for better retrieval
      const queryForEmbedding = isHyDEBeneficial(intent.type)
        ? await generateHypotheticalDoc(messageBody, '', user?.department)
        : messageBody

      // Step 2b: Pinecone ANN retrieval
      const rawResults = await queryKnowledgeBase(
        user.orgId,
        queryForEmbedding,
        { is_approved: true },
        intent.topK
      )

      if (rawResults.length > 0) {
        // Step 3a: LLM cross-encoder re-ranking
        const reranked = await rerankResults(messageBody, rawResults)

        // Step 3b: Citation block (dedup + confidence + token budget)
        const { block, citations: cites } = buildCitationBlock(reranked)
        kbContext = block
        citations = cites
      }
    } catch (err) {
      console.warn('[Borg] generateAgentReply: RAG pipeline failed, proceeding without KB context:', err.message)
    }
  }

  // ── Step 4: Build prompt ──────────────────────────────────────────────────────
  const rules = [
    `Reply on behalf of ${user.displayName} (${user.email}).`,
    `Be concise (2-3 sentences). Do not use email headers. Write the reply body directly.`,
  ]

  if (mode === 'autonomous') {
    rules.push(
      `Evaluate if you have sufficient information from your profile, system instructions, or the knowledge base context below to answer accurately and confidently.`,
      `If confident: start your response with exactly [CONFIDENT] followed by your reply.`,
      `If uncertain or lacking information: start with exactly [ESCALATE] followed by a brief reason.`,
      `Do not guess. It is better to escalate than to provide incorrect information.`
    )
  } else {
    rules.push(
      `If you genuinely cannot answer from the available context, say so briefly and ask your owner to follow up.`
    )
  }

  const replyPrompt = [
    `You received an inter-agent message from ${senderName} (${interaction.senderEmail || interaction.sender_email}).`,
    `Their message: "${messageBody}"`,
    ``,
    kbContext
      ? `KNOWLEDGE BASE CONTEXT (from approved org documents):\n${kbContext}`
      : `No relevant documents found in the org knowledge base for this query.`,
    ``,
    ...rules,
  ].join('\n')

  // ── Step 5: Gemini call with backoff ──────────────────────────────────────────
  let replyText
  try {
    replyText = await callGemini({
      systemPrompt: buildSystemPrompt(user, agent, '', []),
      userMessage:  replyPrompt,
      history:      [],
      temperature:  intent.temperature,
    })
  } catch (err) {
    const { isQuota } = classifyApiError(err)

    if (isQuota) {
      replyText = mode === 'autonomous'
        ? `[ESCALATE] The system is currently rate-limited. Please review and respond manually to ${senderName}'s message.`
        : `Thank you for reaching out. ${user.displayName} will follow up shortly. — ${myAgentName}`
    } else {
      const originalMentions = extractMentionedEmails(messageBody ?? '')
      const tagStr = originalMentions.map(e => `@${e}`).join(' ')
      replyText = mode === 'autonomous'
        ? `[ESCALATE] A system error occurred during reply generation. Manual response required.`
        : (tagStr ? `received ${tagStr}` : `Thank you for your message — ${myAgentName}`)
    }
  }

  // ── Parse autonomous mode tokens ──────────────────────────────────────────────
  if (mode === 'autonomous') {
    const isConfident = /^\[CONFIDENT\]/i.test(replyText.trim())
    const cleanText   = replyText.replace(/^\[(CONFIDENT|ESCALATE)\]\s*/i, '').trim()
    return {
      status:    isConfident ? 'confident' : 'escalate',
      text:      cleanText,
      citations, // Pass citations back for notification display
    }
  }

  return replyText
}
