import { NextRequest, NextResponse } from 'next/server'
import {
  formatAnthropicError,
  getAnthropicClient,
  MENTOR_MODEL,
  mentorNotConfiguredResponse,
} from '@/lib/mentor/anthropic'
import { runMentorSynthesis } from '@/lib/mentor/runSynthesis'

export const runtime = 'nodejs'
export const maxDuration = 90

export async function POST(req: NextRequest) {
  try {
    const client = getAnthropicClient()
    if (!client) return mentorNotConfiguredResponse()

    const body = (await req.json()) as { context?: string }
    const context = typeof body.context === 'string' ? body.context : ''
    if (!context.trim()) {
      return NextResponse.json({ error: 'Context required' }, { status: 400 })
    }

    const result = await runMentorSynthesis(client, context)
    return NextResponse.json({
      insight: result.insight,
      model: result.model,
      path: result.path,
      stop_reason: result.stopReason,
    })
  } catch (error) {
    console.error('mentor analyze failed', error)
    const raw =
      error && typeof error === 'object' && 'raw' in error
        ? String((error as { raw?: string }).raw || '')
        : ''
    const stopReason =
      error && typeof error === 'object' && 'stopReason' in error
        ? (error as { stopReason?: string | null }).stopReason
        : null
    const message =
      error instanceof Error ? error.message : formatAnthropicError(error)

    const status = message.startsWith('Could not parse mentor synthesis') ? 502 : 500
    return NextResponse.json(
      {
        error: message,
        raw: raw.slice(0, 500) || undefined,
        stop_reason: stopReason,
        model: MENTOR_MODEL,
      },
      { status },
    )
  }
}
