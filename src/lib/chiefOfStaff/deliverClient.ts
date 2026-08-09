'use client'

import type { CoSBrief } from '@/types'

/** Ask the browser for notification permission (safe to call often). */
export function requestCosNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

export function showCosBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      tag: 'axyon-cos-brief',
      requireInteraction: false,
    })
  } catch {
    // ignore
  }
}

/** Push a saved brief to Slack via the server route. */
export async function deliverBriefToSlack(brief: CoSBrief): Promise<{
  ok: boolean
  skipped?: boolean
  error?: string
}> {
  try {
    const res = await fetch('/api/chief-of-staff/notify-slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: brief.date,
        slot: brief.slot,
        summary: brief.summary,
        actionItems: brief.actionItems,
        blindSpots: brief.blindSpots,
        unmadeDecisions: brief.unmadeDecisions,
      }),
    })
    const data = (await res.json()) as {
      ok?: boolean
      skipped?: boolean
      error?: string
    }
    if (!res.ok) {
      return { ok: false, skipped: data.skipped, error: data.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Slack delivery failed' }
  }
}
