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
  focusWhy: string
}

const SUNDAY_REVIEW_SCHEMA = {
  type: 'object' as const,
  properties: {
    spendSummary: {
      type: 'string' as const,
      description:
        '3-5 sentences on food, drink, and day-to-day spend vs budget. Name the actual days and amounts. Ignore rent, motorbike, and monthly bills unless they are the only numbers. Plain words. Honest.',
    },
    workSummary: {
      type: 'string' as const,
      description:
        '3-5 sentences on deep work. Name session count, total time, the heaviest day, the most productive hour, and how it felt if debriefs exist. Be specific.',
    },
    journalSummary: {
      type: 'string' as const,
      description:
        '4-7 sentences that make sense of the journal pages. Quote a short phrase. Name the tension and what the writing is asking for this week. If there is no journal, say that clearly.',
    },
    synthesis: {
      type: 'string' as const,
      description:
        'Two short paragraphs, 5-8 sentences total. Tie money, work, and journal into one specific read. Cite real numbers and a real phrase. Name the pattern, not a vibe. No pep talk. No generic “endurance” or “overthinking” unless those exact words are in the journal.',
    },
    focus: {
      type: 'string' as const,
      description:
        'Exactly one action for the next 7 days. Must include WHEN (day + time or first session), WHAT (a named task, project, or rule from the dossier), and DONE LOOKS LIKE. One or two sentences. Forbidden: “act fast”, “be more”, “try to”, “focus on”, “stop overthinking”, “commit to”, “simple focused action”. Pull the action from their open tasks, one-thing, journal, or peak work hour.',
    },
    focusWhy: {
      type: 'string' as const,
      description:
        '1-2 sentences. Why this exact action, with numbers or a journal phrase from the dossier. No pep talk.',
    },
  },
  required: [
    'spendSummary',
    'workSummary',
    'journalSummary',
    'synthesis',
    'focus',
    'focusWhy',
  ] as const,
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
  const focusWhy = asText(parsed.focusWhy)
  if (!synthesis && !focus) return null
  return {
    spendSummary: spendSummary || 'Spend for this week is in the numbers above.',
    workSummary: workSummary || 'Work hours are in the numbers above.',
    journalSummary: journalSummary || 'No journal read this week.',
    synthesis: synthesis || [spendSummary, workSummary, journalSummary].filter(Boolean).join(' '),
    focus: focus || 'Pick the top open task. Tomorrow, work it in one 90-minute block before noon.',
    focusWhy: focusWhy || 'A named task and a named block beats a vague week.',
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
      synthesis: text.slice(0, 2200),
      focus: 'Pick the top open task. Tomorrow, work it in one 90-minute block before noon.',
      focusWhy: 'A named task and a named block beats a vague week.',
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
        max_completion_tokens: 2800,
        tools: [TOOL],
        tool_choice: {
          type: 'function',
          function: { name: 'submit_sunday_review' },
        },
        messages: [
          {
            role: 'system',
            content:
              'You write a weekly Sunday review for one person. Be direct, kind, and specific enough to act on without thinking. Short words. No jargon. Cite real numbers, real hours, and real task names from the dossier. The focus must be a concrete move they can do this week — a time, a named piece of work, and a finish line. If journal text exists, make sense of it — do not paste it back raw. Never write a vague slogan.',
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
