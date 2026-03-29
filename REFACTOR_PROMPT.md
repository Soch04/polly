# Project Borg — Claude Code Refactoring Prompt

Paste everything below this line into Claude Code (claude.ai/code) with your repo open.

---

## CONTEXT

You are refactoring **Project Borg** — a Vite + React 18 multi-agent enterprise AI application. The stack is:
- **Frontend:** Vite 5, React 18, React Router v6, vanilla CSS (glassmorphism design tokens)
- **Backend:** Firebase 10 (Auth, Firestore, Storage via `onSnapshot` real-time listeners)
- **AI/Vector:** Gemini 2.0 Flash/Pro and Pinecone called via raw `fetch()` — no SDK installed
- **Inter-agent bus:** Upstash Redis Pub/Sub (Phase 2, may be stubbed)
- **State:** React Context (`AuthContext.jsx`, `AppContext.jsx`) + local `useState`
- **Mock mode:** `USE_MOCK` flag in `AuthContext.jsx` — when `true`, all Firebase and API calls are bypassed with data from `src/data/mockData.js`
- **IDs:** `uuid` v11 for `requestId` generation in handshake protocol

The codebase was built fast during a 24-hour hackathon. It works. Your job is to make it clean, fast, and maintainable — without changing any visible behavior, UI, or the `borg-agent-handshake-v1` protocol structure.

**Do not:**
- Change any user-facing UI or CSS class names
- Alter the Firestore data schema (`users`, `agents`, `messages`, `orgData` collections)
- Modify the `borg-agent-handshake-v1` JSON protocol shape
- Remove the `USE_MOCK` flag or Mock Mode functionality
- Add new npm dependencies (work with what's in `package.json`)
- Touch `TECH_PLAN.md`, `master_plan.md`, or `implementation_plan.md`

---

## PHASE 1 — AUDIT FIRST, CHANGE SECOND

Before writing a single line of code, do the following:

1. Read every file in `src/` fully. Map all imports and exports.
2. Identify and list in a comment block at the top of your response:
   - Dead code (functions defined but never called)
   - Duplicate logic (same operation written more than once across files)
   - Unnecessary re-renders (state updates that don't affect the UI, missing `useCallback`/`useMemo`)
   - `console.log` and debug statements left in production paths
   - Fetch calls without error handling or loading states
   - Any hardcoded strings that appear more than once (API endpoints, collection names, protocol version string)
   - Files that import from `mockData.js` outside of the `USE_MOCK` guard

Do not begin Phase 2 until the audit list is complete.

---

## PHASE 2 — CONSTANTS AND CONFIGURATION

Create `src/constants/index.js`. Move into it:

```js
// Firestore collection names
export const COLLECTIONS = {
  USERS: 'users',
  AGENTS: 'agents',
  MESSAGES: 'messages',
  ORG_DATA: 'orgData',
};

// Protocol
export const PROTOCOL_VERSION = 'borg-agent-handshake-v1';
export const HANDSHAKE_TTL = 300;
export const MAX_INTER_AGENT_REQUESTS_PER_HOUR = 10;
export const CONFIDENCE_THRESHOLD = 0.75;
export const URGENT_CONFIRMATION_WINDOW_SECONDS = 60;

// Pinecone
export const PINECONE_TOP_K = 5;
export const PINECONE_INDEX = 'borg-org-knowledge';
export const EMBEDDING_DIMENSIONS = 768;

// Gemini
export const GEMINI_FLASH_MODEL = 'gemini-2.0-flash';
export const GEMINI_PRO_MODEL = 'gemini-2.0-pro';
export const EMBEDDING_MODEL = 'text-embedding-004';

// RAG
export const CHUNK_TOKEN_SIZE = 512;
export const CONVERSATION_HISTORY_WINDOW = 10; // last N turns kept in context

// Message types
export const MESSAGE_TYPES = {
  USER: 'user',
  BOT_RESPONSE: 'bot-response',
  BOT_TO_BOT: 'bot-to-bot',
};

// Agent status
export const AGENT_STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  OFFLINE: 'offline',
};

// Handshake types
export const HANDSHAKE_TYPES = {
  STATUS_CHECK: 'status_check',
  INFO_REQUEST: 'info_request',
  SCHEDULE_MEETING: 'schedule_meeting',
  NOTIFY: 'notify',
};

// Priority levels
export const PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};
```

Find every hardcoded instance of these strings across the entire `src/` directory and replace with imports from this file. This is non-negotiable — magic strings are a bug source.

---

## PHASE 3 — FIREBASE LAYER CLEANUP (`src/firebase/`)

### `src/firebase/config.js`
- Confirm Firebase is initialized exactly once. If there is any risk of double-initialization (e.g., HMR in Vite dev mode), add the `getApps().length` guard:
  ```js
  import { getApps, initializeApp } from 'firebase/app';
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  ```
- Export `db`, `auth`, and `storage` as named exports from this single file. No other file should call `getFirestore()`, `getAuth()`, or `getStorage()` directly.

### `src/firebase/firestore.js`
- All Firestore operations must be wrapped in `try/catch` with a consistent error shape: `{ success: false, error: error.message }` on failure, `{ success: true, data: result }` on success.
- Any function that sets up an `onSnapshot` listener must return the unsubscribe function so callers can clean up in `useEffect` return.
- Remove any `onSnapshot` calls that are not returned/cleaned up — these are memory leaks.
- Consolidate any duplicated query patterns (e.g., fetching a user's agent record) into a single reusable function.
- All Firestore writes (`setDoc`, `updateDoc`, `addDoc`) must use `serverTimestamp()` for `createdAt`/`updatedAt` — never `new Date()` or `Date.now()`.

### `src/firebase/auth.js`
- `signUp()` must be atomic: if the Firestore agent record creation fails after Firebase Auth user creation succeeds, delete the Auth user and throw. No orphaned Auth accounts.
- Ensure `signOut()` clears all local context state before resolving.

---

## PHASE 4 — CONTEXT CLEANUP (`src/context/`)

### `AuthContext.jsx`
- The `USE_MOCK` flag must be a single top-level constant — not inline-evaluated multiple times.
- All mock data paths must be inside a single `if (USE_MOCK)` block. No mock data references should exist outside this guard.
- The `currentUser` object exposed by context must have a stable shape regardless of mock/live mode. If mock returns `{ uid, email, displayName }` and Firebase returns a full `User` object, normalize to a consistent interface before exposing.
- Remove any `useEffect` that has an empty dependency array but references values from outside its closure (stale closure bug).

### `AppContext.jsx`
- Audit every piece of state stored here. Remove any state that is derived from other state (compute it inline or with `useMemo` instead).
- If any context value causes the entire tree to re-render on every message update (common with real-time Firestore listeners), split into two contexts: `AppStateContext` (slow-changing: user profile, agent config) and `MessagingContext` (fast-changing: message stream).
- All `onSnapshot` listeners registered in context must be unsubscribed in the context provider's cleanup.

---

## PHASE 5 — HOOKS (`src/hooks/`)

### `useMessages.js`
- Must return: `{ messages, loading, error }` — never raw Firestore snapshot objects.
- Must unsubscribe the `onSnapshot` listener on unmount.
- Filter and sort messages in the hook, not in the component. Components should receive a ready-to-render array.
- If the hook is called in multiple places, confirm it does not open multiple simultaneous `onSnapshot` connections to the same Firestore query.

### `useAgent.js`
- Must expose: `{ agent, updateAgent, loading, error }`.
- `updateAgent` should debounce writes if it can be called on every keystroke (e.g., in the custom instructions editor). Use a 500ms debounce before the Firestore `updateDoc` call.
- Agent `systemInstructions` must never be sent in a `bot-to-bot` message type — add a runtime assertion here.

---

## PHASE 6 — COMPONENT CLEANUP (`src/components/` and `src/pages/`)

For every component:

1. **Remove inline function definitions from JSX.** Every `onClick={() => doSomething(id)}` inside JSX creates a new function reference on every render. Extract to `useCallback` or define above the return statement.

2. **Remove redundant state.** If a variable can be computed from props or other state, it should not be in `useState`. Common offenders:
   - `isLoading` that mirrors whether a data array is `null` vs populated
   - `filteredMessages` that is just `messages.filter(...)` — compute inline with `useMemo`
   - `userName` stored in state when it's available on `currentUser.displayName`

3. **Kill dead JSX.** Remove commented-out JSX blocks. Remove elements that are rendered but have `display: none` or `opacity: 0` via hardcoded inline styles (not design tokens).

4. **Consolidate repeated UI patterns.** If the same card/bubble/badge structure appears in more than one component with only prop differences, extract to a shared component in `src/components/`.

5. **Prop drilling audit.** If any prop is passed through more than two component levels without being used in intermediate components, it should be pulled from context instead.

### Specific pages:

**`MessagingPage.jsx`**
- The bot-to-bot message lane and the user↔bot lane must be clearly separated at the data level, not just visually. If both lanes share the same `messages` array and are distinguished by a `type` field, add a memoized selector: `const botToBotMessages = useMemo(() => messages.filter(m => m.type === MESSAGE_TYPES.BOT_TO_BOT), [messages])`.
- Typing indicator simulation must be driven by a `useRef`-backed timer, not `useState` — typing indicator changes should not trigger a full component re-render.
- Message send must be debounce-protected against double-submit (disable the send button while the Firestore write is in flight).

**`AdminDashboard.jsx`**
- The admin role check must happen in the route guard (`AdminRoute` component), not inside the page component itself. The page should assume it is already authorized.
- Department filter state belongs in the URL (`?dept=engineering`) via `useSearchParams`, not in `useState` — this makes the filter shareable and bookmarkable.

**`BotSettingsPage.jsx`**
- The custom instructions textarea must debounce its Firestore writes (500ms). Saving on every keystroke will exhaust Firestore write quotas.
- The agent status toggle must optimistically update the UI before the Firestore write completes, then roll back on error.

**`OrgPage.jsx`**
- File uploads must validate type and size client-side before initiating a Firebase Storage upload. Accept only `text/plain`, `application/pdf`, and common document MIME types. Reject files over 10MB with a user-facing error.
- The "pending approval" list must not re-fetch on every render — it must use a single `onSnapshot` listener.

---

## PHASE 7 — GEMINI AND PINECONE API CALLS

All raw `fetch()` calls to the Gemini and Pinecone APIs must be extracted into `src/services/`:

```
src/services/
  gemini.js      — embed(), chat(), streamChat()
  pinecone.js    — upsert(), query(), deleteVectors()
  handshake.js   — sendHandshake(), resolveHandshake(), pollHandshake()
```

Each service function must:
1. Accept typed parameters (document them with JSDoc `@param` and `@returns`)
2. Throw a consistent `ServiceError` with `{ service, operation, status, message }` on non-2xx responses
3. Never read `import.meta.env.*` directly — receive the API key as a parameter or from a single `src/config/env.js` that validates all required env vars on import and throws early if any are missing

`src/config/env.js`:
```js
const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_GEMINI_API_KEY',
  'VITE_PINECONE_API_KEY',
  'VITE_PINECONE_ENVIRONMENT',
];

required.forEach(key => {
  if (!import.meta.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export const ENV = {
  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY,
  PINECONE_API_KEY: import.meta.env.VITE_PINECONE_API_KEY,
  PINECONE_ENVIRONMENT: import.meta.env.VITE_PINECONE_ENVIRONMENT,
  UPSTASH_REDIS_URL: import.meta.env.VITE_UPSTASH_REDIS_URL,
  UPSTASH_REDIS_TOKEN: import.meta.env.VITE_UPSTASH_REDIS_TOKEN,
  USE_MOCK: import.meta.env.VITE_USE_MOCK === 'true',
};
```

Note: move `USE_MOCK` to an environment variable so it can be toggled per-environment without a code change. Update `AuthContext.jsx` to read `ENV.USE_MOCK`.

---

## PHASE 8 — HANDSHAKE PROTOCOL (`src/services/handshake.js`)

The `borg-agent-handshake-v1` protocol logic is the core of this product. It must be fully isolated in its own service, not scattered across components or hooks.

```js
import { v4 as uuidv4 } from 'uuid';
import { PROTOCOL_VERSION, HANDSHAKE_TTL, CONFIDENCE_THRESHOLD, PRIORITY } from '../constants';

/**
 * Build a valid outbound handshake request object.
 * @param {string} fromAgentId
 * @param {string} toAgentId
 * @param {'status_check'|'info_request'|'schedule_meeting'|'notify'} type
 * @param {{ subject: string, priority: string, body: string, deadline?: string }} payload
 * @returns {HandshakeRequest}
 */
export function buildHandshake(fromAgentId, toAgentId, type, payload) {
  return {
    protocol: PROTOCOL_VERSION,
    requestId: uuidv4(),
    fromAgentId,
    toAgentId,
    timestamp: new Date().toISOString(),
    type,
    payload: {
      subject: payload.subject,
      priority: payload.priority ?? PRIORITY.NORMAL,
      deadline: payload.deadline ?? null,
      body: payload.body,
    },
    ttl: HANDSHAKE_TTL,
  };
}

/**
 * Evaluate whether a handshake response requires human escalation.
 * @param {number} confidenceScore
 * @returns {boolean}
 */
export function requiresEscalation(confidenceScore) {
  return confidenceScore < CONFIDENCE_THRESHOLD;
}
```

Every place in the codebase that constructs a handshake object by hand must be replaced with `buildHandshake()`. Every place that checks the confidence threshold must use `requiresEscalation()`.

---

## PHASE 9 — MOCK DATA (`src/data/mockData.js`)

- Mock data must match the exact Firestore schema defined in `TECH_PLAN.md`. Any mock field that doesn't exist in the real schema must be removed.
- Mock messages must include at least 3 `bot-to-bot` type messages with valid `borg-agent-handshake-v1` metadata, to ensure the Agent Hub renders correctly in Mock Mode.
- Mock agent objects must include a `confidenceScore` in their metadata so the Teleportation / escalation flow can be demoed without live APIs.
- Add a `MOCK_SCENARIO` constant at the top of `mockData.js` with three preset scenarios:
  ```js
  export const MOCK_SCENARIOS = {
    CLEAN_RESOLUTION: 'clean_resolution',   // high confidence, no escalation
    ESCALATION: 'escalation',               // low confidence, Teleportation fires
    LOOP_CLOSURE: 'loop_closure',           // escalation already resolved
  };
  ```
  The demo should default to `ESCALATION` so judges see the full flow.

---

## PHASE 10 — PERFORMANCE

1. **Route-level code splitting.** Wrap every page component in `React.lazy()` and `<Suspense>`. The initial bundle should only load `AuthPage` — all other pages load on navigation.

```jsx
// App.jsx
import { lazy, Suspense } from 'react';
const MessagingPage = lazy(() => import('./pages/MessagingPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
// etc.
```

2. **Memoize expensive computations.** Any `.filter()`, `.sort()`, or `.map()` over the messages array inside a component must be wrapped in `useMemo` with the messages array as the dependency.

3. **Virtualize the message list.** If the messages array can grow unbounded (it can — Firestore `onSnapshot` accumulates), the message list must either paginate (load last 50 messages, load more on scroll) or use a windowing approach. Add a Firestore query limit: `.orderBy('timestamp', 'desc').limit(50)` and reverse the array for display.

4. **Image and asset optimization.** Confirm `vite.config.js` has `build.rollupOptions` configured to split vendor chunks (React, Firebase, react-router-dom) from application code.

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
        },
      },
    },
  },
});
```

---

## PHASE 11 — SECURITY

1. **Firestore Security Rules (`firestore.rules`):** Confirm the current rules file matches the recommended rules in `TECH_PLAN.md` Section 8. Specifically verify:
   - `messages` with `type: "bot-to-bot"` cannot be created with `content` field populated unless `fullDisclosure: true` is set by an authenticated human user
   - `orgData` documents with `status: "approved"` can only be written by a user with `role: "admin"` in their `users` document
   - No rule uses `allow read, write: if true` anywhere

2. **Environment variable exposure:** Audit every component for any `console.log` that might print `import.meta.env` values. Remove all of them. Firebase config values are semi-public (they're in the client bundle), but Gemini and Pinecone API keys must never be logged.

3. **Input sanitization:** Any user-provided string that gets written to Firestore (custom instructions, message content, org data submissions) must be trimmed and length-capped before the write. Suggested caps: custom instructions 2000 chars, messages 4000 chars, org data content 50000 chars.

---

## PHASE 12 — FINAL CHECKLIST

After completing all phases, verify:

- [ ] `npm run dev` starts without errors or warnings
- [ ] `npm run build` produces a clean bundle with no unresolved imports
- [ ] Mock Mode (`USE_MOCK = true`) renders all 5 pages without touching any external API
- [ ] Live Mode (`USE_MOCK = false`) with valid `.env` keys connects to Firebase Auth and Firestore
- [ ] The Agent Hub shows bot-to-bot messages in real time (or from mock data)
- [ ] Teleportation escalation flow fires correctly when confidence score is below 0.75
- [ ] Admin Dashboard is unreachable by a non-admin user (test with a regular account)
- [ ] No `console.log` statements remain in any `src/` file
- [ ] No hardcoded collection names, protocol version strings, or API endpoints remain outside `src/constants/index.js` or `src/config/env.js`
- [ ] All Firestore `onSnapshot` listeners are unsubscribed on component/context unmount
- [ ] Message list is paginated or limited to the last 50 entries via Firestore query

---

## OUTPUT FORMAT

For each phase, output:
1. A brief summary of what you found and changed
2. The full content of every modified file (not diffs — full files)
3. Any decisions you made that deviated from these instructions, with your reasoning

Work through phases in order. Do not skip phases. If a phase finds nothing to do, say so explicitly and move on.
