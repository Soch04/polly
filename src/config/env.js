/**
 * src/config/env.js
 *
 * Single access point for all environment variables.
 * Validates required vars at import time — throws early with a clear
 * message rather than a cryptic runtime error deep in a service call.
 *
 * NOTE: Firebase config values are semi-public (they end up in the client
 * bundle). Gemini and Pinecone keys must never be logged anywhere.
 */

// Required in live mode. In mock mode (VITE_USE_MOCK=true) these can be
// absent — we skip validation when USE_MOCK is true so devs can run the
// app without real credentials.
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

if (!USE_MOCK) {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_GEMINI_API_KEY',
  ]

  required.forEach(key => {
    if (!import.meta.env[key]) {
      throw new Error(
        `[Borg] Missing required environment variable: ${key}. ` +
        `Set VITE_USE_MOCK=true in .env to run without live credentials.`
      )
    }
  })
}

export const ENV = {
  // Feature flags
  USE_MOCK:                    USE_MOCK,
  ENABLE_INTERNAL_MONOLOGUE:   import.meta.env.VITE_ENABLE_INTERNAL_MONOLOGUE === 'true',
  HIDE_ORG_DATA_UI:            import.meta.env.VITE_HIDE_ORG_DATA_UI === 'true',

  // Firebase (semi-public — safe to have in bundle)
  FIREBASE_API_KEY:             import.meta.env.VITE_FIREBASE_API_KEY            ?? '',
  FIREBASE_AUTH_DOMAIN:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? '',
  FIREBASE_PROJECT_ID:          import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? '',
  FIREBASE_STORAGE_BUCKET:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? '',
  FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  FIREBASE_APP_ID:              import.meta.env.VITE_FIREBASE_APP_ID             ?? '',

  // AI APIs (must never be logged)
  GEMINI_API_KEY:       import.meta.env.VITE_GEMINI_API_KEY       ?? '',
  PINECONE_API_KEY:     import.meta.env.VITE_PINECONE_API_KEY     ?? '',
  PINECONE_ENVIRONMENT: import.meta.env.VITE_PINECONE_ENVIRONMENT ?? '',
  PINECONE_INDEX_NAME:  import.meta.env.VITE_PINECONE_INDEX_NAME  ?? 'borg-knowledge',

  // Upstash Redis (Phase 2 — optional)
  UPSTASH_REDIS_URL:   import.meta.env.VITE_UPSTASH_REDIS_URL   ?? '',
  UPSTASH_REDIS_TOKEN: import.meta.env.VITE_UPSTASH_REDIS_TOKEN ?? '',
}
