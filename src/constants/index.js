// ============================================================
// src/constants/index.js
// Single source of truth for all magic strings and configuration
// constants used across the Borg codebase.
// ============================================================

// Firestore collection names
export const COLLECTIONS = {
  USERS:         'users',
  AGENTS:        'agents',
  MESSAGES:      'messages',
  ORG_DATA:      'orgData',
  CONVERSATIONS: 'conversations',
  AGENT_MAILBOX: 'agentMailbox',
}

// Protocol
export const PROTOCOL_VERSION                   = 'borg-agent-handshake-v1'
export const HANDSHAKE_TTL                      = 300
export const MAX_INTER_AGENT_REQUESTS_PER_HOUR  = 10
export const CONFIDENCE_THRESHOLD               = 0.75
export const URGENT_CONFIRMATION_WINDOW_SECONDS = 60

// Pinecone
export const PINECONE_TOP_K          = 5
export const PINECONE_INDEX_DEFAULT  = 'borg-org-knowledge'
export const EMBEDDING_DIMENSIONS    = 768

// Gemini
export const GEMINI_FLASH_MODEL  = 'gemini-2.0-flash'
export const GEMINI_PRO_MODEL    = 'gemini-2.0-pro'
export const GEMINI_LITE_MODEL   = 'gemini-2.5-flash-lite'
export const EMBEDDING_MODEL     = 'text-embedding-004'

// RAG
export const CHUNK_TOKEN_SIZE            = 512
export const CONVERSATION_HISTORY_WINDOW = 10  // last N turns kept in context
export const MESSAGE_QUERY_LIMIT         = 50  // Firestore query cap for messages
export const CONVERSATION_QUERY_LIMIT    = 50  // Firestore query cap for conversations

// Input sanitization caps (chars)
export const MAX_INSTRUCTIONS_LENGTH = 2000
export const MAX_MESSAGE_LENGTH      = 4000
export const MAX_ORG_DATA_LENGTH     = 50000

// Message types
export const MESSAGE_TYPES = {
  USER:         'user',
  BOT_RESPONSE: 'bot-response',
  BOT_TO_BOT:   'bot-to-bot',
  SYSTEM:       'system',
  ESCALATION:   'escalation',
}

// Agent status
export const AGENT_STATUS = {
  ACTIVE:          'active',
  IDLE:            'idle',
  OFFLINE:         'offline',
  IN_CONVERSATION: 'in-conversation',
}

// Org data document status
export const ORG_DATA_STATUS = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

// Handshake types
export const HANDSHAKE_TYPES = {
  STATUS_CHECK:      'status_check',
  INFO_REQUEST:      'info_request',
  SCHEDULE_MEETING:  'schedule_meeting',
  NOTIFY:            'notify',
  DATA_REQUEST:      'data_request',
}

// Priority levels
export const PRIORITY = {
  LOW:    'low',
  NORMAL: 'normal',
  HIGH:   'high',
  URGENT: 'urgent',
}

// User roles
export const ROLES = {
  MEMBER: 'member',
  ADMIN:  'admin',
}
