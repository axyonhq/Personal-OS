import { NextRequest, NextResponse } from 'next/server'
import {
  formatOpenAIError,
  getMentorOpenAIClient,
  MENTOR_OPENAI_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/openai'
import {
  MentorSynthesisTimeoutError,
  MENTOR_SYNTHESIS_TIMEOUT_MS,
  runMentorSynthesis,
} from '@/lib/mentor/runSynthesis'
import { guardAiRoute } from '@/lib/api/guard'

export const runtime = 'nodejs'
/** Pro plan allows up to 300s; keep headroom above the in-process OpenAI budget. */
export const maxDuration = 120

export async function POST(req: NextRequest) {
  // Synthesis is the most expensive call in the app, so it gets the tightest cap.
  const guard = await guardAiRoute('mentor:analyze', { limit: 6, windowMs: 60_000 })
  if (guard.response) return guard.response

  try {
    const client = getMentorOpenAIClient({ timeout: MENTOR_SYNTHESIS_TIMEOUT_MS + 5_000 })
    if (!client) return mentorNotConfiguredResponse()

    const body = (await req.json()) as { context?: string }
    const context = typeof body.context === 'string' ? body.context : ''
    if (!context.trim()) {
      return NextResponse.json({ error: 'Context required' }, { status: 400 })
    }

    const result = await runMentorSynthesis(client, context, {
      timeoutMs: MENTOR_SYNTHESIS_TIMEOUT_MS,
    })
    return NextResponse.json({
      insight: result.insight,
      model: result.model,
      path: result.path,
      stop_reason: result.stopReason,
      clipped: result.clipped,
      context_chars: result.contextChars,
    })
  } catch (error) {
    console.error('mentor analyze failed', error)

    if (error instanceof MentorSynthesisTimeoutError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'synthesis_timeout',
          model: MENTOR_OPENAI_MODEL,
        },
        { status: 504 },
      )
    }

    const raw =
      error && typeof error === 'object' && 'raw' in error
        ? String((error as { raw?: string }).raw || '')
        : ''
    const stopReason =
      error && typeof error === 'object' && 'stopReason' in error
        ? (error as { stopReason?: string | null }).stopReason
        : null
    const message =
      error instanceof Error ? error.message : formatOpenAIError(error)

    const status = message.startsWith('Could not parse mentor synthesis') ? 502 : 500
    return NextResponse.json(
      {
        error: message,
        raw: raw.slice(0, 500) || undefined,
        stop_reason: stopReason,
        model: MENTOR_OPENAI_MODEL,
      },
      { status },
    )
  }
}
