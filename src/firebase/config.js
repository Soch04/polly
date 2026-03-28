import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// ── Firebase is only initialized if an API key is present ──
// In mock mode (USE_MOCK = true in AuthContext), these will be undefined,
// and Firebase will NOT be initialized — preventing runtime errors.

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY

let app, auth, db, storage

if (apiKey && apiKey !== 'your_firebase_api_key') {
  const firebaseConfig = {
    apiKey,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  }
  app     = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  auth    = getAuth(app)
  db      = getFirestore(app)
  storage = getStorage(app)
} else {
  // Stub — replaced by real instances when keys are configured
  console.info('[Borg] Firebase not configured — running in mock mode. Add keys to .env to enable.')
  app = auth = db = storage = null
}

export { auth, db, storage }
export default app
