'use client'

import { useAuth, useSession } from '@clerk/nextjs'
import { useCallback, useEffect, useRef } from 'react'
import type { Store } from '../hooks/useStore'
import { buildChiefOfStaffContext } from '../lib/chiefOfStaff/context'
import { listCompanyTasks } from '../lib/supabase/companyTodos'
import type { CoSBriefSlot } from '../types'
import { todayDateKey, nowMinutesInAppTz } from '../utils/time'

/**
 * Fires morning/night Chief of Staff briefs while the app is open.
 * Delivery is in-app (+ browser notification if allowed).
 */
export function ChiefOfStaffBriefHost({ store }: { store: Store }) {
  const { userId, isLoaded } = useAuth()
  const { session } = useSession()
  const running = useRef(false)
  const notifiedPermission = useRef(false)

  const ensureNotificationPermission = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'default' || notifiedPermission.current) return
    notifiedPermission.current = true
    void Notification.requestPermission()
  }, [])

  const maybeNotify = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    try {
      new Notification(title, { body, tag: 'axyon-cos-brief' })
    } catch {
      // ignore
    }
  }, [])

  const runDueBrief = useCallback(async () => {
    const cos = store.state.chiefOfStaff
    if (!cos?.proactiveEnabled || running.current) return

    const date = todayDateKey()
    const hour = Math.floor(nowMinutesInAppTz() / 60)

    let slot: CoSBriefSlot | null = null
    if (hour >= cos.morningHour && hour < cos.nightHour && !store.hasCoSBrief(date, 'morning')) {
      slot = 'morning'
    } else if (hour >= cos.nightHour && !store.hasCoSBrief(date, 'night')) {
      slot = 'night'
    }
    if (!slot) return

    running.current = true
    try {
      let companyTasks = [] as Awaited<ReturnType<typeof listCompanyTasks>>
      if (session && userId) {
        try {
          companyTasks = await listCompanyTasks(session, userId)
        } catch {
          companyTasks = []
        }
      }

      const res = await fetch('/api/chief-of-staff/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          date,
          context: buildChiefOfStaffContext(store.state, { companyTasks }),
        }),
      })
      const data = (await res.json()) as {
        brief?: {
          summary: string
          actionItems: string[]
          blindSpots: string[]
          unmadeDecisions: string[]
          chatReply: string
        }
        error?: string
      }
      if (!res.ok || !data.brief) return

      // Re-check in case another tab wrote the brief.
      if (store.hasCoSBrief(date, slot)) return

      const saved = store.saveCoSBrief({
        date,
        slot,
        summary: data.brief.summary,
        actionItems: data.brief.actionItems || [],
        blindSpots: data.brief.blindSpots || [],
        unmadeDecisions: data.brief.unmadeDecisions || [],
        chatReply: data.brief.chatReply,
      })
      maybeNotify(
        `AXYON ${slot === 'morning' ? 'Morning' : 'Night'} brief`,
        saved.summary.slice(0, 140),
      )
    } catch {
      // Silent — will retry next tick.
    } finally {
      running.current = false
    }
  }, [maybeNotify, session, store, userId])

  useEffect(() => {
    if (!isLoaded) return
    ensureNotificationPermission()
    void runDueBrief()
    const id = window.setInterval(() => {
      void runDueBrief()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [ensureNotificationPermission, isLoaded, runDueBrief])

  return null
}
