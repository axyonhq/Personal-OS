import type {
  AppState,
  FinanceLedger,
  JournalEntry,
  SpendEntry,
  SundayReview,
  TimeEntry,
} from '../types'
import {
  categoryBudgetRows,
  formatMoney,
  roundMoney,
  totalMonthlyExpenses,
} from './finance'
import { lifestyleSpendByDay, summarizeLifestyleSeries } from './lifestyleSpend'
import { aggregateSessionsByHour, peakSessionHour } from './sessionAnalytics'
import { addDays, baliDateTimeToUtc, formatMinutes, sundayOnOrBefore, todayDateKey } from './time'

export const SUNDAY_REVIEW_HOUR = 16
/** Stay on screen until the next Sunday 16:00 Bali review is generated. */
export const SUNDAY_REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SUNDAY_REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** Bump when the written review needs a sharper pass. */
export const SUNDAY_REVIEW_VERSION = 2

export type SundayReviewSlot = {
  sundayDate: string
  windowStart: Date
  windowEnd: Date
  visibleUntil: Date
}

/** The review slot that is current for `now` (even if it is not visible). */
export function sundayReviewSlot(now: Date = new Date()): SundayReviewSlot {
  const today = todayDateKey(now)
  let sundayDate = sundayOnOrBefore(today)
  let windowEnd = baliDateTimeToUtc(sundayDate, SUNDAY_REVIEW_HOUR, 0, 0)

  // Before this Sunday 16:00 Bali, the current slot is last Sunday.
  if (now.getTime() < windowEnd.getTime()) {
    sundayDate = addDays(sundayDate, -7)
    windowEnd = baliDateTimeToUtc(sundayDate, SUNDAY_REVIEW_HOUR, 0, 0)
  }

  const windowStart = new Date(windowEnd.getTime() - SUNDAY_REVIEW_WINDOW_MS)
  const visibleUntil = new Date(windowEnd.getTime() + SUNDAY_REVIEW_TTL_MS)
  return { sundayDate, windowStart, windowEnd, visibleUntil }
}

export function isSundayReviewVisible(now: Date = new Date()): boolean {
  const { windowEnd, visibleUntil } = sundayReviewSlot(now)
  const t = now.getTime()
  return t >= windowEnd.getTime() && t < visibleUntil.getTime()
}

export function msUntilNextReview(now: Date = new Date()): number {
  const slot = sundayReviewSlot(now)
  return Math.max(0, slot.visibleUntil.getTime() - now.getTime())
}

export function formatReviewCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  if (totalMinutes <= 0) return 'the next review is due now'

  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  }

  const body =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : `${parts[0]}, ${parts[1]} and ${parts[2]}`
  return `${body} until the next review`
}

/** Seven Bali calendar days ending on the review Sunday. */
export function reviewDateKeys(sundayDate: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(sundayDate, i - 6))
}

export function reviewForSlot(
  reviews: SundayReview[] | undefined,
  slot: SundayReviewSlot,
): SundayReview | null {
  return (reviews ?? []).find((r) => r.sundayDate === slot.sundayDate) ?? null
}

function instantInWindow(iso: string | undefined, start: Date, end: Date): boolean | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return t >= start.getTime() && t < end.getTime()
}

function dateOverlapsWindow(dateKey: string, start: Date, end: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false
  const dayStart = baliDateTimeToUtc(dateKey, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  return dayStart < end && dayEnd > start
}

export function spendsInReviewWindow(ledger: FinanceLedger, slot: SundayReviewSlot): SpendEntry[] {
  return (ledger.spends ?? []).filter((s) => dateOverlapsWindow(s.date, slot.windowStart, slot.windowEnd))
}

export function sessionsInReviewWindow(entries: TimeEntry[], slot: SundayReviewSlot): TimeEntry[] {
  return (entries ?? []).filter((e) => {
    if (e.startedAt != null) {
      return e.startedAt >= slot.windowStart.getTime() && e.startedAt < slot.windowEnd.getTime()
    }
    if (e.endedAt != null) {
      return e.endedAt >= slot.windowStart.getTime() && e.endedAt < slot.windowEnd.getTime()
    }
    return dateOverlapsWindow(e.date, slot.windowStart, slot.windowEnd)
  })
}

export function journalsInReviewWindow(entries: JournalEntry[], slot: SundayReviewSlot): JournalEntry[] {
  return (entries ?? []).filter((j) => {
    const byCreated = instantInWindow(j.createdAt, slot.windowStart, slot.windowEnd)
    if (byCreated != null) return byCreated
    return dateOverlapsWindow(j.date, slot.windowStart, slot.windowEnd)
  })
}

export type SundayReviewStats = {
  spendTotal: number
  budgetTotal: number
  inBudget: boolean
  sessionCount: number
  sessionMinutes: number
  journalCount: number
  categoryLines: string[]
  foodDrinkTotal: number
  spendingsTotal: number
  peakWorkDate: string | null
  peakWorkMinutes: number
  peakHourLabel: string | null
  peakHourMinutes: number
}

function feelingMixLine(sessions: TimeEntry[]): string {
  const counts: Record<string, number> = {}
  for (const e of sessions) {
    const feel = e.debrief?.feeling
    if (!feel) continue
    counts[feel] = (counts[feel] || 0) + 1
  }
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([feel, n]) => `${feel}×${n}`)
  return parts.join(', ') || 'no debriefs'
}

function openTaskLines(state: AppState): string {
  const lines: string[] = []
  const tasks = state.tasks ?? {
    chase: [],
    myProject: [],
    rav: [],
    personal: [],
    sundayAdmin: [],
  }
  for (const [project, list] of Object.entries(tasks)) {
    for (const task of list) {
      if (task.done || task.archived) continue
      const when = task.plannedDate ? ` (${task.plannedDate})` : ''
      lines.push(`- [${project}] ${task.text}${when}`)
      if (lines.length >= 18) return lines.join('\n')
    }
  }
  return lines.join('\n')
}

export function computeSundayReviewStats(state: AppState, slot: SundayReviewSlot): SundayReviewStats {
  const ledger = state.personalFinance
  const spends = spendsInReviewWindow(ledger, slot)
  const spendTotal = roundMoney(spends.reduce((sum, s) => sum + s.amount, 0))
  const monthly = totalMonthlyExpenses(ledger)
  const budgetTotal = roundMoney(monthly * (7 / 30))
  const inBudget = budgetTotal <= 0 ? spendTotal <= 0 : spendTotal <= budgetTotal

  const sessions = sessionsInReviewWindow(state.timeEntries, slot)
  const sessionMinutes = sessions.reduce((sum, e) => sum + e.minutes, 0)
  const journals = journalsInReviewWindow(state.mentor?.journalEntries ?? [], slot).filter(
    (j) => j.status === 'extracted' && j.extractedText.trim(),
  )

  const today = todayDateKey(slot.windowEnd)
  const rows = categoryBudgetRows(ledger, today)
  const categoryLines = rows
    .filter((row) => row.weeklySpent > 0 || row.weeklyBudget > 0)
    .sort((a, b) => b.weeklySpent - a.weeklySpent)
    .slice(0, 8)
    .map((row) => {
      const mark = row.over ? 'OVER' : 'ok'
      return `${row.name}: spent ${formatMoney(row.weeklySpent)} / ${formatMoney(row.weeklyBudget)} (${mark})`
    })

  const lifestyle = summarizeLifestyleSeries(lifestyleSpendByDay(ledger, reviewDateKeys(slot.sundayDate)))
  const byHour = aggregateSessionsByHour(sessions)
  const peakHour = [...byHour].sort((a, b) => b.totalMinutes - a.totalMinutes)[0]
  const peakHourOk = peakHour && peakHour.totalMinutes > 0 ? peakHour : peakSessionHour(byHour)

  const minutesByDate = new Map<string, number>()
  for (const e of sessions) {
    minutesByDate.set(e.date, (minutesByDate.get(e.date) || 0) + e.minutes)
  }
  let peakWorkDate: string | null = null
  let peakWorkMinutes = 0
  for (const [date, minutes] of minutesByDate) {
    if (minutes > peakWorkMinutes) {
      peakWorkDate = date
      peakWorkMinutes = minutes
    }
  }

  return {
    spendTotal,
    budgetTotal,
    inBudget,
    sessionCount: sessions.length,
    sessionMinutes,
    journalCount: journals.length,
    categoryLines,
    foodDrinkTotal: lifestyle.foodTotal,
    spendingsTotal: lifestyle.spendingsTotal,
    peakWorkDate,
    peakWorkMinutes,
    peakHourLabel: peakHourOk && peakHourOk.totalMinutes > 0 ? peakHourOk.label : null,
    peakHourMinutes: peakHourOk?.totalMinutes ?? 0,
  }
}

export function buildSundayReviewContext(state: AppState, slot: SundayReviewSlot): string {
  const stats = computeSundayReviewStats(state, slot)
  const spends = spendsInReviewWindow(state.personalFinance, slot)
  const sessions = sessionsInReviewWindow(state.timeEntries, slot)
  const journals = journalsInReviewWindow(state.mentor?.journalEntries ?? [], slot)
  const dayKeys = reviewDateKeys(slot.sundayDate)
  const lifestyle = summarizeLifestyleSeries(lifestyleSpendByDay(state.personalFinance, dayKeys))
  const byHour = aggregateSessionsByHour(sessions)
    .filter((b) => b.sessionCount > 0)
    .map(
      (b) =>
        `${b.label}: ${b.sessionCount} sess, ${formatMinutes(Math.round(b.totalMinutes))} total, avg ${formatMinutes(b.avgSessionMinutes)}`,
    )
    .join('\n')

  const spendLines = spends
    .slice(0, 40)
    .map((s) => {
      const label =
        s.label ||
        (s.kind === 'unexpected' ? 'Unexpected' : s.note) ||
        'Spend'
      return `- ${s.date} ${formatMoney(s.amount)} ${label}`
    })
    .join('\n')

  const sessionLines = sessions
    .slice(0, 40)
    .map((e) => {
      const feel = e.debrief?.feeling ? ` feel:${e.debrief.feeling}` : ''
      const tags = e.debrief?.tags?.length ? ` tags:${e.debrief.tags.join(',')}` : ''
      const note = e.debrief?.note ? ` note:${e.debrief.note}` : e.note ? ` note:${e.note}` : ''
      const project = e.projectId ? ` ${e.projectId}` : ''
      return `- ${e.date} ${formatMinutes(e.minutes)}${project}${feel}${tags}${note}`
    })
    .join('\n')

  const journalBlocks = journals
    .filter((j) => j.extractedText.trim())
    .slice(0, 20)
    .map((j) => `### ${j.date} (${j.sourceName})\n${j.extractedText.trim().slice(0, 2500)}`)
    .join('\n\n')

  const oneThings = dayKeys
    .map((date) => {
      const text = state.dailyOneThing?.[date]?.trim()
      return text ? `- ${date}: ${text}` : null
    })
    .filter(Boolean)
    .join('\n')

  const weeklyGoals = (state.weeklyGoals ?? [])
    .filter((g) => g.text.trim())
    .map((g) => `- ${g.text}`)
    .join('\n')

  const tasks = openTaskLines(state)
  const lifestylePeak = lifestyle.peak
    ? `Peak day-to-day spend: ${lifestyle.peak.date} ${formatMoney(lifestyle.peak.total)}`
    : 'No food/drink/spendings this week.'

  return [
    `Window: ${slot.windowStart.toISOString()} → ${slot.windowEnd.toISOString()} (last 7 days to the minute, Bali).`,
    `Sunday: ${slot.sundayDate}.`,
    state.weekIntention?.trim() ? `Week intention: ${state.weekIntention.trim()}` : '',
    '',
    '## Money',
    `All spend: ${formatMoney(stats.spendTotal)}`,
    `7-day budget pace (all categories): ${formatMoney(stats.budgetTotal)}`,
    `In budget: ${stats.inBudget ? 'yes' : 'NO'}`,
    `Food & drink this week: ${formatMoney(stats.foodDrinkTotal)}`,
    `Other day-to-day spendings this week: ${formatMoney(stats.spendingsTotal)}`,
    lifestylePeak,
    'Rent, motorbike, and monthly bills are NOT the story — talk about food, drink, and day-to-day spendings.',
    stats.categoryLines.length ? `Categories:\n${stats.categoryLines.map((l) => `- ${l}`).join('\n')}` : 'No category budgets.',
    spendLines ? `Spend rows:\n${spendLines}` : 'No spends in this window.',
    '',
    '## Deep work',
    `Sessions: ${stats.sessionCount}`,
    `Total time: ${formatMinutes(stats.sessionMinutes)}`,
    stats.peakWorkDate
      ? `Heaviest day: ${stats.peakWorkDate} (${formatMinutes(stats.peakWorkMinutes)})`
      : 'No peak work day.',
    stats.peakHourLabel
      ? `Most productive hour: ${stats.peakHourLabel} (${formatMinutes(Math.round(stats.peakHourMinutes))} total)`
      : 'No timestamped peak hour.',
    `Feelings: ${feelingMixLine(sessions)}`,
    byHour ? `By hour:\n${byHour}` : 'No hourly pattern.',
    sessionLines ? `Sessions:\n${sessionLines}` : 'No sessions in this window.',
    '',
    '## Open work (use these names in the focus)',
    weeklyGoals ? `Weekly goals:\n${weeklyGoals}` : 'No weekly goals set.',
    oneThings ? `One-things this week:\n${oneThings}` : 'No daily one-things.',
    tasks ? `Open tasks:\n${tasks}` : 'No open tasks.',
    '',
    '## Journal',
    `Pages with text: ${stats.journalCount}`,
    journalBlocks || 'No journal text in this window.',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export function fallbackSundayReview(
  stats: SundayReviewStats,
  slot: SundayReviewSlot,
): Omit<SundayReview, 'id' | 'generatedAt'> {
  const spendSummary =
    stats.budgetTotal > 0
      ? stats.inBudget
        ? `You spent ${formatMoney(stats.spendTotal)} against a ${formatMoney(stats.budgetTotal)} week pace. You are in budget. Food & drink was ${formatMoney(stats.foodDrinkTotal)}; other day-to-day spendings were ${formatMoney(stats.spendingsTotal)}.`
        : `You spent ${formatMoney(stats.spendTotal)} against a ${formatMoney(stats.budgetTotal)} week pace. You are over budget. Food & drink was ${formatMoney(stats.foodDrinkTotal)}; other day-to-day spendings were ${formatMoney(stats.spendingsTotal)}.`
      : stats.spendTotal > 0
        ? `You spent ${formatMoney(stats.spendTotal)}. Food & drink was ${formatMoney(stats.foodDrinkTotal)}. Set category budgets so next week has a line to hold.`
        : 'No spend landed this week.'

  const workSummary =
    stats.sessionCount === 0
      ? 'No deep work sessions were logged this week.'
      : stats.peakHourLabel
        ? `${stats.sessionCount} session${stats.sessionCount === 1 ? '' : 's'}, ${formatMinutes(stats.sessionMinutes)} on the clock. The heaviest hour was ${stats.peakHourLabel}.`
        : `${stats.sessionCount} session${stats.sessionCount === 1 ? '' : 's'}, ${formatMinutes(stats.sessionMinutes)} on the clock.`

  const journalSummary =
    stats.journalCount === 0
      ? 'No journal pages were read this week.'
      : `${stats.journalCount} journal page${stats.journalCount === 1 ? '' : 's'} were logged.`

  const focus = stats.sessionCount === 0
    ? 'Tomorrow, start a 90-minute deep work block at 9am on the first open task in your list. Phone in another room. Stop when the 90 minutes end.'
    : stats.peakHourLabel
      ? `This week, put your hardest open task in a 90-minute block at ${stats.peakHourLabel}. Start the task in the first 5 minutes. No journal, no extra plan.`
      : 'Pick the top open task. Tomorrow, work it in one 90-minute block before noon. Write nothing else until that block is done.'

  const focusWhy = stats.peakHourLabel
    ? `Last week’s minutes clustered at ${stats.peakHourLabel}. Put the real work there so you do not spend the week deciding when to start.`
    : stats.sessionCount === 0
      ? 'No sessions landed. A named time and a named first task is the smallest rule that creates a week.'
      : 'A named first task and a named block is the smallest rule that beats a vague “work more” week.'

  return {
    sundayDate: slot.sundayDate,
    windowStart: slot.windowStart.toISOString(),
    windowEnd: slot.windowEnd.toISOString(),
    spendTotal: stats.spendTotal,
    budgetTotal: stats.budgetTotal,
    inBudget: stats.inBudget,
    sessionCount: stats.sessionCount,
    sessionMinutes: stats.sessionMinutes,
    journalCount: stats.journalCount,
    spendSummary,
    workSummary,
    journalSummary,
    synthesis: [spendSummary, workSummary, journalSummary].join(' '),
    focus,
    focusWhy,
    version: SUNDAY_REVIEW_VERSION,
  }
}
