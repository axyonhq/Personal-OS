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
import { addDays, baliDateTimeToUtc, formatMinutes, sundayOnOrBefore, todayDateKey } from './time'

export const SUNDAY_REVIEW_HOUR = 16
export const SUNDAY_REVIEW_TTL_MS = 24 * 60 * 60 * 1000
export const SUNDAY_REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

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

  return {
    spendTotal,
    budgetTotal,
    inBudget,
    sessionCount: sessions.length,
    sessionMinutes,
    journalCount: journals.length,
    categoryLines,
  }
}

export function buildSundayReviewContext(state: AppState, slot: SundayReviewSlot): string {
  const stats = computeSundayReviewStats(state, slot)
  const spends = spendsInReviewWindow(state.personalFinance, slot)
  const sessions = sessionsInReviewWindow(state.timeEntries, slot)
  const journals = journalsInReviewWindow(state.mentor?.journalEntries ?? [], slot)

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
      return `- ${e.date} ${formatMinutes(e.minutes)}${feel}${tags}${note}`
    })
    .join('\n')

  const journalBlocks = journals
    .filter((j) => j.extractedText.trim())
    .slice(0, 20)
    .map((j) => `### ${j.date} (${j.sourceName})\n${j.extractedText.trim().slice(0, 2500)}`)
    .join('\n\n')

  return [
    `Window: ${slot.windowStart.toISOString()} → ${slot.windowEnd.toISOString()} (last 7 days to the minute, Bali).`,
    `Sunday: ${slot.sundayDate}.`,
    '',
    '## Money',
    `Spent: ${formatMoney(stats.spendTotal)}`,
    `7-day budget pace: ${formatMoney(stats.budgetTotal)}`,
    `In budget: ${stats.inBudget ? 'yes' : 'NO'}`,
    stats.categoryLines.length ? `Categories:\n${stats.categoryLines.map((l) => `- ${l}`).join('\n')}` : 'No category budgets.',
    spendLines ? `Spend rows:\n${spendLines}` : 'No spends in this window.',
    '',
    '## Deep work',
    `Sessions: ${stats.sessionCount}`,
    `Total time: ${formatMinutes(stats.sessionMinutes)}`,
    sessionLines ? `Sessions:\n${sessionLines}` : 'No sessions in this window.',
    '',
    '## Journal',
    `Pages with text: ${stats.journalCount}`,
    journalBlocks || 'No journal text in this window.',
  ].join('\n')
}

export function fallbackSundayReview(
  stats: SundayReviewStats,
  slot: SundayReviewSlot,
): Omit<SundayReview, 'id' | 'generatedAt'> {
  const spendSummary =
    stats.budgetTotal > 0
      ? stats.inBudget
        ? `You spent ${formatMoney(stats.spendTotal)} against a ${formatMoney(stats.budgetTotal)} week pace. You are in budget.`
        : `You spent ${formatMoney(stats.spendTotal)} against a ${formatMoney(stats.budgetTotal)} week pace. You are over budget.`
      : stats.spendTotal > 0
        ? `You spent ${formatMoney(stats.spendTotal)}. Set category budgets so next week has a line to hold.`
        : 'No spend landed this week.'

  const workSummary =
    stats.sessionCount === 0
      ? 'No deep work sessions were logged this week.'
      : `${stats.sessionCount} session${stats.sessionCount === 1 ? '' : 's'}, ${formatMinutes(stats.sessionMinutes)} on the clock.`

  const journalSummary =
    stats.journalCount === 0
      ? 'No journal pages were read this week.'
      : `${stats.journalCount} journal page${stats.journalCount === 1 ? '' : 's'} were logged.`

  const focus = stats.sessionCount === 0
    ? 'Protect one honest deep work block every weekday.'
    : stats.inBudget
      ? 'Keep the same work rhythm. Do not add new spend categories this week.'
      : 'Hold the budget line. One less leak, same work hours.'

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
  }
}
