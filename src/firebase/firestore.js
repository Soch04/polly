/**
 * firebase/firestore.js
 *
 * All Firestore CRUD and real-time listener functions.
 *
 * Conventions:
 * - All collection references use COLLECTIONS constants (no magic strings)
 * - All onSnapshot calls return their unsubscribe function
 * - All writes use serverTimestamp() for createdAt/updatedAt
 * - Error callbacks are provided for all onSnapshot subscriptions
 */
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'
import {
  COLLECTIONS,
  MESSAGE_TYPES,
  AGENT_STATUS,
  ORG_DATA_STATUS,
  PROTOCOL_VERSION,
  CONVERSATION_QUERY_LIMIT,
  MESSAGE_QUERY_LIMIT,
} from '../constants'

// ════════════════════════════════════════════════════════
// CONVERSATIONS
// Schema: { id, participantIds[], participantNames[], initiatorId,
//           contextType, department, lastMessage, lastActivity,
//           isActive, type: 'direct'|'group', createdAt }
// ════════════════════════════════════════════════════════

/**
 * Upsert a direct conversation between two agents.
 * Uses a deterministic ID (sorted UIDs joined) so the same pair
 * never creates duplicate threads.
 * @returns {Promise<string>} conversation ID
 */
export const upsertConversation = async ({
  participantIds, participantNames, initiatorId,
  contextType, department, lastMessage, lastActivity, isActive,
}) => {
  const sortedIds = [...participantIds].sort()
  const convId    = sortedIds.join('__')
  const convRef   = doc(db, COLLECTIONS.CONVERSATIONS, convId)

  // setDoc with merge: true acts as an upsert — creates if missing, updates fields if exists.
  await setDoc(convRef, {
    participantIds,
    participantNames,
    initiatorId,
    type:         participantIds.length > 2 ? 'group' : 'direct',
    contextType:  contextType ?? 'General Coordination',
    department:   department  ?? 'General',
    lastMessage:  lastMessage ?? '',
    lastActivity: lastActivity instanceof Date ? lastActivity : serverTimestamp(),
    isActive:     isActive ?? true,
    updatedAt:    serverTimestamp(),
    createdAt:    serverTimestamp(),
  }, { merge: true })

  return convId
}

/**
 * Set a conversation's isActive flag (used to stop the processing indicator).
 * @param {string} convId
 * @param {boolean} active
 */
export const setConversationActive = (convId, active) =>
  updateDoc(doc(db, COLLECTIONS.CONVERSATIONS, convId), {
    isActive:  active,
    updatedAt: serverTimestamp(),
  })

/**
 * Real-time listener for all conversations involving a user.
 * @param {string} userId
 * @param {function} callback - called with sorted conversation array
 * @returns {function} unsubscribe
 */
export const subscribeToConversations = (userId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.CONVERSATIONS),
    where('participantIds', 'array-contains', userId),
    limit(CONVERSATION_QUERY_LIMIT),
  )
  return onSnapshot(
    q,
    snap => {
      const convs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aMs = a.lastActivity?.toMillis?.() ?? 0
          const bMs = b.lastActivity?.toMillis?.() ?? 0
          return bMs - aMs
        })
      callback(convs)
    },
    err => console.error('[subscribeToConversations] snapshot error:', err.code, err.message)
  )
}

/**
 * Real-time listener for messages in a specific conversation thread.
 * @param {string} convId
 * @param {function} callback - called with sorted message array
 * @returns {function} unsubscribe
 */
export const subscribeToConvMessages = (convId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.MESSAGES),
    where('convId', '==', convId),
    limit(MESSAGE_QUERY_LIMIT),
  )
  return onSnapshot(
    q,
    snap => {
      const msgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aMs = a.timestamp?.toMillis?.() ?? 0
          const bMs = b.timestamp?.toMillis?.() ?? 0
          return aMs - bMs
        })
      callback(msgs)
    },
    err => console.error('[subscribeToConvMessages] snapshot error:', err.code, err.message)
  )
}

// ══════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════

/**
 * @param {string} uid
 * @returns {Promise<import('firebase/firestore').DocumentSnapshot>}
 */
export const getUserDoc = (uid) =>
  getDoc(doc(db, COLLECTIONS.USERS, uid))

/**
 * @param {string} uid
 * @param {object} data
 */
export const updateUserDoc = (uid, data) =>
  updateDoc(doc(db, COLLECTIONS.USERS, uid), { ...data, updatedAt: serverTimestamp() })

/**
 * Fetch all users for the org directory.
 * @returns {Promise<Array<{ uid, displayName, email, department }>>}
 */
export const getOrgDirectory = async () => {
  const snap = await getDocs(collection(db, COLLECTIONS.USERS))
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
}

// ══════════════════════════════════════════════════════════
// AGENTS
// ══════════════════════════════════════════════════════════

/**
 * @param {string} uid
 * @returns {Promise<import('firebase/firestore').DocumentSnapshot>}
 */
export const getAgentDoc = (uid) =>
  getDoc(doc(db, COLLECTIONS.AGENTS, uid))

/**
 * @param {string} uid
 * @param {string} instructions - trimmed, length-capped by caller
 */
export const updateAgentInstructions = (uid, instructions) =>
  updateDoc(doc(db, COLLECTIONS.AGENTS, uid), {
    systemInstructions: instructions,
    updatedAt: serverTimestamp(),
  })

/**
 * @param {string} uid
 * @param {string} status - use AGENT_STATUS constants
 */
export const updateAgentStatus = (uid, status) =>
  updateDoc(doc(db, COLLECTIONS.AGENTS, uid), { status, updatedAt: serverTimestamp() })

/**
 * @param {string} uid
 * @param {{ displayName: string, department: string, systemInstructions: string }} params
 */
export const createAgentDoc = (uid, { displayName, department, systemInstructions }) =>
  setDoc(doc(db, COLLECTIONS.AGENTS, uid), {
    userId:              uid,
    displayName:         `${displayName}'s Agent`,
    department,
    status:              AGENT_STATUS.ACTIVE,
    systemInstructions,
    model:               'gemini-2.5-flash-lite',
    knowledgeScope:      ['global', department.toLowerCase()],
    conversationHistory: [],
    createdAt:           serverTimestamp(),
    updatedAt:           serverTimestamp(),
  })

// ══════════════════════════════════════════════════════════
// MESSAGES
// Schema: { id, type: MESSAGE_TYPES.*,
//           senderId, senderName, recipientId, recipientName,
//           content, department, timestamp, metadata }
// ══════════════════════════════════════════════════════════

/**
 * Send a user message (user → their bot).
 * Content is trimmed and length-capped before writing.
 * @param {string} userId
 * @param {string} content - raw user input
 * @param {string} userName
 */
export const sendUserMessage = (userId, content, userName) => {
  const sanitized = content.trim().slice(0, 4000)
  return addDoc(collection(db, COLLECTIONS.MESSAGES), {
    type:          MESSAGE_TYPES.USER,
    senderId:      userId,
    senderName:    userName,
    senderType:    'human',
    recipientId:   userId,
    recipientType: 'agent',
    content:       sanitized,
    timestamp:     serverTimestamp(),
    metadata:      {},
  })
}

/**
 * Send a bot response message (bot → user).
 * @param {string} userId
 * @param {string} content
 * @param {string} agentName
 */
export const sendBotMessage = (userId, content, agentName) => {
  const sanitized = content.trim().slice(0, 4000)
  return addDoc(collection(db, COLLECTIONS.MESSAGES), {
    type:          MESSAGE_TYPES.BOT_RESPONSE,
    senderId:      userId,
    senderName:    agentName,
    senderType:    'agent',
    recipientId:   userId,
    recipientType: 'human',
    content:       sanitized,
    timestamp:     serverTimestamp(),
    metadata:      {},
  })
}

/**
 * Log a bot-to-bot message (inter-agent communication).
 * convId ties it to a conversation thread.
 * @param {string} fromId
 * @param {string} toId
 * @param {string} fromName
 * @param {string} toName
 * @param {string} content
 * @param {string} dept
 * @param {string|null} convId
 */
export const logBotToBotMessage = (fromId, toId, fromName, toName, content, dept, convId) => {
  const sanitized = content.trim().slice(0, 4000)
  return addDoc(collection(db, COLLECTIONS.MESSAGES), {
    type:          MESSAGE_TYPES.BOT_TO_BOT,
    senderId:      fromId,
    senderName:    fromName,
    senderType:    'agent',
    recipientId:   toId,
    recipientName: toName,
    recipientType: 'agent',
    content:       sanitized,
    department:    dept,
    convId:        convId ?? null,
    timestamp:     serverTimestamp(),
    metadata:      { protocol: PROTOCOL_VERSION },
  })
}

/**
 * Subscribe to user↔bot messages for a user (real-time listener).
 * Ordered by timestamp ASC, limited to MESSAGE_QUERY_LIMIT.
 * @param {string} userId
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export const subscribeToUserMessages = (userId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.MESSAGES),
    where('recipientId', '==', userId),
    orderBy('timestamp', 'asc'),
    limit(MESSAGE_QUERY_LIMIT),
  )
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(msgs)
    },
    err => console.error('[subscribeToUserMessages] snapshot error:', err.code, err.message)
  )
}

/**
 * Subscribe to all bot-to-bot messages, optionally filtered by department.
 * Ordered by timestamp DESC.
 * @param {string|'all'} department
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export const subscribeToBotLogs = (department, callback) => {
  let q = query(
    collection(db, COLLECTIONS.MESSAGES),
    where('type', '==', MESSAGE_TYPES.BOT_TO_BOT),
    orderBy('timestamp', 'desc'),
    limit(MESSAGE_QUERY_LIMIT),
  )
  if (department && department !== 'all') {
    q = query(
      collection(db, COLLECTIONS.MESSAGES),
      where('type',       '==', MESSAGE_TYPES.BOT_TO_BOT),
      where('department', '==', department),
      orderBy('timestamp', 'desc'),
      limit(MESSAGE_QUERY_LIMIT),
    )
  }
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      callback(msgs)
    },
    err => console.error('[subscribeToBotLogs] snapshot error:', err.code, err.message)
  )
}

/**
 * Subscribe to incoming B2B messages for a specific recipient.
 * Used by useAgentInbox to listen for agent-to-agent communications.
 * @param {string} recipientId
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export const subscribeToIncomingBotMessages = (recipientId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.MESSAGES),
    where('recipientId', '==', recipientId),
    where('type',        '==', MESSAGE_TYPES.BOT_TO_BOT),
    limit(30),
  )
  return onSnapshot(
    q,
    callback,
    err => console.error('[subscribeToIncomingBotMessages] snapshot error:', err.code, err.message)
  )
}

// ══════════════════════════════════════════════════════════
// ORG DATA (Knowledge Base)
// Schema: { id, title, content, fileUrl, fileType,
//           uploadedBy, department, status, createdAt }
// ══════════════════════════════════════════════════════════

/**
 * Submit an org data document for admin review.
 * Content is length-capped before writing.
 * @param {string} userId
 * @param {string} userName
 * @param {{ title: string, content: string, department: string, fileType: string }} data
 */
export const submitOrgData = (userId, userName, data) =>
  addDoc(collection(db, COLLECTIONS.ORG_DATA), {
    title:        data.title.trim().slice(0, 200),
    content:      data.content.trim().slice(0, 50000),
    department:   data.department,
    fileType:     data.fileType,
    uploadedBy:   userId,
    uploaderName: userName,
    status:       ORG_DATA_STATUS.PENDING,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  })

/**
 * Update a document's approval status.
 * @param {string} docId
 * @param {string} status - use ORG_DATA_STATUS constants
 */
export const updateOrgDataStatus = (docId, status) =>
  updateDoc(doc(db, COLLECTIONS.ORG_DATA, docId), { status, updatedAt: serverTimestamp() })

/**
 * Subscribe to all org data documents (admin view).
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export const subscribeToOrgData = (callback) => {
  const q = query(collection(db, COLLECTIONS.ORG_DATA), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))) },
    err => console.error('[subscribeToOrgData] snapshot error:', err.code, err.message)
  )
}

/**
 * Subscribe to org data submitted by a specific user.
 * @param {string} userId
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export const subscribeToUserOrgData = (userId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.ORG_DATA),
    where('uploadedBy', '==', userId),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))) },
    err => console.error('[subscribeToUserOrgData] snapshot error:', err.code, err.message)
  )
}
