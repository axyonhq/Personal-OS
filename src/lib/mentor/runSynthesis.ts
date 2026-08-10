import type Anthropic from '@anthropic-ai/sdk'
import {
  formatAnthropicError,
  MENTOR_MODEL,
  MENTOR_SYNTHESIS_SCHEMA,
} from '@/lib/mentor/anthropic'
import { ANALYZE_JSON_INSTRUCTION, MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'
import {
  insightFromMessageContent,
  parseInsightJson,
  type MentorInsightPayload,
} from '@/lib/mentor/synthesis'
import { clipMentorContext, MENTOR_CONTEXT_CHAR_LIMIT } from '@/lib/mentor/clipContext'

export { clipMentorContext, MENTOR_CONTEXT_CHAR_LIMIT }

/** Leave headroom under route maxDuration so we return JSON, not Vercel HTML. */
export const MENTOR_SYNTHESIS_TIMEOUT_MS = 75_000

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

function textFromContent(content: Anthropic.ContentBlock[]): string {
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

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; message?: string; code?: string; status?: number }
  if (err.name === 'AbortError') return true
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
 * One Claude call only (forced strict tool). Streaming keeps the connection
 * alive on long runs. No sequential fallbacks — those caused Vercel 504s.
 */
export async function runMentorSynthesis(
  client: Anthropic,
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
    // Prefer streaming so proxies see bytes before the final tool payload.
    const stream = client.messages.stream(
      {
        model: MENTOR_MODEL,
        max_tokens: 4096,
        system,
        tools: [SYNTHESIS_TOOL],
        tool_choice: { type: 'tool', name: 'submit_mentor_synthesis' },
        messages: [{ role: 'user', content: userContent }],
      },
      { signal: controller.signal },
    )

    const response = await stream.finalMessage()
    const lastStop = response.stop_reason
    const lastRaw = textFromContent(response.content)

    if (response.stop_reason === 'refusal') {
      throw new Error(
        'Claude refused to run synthesis on this dossier. Try again with less journal text.',
      )
    }

    const insight = insightFromResponse(response)
    if (insight) {
      return {
        insight,
        path: 'tool_use',
        model: MENTOR_MODEL,
        stopReason: lastStop,
        clipped,
        contextChars: clippedText.length,
      }
    }

    const detail = [
      'Could not parse mentor synthesis',
      lastStop ? `stop_reason=${lastStop}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    const err = new Error(detail) as Error & { raw?: string; stopReason?: string | null }
    err.raw = lastRaw.slice(0, 800)
    err.stopReason = lastStop
    throw err
  } catch (error) {
    if (error instanceof MentorSynthesisTimeoutError) throw error
    if (error instanceof Error && error.message.startsWith('Claude refused')) throw error
    if (error instanceof Error && error.message.startsWith('Could not parse')) throw error
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw new MentorSynthesisTimeoutError()
    }
    throw new Error(formatAnthropicError(error))
  } finally {
    clearTimeout(timer)
  }
}
