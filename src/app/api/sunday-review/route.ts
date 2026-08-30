import { NextRequest, NextResponse } from 'next/server'
import { guardAiRoute } from '@/lib/api/guard'
import { mentorNotConfiguredResponse, getMentorOpenAIClient } from '@/lib/mentor/openai'
import { runSundayReview, SUNDAY_REVIEW_TIMEOUT_MS } from '@/lib/mentor/sundayReview'

export const runtime = 'nodejs'
export const maxDuration = 90

export async function POST(req: NextRequest) {
  const guard = await guardAiRoute('sunday-review', { limit: 8, windowMs: 60 * 60_000 })
  if (guard.response) return guard.response

  if (!getMentorOpenAIClient()) return mentorNotConfiguredResponse()

  try {
    const body = (await req.json()) as { context?: string }
    const context = typeof body.context === 'string' ? body.context : ''
    if (!context.trim()) {
      return NextResponse.json({ error: 'Context required' }, { status: 400 })
    }

    const prose = await runSundayReview(context, { timeoutMs: SUNDAY_REVIEW_TIMEOUT_MS })
    return NextResponse.json({ review: prose })
  } catch (error) {
    console.error('sunday review failed', error)
    const message = error instanceof Error ? error.message : 'Sunday review failed'
    const status = message.startsWith('Could not parse') ? 502 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
