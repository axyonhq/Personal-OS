import type Anthropic from '@anthropic-ai/sdk'
import {
  formatAnthropicError,
  MENTOR_MODEL,
  MENTOR_SYNTHESIS_SCHEMA,
} from '@/lib/mentor/anthropic'
import { ANALYZE_JSON_INSTRUCTION, MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'
import {
  insightFromMessageContent,
  normalizeInsight,
  parseInsightJson,
  type MentorInsightPayload,
} from '@/lib/mentor/synthesis'

/** Keep the dossier bounded so one Claude call finishes inside Vercel limits. */
export const MENTOR_CONTEXT_CHAR_LIMIT = 60_000

export function clipMentorContext(context: string, limit = MENTOR_CONTEXT_CHAR_LIMIT): string {
  const trimmed = context.trim()
  if (trimmed.length <= limit) return trimmed
  const head = Math.floor(limit * 0.35)
  const tail = limit - head - 80
  return `${trimmed.slice(0, head)}\n\n[…dossier clipped for length…]\n\n${trimmed.slice(-tail)}`
}

const SYNTHESIS_TOOL: Anthropic.Tool = {
  name: 'submit_mentor_synthesis',
  description: 'Submit the structured mentor pattern synthesis for this operator.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: MENTOR_SYNTHESIS_SCHEMA.properties,
    required: [...MENTOR_SYNTHESIS_SCHEMA.required],
    additionalProperties: false,
  },
}

const JSON_SCHEMA_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object' as const,
    properties: MENTOR_SYNTHESIS_SCHEMA.properties,
    required: [...MENTOR_SYNTHESIS_SCHEMA.required],
    additionalProperties: false as const,
  },
}

function insightFromUnknown(parsed: unknown, fallbackText = ''): MentorInsightPayload | null {
  if (!parsed) return parseInsightJson(fallbackText)
  if (typeof parsed === 'string') return parseInsightJson(parsed)
  if (typeof parsed === 'object' && !Array.isArray(parsed)) {
    return normalizeInsight(parsed as Record<string, unknown>, fallbackText)
  }
  return null
}

function textFromContent(
  content: Anthropic.ContentBlock[],
): string {
  return content
    .map((b) => {
      if (b.type === 'text') return b.text
      if (b.type === 'tool_use') return JSON.stringify(b.input)
      return ''
    })
    .join('\n')
    .trim()
}

function insightFromResponse(response: Anthropic.Message): MentorInsightPayload | null {
  const fromBlocks = insightFromMessageContent(response.content)
  if (fromBlocks) return fromBlocks
  return parseInsightJson(textFromContent(response.content))
}

function isNonRetryableAnthropicError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as {
    status?: number
    error?: { error?: { type?: string }; type?: string }
  }
  const nested = err.error?.error || err.error
  const type = nested && typeof nested === 'object' ? nested.type : undefined
  if (err.status === 401 || type === 'authentication_error') return true
  if (err.status === 403 || type === 'permission_error') return true
  if (err.status === 404 || type === 'not_found_error') return true
  if (err.status === 429 || type === 'rate_limit_error') return true
  return false
}

export type MentorSynthesisResult = {
  insight: MentorInsightPayload
  path: 'json_output' | 'tool_use'
  model: string
  stopReason: string | null
}

/**
 * One primary Claude call (JSON schema output). If the account/model rejects
 * structured outputs, fall back to one forced tool call. Never chains 4 calls.
 * Uses messages.create (not .parse) so a client-side JSON hiccup cannot throw
 * away a usable model response.
 */
export async function runMentorSynthesis(
  client: Anthropic,
  context: string,
): Promise<MentorSynthesisResult> {
  const clipped = clipMentorContext(context)
  const system = `${MENTOR_SYSTEM_PROMPT}\n\n${ANALYZE_JSON_INSTRUCTION}`
  const userContent = `Run a full pattern synthesis on this operator. Be specific. Cite times of day, session shapes, breaks, spend, journals, and debrief feelings when the data supports it.\n\n${clipped}`

  let lastRaw = ''
  let lastStop: string | null = null
  let structuredErrorMessage = ''

  // Primary: grammar-constrained JSON (single call; retry only if truncated).
  try {
    let response = await client.messages.create({
      model: MENTOR_MODEL,
      max_tokens: 6144,
      system,
      output_config: { format: JSON_SCHEMA_FORMAT },
      messages: [{ role: 'user', content: userContent }],
    })

    lastStop = response.stop_reason
    lastRaw = textFromContent(response.content)

    if (response.stop_reason === 'max_tokens' && lastRaw.length > 40) {
      response = await client.messages.create({
        model: MENTOR_MODEL,
        max_tokens: 8192,
        system,
        output_config: { format: JSON_SCHEMA_FORMAT },
        messages: [{ role: 'user', content: userContent }],
      })
      lastStop = response.stop_reason
      lastRaw = textFromContent(response.content)
    }

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude refused to run synthesis on this dossier. Try again with less journal text.')
    }

    const insight =
      insightFromResponse(response) || insightFromUnknown(null, lastRaw)
    if (insight) {
      return {
        insight,
        path: 'json_output',
        model: MENTOR_MODEL,
        stopReason: lastStop,
      }
    }

    // API accepted structured output but body was unusable — try tool once.
    structuredErrorMessage = `empty/unparseable json_output (stop_reason=${lastStop || 'unknown'})`
    console.warn('mentor synthesis json_output unusable; trying tool fallback', {
      stopReason: lastStop,
      rawPreview: lastRaw.slice(0, 200),
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Claude refused')) {
      throw error
    }
    if (isNonRetryableAnthropicError(error)) {
      throw new Error(formatAnthropicError(error))
    }
    structuredErrorMessage = formatAnthropicError(error)
    console.warn('mentor synthesis json_output failed; trying tool fallback', error)
  }

  // Fallback: one forced strict tool call (still Anthropic / Claude).
  let response = await client.messages.create({
    model: MENTOR_MODEL,
    max_tokens: 6144,
    system,
    tools: [SYNTHESIS_TOOL],
    tool_choice: { type: 'tool', name: 'submit_mentor_synthesis' },
    messages: [{ role: 'user', content: userContent }],
  })

  lastStop = response.stop_reason
  lastRaw = textFromContent(response.content)

  if (response.stop_reason === 'max_tokens' && lastRaw.length > 40) {
    response = await client.messages.create({
      model: MENTOR_MODEL,
      max_tokens: 8192,
      system,
      tools: [SYNTHESIS_TOOL],
      tool_choice: { type: 'tool', name: 'submit_mentor_synthesis' },
      messages: [{ role: 'user', content: userContent }],
    })
    lastStop = response.stop_reason
    lastRaw = textFromContent(response.content)
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude refused to run synthesis on this dossier. Try again with less journal text.')
  }

  const insight = insightFromResponse(response)
  if (insight) {
    return {
      insight,
      path: 'tool_use',
      model: MENTOR_MODEL,
      stopReason: lastStop,
    }
  }

  const detail = [
    'Could not parse mentor synthesis',
    structuredErrorMessage ? `json_output: ${structuredErrorMessage}` : null,
    lastStop ? `stop_reason=${lastStop}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const err = new Error(detail) as Error & { raw?: string; stopReason?: string | null }
  err.raw = lastRaw.slice(0, 800)
  err.stopReason = lastStop
  throw err
}
