import { habitDisplayStreak, isHabitDoneOn } from '../hooks/useStore'
import { isDeepWorkId, type AppState } from '../types'
import { addDays, todayDateKey } from './time'

/**
 * Pure day-state predicates.
 *
 * These live outside component files so the modules that render UI export only
 * components, which keeps React Fast Refresh working.
 *
 * They take `AppState` rather than the whole store so callers can memoize on a
 * value that only changes when the data actually changes.
 */

export function isBodyLogReady(state: AppState, date: string): boolean {
  const log = state.bodyLogs?.[date]
  return Boolean(log && log.energy != null && log.sleepHours != null)
}

/** True when yesterday slipped badly enough to be worth a repair prompt. */
export function needsMissDayRepair(state: AppState): boolean {
  const today = todayDateKey()
  if (state.autopilotCompletions?.missRepairDate === today) return false

  const yesterday = addDays(today, -1)
  const yMinutes = state.timeEntries
    .filter((e) => e.date === yesterday && isDeepWorkId(e.projectId))
    .reduce((s, e) => s + e.minutes, 0)
  const hadDeepWorkData = state.timeEntries.some((e) => e.date === yesterday)
  const missedTarget = hadDeepWorkData && yMinutes < state.dailyDeepWorkTargetMinutes

  // Habit that was recently active but skipped yesterday (and not already done today)
  const habitMiss = state.habits.some((h) => {
    if (!h.lastCompletedDate) return false
    if (isHabitDoneOn(h, yesterday) || isHabitDoneOn(h, today)) return false
    const recentlyActive =
      h.lastCompletedDate >= addDays(yesterday, -3) || habitDisplayStreak(h, today) > 0
    return recentlyActive
  })

  return missedTarget || habitMiss
}
