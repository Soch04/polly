/**
 * gemini.js
 * Wrapper around the Google Gemini REST API (v1beta generateContent endpoint).
 *
 * Why REST vs SDK: The @google/generative-ai npm SDK does not support browser
 * environments cleanly with Vite — the REST endpoint works without Node.js shims.
 *
 * Features:
 *  - Exponential backoff retry for transient errors (429 rate limit, 503 unavailable)
 *  - Configurable temperature and max output tokens
 *  - Multi-turn conversation history in Gemini's native format
 *  - System instruction support (v1beta feature)
 */

import { GEMINI_API_KEY, GEMINI_MODEL } from '../context/AppConfig'

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/** Errors that are safe to retry (transient infrastructure issues) */
const RETRYABLE_STATUSES = new Set([429, 500, 503])

/**
 * Exponential backoff delay: 1s → 2s → 4s (with ±10% jitter to avoid thundering herd).
 * @param {number} attempt - 0-indexed attempt number
 * @returns {Promise<void>}
 */
function backoffDelay(attempt) {
  const baseMs  = 1000 * Math.pow(2, attempt)           // 1000, 2000, 4000
  const jitter  = baseMs * 0.1 * (Math.random() * 2 - 1) // ±10%
  return new Promise(resolve => setTimeout(resolve, baseMs + jitter))
}

/**
 * Call Gemini with a system prompt + conversation history.
 * Retries up to MAX_ATTEMPTS times on transient errors with exponential backoff.
 *
 * @param {string}   systemPrompt  — built by buildSystemPrompt()
 * @param {string}   userMessage   — the user's current message
 * @param {Array}    history       — prior turns: [{ role: 'user'|'assistant', content: string }]
 * @param {number}   [temperature] — sampling temperature (default 0.3 for factual grounding)
 * @param {number}   [maxTokens]   — max output tokens (default 1024)
 * @returns {Promise<string>}      — Gemini's text response
 * @throws {Error}                 — after all retry attempts exhausted, or on non-retryable error
 */
export async function callGemini({
  systemPrompt,
  userMessage,
  history      = [],
  temperature  = 0.3,
  maxTokens    = 1024,
}) {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY is not set in .env')
  }

  // Build the contents array in Gemini's multi-turn format
  const contents = [
    ...history.map(turn => ({
      role:  turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.content }],
    })),
    {
      role:  'user',
      parts: [{ text: userMessage }],
    },
  ]

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const MAX_ATTEMPTS = 3
  let lastError

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await backoffDelay(attempt - 1)  // wait before retry, not before first attempt
    }

    const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

      if (!text) {
        // Check for content policy block
        const finishReason = data?.candidates?.[0]?.finishReason
        if (finishReason === 'SAFETY') {
          throw new Error('Gemini blocked the response due to safety filters.')
        }
        throw new Error('Gemini returned an empty response — no text candidate produced.')
      }

      return text
    }

    // Non-OK response — check if retryable
    const errBody  = await res.json().catch(() => ({}))
    const errMsg   = errBody?.error?.message ?? res.statusText
    lastError = new Error(`Gemini API error ${res.status}: ${errMsg}`)

    if (!RETRYABLE_STATUSES.has(res.status)) {
      // 400 Bad Request, 401 Unauthorized, 404 Not Found — don't retry
      throw lastError
    }

    console.warn(`[Borg] Gemini ${res.status} on attempt ${attempt + 1}/${MAX_ATTEMPTS} — retrying...`)
  }

  throw lastError
}
