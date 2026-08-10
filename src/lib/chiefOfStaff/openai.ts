import OpenAI from 'openai'

export const COS_OPENAI_MODEL = process.env.COS_OPENAI_MODEL?.trim() || 'gpt-4.1'

export function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null
  return new OpenAI({ apiKey: key })
}

export function openaiNotConfiguredResponse() {
  return Response.json(
    {
      error:
        'OPENAI_API_KEY is not set. Add an OpenAI API key from platform.openai.com (used by Chief of Staff and Mentor).',
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
