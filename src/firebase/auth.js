import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { auth, db } from './config'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

/**
 * Create a new user account.
 * Triggers: creates User doc + Agent Record in Firestore.
 */
export async function signUp({ email, password, displayName, department, role = 'member' }) {
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  const user = credential.user

  // Set display name on Firebase Auth profile
  await updateProfile(user, { displayName })

  // ── Create User document ──────────────────────────────
  await setDoc(doc(db, 'users', user.uid), {
    uid:         user.uid,
    email,
    displayName,
    department,
    role,        // 'member' | 'admin'
    linkedIn:    null,
    calendarConnected: false,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
  })

  // ── Initialize Agent Record (the "bot" tied to this user) ──
  // This is the hook that spawns the user's AI proxy
  await setDoc(doc(db, 'agents', user.uid), {
    userId:     user.uid,
    displayName: `${displayName}'s Agent`,
    department,
    status:     'active',   // 'active' | 'idle' | 'offline'
    // Default system instructions — customizable later
    systemInstructions: buildDefaultInstructions(displayName, department),
    model:      'gemini-2.5-flash-lite',
    // RAG context scopes this agent is allowed to query
    knowledgeScope: ['global', department.toLowerCase()],
    // Memory — populated over time
    conversationHistory: [],
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  })

  return user
}

/**
 * Sign in an existing user.
 */
export async function signIn({ email, password }) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  return firebaseSignOut(auth)
}

/**
 * Subscribe to auth state changes.
 * @param {function} callback - called with user | null
 * @returns {function} unsubscribe
 */
export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback)
}

// ── Helpers ────────────────────────────────────────────────

function buildDefaultInstructions(name, department) {
  return `You are the AI agent proxy for ${name}, a member of the ${department} department.

Your core responsibilities:
1. Represent ${name} accurately when communicating with other agents
2. Retrieve and synthesize relevant organizational knowledge before responding
3. Schedule and coordinate on behalf of ${name} without interrupting their focus
4. Escalate to ${name} only when human judgment is required

Communication style: Professional, concise, and factual.
Privacy boundary: Never share ${name}'s private Tier-1 data with other agents.
Rate limit: Process a maximum of 10 inter-agent requests per hour without human approval.`
}
