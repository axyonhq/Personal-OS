import { useAuth, useSession } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createEmptyState, createSeedState, PROJECT_MAP, PROJECTS, uid } from '../data/seed'
import {
  createClerkSupabaseClient,
  isSupabaseConfigured,
} from '../lib/supabase/browser'
import {
  absorbLegacyCompanyFinance,
  applyRevolutCredentialsToBrowser,
  isRichFinanceLedger,
  isEmptyCloudPayload,
  mergeRevolutCredentials,
  mergeSessionSafeState,
  preferRicherFinanceLedger,
  preferRicherState,
  withLocalRevolutCredentials,
} from '../lib/supabase/sync'
import type {
  ActiveTimer,
  AppState,
  AppTab,
  CalendarBlock,
  CashAllocationLine,
  DailyBodyLog,
  DailyDeepWorkSplit,
  DeepWorkId,
  ExpenseCategory,
  ExpenseFrequency,
  FinanceLedger,
  FinanceRealm,
  Habit,
  JournalEntry,
  MentorCharge,
  MentorChargeInstall,
  MentorChargeKind,
  MentorChargeStatus,
  MentorInsight,
  MentorMessage,
  MentorState,
  OpenLoop,
  ProjectId,
  RevolutReviewItem,
  RevolutSyncState,
  SessionDebrief,
  SessionFeeling,
  SessionTag,
  SpendEntry,
  StateMigrations,
  SummaryMode,
  AddTaskOptions,
  AutopilotCompletions,
  Task,
  TimeEntry,
  WeekReflection,
  VisionGoal,
  WeeklyGoal,
  WeeklyGoalsArchiveEntry,
} from '../types'
import {
  DEEP_WORK_IDS,
  EMPTY_AUTOPILOT_COMPLETIONS,
  equalDeepWorkSplit,
  emptyMentorState,
  mentorChargeKey,
  normalizeActiveTab,
  isDeepWorkId,
  scaleDeepWorkSplit,
  SESSION_FEELINGS,
  SESSION_TAGS,
} from '../types'
import { mergePersonalFoodAndDrink, migrateWishlist } from '../utils/finance'
import {
  addDays,
  parseDateKey,
  startOfWeekMonday,
  toDateKey,
  todayDateKey,
  todayMonthKey,
  weekDays,
} from '../utils/time'
import {
  aggregatePausesByHour,
  aggregateSessionsByHour,
  computeDurationBuckets,
  computePauseStats,
  computeSessionStats,
  filterEntriesByScope,
  peakPauseHour,
  peakSessionHour,
  recentSessions,
} from '../utils/sessionAnalytics'
import { revolutCredentialsChangedEvent } from '../utils/revolutApi'
import { isInternalRevolutReviewItem } from '../lib/revolut/internal'
import { isValidFocusNote, isValidSessionTarget } from '../utils/focusNote'
import { repairJournalEntryDate } from '../utils/journalDate'

const STORAGE_KEY = 'batcave-deep-work-os-v2'
const FINANCE_BACKUP_KEY = 'batcave-finance-backup-v1'

/**
 * Caps on the fields that otherwise grow forever. The whole app state is one
 * JSON blob in localStorage (~5MB ceiling), so unbounded arrays eventually stop
 * every save. These two are bookkeeping and raw OCR text, not user history, so
 * trimming them is safe.
 */
const MAX_SETTLED_IDS = 2000
const MAX_JOURNAL_TEXT_CHARS = 20_000

/** Active work ms for a timer — excludes pause time. */
function activeTimerWorkMs(t: ActiveTimer, now = Date.now()): number {
  if (t.pausedAt) return t.elapsedBefore
  return now - t.startedAt + t.elapsedBefore
}

function migrateActiveTimer(raw: unknown): ActiveTimer | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Partial<ActiveTimer>
  if (!t.projectId || typeof t.startedAt !== 'number') return null
  // Drop zombie timers with unknown project ids (would crash the overlay).
  if (!PROJECT_MAP[t.projectId as ProjectId]) return null
  const sessionStartedAt =
    typeof t.sessionStartedAt === 'number' ? t.sessionStartedAt : t.startedAt
  const targetMinutes =
    typeof t.targetMinutes === 'number' && Number.isFinite(t.targetMinutes) && t.targetMinutes > 0
      ? Math.round(t.targetMinutes)
      : undefined
  return {
    projectId: t.projectId as ProjectId,
    startedAt: t.startedAt,
    sessionStartedAt,
    focusNote: typeof t.focusNote === 'string' ? t.focusNote : '',
    targetMinutes,
    elapsedBefore: typeof t.elapsedBefore === 'number' ? t.elapsedBefore : 0,
    pausedBefore: typeof t.pausedBefore === 'number' ? t.pausedBefore : 0,
    pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : undefined,
    pauseCount: typeof t.pauseCount === 'number' ? t.pauseCount : 0,
    pauses: Array.isArray(t.pauses) ? t.pauses : [],
  }
}

const FEELING_IDS = new Set(SESSION_FEELINGS.map((f) => f.id))
const TAG_IDS = new Set(SESSION_TAGS.map((t) => t.id))

function migrateSessionDebrief(raw: unknown): SessionDebrief | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const d = raw as Partial<SessionDebrief>
  if (!d.feeling || !FEELING_IDS.has(d.feeling as SessionFeeling)) return undefined
  const tags = Array.isArray(d.tags)
    ? d.tags.filter((t): t is SessionTag => typeof t === 'string' && TAG_IDS.has(t as SessionTag))
    : []
  return {
    feeling: d.feeling as SessionFeeling,
    tags,
    note: typeof d.note === 'string' && d.note.trim() ? d.note.trim().slice(0, 200) : undefined,
  }
}

function migrateTimeEntry(raw: unknown): TimeEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<TimeEntry>
  if (!e.id || !e.projectId || !e.date || typeof e.minutes !== 'number') return null
  const startedAt = typeof e.startedAt === 'number' ? e.startedAt : undefined
  // Timers used to save against the calendar’s selected day. Prefer the Bali
  // wall-clock day of the session so a browse-away doesn’t misfile hours.
  const date =
    startedAt != null ? todayDateKey(new Date(startedAt)) : e.date
  const debrief = migrateSessionDebrief(e.debrief)
  const targetMinutes =
    typeof e.targetMinutes === 'number' && Number.isFinite(e.targetMinutes) && e.targetMinutes > 0
      ? Math.round(e.targetMinutes)
      : undefined
  return {
    id: e.id,
    projectId: e.projectId,
    date,
    minutes: e.minutes,
    note: e.note,
    targetMinutes,
    startedAt,
    endedAt: typeof e.endedAt === 'number' ? e.endedAt : undefined,
    pausedMinutes: typeof e.pausedMinutes === 'number' ? e.pausedMinutes : undefined,
    pauseCount: typeof e.pauseCount === 'number' ? e.pauseCount : undefined,
    pauses: Array.isArray(e.pauses) ? e.pauses : undefined,
    debrief,
  }
}

function migrateMentorState(raw: unknown): MentorState {
  const empty = emptyMentorState()
  if (!raw || typeof raw !== 'object') return empty
  const m = raw as Partial<MentorState>

  const messages: MentorMessage[] = Array.isArray(m.messages)
    ? m.messages
        .map((msg) => {
          if (!msg || typeof msg !== 'object') return null
          const role = msg.role
          if (role !== 'user' && role !== 'mentor' && role !== 'system') return null
          if (typeof msg.text !== 'string' || !msg.text.trim()) return null
          return {
            id: typeof msg.id === 'string' && msg.id ? msg.id : uid('msg'),
            role,
            text: msg.text,
            createdAt:
              typeof msg.createdAt === 'string' ? msg.createdAt : new Date().toISOString(),
          } satisfies MentorMessage
        })
        .filter((x): x is MentorMessage => x != null)
        .slice(-80)
    : empty.messages

  const journalEntries: JournalEntry[] = Array.isArray(m.journalEntries)
    ? m.journalEntries
        .map((j): JournalEntry | null => {
          if (!j || typeof j !== 'object') return null
          if (typeof j.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(j.date)) return null
          const status =
            j.status === 'pending' || j.status === 'extracted' || j.status === 'failed'
              ? j.status
              : 'extracted'
          const entry: JournalEntry = {
            id: typeof j.id === 'string' && j.id ? j.id : uid('journal'),
            date: j.date,
            sourceName:
              typeof j.sourceName === 'string' && j.sourceName.trim()
                ? j.sourceName.trim()
                : 'Journal page',
            extractedText:
              typeof j.extractedText === 'string'
                ? j.extractedText.slice(0, MAX_JOURNAL_TEXT_CHARS)
                : '',
            status,
            createdAt:
              typeof j.createdAt === 'string' ? j.createdAt : new Date().toISOString(),
          }
          if (typeof j.error === 'string' && j.error) entry.error = j.error
          if (
            j.dateSource === 'manual' ||
            j.dateSource === 'extracted' ||
            j.dateSource === 'fallback'
          ) {
            entry.dateSource = j.dateSource
          }
          if (typeof j.detectedDateRaw === 'string' && j.detectedDateRaw) {
            entry.detectedDateRaw = j.detectedDateRaw
          }
          // Yearless page headers must stay on the current year (fix Claude/backfill 2025 drift).
          entry.date = repairJournalEntryDate(entry.date, entry.detectedDateRaw)
          return entry
        })
        .filter((x): x is JournalEntry => x != null)
        .slice(0, 120)
    : []

  const migrateInsight = (rawInsight: unknown): MentorInsight | null => {
    if (!rawInsight || typeof rawInsight !== 'object') return null
    const i = rawInsight as Partial<MentorInsight>
    if (typeof i.summary !== 'string' || !i.summary.trim()) return null
    const list = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12)
        : []
    return {
      id: typeof i.id === 'string' && i.id ? i.id : uid('insight'),
      createdAt: typeof i.createdAt === 'string' ? i.createdAt : new Date().toISOString(),
      summary: i.summary.trim(),
      weapons: list(i.weapons),
      drags: list(i.drags),
      blindSpots: list(i.blindSpots),
      prescriptions: list(i.prescriptions),
      installed: list(i.installed),
    }
  }

  const migrateCharge = (rawCharge: unknown): MentorCharge | null => {
    if (!rawCharge || typeof rawCharge !== 'object') return null
    const c = rawCharge as Partial<MentorCharge>
    if (typeof c.text !== 'string' || !c.text.trim()) return null
    const kind: MentorChargeKind = c.kind === 'prescription' ? 'prescription' : 'blindSpot'
    const status: MentorChargeStatus =
      c.status === 'actioned' || c.status === 'dismissed' ? c.status : 'open'
    const installKind: MentorChargeInstall | undefined =
      c.installKind === 'habit' ||
      c.installKind === 'oneThing' ||
      c.installKind === 'calendar' ||
      c.installKind === 'reminder' ||
      c.installKind === 'manual'
        ? c.installKind
        : undefined
    const createdAt = typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString()
    return {
      id: typeof c.id === 'string' && c.id ? c.id : uid('charge'),
      kind,
      text: c.text.trim(),
      status,
      sourceInsightId:
        typeof c.sourceInsightId === 'string' && c.sourceInsightId ? c.sourceInsightId : undefined,
      createdAt,
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : createdAt,
      actionedAt: typeof c.actionedAt === 'string' ? c.actionedAt : undefined,
      actionNote: typeof c.actionNote === 'string' && c.actionNote.trim() ? c.actionNote.trim() : undefined,
      installKind,
    }
  }

  const latestInsight = migrateInsight(m.latestInsight)
  const insightHistory = Array.isArray(m.insightHistory)
    ? m.insightHistory.map(migrateInsight).filter((x): x is MentorInsight => x != null).slice(0, 20)
    : []

  let charges = Array.isArray(m.charges)
    ? m.charges.map(migrateCharge).filter((x): x is MentorCharge => x != null)
    : []

  // Backfill file from existing syntheses so prior blind spots / RXs aren't lost.
  if (charges.length === 0) {
    const seeded: MentorCharge[] = []
    const seen = new Set<string>()
    const pushFrom = (insight: MentorInsight | null) => {
      if (!insight) return
      const add = (kind: MentorChargeKind, text: string, actioned: boolean) => {
        const key = mentorChargeKey(kind, text)
        if (seen.has(key)) return
        seen.add(key)
        const now = insight.createdAt
        seeded.push({
          id: uid('charge'),
          kind,
          text,
          status: actioned ? 'actioned' : 'open',
          sourceInsightId: insight.id,
          createdAt: now,
          updatedAt: now,
          actionedAt: actioned ? now : undefined,
          installKind: actioned ? 'manual' : undefined,
        })
      }
      for (const text of insight.blindSpots) add('blindSpot', text, false)
      for (const text of insight.prescriptions) {
        add('prescription', text, !!(insight.installed || []).includes(text))
      }
    }
    // Oldest first so newest insight wins on dedupe
    ;[...insightHistory].reverse().forEach(pushFrom)
    pushFrom(latestInsight)
    charges = seeded.slice(0, 80)
  }

  return {
    messages: messages.length > 0 ? messages : empty.messages,
    journalEntries,
    latestInsight,
    insightHistory,
    charges: charges.slice(0, 80),
  }
}

function migrateTimeEntries(raw: unknown, fallback: TimeEntry[]): TimeEntry[] {
  if (!Array.isArray(raw)) return fallback
  return raw.map(migrateTimeEntry).filter((e): e is TimeEntry => e != null)
}

function emptyWeeklyGoals(): WeeklyGoal[] {
  return [0, 1, 2].map(() => ({
    id: uid('wgoal'),
    text: '',
    hit: null,
    why: '',
    visionGoalId: null,
  }))
}

function migrateWeeklyGoal(raw: unknown): WeeklyGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Partial<WeeklyGoal>
  return {
    id: typeof g.id === 'string' && g.id ? g.id : uid('wgoal'),
    text: typeof g.text === 'string' ? g.text : '',
    hit: g.hit === true || g.hit === false ? g.hit : null,
    why: typeof g.why === 'string' ? g.why : '',
    visionGoalId:
      typeof g.visionGoalId === 'string' && g.visionGoalId ? g.visionGoalId : null,
  }
}

function migrateWeeklyGoals(raw: unknown, fallback: WeeklyGoal[]): WeeklyGoal[] {
  if (!Array.isArray(raw)) return fallback
  const goals = raw.map(migrateWeeklyGoal).filter((g): g is WeeklyGoal => g != null)
  while (goals.length < 3) goals.push(...emptyWeeklyGoals().slice(0, 3 - goals.length))
  return goals.slice(0, 3)
}

function migrateAutopilotCompletions(raw: unknown): AutopilotCompletions {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_AUTOPILOT_COMPLETIONS }
  const c = raw as Partial<AutopilotCompletions>
  return {
    eveningWindDownDate:
      typeof c.eveningWindDownDate === 'string' ? c.eveningWindDownDate : null,
    sundayAdminDate: typeof c.sundayAdminDate === 'string' ? c.sundayAdminDate : null,
    sundayCenterWeekStart:
      typeof c.sundayCenterWeekStart === 'string' ? c.sundayCenterWeekStart : null,
    missRepairDate: typeof c.missRepairDate === 'string' ? c.missRepairDate : null,
  }
}

function migrateBodyLogs(raw: unknown): Record<string, DailyBodyLog> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, DailyBodyLog> = {}
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !value || typeof value !== 'object') continue
    const v = value as Partial<DailyBodyLog>
    const energy =
      v.energy === 1 || v.energy === 2 || v.energy === 3 || v.energy === 4 || v.energy === 5
        ? v.energy
        : null
    const sleepHours =
      typeof v.sleepHours === 'number' && Number.isFinite(v.sleepHours)
        ? Math.max(0, Math.min(16, v.sleepHours))
        : null
    out[date] = {
      sleepHours,
      energy,
      trained: Boolean(v.trained),
      trainNote: typeof v.trainNote === 'string' ? v.trainNote : undefined,
      note: typeof v.note === 'string' ? v.note : undefined,
    }
  }
  return out
}

function migrateWeekReflections(raw: unknown): Record<string, WeekReflection> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, WeekReflection> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const r = value as Partial<WeekReflection>
    const patterns = Array.isArray(r.patterns)
      ? r.patterns
          .map((p) => {
            if (!p || typeof p !== 'object') return null
            const row = p as { id?: string; pattern?: string; evolution?: string }
            return {
              id: typeof row.id === 'string' && row.id ? row.id : uid('pat'),
              pattern: typeof row.pattern === 'string' ? row.pattern : '',
              evolution: typeof row.evolution === 'string' ? row.evolution : '',
            }
          })
          .filter((p): p is NonNullable<typeof p> => p != null)
      : []
    out[key] = {
      proud: typeof r.proud === 'string' ? r.proud : '',
      patterns,
      improve: typeof r.improve === 'string' ? r.improve : '',
      productivityShortfall: typeof r.productivityShortfall === 'string' ? r.productivityShortfall : '',
      productivityRemedy: typeof r.productivityRemedy === 'string' ? r.productivityRemedy : '',
    }
  }
  return out
}

function normalizeTask(t: Task, today: string): Task {
  const forToday = typeof t.forToday === 'boolean' ? t.forToday : true
  const plannedDate =
    typeof t.plannedDate === 'string'
      ? t.plannedDate
      : t.plannedDate === null
        ? null
        : forToday
          ? today
          : null
  const done = Boolean(t.done)
  return {
    ...t,
    forToday: plannedDate === today,
    plannedDate,
    notes: typeof t.notes === 'string' ? t.notes : '',
    archived: typeof t.archived === 'boolean' ? t.archived : done,
    sundayDeferCount:
      typeof t.sundayDeferCount === 'number' && t.sundayDeferCount >= 0
        ? Math.floor(t.sundayDeferCount)
        : 0,
  }
}

function migrateTasks(tasks: AppState['tasks']): AppState['tasks'] {
  const today = todayDateKey()
  const next = { ...tasks } as AppState['tasks']
  for (const project of PROJECTS) {
    const list = Array.isArray(next[project.id]) ? next[project.id] : []
    next[project.id] = list.map((t) => normalizeTask(t, today))
  }

  // Personal = weekday-critical todos; Sunday Admin = Sunday-only admin pile.
  if (!Array.isArray(next.personal)) next.personal = []
  if (!Array.isArray(next.sundayAdmin)) next.sundayAdmin = []

  return next
}

/** Active streak only if last tick was today or yesterday; otherwise broken → 0. */
export function habitDisplayStreak(habit: Habit, today = todayDateKey()): number {
  if (!habit.lastCompletedDate || habit.streak <= 0) return 0
  const yesterday = addDays(today, -1)
  if (habit.lastCompletedDate === today || habit.lastCompletedDate === yesterday) {
    return habit.streak
  }
  return 0
}

export function isHabitDoneOn(habit: Habit, date: string): boolean {
  return habit.lastCompletedDate === date
}

function migrateHabits(raw: unknown, today: string): Habit[] {
  if (!Array.isArray(raw)) return []
  const yesterday = addDays(today, -1)
  return raw.map((item) => {
    const h = item as Partial<Habit> & { done?: boolean }
    const id = typeof h.id === 'string' && h.id ? h.id : uid('habit')
    const name = typeof h.name === 'string' ? h.name : 'Habit'
    let lastCompletedDate: string | null =
      typeof h.lastCompletedDate === 'string' && h.lastCompletedDate
        ? h.lastCompletedDate
        : null
    let streak = Math.max(0, Math.round(Number(h.streak) || 0))

    // Legacy boolean `done` → treat as completed today so it stays locked for the day
    if (!lastCompletedDate && h.done) {
      lastCompletedDate = today
      streak = Math.max(1, streak)
    }

    if (lastCompletedDate && lastCompletedDate !== today && lastCompletedDate !== yesterday) {
      streak = 0
    }

    return { id, name, streak, lastCompletedDate } satisfies Habit
  })
}

function migrateSplit(
  raw: Partial<DailyDeepWorkSplit> | undefined,
  totalMinutes: number,
  fallback: DailyDeepWorkSplit,
): DailyDeepWorkSplit {
  if (!raw || typeof raw !== 'object') {
    return scaleDeepWorkSplit(fallback, totalMinutes)
  }
  const split: DailyDeepWorkSplit = {
    chase: Math.max(0, Math.round(Number(raw.chase) || 0)),
    myProject: Math.max(0, Math.round(Number(raw.myProject) || 0)),
    rav: Math.max(0, Math.round(Number(raw.rav) || 0)),
  }
  const sum = DEEP_WORK_IDS.reduce((s, id) => s + split[id], 0)
  if (sum <= 0) return equalDeepWorkSplit(totalMinutes)
  if (sum !== totalMinutes) return scaleDeepWorkSplit(split, totalMinutes)
  return split
}

function migrateLedger(raw: Partial<FinanceLedger> | undefined, fallback: FinanceLedger): FinanceLedger {
  if (!raw || typeof raw !== 'object') return fallback
  const categories = Array.isArray(raw.categories) ? raw.categories : fallback.categories
  const hasBills = categories.some((c) => c.isPreset && !c.parentId && c.name.toLowerCase() === 'bills')
  return {
    categories: hasBills ? categories : [...fallback.categories, ...categories],
    allocations: Array.isArray(raw.allocations) ? raw.allocations : [],
    spends: Array.isArray(raw.spends) ? raw.spends : [],
    wishlist: migrateWishlist(raw.wishlist),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
  }
}

function readFinanceBackup(): {
  personalFinance?: FinanceLedger
  /** Legacy company ledger — still recovered after the company tab was removed. */
  companyFinance?: FinanceLedger
  savedAt?: number
} | null {
  try {
    const raw = localStorage.getItem(FINANCE_BACKUP_KEY)
    if (!raw) return null
    return JSON.parse(raw) as {
      personalFinance?: FinanceLedger
      companyFinance?: FinanceLedger
      savedAt?: number
    }
  } catch {
    return null
  }
}

function writeFinanceBackup(personal: FinanceLedger) {
  if (!isRichFinanceLedger(personal)) return
  try {
    localStorage.setItem(
      FINANCE_BACKUP_KEY,
      JSON.stringify({ personalFinance: personal, savedAt: Date.now() }),
    )
  } catch {
    // ignore quota errors
  }
}

/**
 * Drop the legacy company ledger from the backup blob once it has been folded
 * into personal. Leaving it there is what let company rows come back forever.
 */
function purgeLegacyCompanyFinanceBackup() {
  try {
    const raw = localStorage.getItem(FINANCE_BACKUP_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!('companyFinance' in parsed)) return
    delete parsed.companyFinance
    localStorage.setItem(FINANCE_BACKUP_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

function isBillsPresetCategory(cat: FinanceLedger['categories'][number]): boolean {
  return Boolean(cat.isPreset && !cat.parentId && cat.name.toLowerCase() === 'bills')
}

function withBackupTimestamp(
  ledger: FinanceLedger,
  savedAt: number | undefined,
): FinanceLedger {
  if (ledger.updatedAt || !savedAt) return ledger
  return { ...ledger, updatedAt: new Date(savedAt).toISOString() }
}

function migrateRevolutSync(
  raw: Partial<RevolutSyncState> | undefined,
  fallback: RevolutSyncState,
): RevolutSyncState {
  if (!raw || typeof raw !== 'object') return fallback
  // Newest-last dedupe, then keep only the tail. This list is pure bookkeeping
  // to avoid re-importing transactions, and grew without bound before.
  const settledIds = [
    ...new Set(
      (Array.isArray(raw.settledIds) ? raw.settledIds : []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ].slice(-MAX_SETTLED_IDS)
  const settled = new Set(settledIds)
  const keepQueue = (items: RevolutReviewItem[] | undefined) =>
    (Array.isArray(items) ? items : []).filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        !settled.has(item.id) &&
        !settled.has(item.revolutTransactionId) &&
        !isInternalRevolutReviewItem(item),
    )
  return {
    personalAccountIds: Array.isArray(raw.personalAccountIds) ? raw.personalAccountIds : [],
    personalQueue: keepQueue(raw.personalQueue),
    settledIds,
  }
}

function revolutSkipKeys(item: { id: string; revolutTransactionId?: string }): string[] {
  return [item.id, item.revolutTransactionId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
}

function collectLoggedRevolutIds(s: AppState): Set<string> {
  const logged = new Set<string>(s.revolutSync.settledIds)
  const add = (id?: string) => {
    if (!id) return
    logged.add(id)
    const txnId = id.includes(':') ? id.split(':')[0] : ''
    if (txnId) logged.add(txnId)
  }
  for (const spend of s.personalFinance.spends) add(spend.revolutId)
  return logged
}

function withSettledIds(sync: RevolutSyncState, ids: string[]): RevolutSyncState {
  const next = new Set(sync.settledIds)
  for (const id of ids) {
    if (id) next.add(id)
  }
  return { ...sync, settledIds: [...next] }
}

function dropSettledFromQueues(sync: RevolutSyncState): RevolutSyncState {
  const settled = new Set(sync.settledIds)
  return {
    ...sync,
    personalQueue: sync.personalQueue.filter(
      (item) =>
        !settled.has(item.id) &&
        !settled.has(item.revolutTransactionId) &&
        !isInternalRevolutReviewItem(item),
    ),
  }
}

function normalizeAppState(parsed: Partial<AppState>, options?: { recoverLocal?: boolean }): AppState {
  const seed = createEmptyState()
  const today = todayDateKey()
  const emptyCompanySeed = seed.personalFinance

  const migrations: StateMigrations = { ...(parsed.migrations || {}) }
  // Once the legacy company ledger has been folded in we must never fold it
  // again — re-running on every load is what kept resurrecting company rows
  // inside personal finances.
  const companyAlreadyAbsorbed = migrations.companyFinanceAbsorbed === true

  let personalFinance = migrateLedger(parsed.personalFinance, seed.personalFinance)
  // Older saves kept a separate company ledger — fold it into personal before
  // we drop the field, otherwise Set expenses shows Bills $0.
  let legacyCompanyFinance = migrateLedger(
    companyAlreadyAbsorbed
      ? undefined
      : (parsed as { companyFinance?: Partial<FinanceLedger> }).companyFinance,
    emptyCompanySeed,
  )

  if (options?.recoverLocal) {
    try {
      const rawV1 = localStorage.getItem('batcave-deep-work-os-v1')
      const rawV2 = localStorage.getItem(STORAGE_KEY)
      if (rawV1 && rawV2) {
        const older = JSON.parse(rawV1) as Partial<AppState> & {
          companyFinance?: Partial<FinanceLedger>
        }
        personalFinance = preferRicherFinanceLedger(
          personalFinance,
          migrateLedger(older.personalFinance, seed.personalFinance),
        )
        if (!companyAlreadyAbsorbed) {
          legacyCompanyFinance = preferRicherFinanceLedger(
            legacyCompanyFinance,
            migrateLedger(older.companyFinance, emptyCompanySeed),
          )
        }
      }
    } catch {
      // ignore
    }
    const backup = readFinanceBackup()
    if (backup) {
      personalFinance = preferRicherFinanceLedger(
        personalFinance,
        withBackupTimestamp(
          migrateLedger(backup.personalFinance, seed.personalFinance),
          backup.savedAt,
        ),
      )
      if (!companyAlreadyAbsorbed) {
        legacyCompanyFinance = preferRicherFinanceLedger(
          legacyCompanyFinance,
          withBackupTimestamp(
            migrateLedger(backup.companyFinance, emptyCompanySeed),
            backup.savedAt,
          ),
        )
      }
    }
  }

  // Ids carried over from the company ledger, so Money can offer a one-click
  // cleanup instead of leaving the user to hunt them down by hand.
  let legacyCompanyCategoryIds = Array.isArray(parsed.legacyCompanyCategoryIds)
    ? parsed.legacyCompanyCategoryIds.filter((id): id is string => typeof id === 'string')
    : []

  if (!companyAlreadyAbsorbed) {
    const companyIds = new Set(legacyCompanyFinance.categories.map((c) => c.id))
    personalFinance = absorbLegacyCompanyFinance(personalFinance, legacyCompanyFinance)
    // Flag company-sourced rows by id rather than by diffing, so rows absorbed
    // on an earlier load are still detected.
    legacyCompanyCategoryIds = personalFinance.categories
      .filter((c) => companyIds.has(c.id) && !isBillsPresetCategory(c))
      .map((c) => c.id)
    migrations.companyFinanceAbsorbed = true
    purgeLegacyCompanyFinanceBackup()
  }

  // Legacy company finances tab → personal (via normalizeActiveTab)
  const activeTab = normalizeActiveTab((parsed as { activeTab?: unknown }).activeTab)

  // Drop deleted company / CoS / cold-email fields from older saves
  const parsedClean = { ...(parsed as Record<string, unknown>) }
  for (const key of [
    'companyFinance',
    'companyDocuments',
    'companyIdeas',
    'companyLogins',
    'companyDecisions',
    'coldEmailDomains',
    'coldEmailCatalogVersion',
    'chiefOfStaff',
  ] as const) {
    delete parsedClean[key]
  }

  const personalNext = mergePersonalFoodAndDrink(personalFinance)
  const revolutSync = dropSettledFromQueues(
    withSettledIds(
      migrateRevolutSync(parsed.revolutSync, seed.revolutSync),
      personalNext.spends.flatMap((spend) => {
        if (!spend.revolutId) return []
        const txnId = spend.revolutId.includes(':') ? spend.revolutId.split(':')[0] : ''
        return txnId ? [spend.revolutId, txnId] : [spend.revolutId]
      }),
    ),
  )

  return {
    ...seed,
    ...(parsedClean as Partial<AppState>),
    // Always open on Bali “today” so the day label matches WITA
    selectedDate: today,
    calendarMonth: todayMonthKey(),
    activeTab,
    tasks: migrateTasks((parsed.tasks as AppState['tasks']) || seed.tasks),
    dailyDeepWorkTargetMinutes:
      parsed.dailyDeepWorkTargetMinutes ?? seed.dailyDeepWorkTargetMinutes,
    dailyDeepWorkSplit: migrateSplit(
      parsed.dailyDeepWorkSplit,
      parsed.dailyDeepWorkTargetMinutes ?? seed.dailyDeepWorkTargetMinutes,
      seed.dailyDeepWorkSplit,
    ),
    showAllTasks: parsed.showAllTasks ?? false,
    dailyOneThing: { ...seed.dailyOneThing, ...(parsed.dailyOneThing || {}) },
    bodyLogs: migrateBodyLogs(parsed.bodyLogs),
    weeklyGoals: migrateWeeklyGoals(parsed.weeklyGoals, seed.weeklyGoals),
    weeklyGoalsWeekStart:
      typeof parsed.weeklyGoalsWeekStart === 'string' && parsed.weeklyGoalsWeekStart
        ? parsed.weeklyGoalsWeekStart
        : seed.weeklyGoalsWeekStart,
    weeklyGoalsArchive: Array.isArray(parsed.weeklyGoalsArchive)
      ? (parsed.weeklyGoalsArchive as WeeklyGoalsArchiveEntry[])
          .map((entry) => ({
            weekStart: entry.weekStart,
            goals: migrateWeeklyGoals(entry.goals, emptyWeeklyGoals()),
          }))
          .filter((e) => typeof e.weekStart === 'string')
      : seed.weeklyGoalsArchive,
    weekReflections: migrateWeekReflections(parsed.weekReflections),
    lastSaturdayDumpSunday:
      typeof parsed.lastSaturdayDumpSunday === 'string'
        ? parsed.lastSaturdayDumpSunday
        : parsed.lastSaturdayDumpSunday === null
          ? null
          : seed.lastSaturdayDumpSunday ?? null,
    autopilotCompletions: migrateAutopilotCompletions(parsed.autopilotCompletions),
    habits: migrateHabits(parsed.habits ?? seed.habits, today),
    personalFinance: personalNext,
    revolutSync,
    revolutCredentials: parsed.revolutCredentials,
    visionGoals: Array.isArray(parsed.visionGoals)
      ? (parsed.visionGoals as VisionGoal[])
          .map((g) => {
            if (!g || typeof g !== 'object') return null
            const title = typeof g.title === 'string' ? g.title.trim() : ''
            const body = typeof g.body === 'string' ? g.body : ''
            if (!title && !body.trim()) return null
            return {
              id: typeof g.id === 'string' && g.id ? g.id : uid('vision'),
              title: title || 'Untitled vision',
              body,
              createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date().toISOString(),
              updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : new Date().toISOString(),
            } satisfies VisionGoal
          })
          .filter((g): g is VisionGoal => g != null)
      : seed.visionGoals,
    timeEntries: migrateTimeEntries(parsed.timeEntries, seed.timeEntries),
    activeTimer: migrateActiveTimer(parsed.activeTimer),
    mentor: migrateMentorState(parsed.mentor),
    migrations,
    legacyCompanyCategoryIds,
  }
}

function loadState(): AppState {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY)
    const rawV1 = localStorage.getItem('batcave-deep-work-os-v1')
    const raw = rawV2 ?? rawV1
    if (!raw) return createEmptyState()
    return normalizeAppState(JSON.parse(raw) as Partial<AppState>, { recoverLocal: true })
  } catch {
    return createEmptyState()
  }
}

export function useStore() {
  const { isLoaded: authLoaded, userId } = useAuth()
  const { session } = useSession()
  /**
   * Clerk hands back a new `session` object on every token refresh. Reading it
   * through a ref keeps it out of effect deps, so a refresh cannot re-run the
   * hydrate and overwrite whatever the user is editing.
   */
  const sessionRef = useRef(session)
  sessionRef.current = session
  const [state, setState] = useState<AppState>(() => loadState())
  const [tick, setTick] = useState(0)
  const [cloudSync, setCloudSync] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [cloudSource, setCloudSource] = useState<'local' | 'remote' | null>(null)
  /** True when localStorage rejected a write, so offline copies have stopped. */
  const [storageFull, setStorageFull] = useState(false)
  const skipNextCloudSave = useRef(false)
  const saveTimer = useRef<number | null>(null)
  /** Coalesce overlapping cloud upserts so an older in-flight write cannot land last. */
  const cloudSaveQueue = useRef<AppState | null>(null)
  const cloudSaveTail = useRef<Promise<void>>(Promise.resolve())
  /** Latest in-memory state — cloud hydrate must not use a stale snapshot. */
  const stateRef = useRef(state)
  stateRef.current = state

  /** True once hydrate has settled, so nothing persists a pre-merge snapshot. */
  const hydrateSettled = useRef(false)
  /** Guards against re-hydrating the same user twice. */
  const hydratedForUser = useRef<string | null>(null)

  useEffect(() => {
    // Writing during hydrate can persist local-only state over data the cloud
    // fetch is about to merge in, so wait for the merge to land first.
    if (!hydrateSettled.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      setStorageFull(false)
    } catch {
      // Out of quota. The cloud row is still the source of truth, but the user
      // needs to know this browser has stopped keeping an offline copy.
      setStorageFull(true)
    }
    writeFinanceBackup(state.personalFinance)
  }, [state])

  const upsertCloudState = useCallback(
    async (next: AppState) => {
      const activeSession = sessionRef.current
      if (!userId || !activeSession) throw new Error('Not signed in')
      const client = createClerkSupabaseClient(() => activeSession.getToken())
      if (!client) throw new Error('Supabase is not configured')
      const updatedAt = new Date().toISOString()
      const payload: AppState = {
        ...withLocalRevolutCredentials(next),
        cloudUpdatedAt: updatedAt,
      }
      const { error } = await client.from('user_app_state').upsert({
        user_id: userId,
        state: payload,
        updated_at: updatedAt,
      })
      if (error) throw new Error(error.message)
      return payload
    },
    [userId],
  )

  /** Always write the newest queued snapshot; drop stale mid-flight payloads. */
  const enqueueCloudSave = useCallback(
    (next: AppState, onError?: (message: string) => void) => {
      cloudSaveQueue.current = next
      cloudSaveTail.current = cloudSaveTail.current
        .catch(() => {
          // Keep the chain alive after a prior failure.
        })
        .then(async () => {
          while (cloudSaveQueue.current) {
            const snapshot = cloudSaveQueue.current
            cloudSaveQueue.current = null
            try {
              const saved = await upsertCloudState(snapshot)
              // If the user edited while this write was in flight, fold that in
              // and schedule another pass instead of clobbering memory.
              const latest = withLocalRevolutCredentials(stateRef.current)
              const merged = mergeSessionSafeState(saved, latest, {
                timerMode: 'prefer-other',
              })
              const sessionsChanged =
                JSON.stringify(merged.timeEntries) !== JSON.stringify(saved.timeEntries) ||
                JSON.stringify(merged.activeTimer) !== JSON.stringify(saved.activeTimer)
              const financeChanged =
                JSON.stringify(merged.personalFinance) !==
                JSON.stringify(saved.personalFinance)

              if (sessionsChanged || financeChanged) {
                cloudSaveQueue.current = merged
                skipNextCloudSave.current = true
                stateRef.current = merged
                setState(merged)
                continue
              }

              if (saved.revolutCredentials !== stateRef.current.revolutCredentials) {
                skipNextCloudSave.current = true
                stateRef.current = saved
                setState(saved)
              }
            } catch (err) {
              onError?.(err instanceof Error ? err.message : 'Cloud save failed')
            }
          }
        })
    },
    [upsertCloudState],
  )

  // Load / seed cloud document once Clerk + Supabase are ready
  useEffect(() => {
    if (!authLoaded || !userId || !sessionRef.current) return
    if (!isSupabaseConfigured()) {
      hydrateSettled.current = true
      setCloudSync('idle')
      return
    }
    // Hydrate is a one-shot per signed-in user. Re-running it would re-merge and
    // re-publish state on top of live edits.
    if (hydratedForUser.current === userId) return
    hydratedForUser.current = userId

    let cancelled = false
    setCloudSync('loading')
    setCloudError(null)

    ;(async () => {
      try {
        const activeSession = sessionRef.current
        if (!activeSession) {
          hydrateSettled.current = true
          hydratedForUser.current = null
          return
        }
        const client = createClerkSupabaseClient(() => activeSession.getToken())
        if (!client) {
          hydrateSettled.current = true
          setCloudSync('idle')
          return
        }

        // Fresh disk + live memory: covers finishes / timers that landed while we waited.
        const disk = withLocalRevolutCredentials(loadState())
        const memory = withLocalRevolutCredentials(stateRef.current)
        const local = mergeSessionSafeState(memory, disk)

        const { data, error } = await client
          .from('user_app_state')
          .select('state, updated_at')
          .eq('user_id', userId)
          .maybeSingle()

        if (cancelled) return

        if (error) {
          hydrateSettled.current = true
          hydratedForUser.current = null
          setCloudError(error.message)
          setCloudSync('error')
          return
        }

        let chosen = local
        let source: 'local' | 'remote' = 'local'

        // Only skip a row that is genuinely empty (the column default). Any real
        // row must be merged — discarding a small one loses cross-device data.
        if (data?.state && typeof data.state === 'object' && !isEmptyCloudPayload(data.state)) {
          const remote = normalizeAppState(data.state as Partial<AppState>, {
            recoverLocal: true,
          })
          remote.revolutCredentials = mergeRevolutCredentials(
            remote.revolutCredentials,
            local.revolutCredentials,
          )
          const remoteReady = withLocalRevolutCredentials(remote)

          // Prefer timestamps: a row written after our last sync came from
          // another device and must win. Fall back to content volume only when
          // this browser has never synced and so has no baseline to compare.
          const remoteAt = Date.parse(data.updated_at || '') || 0
          const lastSyncedAt = Date.parse(local.cloudUpdatedAt || '') || 0
          let pick: { winner: AppState; source: 'local' | 'remote' }
          if (lastSyncedAt > 0 && remoteAt > 0) {
            pick =
              remoteAt > lastSyncedAt
                ? { winner: remoteReady, source: 'remote' }
                : { winner: local, source: 'local' }
          } else {
            pick = preferRicherState(local, remoteReady)
          }

          // Winner for bulk fields, but always keep union of sessions + any live timer.
          chosen = mergeSessionSafeState(pick.winner, pick.source === 'local' ? remoteReady : local)
          source = pick.source
        }

        // Re-fold anything the user did during the network round-trip (finish, start, discard, docs).
        // Memory wins for the live timer so discard/finish are not undone.
        const latest = withLocalRevolutCredentials(stateRef.current)
        chosen = mergeSessionSafeState(chosen, latest, { timerMode: 'prefer-other' })

        // Always persist the chosen snapshot so browser data lands under this Clerk user
        let saved = await upsertCloudState(chosen)
        if (cancelled) return

        // Edits / doc saves that landed during the upsert must not be wiped, and must
        // re-queue to cloud instead of being skipped by skipNextCloudSave.
        const afterUpsert = withLocalRevolutCredentials(stateRef.current)
        saved = mergeSessionSafeState(saved, afterUpsert, { timerMode: 'prefer-other' })
        const needsFollowUpSave =
          JSON.stringify(saved.timeEntries) !== JSON.stringify(chosen.timeEntries) ||
          JSON.stringify(saved.activeTimer) !== JSON.stringify(chosen.activeTimer) ||
          JSON.stringify(saved.personalFinance) !==
            JSON.stringify(chosen.personalFinance)

        applyRevolutCredentialsToBrowser(saved.revolutCredentials)
        skipNextCloudSave.current = true
        stateRef.current = saved
        hydrateSettled.current = true
        setState(saved)
        setCloudSource(source)
        setCloudSync('ready')
        if (needsFollowUpSave) {
          enqueueCloudSave(saved, (message) => setCloudError(message))
        }
      } catch (err) {
        if (cancelled) return
        // Let local persistence resume — otherwise a cloud outage would also
        // stop this browser from saving anything at all.
        hydrateSettled.current = true
        hydratedForUser.current = null
        setCloudError(err instanceof Error ? err.message : 'Cloud sync failed')
        setCloudSync('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoaded, userId, upsertCloudState, enqueueCloudSave])

  // Signed-out or Supabase-less sessions never hydrate, so open the local
  // persistence gate for them once auth has resolved.
  useEffect(() => {
    if (hydrateSettled.current) return
    if (!authLoaded) return
    if (!userId || !isSupabaseConfigured()) hydrateSettled.current = true
  }, [authLoaded, userId])

  // Debounced cloud save after hydration
  useEffect(() => {
    if (cloudSync !== 'ready' || !userId || !sessionRef.current) return
    if (!isSupabaseConfigured()) return
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false
      return
    }

    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      enqueueCloudSave(state, (message) => setCloudError(message))
    }, 800)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [state, cloudSync, userId, enqueueCloudSave])

  const pushBrowserToCloud = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCloudError('Supabase env vars are missing')
      setCloudSync('error')
      return
    }
    try {
      setCloudSync('loading')
      const disk = withLocalRevolutCredentials(loadState())
      const memory = withLocalRevolutCredentials(state)
      // Prefer in-memory state (includes unsaved edits) over a fresh localStorage
      // read, but union sessions and finance so the losing side's work survives.
      const pick = preferRicherState(memory, disk)
      const merged = mergeSessionSafeState(pick.winner, pick.source === 'local' ? disk : memory)
      const saved = await upsertCloudState(merged)
      applyRevolutCredentialsToBrowser(saved.revolutCredentials)
      skipNextCloudSave.current = true
      stateRef.current = saved
      setState(saved)
      setCloudSource('local')
      setCloudError(null)
      setCloudSync('ready')
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Upload failed')
      setCloudSync('error')
    }
  }, [state, upsertCloudState])

  useEffect(() => {
    if (!state.activeTimer) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [state.activeTimer])

  // Keep Revolut secrets inside AppState so they ride along with cloud upserts
  useEffect(() => {
    const onChange = () => {
      setState((s) => withLocalRevolutCredentials(s))
    }
    window.addEventListener(revolutCredentialsChangedEvent(), onChange)
    return () => window.removeEventListener(revolutCredentialsChangedEvent(), onChange)
  }, [])

  const update = useCallback((patch: Partial<AppState> | ((s: AppState) => AppState)) => {
    setState((s) => {
      const next = typeof patch === 'function' ? patch(s) : { ...s, ...patch }
      stateRef.current = next
      return next
    })
  }, [])

  const patchLedger = useCallback(
    (_realm: FinanceRealm, fn: (ledger: FinanceLedger) => FinanceLedger) => {
      update((s) => {
        const next = fn(s.personalFinance)
        return {
          ...s,
          personalFinance: {
            ...next,
            updatedAt: new Date().toISOString(),
          },
        }
      })
    },
    [update],
  )

  const setSelectedDate = useCallback((date: string) => update({ selectedDate: date }), [update])
  const setActiveTab = useCallback((activeTab: AppTab) => update({ activeTab }), [update])

  const setIdentity = useCallback(
    (fields: Partial<Pick<AppState, 'identityTitle' | 'identityQuestion' | 'identityBody'>>) =>
      update(fields),
    [update],
  )

  const setWeekIntention = useCallback((weekIntention: string) => update({ weekIntention }), [update])

  const completeAutopilot = useCallback(
    (
      kind: 'eveningWindDown' | 'sundayAdmin' | 'sundayCenter' | 'missRepair',
      key: string,
    ) => {
      update((s) => {
        const current = s.autopilotCompletions ?? { ...EMPTY_AUTOPILOT_COMPLETIONS }
        if (kind === 'eveningWindDown') {
          return {
            ...s,
            autopilotCompletions: { ...current, eveningWindDownDate: key },
          }
        }
        if (kind === 'sundayAdmin') {
          return {
            ...s,
            autopilotCompletions: { ...current, sundayAdminDate: key },
          }
        }
        if (kind === 'missRepair') {
          return {
            ...s,
            autopilotCompletions: { ...current, missRepairDate: key },
          }
        }
        return {
          ...s,
          autopilotCompletions: { ...current, sundayCenterWeekStart: key },
        }
      })
    },
    [update],
  )

  const setBodyLog = useCallback((date: string, patch: Partial<DailyBodyLog>) => {
    update((s) => {
      const prev = s.bodyLogs?.[date] ?? {
        sleepHours: null,
        energy: null,
        trained: false,
      }
      return {
        ...s,
        bodyLogs: {
          ...s.bodyLogs,
          [date]: {
            sleepHours:
              patch.sleepHours !== undefined ? patch.sleepHours : prev.sleepHours,
            energy: patch.energy !== undefined ? patch.energy : prev.energy,
            trained: patch.trained !== undefined ? patch.trained : prev.trained,
            trainNote:
              patch.trainNote !== undefined ? patch.trainNote : prev.trainNote,
            note: patch.note !== undefined ? patch.note : prev.note,
          },
        },
      }
    })
  }, [update])

  const saveWeekReflection = useCallback((weekStart: string, reflection: WeekReflection) => {
    update((s) => ({
      ...s,
      weekReflections: {
        ...s.weekReflections,
        [weekStart]: reflection,
      },
    }))
  }, [update])

  const reviewWeeklyGoals = useCallback((weekStart: string, goals: WeeklyGoal[]) => {
    const next = migrateWeeklyGoals(goals, emptyWeeklyGoals())
    update((s) => {
      if (s.weeklyGoalsWeekStart === weekStart) {
        return { ...s, weeklyGoals: next }
      }
      const hasArchive = (s.weeklyGoalsArchive || []).some((e) => e.weekStart === weekStart)
      if (hasArchive) {
        return {
          ...s,
          weeklyGoalsArchive: s.weeklyGoalsArchive.map((e) =>
            e.weekStart === weekStart ? { ...e, goals: next } : e,
          ),
        }
      }
      // Fallback: attach review onto the active goals the user just walked
      return { ...s, weeklyGoals: next }
    })
  }, [update])

  /** Commit a new weekly plan; archives the previous goals if they belong to another week. */
  const commitWeeklyPlan = useCallback(
    (weekStart: string, goals: WeeklyGoal[], focus: string) => {
      const nextGoals = migrateWeeklyGoals(goals, emptyWeeklyGoals()).map((g) => ({
        ...g,
        hit: null as boolean | null,
        why: '',
      }))
      update((s) => {
        const archive = [...(s.weeklyGoalsArchive || [])]
        const hasContent = s.weeklyGoals.some((g) => g.text.trim())
        if (
          hasContent &&
          s.weeklyGoalsWeekStart &&
          s.weeklyGoalsWeekStart !== weekStart
        ) {
          archive.unshift({
            weekStart: s.weeklyGoalsWeekStart,
            goals: s.weeklyGoals,
          })
        }
        return {
          ...s,
          weeklyGoals: nextGoals,
          weeklyGoalsWeekStart: weekStart,
          weeklyGoalsArchive: archive.slice(0, 24),
          weekIntention: focus.trim() || s.weekIntention,
        }
      })
    },
    [update],
  )

  const setDailyTargetHours = useCallback((hours: number) => {
    const clamped = Math.max(0.5, Math.min(16, hours))
    const minutes = Math.round(clamped * 60)
    update((s) => ({
      ...s,
      dailyDeepWorkTargetMinutes: minutes,
      dailyDeepWorkSplit: scaleDeepWorkSplit(s.dailyDeepWorkSplit, minutes),
    }))
  }, [update])

  /** Set the full allocation from hours per section. Split sum becomes the new total. */
  const setDailyDeepWorkSplit = useCallback((splitHours: Record<DeepWorkId, number>) => {
    const split: DailyDeepWorkSplit = {
      chase: Math.max(0, Math.round(splitHours.chase * 60)),
      myProject: Math.max(0, Math.round(splitHours.myProject * 60)),
      rav: Math.max(0, Math.round(splitHours.rav * 60)),
    }
    let total = DEEP_WORK_IDS.reduce((s, id) => s + split[id], 0)
    total = Math.max(30, Math.min(16 * 60, total))
    const normalized =
      DEEP_WORK_IDS.reduce((s, id) => s + split[id], 0) === total
        ? split
        : scaleDeepWorkSplit(split, total)
    update({
      dailyDeepWorkTargetMinutes: total,
      dailyDeepWorkSplit: normalized,
    })
  }, [update])

  const setShowAllTasks = useCallback((showAllTasks: boolean) => update({ showAllTasks }), [update])

  const setOneThing = useCallback((date: string, text: string) => {
    update((s) => ({
      ...s,
      dailyOneThing: { ...s.dailyOneThing, [date]: text },
    }))
  }, [update])

  const toggleLoop = useCallback((id: string) => {
    update((s) => ({
      ...s,
      openLoops: s.openLoops.map((l) => (l.id === id ? { ...l, done: !l.done } : l)),
    }))
  }, [update])

  const addLoop = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    update((s) => ({
      ...s,
      openLoops: [...s.openLoops, { id: uid('loop'), text: trimmed, done: false } satisfies OpenLoop],
    }))
  }, [update])

  const removeLoop = useCallback(
    (id: string): (() => void) => {
      const index = stateRef.current.openLoops.findIndex((l) => l.id === id)
      const removed = index === -1 ? null : stateRef.current.openLoops[index]
      update((s) => ({ ...s, openLoops: s.openLoops.filter((l) => l.id !== id) }))
      return () => {
        if (!removed) return
        update((s) => {
          if (s.openLoops.some((l) => l.id === removed.id)) return s
          const next = [...s.openLoops]
          next.splice(Math.min(index, next.length), 0, removed)
          return { ...s, openLoops: next }
        })
      }
    },
    [update],
  )

  const addReminder = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    update((s) => ({ ...s, reminders: [...s.reminders, trimmed] }))
  }, [update])

  const removeReminder = useCallback((index: number) => {
    update((s) => ({ ...s, reminders: s.reminders.filter((_, i) => i !== index) }))
  }, [update])

  /** Tick a non-negotiable for Bali today — locks for the day and advances the streak. */
  const completeHabit = useCallback((id: string) => {
    const today = todayDateKey()
    const yesterday = addDays(today, -1)
    update((s) => ({
      ...s,
      habits: s.habits.map((h) => {
        if (h.id !== id) return h
        if (h.lastCompletedDate === today) return h
        const continued = h.lastCompletedDate === yesterday
        const prior = continued ? habitDisplayStreak(h, today) : 0
        return {
          ...h,
          lastCompletedDate: today,
          streak: prior + 1,
        } satisfies Habit
      }),
    }))
  }, [update])

  const addHabit = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    update((s) => ({
      ...s,
      habits: [
        ...s.habits,
        { id: uid('habit'), name: trimmed, streak: 0, lastCompletedDate: null },
      ],
    }))
  }, [update])

  const removeHabit = useCallback(
    (id: string): (() => void) => {
      const index = stateRef.current.habits.findIndex((h) => h.id === id)
      const removed = index === -1 ? null : stateRef.current.habits[index]
      update((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) }))
      return () => {
        if (!removed) return
        update((s) => {
          if (s.habits.some((h) => h.id === removed.id)) return s
          const next = [...s.habits]
          next.splice(Math.min(index, next.length), 0, removed)
          return { ...s, habits: next }
        })
      }
    },
    [update],
  )

  const toggleTask = useCallback((projectId: ProjectId, taskId: string) => {
    update((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [projectId]: s.tasks[projectId].map((t) => {
          if (t.id !== taskId) return t
          // Completing a task archives it (hidden from active lists).
          if (!t.done) return { ...t, done: true, archived: true }
          return { ...t, done: false, archived: false }
        }),
      },
    }))
  }, [update])

  const setTaskForToday = useCallback((projectId: ProjectId, taskId: string, forToday: boolean) => {
    const today = todayDateKey()
    update((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [projectId]: s.tasks[projectId].map((t) =>
          t.id === taskId
            ? {
                ...t,
                forToday,
                plannedDate: forToday ? today : null,
              }
            : t,
        ),
      },
    }))
  }, [update])

  const setTaskPlannedDate = useCallback(
    (projectId: ProjectId, taskId: string, plannedDate: string | null) => {
      const today = todayDateKey()
      update((s) => ({
        ...s,
        tasks: {
          ...s.tasks,
          [projectId]: s.tasks[projectId].map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  plannedDate,
                  forToday: plannedDate === today,
                }
              : t,
          ),
        },
      }))
    },
    [update],
  )

  const setTaskNotes = useCallback((projectId: ProjectId, taskId: string, notes: string) => {
    update((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [projectId]: s.tasks[projectId].map((t) =>
          t.id === taskId ? { ...t, notes } : t,
        ),
      },
    }))
  }, [update])

  /**
   * Finalize Saturday Dump for `sundayDate`:
   * - allocated ids → planned for that Sunday, defer count reset
   * - non-allocated → defer count +1; at 2 consecutive dumps → deleted
   * Re-running the same Sunday updates allocations without double-counting deferrals.
   */
  const finalizeSaturdayDump = useCallback(
    (
      sundayDate: string,
      allocatedIds: string[],
      notesById: Record<string, string>,
    ) => {
      const allocated = new Set(allocatedIds)
      update((s) => {
        const sameSunday = s.lastSaturdayDumpSunday === sundayDate
        const today = todayDateKey()
        const list = s.tasks.sundayAdmin ?? []
        const nextList: Task[] = []
        for (const t of list) {
          if (t.archived || t.done) {
            nextList.push(t)
            continue
          }
          const notes =
            notesById[t.id] !== undefined ? notesById[t.id] : (t.notes ?? '')
          if (allocated.has(t.id)) {
            nextList.push({
              ...t,
              notes,
              plannedDate: sundayDate,
              forToday: sundayDate === today,
              sundayDeferCount: 0,
            })
            continue
          }
          // Not allocated to this Sunday
          const prevDefer = typeof t.sundayDeferCount === 'number' ? t.sundayDeferCount : 0
          const deferCount = sameSunday ? prevDefer : prevDefer + 1
          if (deferCount >= 2) {
            // Purged — two Saturday Dumps without allocation
            continue
          }
          const plannedDate = t.plannedDate === sundayDate ? null : t.plannedDate
          nextList.push({
            ...t,
            notes,
            plannedDate,
            forToday: plannedDate === today,
            sundayDeferCount: deferCount,
          })
        }
        return {
          ...s,
          tasks: { ...s.tasks, sundayAdmin: nextList },
          lastSaturdayDumpSunday: sundayDate,
        }
      })
    },
    [update],
  )

  const addTask = useCallback(
    (projectId: ProjectId, text: string, opts: boolean | AddTaskOptions = true) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const today = todayDateKey()
      const options: AddTaskOptions = typeof opts === 'boolean' ? { forToday: opts } : opts
      const plannedDate =
        options.plannedDate !== undefined
          ? options.plannedDate
          : options.forToday === false
            ? null
            : today
      const forToday = plannedDate === today
      update((s) => ({
        ...s,
        tasks: {
          ...s.tasks,
          [projectId]: [
            ...(s.tasks[projectId] ?? []),
            {
              id: uid('task'),
              text: trimmed,
              done: false,
              forToday,
              plannedDate,
              notes: options.notes?.trim() ?? '',
              archived: false,
              sundayDeferCount: 0,
            } satisfies Task,
          ],
        },
      }))
    },
    [update],
  )

  /**
   * Removes a task and hands back a function that puts it back where it was.
   *
   * Returning the undo from the store keeps the snapshot next to the data, so
   * callers can offer "Undo" without reimplementing restore logic.
   */
  const removeTask = useCallback(
    (projectId: ProjectId, taskId: string): (() => void) => {
      const list = stateRef.current.tasks[projectId] || []
      const index = list.findIndex((t) => t.id === taskId)
      const removed = index === -1 ? null : list[index]

      update((s) => ({
        ...s,
        tasks: {
          ...s.tasks,
          [projectId]: s.tasks[projectId].filter((t) => t.id !== taskId),
        },
      }))

      return () => {
        if (!removed) return
        update((s) => {
          const current = s.tasks[projectId] || []
          if (current.some((t) => t.id === removed.id)) return s
          const next = [...current]
          next.splice(Math.min(index, next.length), 0, removed)
          return { ...s, tasks: { ...s.tasks, [projectId]: next } }
        })
      }
    },
    [update],
  )

  const setSummaryMode = useCallback((summaryMode: SummaryMode) => update({ summaryMode }), [update])
  const setCalendarMonth = useCallback((calendarMonth: string) => update({ calendarMonth }), [update])

  const startTimer = useCallback((
    projectId: ProjectId,
    focusNote: string,
    options?: { startedMinutesAgo?: number; targetMinutes?: number },
  ) => {
    const cleaned = focusNote.trim().replace(/\s+/g, ' ')
    // Deep work clocks never start without a Slight Edge Focus note.
    if (isDeepWorkId(projectId) && !isValidFocusNote(cleaned)) return
    const rawTarget = options?.targetMinutes
    const targetMinutes =
      rawTarget != null && isValidSessionTarget(Math.round(rawTarget))
        ? Math.round(rawTarget)
        : undefined
    // Deep work also needs a session target so progress can show live.
    if (isDeepWorkId(projectId) && targetMinutes == null) return
    const now = Date.now()
    const agoMin = Math.max(0, Math.min(12 * 60, Math.round(options?.startedMinutesAgo ?? 0)))
    const startedAt = now - agoMin * 60_000
    update((s) => ({
      ...s,
      activeTimer: {
        projectId,
        startedAt,
        sessionStartedAt: startedAt,
        focusNote: cleaned,
        targetMinutes,
        elapsedBefore: 0,
        pausedBefore: 0,
        pauseCount: 0,
        pauses: [],
      } satisfies ActiveTimer,
    }))
  }, [update])

  const pauseTimer = useCallback(() => {
    update((s) => {
      const t = s.activeTimer
      if (!t || t.pausedAt) return s
      const now = Date.now()
      return {
        ...s,
        activeTimer: {
          ...t,
          elapsedBefore: t.elapsedBefore + (now - t.startedAt),
          pausedAt: now,
          pauseCount: t.pauseCount + 1,
        },
      }
    })
  }, [update])

  const resumeTimer = useCallback(() => {
    update((s) => {
      const t = s.activeTimer
      if (!t || !t.pausedAt) return s
      const now = Date.now()
      const pauseDuration = now - t.pausedAt
      return {
        ...s,
        activeTimer: {
          ...t,
          startedAt: now,
          pausedAt: undefined,
          pausedBefore: t.pausedBefore + pauseDuration,
          pauses: [...t.pauses, { startedAt: t.pausedAt, durationMs: pauseDuration }],
        },
      }
    })
  }, [update])

  const finishTimer = useCallback((debrief?: SessionDebrief) => {
    update((s) => {
      if (!s.activeTimer) return s
      const t = s.activeTimer
      const now = Date.now()

      let pauses = [...t.pauses]
      let pausedBefore = t.pausedBefore
      if (t.pausedAt) {
        const durationMs = now - t.pausedAt
        pauses.push({ startedAt: t.pausedAt, durationMs })
        pausedBefore += durationMs
      }

      const activeMs = activeTimerWorkMs(t, now)
      const minutes = Math.max(1, Math.round(activeMs / 60000))
      const pausedMinutes = Math.round(pausedBefore / 60000)
      const sessionDate = todayDateKey(new Date(t.sessionStartedAt))
      const cleanDebrief = migrateSessionDebrief(debrief)

      const entry: TimeEntry = {
        id: uid('te'),
        projectId: t.projectId,
        date: sessionDate,
        minutes,
        note: t.focusNote || undefined,
        targetMinutes: t.targetMinutes,
        startedAt: t.sessionStartedAt,
        endedAt: now,
        pausedMinutes: pausedMinutes > 0 ? pausedMinutes : undefined,
        pauseCount: t.pauseCount > 0 ? t.pauseCount : undefined,
        pauses: pauses.length > 0 ? pauses : undefined,
        debrief: cleanDebrief,
      }
      return {
        ...s,
        selectedDate: sessionDate,
        activeTimer: null,
        timeEntries: [...s.timeEntries, entry],
      }
    })
  }, [update])

  /**
   * Log a session that already ended (forgot to hit Finish / never started the timer).
   * Writes a time entry directly — no live clock.
   * Optional `date` (YYYY-MM-DD) pins the session to that Bali calendar day.
   */
  const logCompletedSession = useCallback(
    (
      projectId: ProjectId,
      focusNote: string,
      minutes: number,
      options?: { targetMinutes?: number; endedAt?: number; date?: string },
    ) => {
      const cleaned = focusNote.trim().replace(/\s+/g, ' ')
      if (isDeepWorkId(projectId) && !isValidFocusNote(cleaned)) return null
      const mins = Math.max(1, Math.min(12 * 60, Math.round(minutes)))
      const rawTarget = options?.targetMinutes
      const targetMinutes =
        rawTarget != null && isValidSessionTarget(Math.round(rawTarget))
          ? Math.round(rawTarget)
          : undefined
      if (isDeepWorkId(projectId) && targetMinutes == null) return null

      let endedAt = options?.endedAt ?? Date.now()
      let startedAt = endedAt - mins * 60_000
      let sessionDate = todayDateKey(new Date(startedAt))
      const pinnedDate =
        typeof options?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(options.date)
          ? options.date
          : null
      if (pinnedDate && pinnedDate !== sessionDate) {
        const dayShift =
          (parseDateKey(pinnedDate).getTime() - parseDateKey(sessionDate).getTime()) /
          86_400_000
        const shiftMs = Math.round(dayShift) * 86_400_000
        startedAt += shiftMs
        endedAt += shiftMs
        sessionDate = pinnedDate
      }
      const entry: TimeEntry = {
        id: uid('te'),
        projectId,
        date: sessionDate,
        minutes: mins,
        note: cleaned || undefined,
        targetMinutes,
        startedAt,
        endedAt,
      }
      update((s) => ({
        ...s,
        selectedDate: sessionDate,
        timeEntries: [...s.timeEntries, entry],
      }))
      return entry.id
    },
    [update],
  )

  /** Move a saved session onto another Bali calendar day (shifts timestamps with it). */
  const updateTimeEntryDate = useCallback(
    (id: string, date: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
      update((s) => ({
        ...s,
        timeEntries: s.timeEntries.map((entry) => {
          if (entry.id !== id || entry.date === date) return entry
          const dayShift =
            (parseDateKey(date).getTime() - parseDateKey(entry.date).getTime()) / 86_400_000
          const shiftMs = Math.round(dayShift) * 86_400_000
          return {
            ...entry,
            date,
            startedAt:
              entry.startedAt != null ? entry.startedAt + shiftMs : entry.startedAt,
            endedAt: entry.endedAt != null ? entry.endedAt + shiftMs : entry.endedAt,
          }
        }),
      }))
    },
    [update],
  )

  const appendMentorMessage = useCallback((message: Omit<MentorMessage, 'id' | 'createdAt'> & {
    id?: string
    createdAt?: string
  }) => {
    update((s) => {
      const next: MentorMessage = {
        id: message.id || uid('msg'),
        role: message.role,
        text: message.text,
        createdAt: message.createdAt || new Date().toISOString(),
      }
      return {
        ...s,
        mentor: {
          ...s.mentor,
          messages: [...s.mentor.messages, next].slice(-80),
        },
      }
    })
  }, [update])

  /** Replace one message's text — used to fill a bubble as tokens stream in. */
  const setMentorMessageText = useCallback(
    (id: string, text: string) => {
      update((s) => ({
        ...s,
        mentor: {
          ...s.mentor,
          messages: s.mentor.messages.map((m) => (m.id === id ? { ...m, text } : m)),
        },
      }))
    },
    [update],
  )

  const setMentorMessages = useCallback((messages: MentorMessage[]) => {
    update((s) => ({
      ...s,
      mentor: { ...s.mentor, messages: messages.slice(-80) },
    }))
  }, [update])

  const addJournalEntry = useCallback((entry: Omit<JournalEntry, 'id' | 'createdAt'> & {
    id?: string
    createdAt?: string
  }) => {
    const next: JournalEntry = {
      id: entry.id || uid('journal'),
      date: entry.date,
      sourceName: entry.sourceName,
      extractedText: entry.extractedText,
      status: entry.status,
      error: entry.error,
      createdAt: entry.createdAt || new Date().toISOString(),
    }
    update((s) => ({
      ...s,
      mentor: {
        ...s.mentor,
        journalEntries: [next, ...s.mentor.journalEntries].slice(0, 120),
      },
    }))
    return next.id
  }, [update])

  const updateJournalEntry = useCallback((id: string, patch: Partial<JournalEntry>) => {
    update((s) => ({
      ...s,
      mentor: {
        ...s.mentor,
        journalEntries: s.mentor.journalEntries.map((j) =>
          j.id === id ? { ...j, ...patch, id: j.id } : j,
        ),
      },
    }))
  }, [update])

  const removeJournalEntry = useCallback((id: string) => {
    update((s) => ({
      ...s,
      mentor: {
        ...s.mentor,
        journalEntries: s.mentor.journalEntries.filter((j) => j.id !== id),
      },
    }))
  }, [update])

  const saveMentorInsight = useCallback((insight: Omit<MentorInsight, 'id' | 'createdAt'> & {
    id?: string
    createdAt?: string
  }) => {
    const list = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12)
        : []
    const next: MentorInsight = {
      id: insight.id || uid('insight'),
      createdAt: insight.createdAt || new Date().toISOString(),
      summary: typeof insight.summary === 'string' ? insight.summary.trim() : '',
      weapons: list(insight.weapons),
      drags: list(insight.drags),
      blindSpots: list(insight.blindSpots),
      prescriptions: list(insight.prescriptions),
      installed: list(insight.installed),
    }
    if (!next.summary) {
      throw new Error('Mentor synthesis missing summary')
    }
    update((s) => {
      const now = next.createdAt
      const charges = [...(s.mentor.charges || [])]
      const openKeys = new Set(
        charges.filter((c) => c.status === 'open').map((c) => mentorChargeKey(c.kind, c.text)),
      )
      // Replace entries rather than mutating them: these objects are still
      // referenced by the previous state, and React 19 may reuse that snapshot.
      const upsert = (kind: MentorChargeKind, text: string, actioned: boolean) => {
        const key = mentorChargeKey(kind, text)
        const openIndex = charges.findIndex(
          (c) => c.status === 'open' && mentorChargeKey(c.kind, c.text) === key,
        )
        if (openIndex !== -1) {
          const existingOpen = charges[openIndex]
          charges[openIndex] = {
            ...existingOpen,
            sourceInsightId: next.id,
            updatedAt: now,
            ...(actioned
              ? {
                  status: 'actioned' as const,
                  actionedAt: now,
                  installKind: existingOpen.installKind || ('manual' as const),
                }
              : {}),
          }
          if (actioned) openKeys.delete(key)
          return
        }
        if (openKeys.has(key)) return
        // Raised again after they cleared it — reopen. Accountability is the point.
        const clearedIndex = charges.findIndex(
          (c) =>
            mentorChargeKey(c.kind, c.text) === key &&
            (c.status === 'actioned' || c.status === 'dismissed'),
        )
        if (clearedIndex !== -1 && !actioned) {
          charges[clearedIndex] = {
            ...charges[clearedIndex],
            status: 'open',
            sourceInsightId: next.id,
            updatedAt: now,
            actionedAt: undefined,
            actionNote: undefined,
            installKind: undefined,
          }
          openKeys.add(key)
          return
        }
        charges.unshift({
          id: uid('charge'),
          kind,
          text: text.trim(),
          status: actioned ? 'actioned' : 'open',
          sourceInsightId: next.id,
          createdAt: now,
          updatedAt: now,
          actionedAt: actioned ? now : undefined,
          installKind: actioned ? 'manual' : undefined,
        })
        if (!actioned) openKeys.add(key)
      }
      for (const text of next.blindSpots) upsert('blindSpot', text, false)
      for (const text of next.prescriptions) {
        upsert('prescription', text, !!(next.installed || []).includes(text))
      }
      return {
        ...s,
        mentor: {
          ...s.mentor,
          latestInsight: next,
          insightHistory: [next, ...s.mentor.insightHistory].slice(0, 20),
          charges: charges.slice(0, 80),
        },
      }
    })
    return next
  }, [update])

  const markPrescriptionInstalled = useCallback((insightId: string, prescription: string) => {
    update((s) => {
      const apply = (insight: MentorInsight | null): MentorInsight | null => {
        if (!insight || insight.id !== insightId) return insight
        const installed = [...(insight.installed || [])]
        if (!installed.includes(prescription)) installed.push(prescription)
        return { ...insight, installed }
      }
      const now = new Date().toISOString()
      const key = mentorChargeKey('prescription', prescription)
      const charges = (s.mentor.charges || []).map((c) => {
        if (mentorChargeKey(c.kind, c.text) !== key) return c
        if (c.status === 'actioned') return c
        return {
          ...c,
          status: 'actioned' as const,
          updatedAt: now,
          actionedAt: now,
          installKind: c.installKind || ('manual' as const),
        }
      })
      return {
        ...s,
        mentor: {
          ...s.mentor,
          latestInsight: apply(s.mentor.latestInsight),
          insightHistory: s.mentor.insightHistory.map((i) => apply(i) ?? i),
          charges,
        },
      }
    })
  }, [update])

  const resolveMentorCharge = useCallback(
    (
      chargeId: string,
      status: 'actioned' | 'dismissed' | 'open',
      opts?: { note?: string; installKind?: MentorChargeInstall },
    ) => {
      update((s) => {
        const now = new Date().toISOString()
        return {
          ...s,
          mentor: {
            ...s.mentor,
            charges: (s.mentor.charges || []).map((c) => {
              if (c.id !== chargeId) return c
              if (status === 'open') {
                return {
                  ...c,
                  status: 'open',
                  updatedAt: now,
                  actionedAt: undefined,
                  actionNote: undefined,
                  installKind: undefined,
                }
              }
              return {
                ...c,
                status,
                updatedAt: now,
                actionedAt: now,
                actionNote: opts?.note?.trim() || c.actionNote,
                installKind: opts?.installKind || c.installKind || (status === 'actioned' ? 'manual' : undefined),
              }
            }),
          },
        }
      })
    },
    [update],
  )

  const actionMentorCharge = useCallback(
    (chargeId: string, installKind: MentorChargeInstall, note?: string) => {
      resolveMentorCharge(chargeId, 'actioned', { installKind, note })
    },
    [resolveMentorCharge],
  )

  const discardTimer = useCallback(() => {
    update({ activeTimer: null })
  }, [update])

  const addCalendarBlock = useCallback((block: Omit<CalendarBlock, 'id'>) => {
    update((s) => ({
      ...s,
      calendarBlocks: [...s.calendarBlocks, { ...block, id: uid('block') }],
    }))
  }, [update])

  const updateCalendarBlock = useCallback((id: string, patch: Partial<CalendarBlock>) => {
    update((s) => ({
      ...s,
      calendarBlocks: s.calendarBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))
  }, [update])

  const removeCalendarBlock = useCallback((id: string) => {
    update((s) => ({
      ...s,
      calendarBlocks: s.calendarBlocks.filter((b) => b.id !== id),
    }))
  }, [update])

  /** Hide a single occurrence of a repeating block (delete "this event only"). */
  const skipBlockOccurrence = useCallback((id: string, date: string) => {
    update((s) => ({
      ...s,
      calendarBlocks: s.calendarBlocks.map((b) =>
        b.id === id
          ? { ...b, skipDates: [...new Set([...(b.skipDates || []), date])] }
          : b,
      ),
    }))
  }, [update])

  /**
   * Edit a single occurrence of a repeating block: the occurrence is removed
   * from the series and re-created as a standalone block with `patch` applied.
   */
  const detachBlockOccurrence = useCallback(
    (id: string, date: string, patch: Partial<Omit<CalendarBlock, 'id'>>) => {
      update((s) => {
        const source = s.calendarBlocks.find((b) => b.id === id)
        if (!source) return s
        const detached: CalendarBlock = {
          ...source,
          ...patch,
          id: uid('block'),
          date: patch.date ?? date,
          repeat: undefined,
          skipDates: undefined,
        }
        return {
          ...s,
          calendarBlocks: [
            ...s.calendarBlocks.map((b) =>
              b.id === id
                ? { ...b, skipDates: [...new Set([...(b.skipDates || []), date])] }
                : b,
            ),
            detached,
          ],
        }
      })
    },
    [update],
  )

  // ——— Finance ———

  const addExpenseCategory = useCallback(
    (
      realm: FinanceRealm,
      input: { name: string; frequency: ExpenseFrequency; amount: number; parentId?: string },
    ) => {
      const name = input.name.trim()
      if (!name || input.amount < 0) return
      patchLedger(realm, (ledger) => {
        const parent = input.parentId
          ? ledger.categories.find((c) => c.id === input.parentId)
          : undefined
        const cat: ExpenseCategory = {
          id: uid('cat'),
          name,
          frequency: parent?.frequency ?? input.frequency,
          amount: Math.round(input.amount * 100) / 100,
          parentId: input.parentId,
        }
        return { ...ledger, categories: [...ledger.categories, cat] }
      })
    },
    [patchLedger],
  )

  const updateExpenseCategory = useCallback(
    (
      realm: FinanceRealm,
      id: string,
      patch: Partial<Pick<ExpenseCategory, 'name' | 'frequency' | 'amount'>>,
    ) => {
      patchLedger(realm, (ledger) => ({
        ...ledger,
        categories: ledger.categories.map((c) => {
          if (c.id !== id) {
            // When parent frequency changes, sync children
            if (
              patch.frequency &&
              c.parentId === id
            ) {
              return { ...c, frequency: patch.frequency }
            }
            return c
          }
          const next = { ...c, ...patch }
          if (typeof patch.amount === 'number') {
            next.amount = Math.round(patch.amount * 100) / 100
          }
          if (patch.name !== undefined) next.name = patch.name.trim() || c.name
          return next
        }),
      }))
    },
    [patchLedger],
  )

  const removeExpenseCategory = useCallback(
    (realm: FinanceRealm, id: string) => {
      patchLedger(realm, (ledger) => {
        const target = ledger.categories.find((c) => c.id === id)
        if (!target || target.isPreset) return ledger
        const removeIds = new Set([
          id,
          ...ledger.categories.filter((c) => c.parentId === id).map((c) => c.id),
        ])
        return {
          ...ledger,
          categories: ledger.categories.filter((c) => !removeIds.has(c.id)),
        }
      })
    },
    [patchLedger],
  )

  /**
   * Remove the categories folded in from the retired company ledger, along with
   * the spends and allocation lines that pointed at them.
   */
  const removeLegacyCompanyCategories = useCallback(() => {
    update((s) => {
      const ids = new Set(s.legacyCompanyCategoryIds || [])
      if (ids.size === 0) return { ...s, legacyCompanyCategoryIds: [] }
      const ledger = s.personalFinance
      for (const cat of ledger.categories) {
        if (cat.parentId && ids.has(cat.parentId)) ids.add(cat.id)
      }
      return {
        ...s,
        legacyCompanyCategoryIds: [],
        personalFinance: {
          ...ledger,
          categories: ledger.categories.filter((c) => !ids.has(c.id)),
          spends: ledger.spends.filter(
            (s2) => !(s2.kind === 'category' && s2.categoryId && ids.has(s2.categoryId)),
          ),
          allocations: ledger.allocations
            .map((a) => ({
              ...a,
              lines: a.lines.filter(
                (l) => !(l.kind === 'category' && l.categoryId && ids.has(l.categoryId)),
              ),
            }))
            .filter((a) => a.lines.length > 0),
          updatedAt: new Date().toISOString(),
        },
      }
    })
  }, [update])

  /** Keep the legacy company rows — just stop asking about them. */
  const keepLegacyCompanyCategories = useCallback(() => {
    update({ legacyCompanyCategoryIds: [] })
  }, [update])

  const addCashAllocation = useCallback(
    (
      realm: FinanceRealm,
      input: {
        date: string
        totalAmount: number
        note?: string
        lines: Omit<CashAllocationLine, 'id'>[]
      },
    ) => {
      if (input.totalAmount <= 0 || input.lines.length === 0) return
      const lines: CashAllocationLine[] = input.lines
        .filter((l) => l.amount > 0)
        .map((l) => ({ ...l, id: uid('aline'), amount: Math.round(l.amount * 100) / 100 }))
      if (lines.length === 0) return
      patchLedger(realm, (ledger) => ({
        ...ledger,
        allocations: [
          {
            id: uid('alloc'),
            date: input.date,
            totalAmount: Math.round(input.totalAmount * 100) / 100,
            note: input.note?.trim() || undefined,
            lines,
          },
          ...ledger.allocations,
        ],
      }))
    },
    [patchLedger],
  )

  const removeCashAllocation = useCallback(
    (realm: FinanceRealm, id: string) => {
      patchLedger(realm, (ledger) => ({
        ...ledger,
        allocations: ledger.allocations.filter((a) => a.id !== id),
      }))
    },
    [patchLedger],
  )

  const addSpend = useCallback(
    (
      realm: FinanceRealm,
      input: {
        date: string
        amount: number
        kind: SpendEntry['kind']
        categoryId?: string
        label?: string
        note?: string
        revolutId?: string
      },
    ) => {
      if (input.amount <= 0) return
      if (input.kind === 'category' && !input.categoryId) return
      if (input.kind === 'unexpected' && !input.label?.trim()) return
      const entry: SpendEntry = {
        id: uid('spend'),
        date: input.date,
        amount: Math.round(input.amount * 100) / 100,
        kind: input.kind,
        categoryId: input.categoryId,
        label: input.label?.trim() || undefined,
        note: input.note?.trim() || undefined,
        revolutId: input.revolutId,
      }
      patchLedger(realm, (ledger) => ({
        ...ledger,
        spends: [entry, ...ledger.spends],
      }))
    },
    [patchLedger],
  )

  const removeSpend = useCallback(
    (realm: FinanceRealm, id: string) => {
      patchLedger(realm, (ledger) => ({
        ...ledger,
        spends: ledger.spends.filter((s) => s.id !== id),
      }))
    },
    [patchLedger],
  )

  const addWishlistItem = useCallback(
    (realm: FinanceRealm, input: { name: string; amount: number }) => {
      const name = input.name.trim()
      if (!name || !(input.amount >= 0)) return
      patchLedger(realm, (ledger) => ({
        ...ledger,
        wishlist: [
          {
            id: uid('wish'),
            name,
            amount: Math.round(input.amount * 100) / 100,
            createdAt: new Date().toISOString(),
          },
          ...(ledger.wishlist ?? []),
        ],
      }))
    },
    [patchLedger],
  )

  const removeWishlistItem = useCallback(
    (realm: FinanceRealm, id: string) => {
      patchLedger(realm, (ledger) => ({
        ...ledger,
        wishlist: (ledger.wishlist ?? []).filter((item) => item.id !== id),
      }))
    },
    [patchLedger],
  )

  const setRevolutAccountIds = useCallback(
    (_realm: FinanceRealm, accountIds: string[]) => {
      update((s) => ({
        ...s,
        revolutSync: {
          ...s.revolutSync,
          personalAccountIds: [...new Set(accountIds)],
        },
      }))
    },
    [update],
  )

  const mergeRevolutReviewItems = useCallback(
    (_realm: FinanceRealm, items: RevolutReviewItem[]) => {
      update((s) => {
        const skipped = collectLoggedRevolutIds(s)
        const existing = new Map(
          s.revolutSync.personalQueue
            .filter((item) => !isInternalRevolutReviewItem(item) && !skipped.has(item.id))
            .map((item) => [item.id, item]),
        )
        for (const item of items) {
          if (isInternalRevolutReviewItem(item)) continue
          if (skipped.has(item.id) || skipped.has(item.revolutTransactionId)) continue
          if (existing.has(item.id)) continue
          existing.set(item.id, item)
        }
        return {
          ...s,
          revolutSync: {
            ...s.revolutSync,
            personalQueue: [...existing.values()].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          },
        }
      })
    },
    [update],
  )

  const discardRevolutReviewItem = useCallback(
    (_realm: FinanceRealm, id: string) => {
      update((s) => {
        const item = s.revolutSync.personalQueue.find((row) => row.id === id)
        const settle = item ? revolutSkipKeys(item) : [id]
        return {
          ...s,
          revolutSync: {
            ...withSettledIds(s.revolutSync, settle),
            personalQueue: s.revolutSync.personalQueue.filter((row) => row.id !== id),
          },
        }
      })
    },
    [update],
  )

  const categorizeRevolutReviewItem = useCallback(
    (
      _realm: FinanceRealm,
      id: string,
      input: {
        kind: SpendEntry['kind']
        categoryId?: string
        label?: string
      },
    ) => {
      if (input.kind === 'category' && !input.categoryId) return
      if (input.kind === 'unexpected' && !input.label?.trim()) return

      update((s) => {
        const item = s.revolutSync.personalQueue.find((row) => row.id === id)
        if (!item || item.direction !== 'out' || item.amount <= 0) return s

        const entry: SpendEntry = {
          id: uid('spend'),
          date: item.date,
          amount: Math.round(item.amount * 100) / 100,
          kind: input.kind,
          categoryId: input.categoryId,
          label: input.label?.trim() || undefined,
          note: [item.merchant, item.description].filter(Boolean).join(' · ') || undefined,
          revolutId: item.id,
        }

        return {
          ...s,
          personalFinance: {
            ...s.personalFinance,
            spends: [entry, ...s.personalFinance.spends],
            updatedAt: new Date().toISOString(),
          },
          revolutSync: {
            ...withSettledIds(s.revolutSync, revolutSkipKeys(item)),
            personalQueue: s.revolutSync.personalQueue.filter((row) => row.id !== id),
          },
        }
      })
    },
    [update],
  )

  /** Clear deep-work data back to blank. Finances and vision are kept. */
  const resetToSeed = useCallback(() => {
    const blank = createEmptyState()
    setState((s) => {
      const next: AppState = {
        ...blank,
        personalFinance: s.personalFinance,
        revolutSync: s.revolutSync,
        visionGoals: s.visionGoals,
        autopilotCompletions: s.autopilotCompletions,
        lastSaturdayDumpSunday: s.lastSaturdayDumpSunday,
        migrations: s.migrations,
        legacyCompanyCategoryIds: s.legacyCompanyCategoryIds,
      }
      stateRef.current = next
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      writeFinanceBackup(next.personalFinance)
      return next
    })
  }, [])

  /** Explicit opt-in demo content, so the app can be shown off safely. */
  const loadSampleData = useCallback(() => {
    setState((s) => {
      const next: AppState = {
        ...createSeedState(),
        personalFinance: s.personalFinance,
        revolutSync: s.revolutSync,
        revolutCredentials: s.revolutCredentials,
        migrations: s.migrations,
        legacyCompanyCategoryIds: s.legacyCompanyCategoryIds,
      }
      stateRef.current = next
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const addVisionGoal = useCallback(
    (input: { title: string; body: string }) => {
      const title = input.title.trim()
      const body = input.body.trim()
      if (!title && !body) return
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        visionGoals: [
          {
            id: uid('vision'),
            title: title || 'Untitled vision',
            body,
            createdAt: now,
            updatedAt: now,
          },
          ...(s.visionGoals ?? []),
        ],
      }))
    },
    [update],
  )

  const updateVisionGoal = useCallback(
    (id: string, patch: Partial<{ title: string; body: string }>) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        visionGoals: (s.visionGoals ?? []).map((goal) => {
          if (goal.id !== id) return goal
          const title =
            patch.title !== undefined ? patch.title.trim() || goal.title : goal.title
          const body = patch.body !== undefined ? patch.body : goal.body
          return { ...goal, title, body, updatedAt: now }
        }),
      }))
    },
    [update],
  )

  const removeVisionGoal = useCallback(
    (id: string) => {
      update((s) => ({
        ...s,
        visionGoals: (s.visionGoals ?? []).filter((goal) => goal.id !== id),
      }))
    },
    [update],
  )

  const minutesFor = useCallback(
    (projectId: ProjectId | 'all', scope: 'day' | 'week' | 'total', date = state.selectedDate) => {
      let entries = state.timeEntries
      if (scope === 'day') {
        entries = entries.filter((e) => e.date === date)
      } else if (scope === 'week') {
        const days = new Set(weekDays(date))
        entries = entries.filter((e) => days.has(e.date))
      }
      if (projectId !== 'all') entries = entries.filter((e) => e.projectId === projectId)
      return entries.reduce((sum, e) => sum + e.minutes, 0)
    },
    [state.timeEntries, state.selectedDate],
  )

  const deepWorkMinutesForDate = useCallback(
    (date: string) => {
      void tick
      let total = state.timeEntries
        .filter((e) => e.date === date && isDeepWorkId(e.projectId))
        .reduce((s, e) => s + e.minutes, 0)
      if (
        state.activeTimer &&
        isDeepWorkId(state.activeTimer.projectId) &&
        todayDateKey(new Date(state.activeTimer.sessionStartedAt)) === date
      ) {
        total += Math.floor(activeTimerWorkMs(state.activeTimer) / 60000)
      }
      return total
    },
    [state.timeEntries, state.activeTimer, tick],
  )

  const hitTarget = useCallback(
    (date: string) => deepWorkMinutesForDate(date) >= state.dailyDeepWorkTargetMinutes,
    [deepWorkMinutesForDate, state.dailyDeepWorkTargetMinutes],
  )

  const targetStreak = useMemo(() => {
    // Re-run each second while a timer is live so today's streak stays current.
    void tick
    // Index once instead of rescanning every entry for each of up to 365 days.
    const deepMinutesByDate = new Map<string, number>()
    const datesWithEntries = new Set<string>()
    for (const entry of state.timeEntries) {
      datesWithEntries.add(entry.date)
      if (!isDeepWorkId(entry.projectId)) continue
      deepMinutesByDate.set(entry.date, (deepMinutesByDate.get(entry.date) || 0) + entry.minutes)
    }

    // Count a running timer too, so the streak agrees with hitTarget instead of
    // reading zero until the session is saved.
    if (state.activeTimer && isDeepWorkId(state.activeTimer.projectId)) {
      const liveDate = todayDateKey(new Date(state.activeTimer.sessionStartedAt))
      const liveMinutes = Math.floor(activeTimerWorkMs(state.activeTimer) / 60000)
      if (liveMinutes > 0) {
        datesWithEntries.add(liveDate)
        deepMinutesByDate.set(liveDate, (deepMinutesByDate.get(liveDate) || 0) + liveMinutes)
      }
    }

    let streak = 0
    let cursor = state.selectedDate
    // Today still in progress should not break a streak built up to yesterday.
    if ((deepMinutesByDate.get(cursor) || 0) < state.dailyDeepWorkTargetMinutes) {
      cursor = addDays(cursor, -1)
    }
    for (let i = 0; i < 365; i++) {
      const mins = deepMinutesByDate.get(cursor) || 0
      if (!datesWithEntries.has(cursor) && mins === 0) break
      if (mins < state.dailyDeepWorkTargetMinutes) break
      streak += 1
      cursor = addDays(cursor, -1)
    }
    return streak
  }, [
    state.selectedDate,
    state.timeEntries,
    state.activeTimer,
    state.dailyDeepWorkTargetMinutes,
    tick,
  ])

  const weekHitRate = useMemo(() => {
    const days = weekDays(state.selectedDate)
    let hits = 0
    let counted = 0
    for (const d of days) {
      const hasData = state.timeEntries.some((e) => e.date === d)
      if (!hasData && d > state.selectedDate) continue
      if (!hasData && d !== state.selectedDate) continue
      counted += 1
      if (hitTarget(d)) hits += 1
    }
    return { hits, counted }
  }, [state.selectedDate, state.timeEntries, hitTarget])

  const liveTimerSeconds = useMemo(() => {
    void tick
    const t = state.activeTimer
    if (!t) return 0
    return Math.floor(activeTimerWorkMs(t) / 1000)
  }, [state.activeTimer, tick])

  const livePauseSeconds = useMemo(() => {
    void tick
    const t = state.activeTimer
    if (!t) return 0
    let ms = t.pausedBefore
    if (t.pausedAt) ms += Date.now() - t.pausedAt
    return Math.floor(ms / 1000)
  }, [state.activeTimer, tick])

  const isTimerPaused = !!state.activeTimer?.pausedAt

  const scopedTimeEntries = useMemo(
    () => filterEntriesByScope(state.timeEntries, state.summaryMode, state.selectedDate),
    [state.timeEntries, state.summaryMode, state.selectedDate],
  )

  const sessionStats = useMemo(
    () => computeSessionStats(scopedTimeEntries),
    [scopedTimeEntries],
  )

  const durationBuckets = useMemo(
    () => computeDurationBuckets(scopedTimeEntries),
    [scopedTimeEntries],
  )

  const sessionsByHour = useMemo(
    () => aggregateSessionsByHour(scopedTimeEntries),
    [scopedTimeEntries],
  )

  const peakSession = useMemo(() => peakSessionHour(sessionsByHour), [sessionsByHour])

  const pauseStats = useMemo(() => computePauseStats(scopedTimeEntries), [scopedTimeEntries])

  const pausesByHour = useMemo(
    () => aggregatePausesByHour(scopedTimeEntries),
    [scopedTimeEntries],
  )

  const peakPause = useMemo(() => peakPauseHour(pausesByHour), [pausesByHour])

  const recentSessionEntries = useMemo(
    () => recentSessions(scopedTimeEntries),
    [scopedTimeEntries],
  )

  const projectMinutesToday = useMemo(() => {
    const map = Object.fromEntries(PROJECTS.map((p) => [p.id, 0])) as Record<ProjectId, number>
    for (const e of state.timeEntries) {
      if (e.date === state.selectedDate && e.projectId in map) map[e.projectId] += e.minutes
    }
    if (
      state.activeTimer &&
      todayDateKey(new Date(state.activeTimer.sessionStartedAt)) === state.selectedDate &&
      state.activeTimer.projectId in map
    ) {
      const liveMin = Math.floor(liveTimerSeconds / 60)
      map[state.activeTimer.projectId] += liveMin
    }
    return map
  }, [state.timeEntries, state.selectedDate, state.activeTimer, liveTimerSeconds])

  const weekStart = startOfWeekMonday(state.selectedDate)
  const weekEnd = addDays(weekStart, 6)

  const financeFor = useCallback(
    (_realm: FinanceRealm) => state.personalFinance,
    [state.personalFinance],
  )

  return {
    state,
    cloudSync,
    cloudError,
    cloudSource,
    storageFull,
    pushBrowserToCloud,
    projects: PROJECTS,
    liveTimerSeconds,
    livePauseSeconds,
    isTimerPaused,
    sessionStats,
    durationBuckets,
    sessionsByHour,
    peakSession,
    pauseStats,
    pausesByHour,
    peakPause,
    recentSessionEntries,
    projectMinutesToday,
    weekStart,
    weekEnd,
    deepWorkMinutesForDate,
    hitTarget,
    targetStreak,
    weekHitRate,
    setSelectedDate,
    setActiveTab,
    setIdentity,
    setWeekIntention,
    completeAutopilot,
    setBodyLog,
    saveWeekReflection,
    reviewWeeklyGoals,
    commitWeeklyPlan,
    setDailyTargetHours,
    setDailyDeepWorkSplit,
    setShowAllTasks,
    setOneThing,
    toggleLoop,
    addLoop,
    removeLoop,
    addReminder,
    removeReminder,
    completeHabit,
    addHabit,
    removeHabit,
    toggleTask,
    setTaskForToday,
    setTaskPlannedDate,
    setTaskNotes,
    finalizeSaturdayDump,
    addTask,
    removeTask,
    setSummaryMode,
    setCalendarMonth,
    startTimer,
    pauseTimer,
    resumeTimer,
    finishTimer,
    logCompletedSession,
    updateTimeEntryDate,
    discardTimer,
    appendMentorMessage,
    setMentorMessageText,
    setMentorMessages,
    addJournalEntry,
    updateJournalEntry,
    removeJournalEntry,
    saveMentorInsight,
    markPrescriptionInstalled,
    resolveMentorCharge,
    actionMentorCharge,
    addCalendarBlock,
    updateCalendarBlock,
    removeCalendarBlock,
    skipBlockOccurrence,
    detachBlockOccurrence,
    addExpenseCategory,
    updateExpenseCategory,
    removeExpenseCategory,
    removeLegacyCompanyCategories,
    keepLegacyCompanyCategories,
    addCashAllocation,
    removeCashAllocation,
    addSpend,
    removeSpend,
    addWishlistItem,
    removeWishlistItem,
    setRevolutAccountIds,
    mergeRevolutReviewItems,
    discardRevolutReviewItem,
    categorizeRevolutReviewItem,
    financeFor,
    addVisionGoal,
    updateVisionGoal,
    removeVisionGoal,
    minutesFor,
    resetToSeed,
    loadSampleData,
    parseDateKey,
    toDateKey,
  }
}

export type Store = ReturnType<typeof useStore>
