/**
 * context/AppConfig.js
 *
 * Re-exports from src/config/env.js for backward compatibility.
 * All new code should import from '../config/env' directly.
 */
import { ENV } from '../config/env'
import { GEMINI_LITE_MODEL } from '../constants'

export const USE_MOCK                   = ENV.USE_MOCK
export const ENABLE_INTERNAL_MONOLOGUE  = ENV.ENABLE_INTERNAL_MONOLOGUE
export const HIDE_ORG_DATA_UI           = ENV.HIDE_ORG_DATA_UI

export const GEMINI_API_KEY  = ENV.GEMINI_API_KEY
export const GEMINI_MODEL    = GEMINI_LITE_MODEL   // canonical model constant

export const PINECONE_API_KEY = ENV.PINECONE_API_KEY
export const PINECONE_ENV     = ENV.PINECONE_ENVIRONMENT
export const PINECONE_INDEX   = ENV.PINECONE_INDEX_NAME
