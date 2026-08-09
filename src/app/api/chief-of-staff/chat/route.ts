import { NextRequest, NextResponse } from 'next/server'
import {
  getAnthropicClient,
  MENTOR_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/anthropic'
import { COS_SYSTEM_PROMPT } from '@/lib/chiefOfStaff/prompts'

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
      COS_SYSTEM_PROMPT,
      '',
      '--- LIVE PLATFORM DOSSIER ---',
      context || '(dossier empty)',
    ].join('\n')

    const response = await client.messages.create({
      model: MENTOR_MODEL,
      max_tokens: 1800,
      system,
      messages: [...history, { role: 'user', content: message }],
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (!text) {
      return NextResponse.json({ error: 'Empty Chief of Staff response' }, { status: 502 })
    }

    return NextResponse.json({ reply: text })
  } catch (error) {
    console.error('chief of staff chat failed', error)
    const message = error instanceof Error ? error.message : 'Chief of Staff chat failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
