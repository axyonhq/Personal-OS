import OpenAI from 'openai'

/** Mentor runs on OpenAI (same OPENAI_API_KEY as Chief of Staff). */
export const MENTOR_OPENAI_MODEL =
  process.env.MENTOR_OPENAI_MODEL?.trim() ||
  process.env.COS_OPENAI_MODEL?.trim() ||
  'gpt-4.1'

export const MENTOR_SYNTHESIS_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string' as const,
      description: '2-4 sentence read on how they currently operate',
    },
    weapons: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'What makes them lethal — specific, evidence-backed',
    },
    drags: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'What bleeds performance — specific, evidence-backed',
    },
    blindSpots: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Patterns they are likely missing',
    },
    prescriptions: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Concrete systems / rules / constraints to install',
    },
    chatReply: {
      type: 'string' as const,
      description: 'Short mentor message for the chat thread summarizing the synthesis',
    },
  },
  required: [
    'summary',
    'weapons',
    'drags',
    'blindSpots',
    'prescriptions',
    'chatReply',
  ] as const,
  additionalProperties: false as const,
}

export function getMentorOpenAIClient(options?: { timeout?: number }): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null
  return new OpenAI({
    apiKey: key,
    ...(typeof options?.timeout === 'number' ? { timeout: options.timeout } : {}),
  })
}

export function mentorNotConfiguredResponse() {
  return Response.json(
    {
      error:
        'OPENAI_API_KEY is not set. Add an OpenAI API key from platform.openai.com in Vercel (Production + Preview).',
      code: 'missing_api_key',
    },
    { status: 503 },
  )
}

export function parseOpenAIToolArgs(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** Turn OpenAI SDK / API failures into a short user-facing message. */
export function formatOpenAIError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : 'OpenAI request failed'
  }

  const err = error as {
    message?: string
    status?: number
    code?: string
    error?: { message?: string; type?: string; code?: string }
  }

  const detail =
    typeof err.error?.message === 'string'
      ? err.error.message
      : typeof err.message === 'string'
        ? err.message
        : 'OpenAI request failed'

  const status = err.status
  const code = err.code || err.error?.code || err.error?.type

  if (status === 401 || code === 'invalid_api_key') {
    return 'OpenAI API key is invalid. Check OPENAI_API_KEY in Vercel.'
  }
  if (status === 404 || code === 'model_not_found') {
    return `OpenAI model not found (${MENTOR_OPENAI_MODEL}). ${detail}`
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return 'OpenAI rate limit hit. Wait a moment and try again.'
  }
  if (status === 400 || code === 'invalid_request_error') {
    return `OpenAI rejected the request: ${detail}`
  }
  if (status && status >= 500) {
    return `OpenAI is unavailable (${status}). Try again shortly.`
  }
  return detail
}
