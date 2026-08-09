import { NextRequest, NextResponse } from 'next/server'
import { postCosBriefToSlack, slackConfigured } from '@/lib/chiefOfStaff/slack'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  return NextResponse.json({
    configured: slackConfigured(),
    mode: process.env.SLACK_COS_WEBHOOK_URL?.trim()
      ? 'webhook'
      : process.env.SLACK_BOT_TOKEN?.trim()
        ? 'bot'
        : 'none',
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      date?: string
      slot?: 'morning' | 'night'
      summary?: string
      actionItems?: string[]
      blindSpots?: string[]
      unmadeDecisions?: string[]
    }

    if (!body.summary?.trim() || (body.slot !== 'morning' && body.slot !== 'night')) {
      return NextResponse.json({ error: 'summary + slot required' }, { status: 400 })
    }

    const result = await postCosBriefToSlack({
      date: typeof body.date === 'string' ? body.date : 'today',
      slot: body.slot,
      summary: body.summary.trim(),
      actionItems: Array.isArray(body.actionItems)
        ? body.actionItems.filter((x): x is string => typeof x === 'string')
        : [],
      blindSpots: Array.isArray(body.blindSpots)
        ? body.blindSpots.filter((x): x is string => typeof x === 'string')
        : [],
      unmadeDecisions: Array.isArray(body.unmadeDecisions)
        ? body.unmadeDecisions.filter((x): x is string => typeof x === 'string')
        : [],
    })

    if (!result.ok) {
      return NextResponse.json(result, { status: result.skipped ? 503 : 502 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('cos slack notify failed', error)
    const message = error instanceof Error ? error.message : 'Slack notify failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
