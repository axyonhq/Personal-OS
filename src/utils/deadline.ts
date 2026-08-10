import { todayDateKey } from './time'

/** Days from today to a YYYY-MM-DD key (negative = past). */
export function daysUntilDateKey(deadline: string, today: string = todayDateKey()): number {
  const todayMs = Date.parse(`${today}T00:00:00`)
  const dueMs = Date.parse(`${deadline}T00:00:00`)
  if (Number.isNaN(todayMs) || Number.isNaN(dueMs)) return 0
  return Math.round((dueMs - todayMs) / 86_400_000)
}

/** Short countdown for task list columns, e.g. "due in 3 days". */
export function formatDeadlineCountdown(
  deadline: string | null | undefined,
  today: string = todayDateKey(),
): string {
  if (!deadline) return 'Set deadline'
  const days = daysUntilDateKey(deadline, today)
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days > 1) return `due in ${days} days`
  if (days === -1) return '1 day overdue'
  return `${Math.abs(days)} days overdue`
}

export function deadlineTone(
  deadline: string | null | undefined,
  today: string = todayDateKey(),
): 'none' | 'ok' | 'soon' | 'overdue' {
  if (!deadline) return 'none'
  const days = daysUntilDateKey(deadline, today)
  if (days < 0) return 'overdue'
  if (days <= 3) return 'soon'
  return 'ok'
}
