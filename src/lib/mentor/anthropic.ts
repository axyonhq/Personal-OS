import Anthropic from '@anthropic-ai/sdk'

/** Mentor always runs on Anthropic Claude (not OpenAI). */
export const MENTOR_MODEL = 'claude-sonnet-4-6'

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

export function getAnthropicClient(options?: { timeout?: number }): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  return new Anthropic({
    apiKey: key,
    ...(typeof options?.timeout === 'number' ? { timeout: options.timeout } : {}),
  })
}

export function mentorNotConfiguredResponse() {
  return Response.json(
    {
      error:
        'ANTHROPIC_API_KEY is not set. Add an Anthropic API key (console.anthropic.com) — Claude Pro alone does not unlock the API.',
      code: 'missing_api_key',
    },
    { status: 503 },
  )
}

/** Turn Anthropic SDK / API failures into a short user-facing message. */
export function formatAnthropicError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : 'Claude request failed'
  }

  const err = error as {
    message?: string
    status?: number
    error?: { error?: { type?: string; message?: string }; type?: string; message?: string }
  }

  const nested = err.error?.error || err.error
  const type = nested && typeof nested === 'object' ? nested.type : undefined
  const detail =
    nested && typeof nested === 'object' && typeof nested.message === 'string'
      ? nested.message
      : typeof err.message === 'string'
        ? err.message
        : 'Claude request failed'

  if (err.status === 401 || type === 'authentication_error') {
    return 'Claude API key is invalid. Check ANTHROPIC_API_KEY in Vercel.'
  }
  if (err.status === 404 || type === 'not_found_error') {
    return `Claude model not found (${MENTOR_MODEL}). ${detail}`
  }
  if (err.status === 429 || type === 'rate_limit_error') {
    return 'Claude rate limit hit. Wait a moment and try again.'
  }
  if (type === 'invalid_request_error') {
    return `Claude rejected the request: ${detail}`
  }
  if (err.status && err.status >= 500) {
    return `Claude is unavailable (${err.status}). Try again shortly.`
  }
  return detail
}
