/**
 * firebase/auth.js
 *
 * Firebase Authentication helpers.
 * signUp() is atomic — if Firestore writes fail after Auth user creation,
 * the Auth user is deleted to prevent orphaned accounts.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
} from 'firebase/auth'
import { auth, db } from './config'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { COLLECTIONS, AGENT_STATUS, GEMINI_LITE_MODEL, MAX_INTER_AGENT_REQUESTS_PER_HOUR } from '../constants'

/**
 * Create a new user account (atomic).
 * If Firestore document creation fails after Auth signup,
 * the Auth user is deleted to prevent orphaned accounts.
 *
 * @param {{ email: string, password: string, displayName: string, department: string, role?: string }} params
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signUp({ email, password, displayName, department, role = 'member' }) {
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  const user = credential.user

  // Set display name on Firebase Auth profile
  await updateProfile(user, { displayName })

  try {
    // ── Create User document ──────────────────────────────
    await setDoc(doc(db, COLLECTIONS.USERS, user.uid), {
      uid:               user.uid,
      email,
      displayName,
      department,
      role,              // 'member' | 'admin'
      linkedIn:          null,
      calendarConnected: false,
      createdAt:         serverTimestamp(),
      updatedAt:         serverTimestamp(),
    })

    // ── Initialize Agent Record (the "bot" tied to this user) ──
    await setDoc(doc(db, COLLECTIONS.AGENTS, user.uid), {
      userId:     user.uid,
      displayName: `${displayName}'s Agent`,
      department,
      status:     AGENT_STATUS.ACTIVE,
      systemInstructions: buildDefaultInstructions(displayName, department),
      model:      GEMINI_LITE_MODEL,
      knowledgeScope: ['global', department.toLowerCase()],
      conversationHistory: [],
      createdAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    })
  } catch (err) {
    // Firestore write failed — roll back the Auth user to avoid orphaned accounts
    await deleteUser(user).catch(() => {
      // If deletion also fails, log for monitoring — not much else we can do
      console.error('[Auth] CRITICAL: Auth user created but Firestore failed AND user deletion failed:', err.message)
    })
    throw new Error(`Account creation failed: ${err.message}`)
  }

  return user
}

/**
 * Sign in an existing user.
 * @param {{ email: string, password: string }} params
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signIn({ email, password }) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

/**
 * Sign out the current user.
 * @returns {Promise<void>}
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
Rate limit: Process a maximum of ${MAX_INTER_AGENT_REQUESTS_PER_HOUR} inter-agent requests per hour without human approval.`
}
