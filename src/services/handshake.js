/**
 * src/services/handshake.js
 *
 * Borg Agent Handshake v1 protocol utilities.
 * All code that constructs or evaluates handshake objects must use
 * these functions — never build the shape by hand.
 */
import { v4 as uuidv4 } from 'uuid'
import {
  PROTOCOL_VERSION,
  HANDSHAKE_TTL,
  CONFIDENCE_THRESHOLD,
  PRIORITY,
  HANDSHAKE_TYPES,
} from '../constants'

/**
 * @typedef {object} HandshakePayload
 * @property {string}  subject
 * @property {string}  priority  - one of PRIORITY.*
 * @property {string}  body
 * @property {string|null} [deadline]
 */

/**
 * @typedef {object} HandshakeRequest
 * @property {string} protocol   - always PROTOCOL_VERSION
 * @property {string} requestId  - uuid v4
 * @property {string} fromAgentId
 * @property {string} toAgentId
 * @property {string} timestamp  - ISO 8601
 * @property {string} type       - one of HANDSHAKE_TYPES.*
 * @property {HandshakePayload} payload
 * @property {number} ttl        - seconds until the request expires
 */

/**
 * Build a valid outbound handshake request object.
 *
 * @param {string} fromAgentId
 * @param {string} toAgentId
 * @param {keyof typeof HANDSHAKE_TYPES} type
 * @param {HandshakePayload} payload
 * @returns {HandshakeRequest}
 */
export function buildHandshake(fromAgentId, toAgentId, type, payload) {
  return {
    protocol:    PROTOCOL_VERSION,
    requestId:   uuidv4(),
    fromAgentId,
    toAgentId,
    timestamp:   new Date().toISOString(),
    type,
    payload: {
      subject:  payload.subject,
      priority: payload.priority ?? PRIORITY.NORMAL,
      deadline: payload.deadline ?? null,
      body:     payload.body,
    },
    ttl: HANDSHAKE_TTL,
  }
}

/**
 * Evaluate whether a confidence score requires human escalation.
 * Uses the canonical CONFIDENCE_THRESHOLD constant (0.75).
 *
 * @param {number} confidenceScore - 0.0 to 1.0
 * @returns {boolean} true if human escalation is needed
 */
export function requiresEscalation(confidenceScore) {
  return confidenceScore < CONFIDENCE_THRESHOLD
}

/**
 * Parse confidence from the structured Gemini confidence-check response.
 * Response format: "CONFIDENCE: HIGH\n[body]" or "CONFIDENCE: LOW\n[body]"
 *
 * @param {string} responseText
 * @returns {{ isHighConfidence: boolean, body: string }}
 */
export function parseConfidenceResponse(responseText) {
  const firstLine        = responseText.split('\n')[0].trim().toUpperCase()
  const isHighConfidence = firstLine.includes('CONFIDENCE: HIGH')
  const body             = responseText.split('\n').slice(1).join('\n').trim()
  return { isHighConfidence, body }
}

/**
 * Serialize a handshake to the JSON string format used in message content.
 * @param {HandshakeRequest} handshake
 * @returns {string}
 */
export function serializeHandshake(handshake) {
  return JSON.stringify(handshake)
}

/**
 * Check whether a message content string is a serialized handshake.
 * @param {string} content
 * @returns {boolean}
 */
export function isHandshakeMessage(content) {
  try {
    const parsed = JSON.parse(content)
    return parsed?.protocol === PROTOCOL_VERSION
  } catch {
    return false
  }
}
