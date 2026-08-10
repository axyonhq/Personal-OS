import { NextRequest, NextResponse } from 'next/server'
import {
  formatAnthropicError,
  getAnthropicClient,
  MENTOR_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/anthropic'
import { MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'

export const runtime = 'nodejs'
export const maxDuration = 60

type ChatTurn = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const client = getAnthropicClient()
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

    const response = await client.messages.create({
      model: MENTOR_MODEL,
      max_tokens: 1600,
      system,
      messages: [...history, { role: 'user', content: message }],
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (!text) {
      return NextResponse.json({ error: 'Empty mentor response' }, { status: 502 })
    }

    return NextResponse.json({ reply: text })
  } catch (error) {
    console.error('mentor chat failed', error)
    return NextResponse.json({ error: formatAnthropicError(error) }, { status: 500 })
  }
}
