import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'

// ══════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════

export const getUserDoc = (uid) =>
  getDoc(doc(db, 'users', uid))

export const updateUserDoc = (uid, data) =>
  updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() })

/**
 * Fetch the full org directory (all user docs).
 * Used by the @mention autocomplete in MessageInput.
 * @returns {Promise<object[]>}
 */
export const getOrgDirectory = () =>
  getDocs(collection(db, 'users')).then(snap => snap.docs.map(d => d.data()))

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
export const sendBotMessage = (userId, content, agentName, metadata = {}) =>
  addDoc(collection(db, 'messages'), {
    type:          'bot-response',
    senderId:      userId,
    senderName:    agentName,
    senderType:    'agent',
    recipientId:   userId,
    recipientType: 'human',
    content,
    timestamp:     serverTimestamp(),
    metadata,
  })

/**
 * Update the metadata of an existing message (e.g. to mark an interaction actioned)
 */
export const updateMessageMetadata = (msgId, data) =>
  updateDoc(doc(db, 'messages', msgId), { metadata: data })

/**
 * Log a bot-to-bot message (inter-agent communication)
 */
export const logBotToBotMessage = (fromId, toId, fromName, toName, content, dept) =>
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

// ════════════════════════════════════════════════════════
// AGENT INTERACTIONS (@mention routing)
// Schema per doc:
//   sender_uid      : string   — Firebase UID of sender
//   sender_name     : string   — display name
//   sender_email    : string   — sender's email
//   recipient_email : string   — target user's email (queried by recipient)
//   content         : string   — full message including @mention
//   body            : string   — message text with @mention stripped
//   status          : 'pending' | 'replied' | 'escalated'
//   reply           : string   — agent's response (written back to same doc)
//   replied_at      : timestamp
//   timestamp       : timestamp
// ════════════════════════════════════════════════════════

/**
 * Write a new @mention interaction to Firestore.
 * @param {{ sender_uid, sender_name, sender_email, recipient_email, content, body }} params
 * @returns {Promise<DocumentReference>}
 */
export const sendMention = ({ sender_uid, sender_name, sender_email, recipient_email, content, body }) =>
  addDoc(collection(db, 'agent_interactions'), {
    sender_uid,
    sender_name,
    sender_email,
    recipient_email: recipient_email.toLowerCase().trim(),
    content,
    body,
    status:    'pending',
    reply:     null,
    replied_at: null,
    timestamp: serverTimestamp(),
  })

/**
 * Real-time listener for interactions addressed to this user's email.
 * Ordered newest-first, capped at 50.
 * @param {string}   recipientEmail
 * @param {function} callback  — called with array of interaction docs
 * @returns {function} unsubscribe
 */
export const subscribeToIncomingMentions = (recipientEmail, callback) => {
  const q = query(
    collection(db, 'agent_interactions'),
    where('recipient_email', '==', recipientEmail.toLowerCase().trim()),
    orderBy('timestamp', 'desc'),
    limit(50),
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, () => callback([]))
}

/**
 * Write the agent's reply back to the same interaction document.
 * @param {string} interactionId
 * @param {string} replyText
 */
export const postMentionReply = (interactionId, replyText) =>
  updateDoc(doc(db, 'agent_interactions', interactionId), {
    reply:      replyText,
    status:     'replied',
    replied_at: serverTimestamp(),
  })

/**
 * Mark that this interaction has been shown in the user's personal chat feed
 * to prevent duplicate notifications upon Reload.
 */
export const markInteractionNotified = (interactionId) =>
  updateDoc(doc(db, 'agent_interactions', interactionId), {
    feed_notified: true
  })
