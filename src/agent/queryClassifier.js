/**
 * @module queryClassifier
 * @description Classifies user queries to optimize RAG retrieval strategy before
 * hitting Pinecone. Different query types benefit from different retrieval parameters:
 *
 *   CONVERSATIONAL  → Skip RAG entirely (greetings, acknowledgements)
 *                     Avoids an unnecessary Pinecone round-trip for zero-value queries
 *
 *   FACTUAL         → Standard top-K=5, low temperature
 *                     Best for specific fact lookups ("What is the leave policy?")
 *
 *   ANALYTICAL      → Expanded top-K=8, medium temperature
 *                     Comparison/synthesis queries need broader source coverage
 *                     ("Compare the Q1 and Q2 performance targets")
 *
 *   PROCEDURAL      → Focused top-K=4, very low temperature
 *                     How-to queries need precise, step-ordered answers
 *                     ("How do I submit an expense report?")
 *
 * This classification runs locally (no API call) using pattern matching before
 * any Pinecone or Gemini call is made — adds ~0ms overhead per query.
 */

/** @typedef {'CONVERSATIONAL' | 'FACTUAL' | 'ANALYTICAL' | 'PROCEDURAL'} QueryType */

/**
 * @typedef {Object} QueryClassification
 * @property {QueryType} type        - The detected query intent
 * @property {number}    topK        - Recommended Pinecone top-K for this intent
 * @property {number}    temperature - Recommended Gemini temperature for this intent
 * @property {boolean}   skipRAG     - True if RAG retrieval should be skipped entirely
 */

// Patterns that match conversational inputs — RAG would waste a round-trip
const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|bye|goodbye|ok|okay|sure|got it|yes|no|yep|nope|np|lol)\b/i,
  /^(good morning|good afternoon|good evening|good night)/i,
  /^(how are you|what'?s? up|what'?s? new|how'?s? it going)/i,
  /^(great|perfect|sounds good|makes sense|i see|understood|noted)\b/i,
  /^(who are you|what are you|what can you do)/i,
]

// Analytical queries benefit from broader context retrieval
const ANALYTICAL_KEYWORDS = [
  'compare', 'comparison', 'analyze', 'analyse', 'evaluate', 'assessment',
  'pros and cons', 'trade-off', 'tradeoff', 'difference between', 'versus', ' vs ',
  'why is', 'what causes', 'what are the implications', 'recommend', 'should i',
  'best option', 'what do you think', 'help me decide', 'overview of',
]

// Procedural queries need precise, low-temperature responses
const PROCEDURAL_KEYWORDS = [
  'how to', 'how do i', 'how do you', 'how can i', 'steps to', 'steps for',
  'process for', 'procedure', 'guide me', 'walk me through', 'instructions for',
  'what is the process', 'workflow for', 'checklist', 'to submit', 'to request',
  'to create', 'to set up', 'to configure',
]

/**
 * Classify a user query and return optimal RAG retrieval parameters.
 *
 * @param {string} text - The user's raw message
 * @returns {QueryClassification}
 */
export function classifyQuery(text) {
  if (!text || typeof text !== 'string') {
    return { type: 'FACTUAL', topK: 5, temperature: 0.3, skipRAG: false }
  }

  const lower = text.toLowerCase().trim()

  // 1. Conversational — skip RAG entirely, no vector round-trip needed
  if (CONVERSATIONAL_PATTERNS.some(p => p.test(lower))) {
    return { type: 'CONVERSATIONAL', topK: 0, temperature: 0.7, skipRAG: true }
  }

  // 2. Analytical — broader retrieval, slightly higher temperature for synthesis
  if (ANALYTICAL_KEYWORDS.some(k => lower.includes(k))) {
    return { type: 'ANALYTICAL', topK: 8, temperature: 0.4, skipRAG: false }
  }

  // 3. Procedural — focused retrieval, very low temperature for step accuracy
  if (PROCEDURAL_KEYWORDS.some(k => lower.includes(k))) {
    return { type: 'PROCEDURAL', topK: 4, temperature: 0.15, skipRAG: false }
  }

  // 4. Default: factual lookup — standard parameters
  return { type: 'FACTUAL', topK: 5, temperature: 0.3, skipRAG: false }
}
