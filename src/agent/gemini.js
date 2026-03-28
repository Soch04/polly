/**
 * gemini.js
 * Wrapper around the Google Gemini REST API.
 * Uses the generateContent endpoint directly (no SDK dependency).
 *
 * Why REST vs SDK: The @google/generative-ai npm SDK does not yet support
 * browser environments cleanly with Vite. The REST endpoint works directly.
 */

import { GEMINI_API_KEY, GEMINI_MODEL } from '../context/AppConfig'

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/**
 * Call Gemini with a system prompt + conversation history.
 *
 * @param {string}   systemPrompt  — built by buildSystemPrompt()
 * @param {string}   userMessage   — the user's current message
 * @param {Array}    history       — prior turns: [{role, content}]
 * @returns {Promise<string>}      — Gemini's text response
 */
export async function callGemini({ systemPrompt, userMessage, history = [] }) {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY is not set in .env')
  }

  // Build the contents array in Gemini's format
  // System message is passed as a system_instruction (v1beta feature)
  const contents = [
    // Convert history to Gemini turn format
    ...history.map(turn => ({
      role:  turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.content }],
    })),
    // Current user message
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
      temperature:     0.3,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gemini API error ${res.status}: ${err?.error?.message ?? res.statusText}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  return text
}
