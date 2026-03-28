import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'

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
 * Returns the conversation ID.
 */
export const upsertConversation = async ({
  participantIds, participantNames, initiatorId,
  contextType, department, lastMessage, lastActivity, isActive,
}) => {
  const sortedIds = [...participantIds].sort()
  const convId    = sortedIds.join('__')
  const convRef   = doc(db, 'conversations', convId)

  // setDoc with merge: true acts as an upsert — creates if missing, updates fields if exists.
  // Avoids a getDoc call that would fail when the doc doesn't exist yet.
  await setDoc(convRef, {
    participantIds,
    participantNames,
    initiatorId,
    type:         participantIds.length > 2 ? 'group' : 'direct',
    contextType:  contextType ?? 'General Coordination',
    department:   department ?? 'General',
    lastMessage:  lastMessage ?? '',
    // Use the passed-in Date (plain JS Date, not serverTimestamp)
    // so the value is immediately available in local cache without a pending state.
    lastActivity: lastActivity instanceof Date ? lastActivity : serverTimestamp(),
    isActive:     isActive ?? true,
    updatedAt:    serverTimestamp(),
    createdAt:    serverTimestamp(),
  }, { merge: true })

  return convId
}

/** Set a conversation's isActive flag (used to stop the processing indicator) */
export const setConversationActive = (convId, active) =>
  updateDoc(doc(db, 'conversations', convId), {
    isActive:  active,
    updatedAt: serverTimestamp(),
  })

/**
 * Real-time listener for all conversations involving a user.
 */
export const subscribeToConversations = (userId, callback) => {
  // No orderBy — avoids composite index requirement.
  // Sort client-side after fetch.
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', userId),
    limit(50),
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
      console.log('[subscribeToConversations] received', convs.length, 'conversations')
      callback(convs)
    },
    err => console.error('[subscribeToConversations] snapshot error:', err.code, err.message)
  )
}

/**
 * Real-time listener for messages in a specific conversation thread.
 */
export const subscribeToConvMessages = (convId, callback) => {
  // No orderBy on a different field — avoids composite index requirement.
  const q = query(
    collection(db, 'messages'),
    where('convId', '==', convId),
    limit(100),
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

export const getUserDoc = (uid) =>
  getDoc(doc(db, 'users', uid))

export const updateUserDoc = (uid, data) =>
  updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() })

/**
 * Fetch all users for the org directory (used by @mention autocomplete).
 * Returns an array of plain objects: { uid, displayName, email, department }
 */
export const getOrgDirectory = async () => {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
}

// ══════════════════════════════════════════════════════════
// AGENTS
// ══════════════════════════════════════════════════════════

export const getAgentDoc = (uid) =>
  getDoc(doc(db, 'agents', uid))

export const updateAgentInstructions = (uid, instructions) =>
  updateDoc(doc(db, 'agents', uid), {
    systemInstructions: instructions,
    updatedAt: serverTimestamp(),
  })

export const updateAgentStatus = (uid, status) =>
  updateDoc(doc(db, 'agents', uid), { status, updatedAt: serverTimestamp() })

export const createAgentDoc = (uid, { displayName, department, systemInstructions }) =>
  setDoc(doc(db, 'agents', uid), {
    userId:             uid,
    displayName:        `${displayName}'s Agent`,
    department,
    status:             'active',
    systemInstructions,
    model:              'gemini-2.5-flash-lite',
    knowledgeScope:     ['global', department.toLowerCase()],
    conversationHistory: [],
    createdAt:          serverTimestamp(),
    updatedAt:          serverTimestamp(),
  })

// ══════════════════════════════════════════════════════════
// MESSAGES
// Schema: { id, type: 'user'|'bot-response'|'bot-to-bot',
//           senderId, senderName, recipientId, recipientName,
//           content, department, timestamp, metadata }
// ══════════════════════════════════════════════════════════

/**
 * Send a user message (user → their bot)
 */
export const sendUserMessage = (userId, content, userName) =>
  addDoc(collection(db, 'messages'), {
    type:          'user',
    senderId:      userId,
    senderName:    userName,
    senderType:    'human',
    recipientId:   userId,   // bot tied to this user
    recipientType: 'agent',
    content,
    timestamp:     serverTimestamp(),
    metadata:      {},
  })

/**
 * Send a bot response message (bot → user)
 */
export const sendBotMessage = (userId, content, agentName) =>
  addDoc(collection(db, 'messages'), {
    type:          'bot-response',
    senderId:      userId,
    senderName:    agentName,
    senderType:    'agent',
    recipientId:   userId,
    recipientType: 'human',
    content,
    timestamp:     serverTimestamp(),
    metadata:      {},
  })

/**
 * Log a bot-to-bot message (inter-agent communication)
 * convId ties it to a conversation thread.
 */
export const logBotToBotMessage = (fromId, toId, fromName, toName, content, dept, convId) =>
  addDoc(collection(db, 'messages'), {
    type:          'bot-to-bot',
    senderId:      fromId,
    senderName:    fromName,
    senderType:    'agent',
    recipientId:   toId,
    recipientName: toName,
    recipientType: 'agent',
    content,
    department:    dept,
    convId:        convId ?? null,
    timestamp:     serverTimestamp(),
    metadata:      { protocol: 'borg-agent-handshake-v1' },
  })

/**
 * Subscribe to messages for a user (real-time listener)
 * Returns unsubscribe function.
 */
export const subscribeToUserMessages = (userId, callback) => {
  const q = query(
    collection(db, 'messages'),
    where('recipientId',   '==', userId),
    orderBy('timestamp', 'asc'),
    limit(100),
  )
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(msgs)
  })
}

/**
 * Subscribe to bot-to-bot logs (optionally filtered by department)
 */
export const subscribeToBotLogs = (department, callback) => {
  let q = query(
    collection(db, 'messages'),
    where('type', '==', 'bot-to-bot'),
    orderBy('timestamp', 'desc'),
    limit(50),
  )
  if (department && department !== 'all') {
    q = query(
      collection(db, 'messages'),
      where('type',       '==', 'bot-to-bot'),
      where('department', '==', department),
      orderBy('timestamp', 'desc'),
      limit(50),
    )
  }
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(msgs)
  })
}

// ══════════════════════════════════════════════════════════
// ORG DATA (Knowledge Base)
// Schema: { id, title, content, fileUrl, fileType,
//           uploadedBy, department, status, createdAt }
// ══════════════════════════════════════════════════════════

export const submitOrgData = (userId, userName, data) =>
  addDoc(collection(db, 'orgData'), {
    ...data,
    uploadedBy:   userId,
    uploaderName: userName,
    status:       'pending',   // 'pending' | 'approved' | 'rejected'
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  })

export const updateOrgDataStatus = (docId, status) =>
  updateDoc(doc(db, 'orgData', docId), { status, updatedAt: serverTimestamp() })

export const subscribeToOrgData = (callback) => {
  const q = query(collection(db, 'orgData'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export const subscribeToUserOrgData = (userId, callback) => {
  const q = query(
    collection(db, 'orgData'),
    where('uploadedBy', '==', userId),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}
