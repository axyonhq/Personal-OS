import type OpenAI from 'openai'
import { parseJsonRecord } from '@/lib/mentor/parseJson'
import {
  formatOpenAIError,
  MENTOR_OPENAI_MODEL,
  getMentorOpenAIClient,
} from '@/lib/mentor/openai'
import { clipMentorContext } from '@/lib/mentor/clipContext'

export const SUNDAY_REVIEW_TIMEOUT_MS = 60_000

export type SundayReviewProse = {
  spendSummary: string
  workSummary: string
  journalSummary: string
  synthesis: string
  focus: string
}

const SUNDAY_REVIEW_SCHEMA = {
  type: 'object' as const,
  properties: {
    spendSummary: {
      type: 'string' as const,
      description: '2-4 sentences on spend vs budget and the habit behind it. Plain words. Honest.',
    },
    workSummary: {
      type: 'string' as const,
      description: '2-4 sentences on deep work hours, session count, and quality if debriefs exist.',
    },
    journalSummary: {
      type: 'string' as const,
      description:
        '3-6 sentences that make sense of the journal pages. Themes, mood, tension, what the writing is asking for. If there is no journal, say that clearly.',
    },
    synthesis: {
      type: 'string' as const,
      description:
        'One short paragraph that ties money, work, and journal into a useful read. Point them in the right direction. No fluff.',
    },
    focus: {
      type: 'string' as const,
      description: 'Exactly one focus for the next 7 days. Concrete. One sentence.',
    },
  },
  required: ['spendSummary', 'workSummary', 'journalSummary', 'synthesis', 'focus'] as const,
  additionalProperties: false as const,
}

const TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_sunday_review',
    description: 'Submit the weekly Sunday review for this operator.',
    strict: true,
    parameters: {
      type: 'object',
      properties: SUNDAY_REVIEW_SCHEMA.properties,
      required: [...SUNDAY_REVIEW_SCHEMA.required],
      additionalProperties: false,
    },
  },
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function proseFromRecord(parsed: Record<string, unknown>): SundayReviewProse | null {
  const spendSummary = asText(parsed.spendSummary)
  const workSummary = asText(parsed.workSummary)
  const journalSummary = asText(parsed.journalSummary)
  const synthesis = asText(parsed.synthesis)
  const focus = asText(parsed.focus)
  if (!synthesis && !focus) return null
  return {
    spendSummary: spendSummary || 'Spend for this week is in the numbers above.',
    workSummary: workSummary || 'Work hours are in the numbers above.',
    journalSummary: journalSummary || 'No journal read this week.',
    synthesis: synthesis || [spendSummary, workSummary, journalSummary].filter(Boolean).join(' '),
    focus: focus || 'Pick one thing and finish it.',
  }
}

function proseFromCompletion(response: OpenAI.Chat.Completions.ChatCompletion): SundayReviewProse | null {
  const message = response.choices[0]?.message
  if (!message) return null

  const toolCall = message.tool_calls?.find(
    (t) => t.type === 'function' && t.function?.name === 'submit_sunday_review',
  )
  if (toolCall && toolCall.type === 'function') {
    try {
      const args = JSON.parse(toolCall.function.arguments || '') as unknown
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        const fromTool = proseFromRecord(args as Record<string, unknown>)
        if (fromTool) return fromTool
      }
    } catch {
      // fall through
    }
  }

  const text = typeof message.content === 'string' ? message.content.trim() : ''
  if (!text) return null
  const parsed = parseJsonRecord(text)
  if (parsed) return proseFromRecord(parsed)
  if (text.length >= 40) {
    return {
      spendSummary: '',
      workSummary: '',
      journalSummary: '',
      synthesis: text.slice(0, 1600),
      focus: 'Protect the next deep work block.',
    }
  }
  return null
}

export async function runSundayReview(
  context: string,
  options?: { timeoutMs?: number },
): Promise<SundayReviewProse> {
  const client = getMentorOpenAIClient({
    timeout: (options?.timeoutMs ?? SUNDAY_REVIEW_TIMEOUT_MS) + 5_000,
  })
  if (!client) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add an OpenAI API key from platform.openai.com in Vercel.',
    )
  }

  const timeoutMs = options?.timeoutMs ?? SUNDAY_REVIEW_TIMEOUT_MS
  const clipped = clipMentorContext(context)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await client.chat.completions.create(
      {
        model: MENTOR_OPENAI_MODEL,
        max_completion_tokens: 1800,
        tools: [TOOL],
        tool_choice: {
          type: 'function',
          function: { name: 'submit_sunday_review' },
        },
        messages: [
          {
            role: 'system',
            content:
              'You write a weekly Sunday review for one person. Be direct, kind, and useful. Short words. No jargon. Cite real numbers from the dossier. Give exactly one focus for the week ahead. If journal text exists, make sense of it — do not paste it back raw.',
          },
          {
            role: 'user',
            content: `Write this week’s Sunday review from this dossier.\n\n${clipped}`,
          },
        ],
      },
      { signal: controller.signal },
    )

    const prose = proseFromCompletion(response)
    if (prose) return prose
    throw new Error('Could not parse Sunday review')
  } catch (error) {
    if (error instanceof Error && error.message === 'Could not parse Sunday review') throw error
    throw new Error(formatOpenAIError(error))
  } finally {
    clearTimeout(timer)
  }
}
