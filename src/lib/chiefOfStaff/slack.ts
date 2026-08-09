import type { CoSBrief, CoSBriefSlot } from '@/types'

export function formatSlackBriefMessage(brief: {
  date: string
  slot: CoSBriefSlot
  summary: string
  actionItems: string[]
  blindSpots: string[]
  unmadeDecisions: string[]
}): string {
  const title = brief.slot === 'morning' ? 'Morning brief' : 'Night brief'
  const actions =
    brief.actionItems.length > 0
      ? brief.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : '1. No actions listed'
  const blinds =
    brief.blindSpots.length > 0
      ? brief.blindSpots.map((b) => `• ${b}`).join('\n')
      : '• None called out'
  const decisions =
    brief.unmadeDecisions.length > 0
      ? brief.unmadeDecisions.map((d) => `• ${d}`).join('\n')
      : '• None open'

  return [
    `*AXYON CoS · ${title}*`,
    `_${brief.date} · Asia/Makassar_`,
    '',
    brief.summary,
    '',
    '*Actions*',
    actions,
    '',
    '*Blind spots*',
    blinds,
    '',
    '*Unmade decisions*',
    decisions,
  ].join('\n')
}

export type SlackDeliveryResult =
  | { ok: true; via: 'webhook' | 'bot'; channel?: string; ts?: string }
  | { ok: false; skipped?: boolean; error: string }

/** Post a CoS brief to Slack via webhook and/or bot token. */
export async function postCosBriefToSlack(brief: {
  date: string
  slot: CoSBriefSlot
  summary: string
  actionItems: string[]
  blindSpots: string[]
  unmadeDecisions: string[]
}): Promise<SlackDeliveryResult> {
  const text = formatSlackBriefMessage(brief)
  const webhook = process.env.SLACK_COS_WEBHOOK_URL?.trim()
  const token = process.env.SLACK_BOT_TOKEN?.trim()
  const channel =
    process.env.SLACK_COS_CHANNEL_ID?.trim() ||
    process.env.SLACK_COS_USER_ID?.trim() ||
    ''

  if (!webhook && !(token && channel)) {
    return {
      ok: false,
      skipped: true,
      error:
        'Slack not configured. Set SLACK_COS_WEBHOOK_URL or SLACK_BOT_TOKEN + SLACK_COS_CHANNEL_ID (user id works for DM).',
    }
  }

  if (webhook) {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Webhook failed (${res.status}): ${body.slice(0, 200)}` }
    }
    return { ok: true, via: 'webhook' }
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel,
      text,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false,
    }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    ts?: string
    channel?: string
  }
  if (!data.ok) {
    return { ok: false, error: data.error || `Slack API HTTP ${res.status}` }
  }
  return { ok: true, via: 'bot', channel: data.channel, ts: data.ts }
}

export function slackConfigured(): boolean {
  const webhook = Boolean(process.env.SLACK_COS_WEBHOOK_URL?.trim())
  const bot =
    Boolean(process.env.SLACK_BOT_TOKEN?.trim()) &&
    Boolean(process.env.SLACK_COS_CHANNEL_ID?.trim() || process.env.SLACK_COS_USER_ID?.trim())
  return webhook || bot
}

export function briefAlreadySlacked(brief: CoSBrief | undefined | null): boolean {
  return Boolean(brief?.slackSentAt)
}
