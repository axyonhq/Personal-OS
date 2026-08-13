import type OpenAI from 'openai'
import {
  formatOpenAIError,
  MENTOR_OPENAI_MODEL,
  MENTOR_SYNTHESIS_SCHEMA,
  parseOpenAIToolArgs,
} from '@/lib/mentor/openai'
import { ANALYZE_JSON_INSTRUCTION, MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'
import {
  normalizeInsight,
  parseInsightJson,
  type MentorInsightPayload,
} from '@/lib/mentor/synthesis'
import { clipMentorContext, MENTOR_CONTEXT_CHAR_LIMIT } from '@/lib/mentor/clipContext'

export { clipMentorContext, MENTOR_CONTEXT_CHAR_LIMIT }

/** Leave headroom under route maxDuration so we return JSON, not Vercel HTML. */
export const MENTOR_SYNTHESIS_TIMEOUT_MS = 75_000

const SYNTHESIS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_mentor_synthesis',
    description: 'Submit the structured mentor pattern synthesis for this operator.',
    strict: true,
    parameters: {
      type: 'object',
      properties: MENTOR_SYNTHESIS_SCHEMA.properties,
      required: [...MENTOR_SYNTHESIS_SCHEMA.required],
      additionalProperties: false,
    },
  },
}

function insightFromCompletion(
  response: OpenAI.Chat.Completions.ChatCompletion,
): MentorInsightPayload | null {
  const message = response.choices[0]?.message
  if (!message) return null

  const toolCall = message.tool_calls?.find(
    (t) => t.type === 'function' && t.function?.name === 'submit_mentor_synthesis',
  )
  if (toolCall && toolCall.type === 'function') {
    const args = parseOpenAIToolArgs(toolCall.function.arguments)
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      const fromTool = normalizeInsight(args as Record<string, unknown>)
      if (fromTool) return fromTool
      const recovered = parseInsightJson(toolCall.function.arguments || '')
      if (recovered) return recovered
    }
  }

  const text = typeof message.content === 'string' ? message.content.trim() : ''
  return text ? parseInsightJson(text) : null
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; message?: string; code?: string; status?: number }
  if (err.name === 'AbortError' || err.name === 'APIUserAbortError') return true
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') return true
  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : ''
  return (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    err.status === 408 ||
    err.status === 504
  )
}

export class MentorSynthesisTimeoutError extends Error {
  constructor(message = 'Synthesis timed out. The dossier may be too large — try again in a moment.') {
    super(message)
    this.name = 'MentorSynthesisTimeoutError'
  }
}

export type MentorSynthesisResult = {
  insight: MentorInsightPayload
  path: 'tool_use'
  model: string
  stopReason: string | null
  clipped: boolean
  contextChars: number
}

/**
 * One OpenAI call only (forced strict tool). No sequential fallbacks —
 * those caused Vercel 504s with Claude.
 */
export async function runMentorSynthesis(
  client: OpenAI,
  context: string,
  options?: { timeoutMs?: number },
): Promise<MentorSynthesisResult> {
  const timeoutMs = options?.timeoutMs ?? MENTOR_SYNTHESIS_TIMEOUT_MS
  const clippedText = clipMentorContext(context)
  const clipped = clippedText.length < context.trim().length
  const system = `${MENTOR_SYSTEM_PROMPT}\n\n${ANALYZE_JSON_INSTRUCTION}`
  const userContent = `Run a full pattern synthesis on this operator. Be specific. Cite times of day, session shapes, breaks, spend, journals, and debrief feelings when the data supports it.\n\n${clippedText}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await client.chat.completions.create(
      {
        model: MENTOR_OPENAI_MODEL,
        max_completion_tokens: 4096,
        tools: [SYNTHESIS_TOOL],
        tool_choice: {
          type: 'function',
          function: { name: 'submit_mentor_synthesis' },
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      },
      { signal: controller.signal },
    )

    const choice = response.choices[0]
    const lastStop = choice?.finish_reason ?? null
    const toolCall = choice?.message?.tool_calls?.find(
      (t) => t.type === 'function' && t.function?.name === 'submit_mentor_synthesis',
    )
    const lastRaw =
      (toolCall && toolCall.type === 'function' ? toolCall.function.arguments : '') ||
      (typeof choice?.message?.content === 'string' ? choice.message.content : '') ||
      ''

    const insight = insightFromCompletion(response)
    if (insight) {
      return {
        insight,
        path: 'tool_use',
        model: MENTOR_OPENAI_MODEL,
        stopReason: lastStop,
        clipped,
        contextChars: clippedText.length,
      }
    }

    const detail = [
      'Could not parse mentor synthesis',
      lastStop ? `finish_reason=${lastStop}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    const err = new Error(detail) as Error & { raw?: string; stopReason?: string | null }
    err.raw = lastRaw.slice(0, 800)
    err.stopReason = lastStop
    throw err
  } catch (error) {
    if (error instanceof MentorSynthesisTimeoutError) throw error
    if (error instanceof Error && error.message.startsWith('Could not parse')) throw error
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw new MentorSynthesisTimeoutError()
    }
    throw new Error(formatOpenAIError(error))
  } finally {
    clearTimeout(timer)
  }
}
