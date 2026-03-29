/**
 * @module tokenBudget
 * @description Context window budget manager for Gemini system prompts.
 *
 * PROBLEM: Gemini 2.5 Flash Lite has a context window of ~32k tokens. A system prompt
 * containing the agent identity, org directory, and RAG knowledge block can easily
 * exceed this limit when dealing with long documents or many retrieved chunks.
 * Exceeding the context window causes the API to reject the request with a 400 error.
 *
 * SOLUTION: Before assembling the final system prompt, estimate the token count of
 * each component and dynamically truncate the knowledge block if total estimated
 * tokens would exceed the safe budget.
 *
 * TOKEN ESTIMATION: Uses a character-based heuristic — 1 token ≈ 4 characters for
 * English text. This is deliberately conservative (actual tokenization varies by
 * vocabulary). The model used is Gemini 2.5 Flash Lite which uses a SentencePiece
 * tokenizer; exact counts would require a server-side tokenize() call.
 *
 * BUDGET ALLOCATION:
 *   Total context: ~32,000 tokens
 *   Reserved for conversation history (20 turns × 150 tokens avg): 3,000 tokens
 *   Reserved for user message + response buffer: 2,000 tokens
 *   Reserved for system identity + instructions: 1,500 tokens
 *   Available for knowledge block: 25,500 tokens (80% of total)
 *
 * @exports estimateTokens   - Estimate token count from character length
 * @exports trimToTokenBudget - Trim a string to fit within a token budget
 * @exports buildSafePrompt  - Assemble system prompt with automatic KB trimming
 */

/** Characters per token — conservative estimate for English text */
const CHARS_PER_TOKEN = 4

/** Total Gemini 2.5 Flash Lite context window in tokens */
const MAX_CONTEXT_TOKENS = 32_000

/** Tokens reserved for history, user message, response, and system identity */
const RESERVED_TOKENS = 6_500

/** Maximum tokens available for the knowledge base context block */
export const KB_TOKEN_BUDGET = MAX_CONTEXT_TOKENS - RESERVED_TOKENS  // 25,500

/**
 * Estimate the number of tokens in a string.
 * Uses the 4-chars-per-token heuristic — accurate to within ~15% for English text.
 *
 * @param {string} text
 * @returns {number} estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Trim a string to fit within a token budget.
 * Trims at the last complete sentence boundary within the budget to avoid
 * cutting mid-sentence, then appends a truncation notice.
 *
 * @param {string} text        - The text to potentially trim
 * @param {number} budgetTokens - Maximum allowed tokens
 * @returns {string} - Original text if within budget, or trimmed text with notice
 */
export function trimToTokenBudget(text, budgetTokens = KB_TOKEN_BUDGET) {
  if (!text) return ''

  const estimatedTokens = estimateTokens(text)
  if (estimatedTokens <= budgetTokens) return text  // within budget, no trim needed

  // Calculate the character limit from the token budget
  const charLimit = budgetTokens * CHARS_PER_TOKEN

  // Trim at character limit and find the last sentence boundary
  let trimmed = text.slice(0, charLimit)
  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf('. '),
    trimmed.lastIndexOf('.\n'),
    trimmed.lastIndexOf('\n\n'),
  )

  if (lastSentenceEnd > charLimit * 0.7) {
    // We found a clean sentence break within 70–100% of the limit — use it
    trimmed = trimmed.slice(0, lastSentenceEnd + 1)
  }
  // else: no clean break found, use the hard character limit

  const originalTokens = estimatedTokens
  const trimmedTokens  = estimateTokens(trimmed)

  return trimmed + `\n\n[Knowledge context trimmed: ${originalTokens - trimmedTokens} tokens removed to fit context window]`
}

/**
 * Get the budget utilization as a percentage string for logging/debugging.
 *
 * @param {string} knowledgeBlock
 * @returns {string} e.g. "42% (10,710 / 25,500 tokens)"
 */
export function getBudgetUtilization(knowledgeBlock) {
  const used    = estimateTokens(knowledgeBlock)
  const percent = Math.round((used / KB_TOKEN_BUDGET) * 100)
  return `${percent}% (${used.toLocaleString()} / ${KB_TOKEN_BUDGET.toLocaleString()} tokens)`
}
