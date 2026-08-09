import { NextRequest, NextResponse } from 'next/server'
import {
  COS_OPENAI_MODEL,
  getOpenAIClient,
  openaiNotConfiguredResponse,
} from '@/lib/chiefOfStaff/openai'
import { COS_SYSTEM_PROMPT } from '@/lib/chiefOfStaff/prompts'

export const runtime = 'nodejs'
export const maxDuration = 60

type ChatTurn = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const client = getOpenAIClient()
    if (!client) return openaiNotConfiguredResponse()

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

    const response = await client.chat.completions.create({
      model: COS_OPENAI_MODEL,
      max_completion_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: [
            COS_SYSTEM_PROMPT,
            '',
            '--- LIVE PLATFORM DOSSIER ---',
            context || '(dossier empty)',
          ].join('\n'),
        },
        ...history,
        { role: 'user', content: message },
      ],
    })

    const text = response.choices[0]?.message?.content?.trim()
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
