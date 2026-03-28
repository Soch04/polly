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
