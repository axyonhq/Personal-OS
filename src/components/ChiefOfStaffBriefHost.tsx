'use client'

import { useAuth, useSession } from '@clerk/nextjs'
import { useCallback, useEffect, useRef } from 'react'
import type { Store } from '../hooks/useStore'
import { buildChiefOfStaffContext } from '../lib/chiefOfStaff/context'
import {
  deliverBriefToSlack,
  requestCosNotificationPermission,
  showCosBrowserNotification,
} from '../lib/chiefOfStaff/deliverClient'
import { listCompanyTasks } from '../lib/supabase/companyTodos'
import type { CoSBriefSlot } from '../types'
import { todayDateKey, nowMinutesInAppTz } from '../utils/time'

/**
 * Fires morning/night Chief of Staff briefs while the app is open.
 * Delivers in-app + browser notification + Slack (if configured).
 */
export function ChiefOfStaffBriefHost({ store }: { store: Store }) {
  const { userId, isLoaded } = useAuth()
  const { session } = useSession()
  const running = useRef(false)

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

      showCosBrowserNotification(
        `AXYON ${slot === 'morning' ? 'Morning' : 'Night'} brief`,
        saved.summary.slice(0, 140),
      )

      const slack = await deliverBriefToSlack(saved)
      if (slack.ok) store.markCoSBriefSlackSent(saved.id)
    } catch {
      // Silent — will retry next tick.
    } finally {
      running.current = false
    }
  }, [session, store, userId])

  useEffect(() => {
    if (!isLoaded) return
    requestCosNotificationPermission()
    void runDueBrief()
    const id = window.setInterval(() => {
      void runDueBrief()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [isLoaded, runDueBrief])

  return null
}
