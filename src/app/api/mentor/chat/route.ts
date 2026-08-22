import { NextRequest, NextResponse } from 'next/server'
import {
  formatOpenAIError,
  getMentorOpenAIClient,
  MENTOR_OPENAI_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/openai'
import { MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'
import { guardAiRoute } from '@/lib/api/guard'

export const runtime = 'nodejs'
export const maxDuration = 60

type ChatTurn = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const guard = await guardAiRoute('mentor:chat', { limit: 20, windowMs: 60_000 })
  if (guard.response) return guard.response

  try {
    // Keep the OpenAI budget under maxDuration so a hang returns JSON we can
    // show the user, rather than the platform killing the function first.
    const client = getMentorOpenAIClient({ timeout: 50_000 })
    if (!client) return mentorNotConfiguredResponse()

    const body = (await req.json()) as {
      message?: string
      context?: string
      history?: ChatTurn[]
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const context = typeof body.context === 'string' ? body.context : ''
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (t): t is ChatTurn =>
              !!t &&
              (t.role === 'user' || t.role === 'assistant') &&
              typeof t.content === 'string' &&
              t.content.trim().length > 0,
          )
          .slice(-16)
      : []

    const system = [
      MENTOR_SYSTEM_PROMPT,
      '',
      '--- LIVE OPERATOR DOSSIER ---',
      context || '(dossier empty)',
    ].join('\n')

    const response = await client.chat.completions.create({
      model: MENTOR_OPENAI_MODEL,
      max_completion_tokens: 1600,
      messages: [
        { role: 'system', content: system },
        ...history.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user', content: message },
      ],
    })

    const text = (response.choices[0]?.message?.content || '').trim()

    if (!text) {
      return NextResponse.json({ error: 'Empty mentor response' }, { status: 502 })
    }

    return NextResponse.json({ reply: text })
  } catch (error) {
    console.error('mentor chat failed', error)
    return NextResponse.json({ error: formatOpenAIError(error) }, { status: 500 })
  }
}
