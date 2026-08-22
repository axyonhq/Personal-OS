import { NextRequest, NextResponse } from 'next/server'
import {
  formatOpenAIError,
  getMentorOpenAIClient,
  MENTOR_OPENAI_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/openai'
import { MENTOR_SYSTEM_PROMPT } from '@/lib/mentor/context'
import { guardAiRoute } from '@/lib/api/guard'
import { clipMentorContext } from '@/lib/mentor/clipContext'

export const runtime = 'nodejs'
export const maxDuration = 60

type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** Keeps a runaway dossier from blowing the token budget and the bill. */
const MAX_CONTEXT_CHARS = 24_000

export async function POST(req: NextRequest) {
  const guard = await guardAiRoute('mentor:chat', { limit: 20, windowMs: 60_000 })
  if (guard.response) return guard.response

  try {
    // Keep the OpenAI budget under maxDuration so a hang returns a readable
    // error rather than the platform killing the function first.
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

    const rawContext = typeof body.context === 'string' ? body.context : ''
    const context = rawContext ? clipMentorContext(rawContext, MAX_CONTEXT_CHARS) : ''

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
          .map((t) => ({ role: t.role, content: t.content.slice(0, 8000) }))
      : []

    const system = [
      MENTOR_SYSTEM_PROMPT,
      '',
      '--- LIVE OPERATOR DOSSIER ---',
      context || '(dossier empty)',
    ].join('\n')

    // Stream the reply. Waiting up to a minute for a whole answer made the app
    // feel broken; tokens now appear as they are produced.
    const completion = await client.chat.completions.create({
      model: MENTOR_OPENAI_MODEL,
      max_completion_tokens: 1600,
      stream: true,
      messages: [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: message },
      ],
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let sawContent = false
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content
            if (!delta) continue
            sawContent = true
            controller.enqueue(encoder.encode(delta))
          }
          if (!sawContent) {
            controller.enqueue(encoder.encode('The mentor returned nothing. Try again.'))
          }
        } catch (error) {
          console.error('mentor chat stream failed', error)
          // The response has already started, so the only way to report this is
          // in-band. Prefixed so the client can flag it as an error turn.
          controller.enqueue(encoder.encode(`\n\n[stream-error] ${formatOpenAIError(error)}`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('mentor chat failed', error)
    return NextResponse.json({ error: formatOpenAIError(error) }, { status: 500 })
  }
}
