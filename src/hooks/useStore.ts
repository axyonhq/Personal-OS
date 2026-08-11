import { useAuth, useSession } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildOutlookColdEmailDomains,
  COLD_EMAIL_OUTLOOK_CATALOG_VERSION,
} from '../data/coldEmailOutlookCatalog'
import { createSeedState, PROJECTS, uid } from '../data/seed'
import {
  createClerkSupabaseClient,
  isSupabaseConfigured,
} from '../lib/supabase/browser'
import {
  applyRevolutCredentialsToBrowser,
  isThinCloudPayload,
  mergeRevolutCredentials,
  mergeSessionSafeState,
  preferRicherState,
  withLocalRevolutCredentials,
} from '../lib/supabase/sync'
import type {
  ActiveTimer,
  AppState,
  AppTab,
  CalendarBlock,
  CashAllocationLine,
  CompanyDecision,
  CompanyDecisionOption,
  CompanyIdea,
  CompanyLogin,
  ColdEmailDomain,
  ColdEmailMailbox,
  ColdEmailProvider,
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
  SummaryMode,
  AddTaskOptions,
  AutopilotCompletions,
  Task,
  TimeEntry,
  WeekReflection,
  VisionGoal,
  WeeklyGoal,
  WeeklyGoalsArchiveEntry,
  ChiefOfStaffState,
  CoSBrief,
  CoSBriefSlot,
  CoSInsight,
  CoSMessage,
} from '../types'
import {
  DEEP_WORK_IDS,
  EMPTY_AUTOPILOT_COMPLETIONS,
  equalDeepWorkSplit,
  emptyChiefOfStaffState,
  emptyMentorState,
  mentorChargeKey,
  normalizeActiveTab,
  isDeepWorkId,
  scaleDeepWorkSplit,
  SESSION_FEELINGS,
  SESSION_TAGS,
  cosBriefKey,
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
import { isValidFocusNote, isValidSessionTarget } from '../utils/focusNote'
import { repairJournalEntryDate } from '../utils/journalDate'

const STORAGE_KEY = 'batcave-deep-work-os-v2'
const FINANCE_BACKUP_KEY = 'batcave-finance-backup-v1'

/** Active work ms for a timer — excludes pause time. */
function activeTimerWorkMs(t: ActiveTimer, now = Date.now()): number {
  if (t.pausedAt) return t.elapsedBefore
  return now - t.startedAt + t.elapsedBefore
}

function migrateActiveTimer(raw: unknown): ActiveTimer | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Partial<ActiveTimer>
  if (!t.projectId || typeof t.startedAt !== 'number') return null
  const sessionStartedAt =
    typeof t.sessionStartedAt === 'number' ? t.sessionStartedAt : t.startedAt
  const targetMinutes =
    typeof t.targetMinutes === 'number' && Number.isFinite(t.targetMinutes) && t.targetMinutes > 0
      ? Math.round(t.targetMinutes)
      : undefined
  return {
    projectId: t.projectId,
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
            extractedText: typeof j.extractedText === 'string' ? j.extractedText : '',
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

function migrateChiefOfStaffState(raw: unknown): ChiefOfStaffState {
  const empty = emptyChiefOfStaffState()
  if (!raw || typeof raw !== 'object') return empty
  const c = raw as Partial<ChiefOfStaffState>

  const messages: CoSMessage[] = Array.isArray(c.messages)
    ? c.messages
        .map((msg): CoSMessage | null => {
          if (!msg || typeof msg !== 'object') return null
          const role = msg.role
          if (role !== 'user' && role !== 'cos' && role !== 'system') return null
          if (typeof msg.text !== 'string' || !msg.text.trim()) return null
          const next: CoSMessage = {
            id: typeof msg.id === 'string' && msg.id ? msg.id : uid('cosmsg'),
            role,
            text: msg.text,
            createdAt:
              typeof msg.createdAt === 'string' ? msg.createdAt : new Date().toISOString(),
          }
          if (typeof msg.briefId === 'string') next.briefId = msg.briefId
          return next
        })
        .filter((m): m is CoSMessage => m != null)
        .slice(-120)
    : empty.messages

  const briefs: CoSBrief[] = Array.isArray(c.briefs)
    ? c.briefs
        .map((b): CoSBrief | null => {
          if (!b || typeof b !== 'object') return null
          if (typeof b.date !== 'string' || (b.slot !== 'morning' && b.slot !== 'night')) return null
          if (typeof b.summary !== 'string' || !b.summary.trim()) return null
          const next: CoSBrief = {
            id: typeof b.id === 'string' && b.id ? b.id : uid('brief'),
            date: b.date,
            slot: b.slot,
            summary: b.summary,
            actionItems: Array.isArray(b.actionItems)
              ? b.actionItems.filter((x): x is string => typeof x === 'string')
              : [],
            blindSpots: Array.isArray(b.blindSpots)
              ? b.blindSpots.filter((x): x is string => typeof x === 'string')
              : [],
            unmadeDecisions: Array.isArray(b.unmadeDecisions)
              ? b.unmadeDecisions.filter((x): x is string => typeof x === 'string')
              : [],
            createdAt:
              typeof b.createdAt === 'string' ? b.createdAt : new Date().toISOString(),
          }
          if (typeof b.readAt === 'string') next.readAt = b.readAt
          if (typeof b.slackSentAt === 'string') next.slackSentAt = b.slackSentAt
          return next
        })
        .filter((b): b is CoSBrief => b != null)
        .slice(0, 60)
    : []

  const migrateInsight = (rawInsight: unknown): CoSInsight | null => {
    if (!rawInsight || typeof rawInsight !== 'object') return null
    const i = rawInsight as Partial<CoSInsight>
    if (typeof i.summary !== 'string' || !i.summary.trim()) return null
    return {
      id: typeof i.id === 'string' && i.id ? i.id : uid('cosscan'),
      createdAt: typeof i.createdAt === 'string' ? i.createdAt : new Date().toISOString(),
      summary: i.summary,
      patterns: Array.isArray(i.patterns)
        ? i.patterns.filter((x): x is string => typeof x === 'string')
        : [],
      blindSpots: Array.isArray(i.blindSpots)
        ? i.blindSpots.filter((x): x is string => typeof x === 'string')
        : [],
      unmadeDecisions: Array.isArray(i.unmadeDecisions)
        ? i.unmadeDecisions.filter((x): x is string => typeof x === 'string')
        : [],
      actionItems: Array.isArray(i.actionItems)
        ? i.actionItems.filter((x): x is string => typeof x === 'string')
        : [],
    }
  }

  const latestInsight = migrateInsight(c.latestInsight)
  const insightHistory = Array.isArray(c.insightHistory)
    ? c.insightHistory.map(migrateInsight).filter((x): x is CoSInsight => x != null).slice(0, 20)
    : []

  const morningHour =
    typeof c.morningHour === 'number' && c.morningHour >= 0 && c.morningHour <= 23
      ? Math.round(c.morningHour)
      : 7
  const nightHour =
    typeof c.nightHour === 'number' && c.nightHour >= 0 && c.nightHour <= 23
      ? Math.round(c.nightHour)
      : 22
  // Migrate previous default (20) to the new 22:00 WITA night brief.
  const resolvedNight = nightHour === 20 && c.nightHour === 20 ? 22 : nightHour

  return {
    messages: messages.length > 0 ? messages : empty.messages,
    briefs,
    latestInsight,
    insightHistory,
    morningHour,
    nightHour: resolvedNight,
    proactiveEnabled: c.proactiveEnabled !== false,
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
  }
}

/** True when the ledger has more than a bare empty Bills preset. */
function isRichLedger(ledger: FinanceLedger): boolean {
  const cats = ledger.categories || []
  if ((ledger.wishlist?.length || 0) > 0) return true
  if (cats.length === 0) return false
  if (cats.length > 1) return true
  const only = cats[0]
  if (!only) return false
  if (only.name.toLowerCase() !== 'bills') return true
  if (only.amount > 0) return true
  return cats.some((c) => c.parentId)
}

function preferRicherLedger(current: FinanceLedger, candidate: FinanceLedger): FinanceLedger {
  if (!isRichLedger(current) && isRichLedger(candidate)) return candidate
  if (candidate.categories.length > current.categories.length) return candidate
  return current
}

function readFinanceBackup(): {
  personalFinance?: FinanceLedger
  companyFinance?: FinanceLedger
} | null {
  try {
    const raw = localStorage.getItem(FINANCE_BACKUP_KEY)
    if (!raw) return null
    return JSON.parse(raw) as {
      personalFinance?: FinanceLedger
      companyFinance?: FinanceLedger
    }
  } catch {
    return null
  }
}

function writeFinanceBackup(personal: FinanceLedger, company: FinanceLedger) {
  if (!isRichLedger(personal) && !isRichLedger(company)) return
  try {
    localStorage.setItem(
      FINANCE_BACKUP_KEY,
      JSON.stringify({
        personalFinance: personal,
        companyFinance: company,
        savedAt: Date.now(),
      }),
    )
  } catch {
    // ignore quota errors
  }
}

function migrateRevolutSync(
  raw: Partial<RevolutSyncState> | undefined,
  fallback: RevolutSyncState,
): RevolutSyncState {
  if (!raw || typeof raw !== 'object') return fallback
  return {
    personalAccountIds: Array.isArray(raw.personalAccountIds) ? raw.personalAccountIds : [],
    companyAccountIds: Array.isArray(raw.companyAccountIds) ? raw.companyAccountIds : [],
    personalQueue: Array.isArray(raw.personalQueue) ? raw.personalQueue : [],
    companyQueue: Array.isArray(raw.companyQueue) ? raw.companyQueue : [],
    // Drop legacy discard settlements — discarded txns should reappear on sync
    settledIds: [],
  }
}

function migrateCompanyDecisions(
  raw: unknown,
  fallback: CompanyDecision[],
): CompanyDecision[] {
  if (!Array.isArray(raw)) return fallback
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const d = item as Partial<CompanyDecision>
      const title = typeof d.title === 'string' ? d.title.trim() : ''
      if (!title) return null
      const options: CompanyDecisionOption[] = Array.isArray(d.options)
        ? d.options
            .map((opt) => {
              if (!opt || typeof opt !== 'object') return null
              const text = typeof opt.text === 'string' ? opt.text.trim() : ''
              if (!text) return null
              return {
                id: typeof opt.id === 'string' && opt.id ? opt.id : uid('dopt'),
                text,
              } satisfies CompanyDecisionOption
            })
            .filter((o): o is CompanyDecisionOption => o != null)
        : []
      const status: CompanyDecision['status'] = d.status === 'decided' ? 'decided' : 'open'
      const chosenOptionId =
        typeof d.chosenOptionId === 'string' && options.some((o) => o.id === d.chosenOptionId)
          ? d.chosenOptionId
          : null
      return {
        id: typeof d.id === 'string' && d.id ? d.id : uid('decision'),
        title,
        why: typeof d.why === 'string' ? d.why : '',
        decideBy: typeof d.decideBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.decideBy)
          ? d.decideBy
          : todayDateKey(),
        options,
        status: status === 'decided' && !chosenOptionId ? 'open' : status,
        chosenOptionId: status === 'decided' ? chosenOptionId : null,
        createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date().toISOString(),
        updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
      } satisfies CompanyDecision
    })
    .filter((d): d is CompanyDecision => d != null)
}

function normalizeDomainHost(raw: string): string {
  let value = raw.trim().toLowerCase()
  if (!value) return ''
  value = value.replace(/^https?:\/\//i, '')
  value = value.split('/')[0] ?? ''
  value = value.split('?')[0] ?? ''
  value = value.replace(/^www\./, '')
  value = value.replace(/\.$/, '')
  // Strip trailing path leftovers / ports for host:port
  const host = value.split(':')[0] ?? ''
  if (!host || !host.includes('.')) return ''
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) {
    return ''
  }
  return host
}

function parseDomainList(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const host = normalizeDomainHost(part)
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push(host)
  }
  return out
}

function normalizeMailboxLocalPart(raw: string): string {
  let value = raw.trim().toLowerCase()
  if (!value) return ''
  // Accept nick@, nick@domain.com, or nick
  if (value.includes('@')) {
    value = value.split('@')[0] ?? ''
  }
  value = value.replace(/^\.+|\.+$/g, '')
  if (!value) return ''
  if (!/^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?$/i.test(value) && !/^[a-z0-9]$/i.test(value)) {
    return ''
  }
  return value
}

function parseMailboxList(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\s,;]+/)) {
    const local = normalizeMailboxLocalPart(part)
    if (!local || seen.has(local)) continue
    seen.add(local)
    out.push(local)
  }
  return out
}

function migrateColdEmailDomains(
  raw: unknown,
  fallback: ColdEmailDomain[],
): ColdEmailDomain[] {
  if (!Array.isArray(raw)) return fallback
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const d = item as Partial<ColdEmailDomain>
      const domain = normalizeDomainHost(typeof d.domain === 'string' ? d.domain : '')
      if (!domain) return null
      const provider: ColdEmailProvider =
        d.provider === 'google' ? 'google' : 'microsoft'
      const mailboxes: ColdEmailMailbox[] = Array.isArray(d.mailboxes)
        ? d.mailboxes
            .map((box) => {
              if (!box || typeof box !== 'object') return null
              const localPart = normalizeMailboxLocalPart(
                typeof box.localPart === 'string' ? box.localPart : '',
              )
              if (!localPart) return null
              return {
                id: typeof box.id === 'string' && box.id ? box.id : uid('mbox'),
                localPart,
                password: typeof box.password === 'string' ? box.password : '',
                createdAt:
                  typeof box.createdAt === 'string'
                    ? box.createdAt
                    : new Date().toISOString(),
              } satisfies ColdEmailMailbox
            })
            .filter((b): b is ColdEmailMailbox => b != null)
        : []
      // Dedupe local parts
      const seen = new Set<string>()
      const uniqueMailboxes = mailboxes.filter((b) => {
        if (seen.has(b.localPart)) return false
        seen.add(b.localPart)
        return true
      })
      return {
        id: typeof d.id === 'string' && d.id ? d.id : uid('cedom'),
        domain,
        provider,
        mailboxes: uniqueMailboxes,
        createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date().toISOString(),
        updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
      } satisfies ColdEmailDomain
    })
    .filter((d): d is ColdEmailDomain => d != null)
}

function queueKey(realm: FinanceRealm): 'personalQueue' | 'companyQueue' {
  return realm === 'personal' ? 'personalQueue' : 'companyQueue'
}

function accountIdsKey(realm: FinanceRealm): 'personalAccountIds' | 'companyAccountIds' {
  return realm === 'personal' ? 'personalAccountIds' : 'companyAccountIds'
}

function normalizeAppState(parsed: Partial<AppState>, options?: { recoverLocal?: boolean }): AppState {
  const seed = createSeedState()
  const today = todayDateKey()

  let personalFinance = migrateLedger(parsed.personalFinance, seed.personalFinance)
  let companyFinance = migrateLedger(parsed.companyFinance, seed.companyFinance)

  if (options?.recoverLocal) {
    try {
      const rawV1 = localStorage.getItem('batcave-deep-work-os-v1')
      const rawV2 = localStorage.getItem(STORAGE_KEY)
      if (rawV1 && rawV2) {
        const older = JSON.parse(rawV1) as Partial<AppState>
        personalFinance = preferRicherLedger(
          personalFinance,
          migrateLedger(older.personalFinance, seed.personalFinance),
        )
        companyFinance = preferRicherLedger(
          companyFinance,
          migrateLedger(older.companyFinance, seed.companyFinance),
        )
      }
    } catch {
      // ignore
    }
    const backup = readFinanceBackup()
    if (backup) {
      personalFinance = preferRicherLedger(
        personalFinance,
        migrateLedger(backup.personalFinance, seed.personalFinance),
      )
      companyFinance = preferRicherLedger(
        companyFinance,
        migrateLedger(backup.companyFinance, seed.companyFinance),
      )
    }
  }

  const priorColdEmailCatalogVersion =
    typeof parsed.coldEmailCatalogVersion === 'number' ? parsed.coldEmailCatalogVersion : 0
  const coldEmailCatalogNeedsReplace =
    priorColdEmailCatalogVersion < COLD_EMAIL_OUTLOOK_CATALOG_VERSION
  const coldEmailDomains = coldEmailCatalogNeedsReplace
    ? buildOutlookColdEmailDomains()
    : migrateColdEmailDomains(parsed.coldEmailDomains, seed.coldEmailDomains)
  const coldEmailCatalogVersion = coldEmailCatalogNeedsReplace
    ? COLD_EMAIL_OUTLOOK_CATALOG_VERSION
    : priorColdEmailCatalogVersion

  return {
    ...seed,
    ...parsed,
    // Always open on Bali “today” so the day label matches WITA
    selectedDate: today,
    calendarMonth: todayMonthKey(),
    activeTab: normalizeActiveTab(parsed.activeTab),
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
    personalFinance: mergePersonalFoodAndDrink(personalFinance),
    companyFinance,
    revolutSync: migrateRevolutSync(parsed.revolutSync, seed.revolutSync),
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
    companyDocuments: Array.isArray(parsed.companyDocuments)
      ? parsed.companyDocuments
      : seed.companyDocuments,
    companyIdeas: Array.isArray(parsed.companyIdeas)
      ? parsed.companyIdeas.map((idea) => {
          const raw = idea as CompanyIdea & { title?: string }
          const text = typeof raw.text === 'string' ? raw.text : ''
          const title =
            typeof raw.title === 'string' && raw.title.trim()
              ? raw.title.trim()
              : text.split('\n')[0]?.slice(0, 80) || 'Untitled idea'
          return {
            id: raw.id,
            title,
            text,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
          }
        })
      : seed.companyIdeas,
    companyLogins: Array.isArray(parsed.companyLogins)
      ? parsed.companyLogins
          .map((row) => {
            const raw = row as Partial<CompanyLogin>
            if (!raw || typeof raw.id !== 'string') return null
            const url = typeof raw.url === 'string' ? raw.url.trim() : ''
            const platform = typeof raw.platform === 'string' ? raw.platform.trim() : ''
            const username = typeof raw.username === 'string' ? raw.username.trim() : ''
            const password = typeof raw.password === 'string' ? raw.password : ''
            if (!url && !platform && !username) return null
            return {
              id: raw.id,
              platform,
              url,
              username,
              password,
              twoFactorEnabled: Boolean(raw.twoFactorEnabled),
              createdAt:
                typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
              updatedAt:
                typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
            } satisfies CompanyLogin
          })
          .filter((row): row is CompanyLogin => row != null)
      : seed.companyLogins,
    companyDecisions: migrateCompanyDecisions(parsed.companyDecisions, seed.companyDecisions),
    coldEmailDomains,
    coldEmailCatalogVersion,
    timeEntries: migrateTimeEntries(parsed.timeEntries, seed.timeEntries),
    activeTimer: migrateActiveTimer(parsed.activeTimer),
    mentor: migrateMentorState(parsed.mentor),
    chiefOfStaff: migrateChiefOfStaffState(parsed.chiefOfStaff),
  }
}

function loadState(): AppState {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY)
    const rawV1 = localStorage.getItem('batcave-deep-work-os-v1')
    const raw = rawV2 ?? rawV1
    if (!raw) return createSeedState()
    return normalizeAppState(JSON.parse(raw) as Partial<AppState>, { recoverLocal: true })
  } catch {
    return createSeedState()
  }
}

function ledgerKey(realm: FinanceRealm): 'personalFinance' | 'companyFinance' {
  return realm === 'personal' ? 'personalFinance' : 'companyFinance'
}

export function useStore() {
  const { isLoaded: authLoaded, userId } = useAuth()
  const { session } = useSession()
  const [state, setState] = useState<AppState>(() => loadState())
  const [tick, setTick] = useState(0)
  const [cloudSync, setCloudSync] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [cloudSource, setCloudSource] = useState<'local' | 'remote' | null>(null)
  const skipNextCloudSave = useRef(false)
  const saveTimer = useRef<number | null>(null)
  /** Coalesce overlapping cloud upserts so an older in-flight write cannot land last. */
  const cloudSaveQueue = useRef<AppState | null>(null)
  const cloudSaveTail = useRef<Promise<void>>(Promise.resolve())
  /** Latest in-memory state — cloud hydrate must not use a stale snapshot. */
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    writeFinanceBackup(state.personalFinance, state.companyFinance)
  }, [state])

  const upsertCloudState = useCallback(
    async (next: AppState) => {
      if (!userId || !session) throw new Error('Not signed in')
      const client = createClerkSupabaseClient(() => session.getToken())
      if (!client) throw new Error('Supabase is not configured')
      const payload = withLocalRevolutCredentials(next)
      const { error } = await client.from('user_app_state').upsert({
        user_id: userId,
        state: payload,
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
      return payload
    },
    [userId, session],
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
              const docsChanged =
                JSON.stringify(merged.companyDocuments) !==
                JSON.stringify(saved.companyDocuments)
              const sessionsChanged =
                JSON.stringify(merged.timeEntries) !== JSON.stringify(saved.timeEntries) ||
                JSON.stringify(merged.activeTimer) !== JSON.stringify(saved.activeTimer)

              if (docsChanged || sessionsChanged) {
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
    if (!authLoaded || !userId || !session) return
    if (!isSupabaseConfigured()) {
      setCloudSync('idle')
      return
    }

    let cancelled = false
    setCloudSync('loading')
    setCloudError(null)

    ;(async () => {
      try {
        const client = createClerkSupabaseClient(() => session.getToken())
        if (!client) {
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
          setCloudError(error.message)
          setCloudSync('error')
          return
        }

        let chosen = local
        let source: 'local' | 'remote' = 'local'

        if (data?.state && typeof data.state === 'object' && !isThinCloudPayload(data.state)) {
          const remote = normalizeAppState(data.state as Partial<AppState>, {
            recoverLocal: true,
          })
          remote.revolutCredentials = mergeRevolutCredentials(
            remote.revolutCredentials,
            local.revolutCredentials,
          )
          const remoteReady = withLocalRevolutCredentials(remote)
          const pick = preferRicherState(local, remoteReady)
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
          JSON.stringify(saved.companyDocuments) !==
            JSON.stringify(chosen.companyDocuments) ||
          JSON.stringify(saved.timeEntries) !== JSON.stringify(chosen.timeEntries) ||
          JSON.stringify(saved.activeTimer) !== JSON.stringify(chosen.activeTimer)

        applyRevolutCredentialsToBrowser(saved.revolutCredentials)
        skipNextCloudSave.current = true
        stateRef.current = saved
        setState(saved)
        setCloudSource(source)
        setCloudSync('ready')
        if (needsFollowUpSave) {
          enqueueCloudSave(saved, (message) => setCloudError(message))
        }
      } catch (err) {
        if (cancelled) return
        setCloudError(err instanceof Error ? err.message : 'Cloud sync failed')
        setCloudSync('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoaded, userId, session, upsertCloudState, enqueueCloudSave])

  // Debounced cloud save after hydration
  useEffect(() => {
    if (cloudSync !== 'ready' || !userId || !session) return
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
  }, [state, cloudSync, userId, session, enqueueCloudSave])

  const pushBrowserToCloud = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCloudError('Supabase env vars are missing')
      setCloudSync('error')
      return
    }
    try {
      setCloudSync('loading')
      const local = withLocalRevolutCredentials(loadState())
      // Prefer in-memory state (includes unsaved edits) over a fresh localStorage read
      const merged = preferRicherState(
        withLocalRevolutCredentials(state),
        local,
      ).winner
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
    (realm: FinanceRealm, fn: (ledger: FinanceLedger) => FinanceLedger) => {
      const key = ledgerKey(realm)
      update((s) => ({ ...s, [key]: fn(s[key]) }))
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

  const removeLoop = useCallback((id: string) => {
    update((s) => ({ ...s, openLoops: s.openLoops.filter((l) => l.id !== id) }))
  }, [update])

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

  const removeHabit = useCallback((id: string) => {
    update((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) }))
  }, [update])

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

  const removeTask = useCallback((projectId: ProjectId, taskId: string) => {
    update((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [projectId]: s.tasks[projectId].filter((t) => t.id !== taskId),
      },
    }))
  }, [update])

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
      const upsert = (kind: MentorChargeKind, text: string, actioned: boolean) => {
        const key = mentorChargeKey(kind, text)
        const existingOpen = charges.find(
          (c) => c.status === 'open' && mentorChargeKey(c.kind, c.text) === key,
        )
        if (existingOpen) {
          existingOpen.sourceInsightId = next.id
          existingOpen.updatedAt = now
          if (actioned) {
            existingOpen.status = 'actioned'
            existingOpen.actionedAt = now
            existingOpen.installKind = existingOpen.installKind || 'manual'
            openKeys.delete(key)
          }
          return
        }
        if (openKeys.has(key)) return
        // Raised again after they cleared it — reopen. Accountability is the point.
        const cleared = charges.find(
          (c) =>
            mentorChargeKey(c.kind, c.text) === key &&
            (c.status === 'actioned' || c.status === 'dismissed'),
        )
        if (cleared && !actioned) {
          cleared.status = 'open'
          cleared.sourceInsightId = next.id
          cleared.updatedAt = now
          cleared.actionedAt = undefined
          cleared.actionNote = undefined
          cleared.installKind = undefined
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

  const appendCoSMessage = useCallback(
    (
      message: Omit<CoSMessage, 'id' | 'createdAt'> & {
        id?: string
        createdAt?: string
      },
    ) => {
      update((s) => {
        const next: CoSMessage = {
          id: message.id || uid('cosmsg'),
          role: message.role,
          text: message.text,
          createdAt: message.createdAt || new Date().toISOString(),
          briefId: message.briefId,
        }
        return {
          ...s,
          chiefOfStaff: {
            ...s.chiefOfStaff,
            messages: [...(s.chiefOfStaff?.messages || []), next].slice(-120),
          },
        }
      })
    },
    [update],
  )

  const saveCoSBrief = useCallback(
    (
      input: Omit<CoSBrief, 'id' | 'createdAt'> & {
        id?: string
        createdAt?: string
        chatReply?: string
      },
    ) => {
      const now = input.createdAt || new Date().toISOString()
      const id = input.id || uid('brief')
      const brief: CoSBrief = {
        id,
        date: input.date,
        slot: input.slot,
        summary: input.summary,
        actionItems: input.actionItems || [],
        blindSpots: input.blindSpots || [],
        unmadeDecisions: input.unmadeDecisions || [],
        createdAt: now,
        readAt: input.readAt,
      }
      update((s) => {
        const cos = s.chiefOfStaff || emptyChiefOfStaffState()
        const withoutDup = (cos.briefs || []).filter(
          (b) => cosBriefKey(b.date, b.slot) !== cosBriefKey(brief.date, brief.slot),
        )
        const chatText =
          input.chatReply?.trim() ||
          [
            `${brief.slot === 'morning' ? 'Morning' : 'Night'} brief · ${brief.date}`,
            brief.summary,
            '',
            'Actions:',
            ...brief.actionItems.map((a, i) => `${i + 1}. ${a}`),
          ].join('\n')
        return {
          ...s,
          chiefOfStaff: {
            ...cos,
            briefs: [brief, ...withoutDup].slice(0, 60),
            messages: [
              ...(cos.messages || []),
              {
                id: uid('cosmsg'),
                role: 'cos' as const,
                text: chatText,
                createdAt: now,
                briefId: id,
              },
            ].slice(-120),
          },
        }
      })
      return brief
    },
    [update],
  )

  const markCoSBriefRead = useCallback(
    (id: string) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        chiefOfStaff: {
          ...s.chiefOfStaff,
          briefs: (s.chiefOfStaff?.briefs || []).map((b) =>
            b.id === id ? { ...b, readAt: b.readAt || now } : b,
          ),
        },
      }))
    },
    [update],
  )

  const markCoSBriefSlackSent = useCallback(
    (id: string) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        chiefOfStaff: {
          ...s.chiefOfStaff,
          briefs: (s.chiefOfStaff?.briefs || []).map((b) =>
            b.id === id ? { ...b, slackSentAt: b.slackSentAt || now } : b,
          ),
        },
      }))
    },
    [update],
  )

  const saveCoSInsight = useCallback(
    (
      insight: Omit<CoSInsight, 'id' | 'createdAt'> & {
        id?: string
        createdAt?: string
        chatReply?: string
      },
    ) => {
      const now = insight.createdAt || new Date().toISOString()
      const next: CoSInsight = {
        id: insight.id || uid('cosscan'),
        createdAt: now,
        summary: insight.summary,
        patterns: insight.patterns || [],
        blindSpots: insight.blindSpots || [],
        unmadeDecisions: insight.unmadeDecisions || [],
        actionItems: insight.actionItems || [],
      }
      update((s) => {
        const cos = s.chiefOfStaff || emptyChiefOfStaffState()
        return {
          ...s,
          chiefOfStaff: {
            ...cos,
            latestInsight: next,
            insightHistory: [next, ...(cos.insightHistory || [])].slice(0, 20),
            messages: insight.chatReply
              ? [
                  ...(cos.messages || []),
                  {
                    id: uid('cosmsg'),
                    role: 'cos' as const,
                    text: insight.chatReply,
                    createdAt: now,
                  },
                ].slice(-120)
              : cos.messages,
          },
        }
      })
      return next
    },
    [update],
  )

  const setCoSProactive = useCallback(
    (enabled: boolean) => {
      update((s) => ({
        ...s,
        chiefOfStaff: {
          ...(s.chiefOfStaff || emptyChiefOfStaffState()),
          proactiveEnabled: enabled,
        },
      }))
    },
    [update],
  )

  const setCoSBriefHours = useCallback(
    (morningHour: number, nightHour: number) => {
      update((s) => ({
        ...s,
        chiefOfStaff: {
          ...(s.chiefOfStaff || emptyChiefOfStaffState()),
          morningHour: Math.max(0, Math.min(23, Math.round(morningHour))),
          nightHour: Math.max(0, Math.min(23, Math.round(nightHour))),
        },
      }))
    },
    [update],
  )

  const hasCoSBrief = useCallback(
    (date: string, slot: CoSBriefSlot) => {
      return (state.chiefOfStaff?.briefs || []).some(
        (b) => cosBriefKey(b.date, b.slot) === cosBriefKey(date, slot),
      )
    },
    [state.chiefOfStaff?.briefs],
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
    (realm: FinanceRealm, accountIds: string[]) => {
      const key = accountIdsKey(realm)
      update((s) => ({
        ...s,
        revolutSync: {
          ...s.revolutSync,
          [key]: [...new Set(accountIds)],
        },
      }))
    },
    [update],
  )

  const mergeRevolutReviewItems = useCallback(
    (realm: FinanceRealm, items: RevolutReviewItem[]) => {
      const qKey = queueKey(realm)
      update((s) => {
        // Only skip txns already logged as spends — discarded ones come back on re-sync
        const logged = new Set<string>()
        for (const spend of s.personalFinance.spends) {
          if (spend.revolutId) logged.add(spend.revolutId)
        }
        for (const spend of s.companyFinance.spends) {
          if (spend.revolutId) logged.add(spend.revolutId)
        }
        const existing = new Map(s.revolutSync[qKey].map((item) => [item.id, item]))
        for (const item of items) {
          if (logged.has(item.id)) continue
          existing.set(item.id, item)
        }
        return {
          ...s,
          revolutSync: {
            ...s.revolutSync,
            settledIds: [],
            [qKey]: [...existing.values()].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          },
        }
      })
    },
    [update],
  )

  const discardRevolutReviewItem = useCallback(
    (realm: FinanceRealm, id: string) => {
      const qKey = queueKey(realm)
      update((s) => ({
        ...s,
        revolutSync: {
          ...s.revolutSync,
          // Remove from queue only — do not permanently settle (re-sync can show again)
          [qKey]: s.revolutSync[qKey].filter((item) => item.id !== id),
        },
      }))
    },
    [update],
  )

  const categorizeRevolutReviewItem = useCallback(
    (
      realm: FinanceRealm,
      id: string,
      input: {
        kind: SpendEntry['kind']
        categoryId?: string
        label?: string
      },
    ) => {
      if (input.kind === 'category' && !input.categoryId) return
      if (input.kind === 'unexpected' && !input.label?.trim()) return

      const qKey = queueKey(realm)
      const ledger = ledgerKey(realm)

      update((s) => {
        const item = s.revolutSync[qKey].find((row) => row.id === id)
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
          [ledger]: {
            ...s[ledger],
            spends: [entry, ...s[ledger].spends],
          },
          revolutSync: {
            ...s.revolutSync,
            [qKey]: s.revolutSync[qKey].filter((row) => row.id !== id),
          },
        }
      })
    },
    [update],
  )

  const resetToSeed = useCallback(() => {
    const seed = createSeedState()
    setState((s) => {
      const next = {
        ...seed,
        personalFinance: s.personalFinance,
        companyFinance: s.companyFinance,
        revolutSync: s.revolutSync,
        companyDocuments: s.companyDocuments,
        companyIdeas: s.companyIdeas,
        companyLogins: s.companyLogins,
        companyDecisions: s.companyDecisions,
        coldEmailDomains: s.coldEmailDomains,
        coldEmailCatalogVersion: s.coldEmailCatalogVersion,
        visionGoals: s.visionGoals,
        autopilotCompletions: s.autopilotCompletions,
        lastSaturdayDumpSunday: s.lastSaturdayDumpSunday,
        chiefOfStaff: s.chiefOfStaff,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      writeFinanceBackup(next.personalFinance, next.companyFinance)
      return next
    })
  }, [])

  const addCompanyDocument = useCallback(
    (input: { title: string; content?: string; sourceName?: string }) => {
      const now = new Date().toISOString()
      const title = input.title.trim() || 'Untitled'
      const id = uid('doc')
      update((s) => ({
        ...s,
        companyDocuments: [
          {
            id,
            title,
            content: input.content ?? '',
            sourceName: input.sourceName,
            createdAt: now,
            updatedAt: now,
          },
          ...s.companyDocuments,
        ],
      }))
      return id
    },
    [update],
  )

  const updateCompanyDocument = useCallback(
    (id: string, patch: Partial<{ title: string; content: string }>) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyDocuments: s.companyDocuments.map((d) =>
          d.id === id
            ? {
                ...d,
                title: patch.title !== undefined ? patch.title.trim() || d.title : d.title,
                content: patch.content !== undefined ? patch.content : d.content,
                updatedAt: now,
              }
            : d,
        ),
      }))
    },
    [update],
  )

  const removeCompanyDocument = useCallback(
    (id: string) => {
      update((s) => ({
        ...s,
        companyDocuments: s.companyDocuments.filter((d) => d.id !== id),
      }))
    },
    [update],
  )

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

  const addCompanyIdea = useCallback(
    (input: { title: string; text: string }) => {
      const title = input.title.trim()
      const text = input.text.trim()
      if (!title && !text) return
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyIdeas: [
          {
            id: uid('idea'),
            title: title || 'Untitled idea',
            text,
            createdAt: now,
            updatedAt: now,
          },
          ...s.companyIdeas,
        ],
      }))
    },
    [update],
  )

  const updateCompanyIdea = useCallback(
    (id: string, patch: Partial<{ title: string; text: string }>) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyIdeas: s.companyIdeas.map((idea) => {
          if (idea.id !== id) return idea
          const title =
            patch.title !== undefined ? patch.title.trim() || idea.title : idea.title
          const text = patch.text !== undefined ? patch.text : idea.text
          return { ...idea, title, text, updatedAt: now }
        }),
      }))
    },
    [update],
  )

  const removeCompanyIdea = useCallback(
    (id: string) => {
      update((s) => ({
        ...s,
        companyIdeas: s.companyIdeas.filter((idea) => idea.id !== id),
      }))
    },
    [update],
  )

  const addCompanyLogin = useCallback(
    (input: {
      platform: string
      url: string
      username: string
      password: string
      twoFactorEnabled: boolean
    }) => {
      const platform = input.platform.trim()
      const url = input.url.trim()
      const username = input.username.trim()
      const password = input.password
      if (!platform && !url && !username) return
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyLogins: [
          {
            id: uid('login'),
            platform,
            url,
            username,
            password,
            twoFactorEnabled: Boolean(input.twoFactorEnabled),
            createdAt: now,
            updatedAt: now,
          },
          ...(s.companyLogins ?? []),
        ],
      }))
    },
    [update],
  )

  const updateCompanyLogin = useCallback(
    (
      id: string,
      patch: Partial<{
        platform: string
        url: string
        username: string
        password: string
        twoFactorEnabled: boolean
      }>,
    ) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyLogins: (s.companyLogins ?? []).map((login) => {
          if (login.id !== id) return login
          return {
            ...login,
            platform:
              patch.platform !== undefined ? patch.platform.trim() : login.platform,
            url: patch.url !== undefined ? patch.url.trim() : login.url,
            username:
              patch.username !== undefined ? patch.username.trim() : login.username,
            password: patch.password !== undefined ? patch.password : login.password,
            twoFactorEnabled:
              patch.twoFactorEnabled !== undefined
                ? Boolean(patch.twoFactorEnabled)
                : login.twoFactorEnabled,
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const removeCompanyLogin = useCallback(
    (id: string) => {
      update((s) => ({
        ...s,
        companyLogins: (s.companyLogins ?? []).filter((login) => login.id !== id),
      }))
    },
    [update],
  )

  const addColdEmailDomains = useCallback(
    (raw: string, provider: ColdEmailProvider = 'microsoft') => {
      const hosts = parseDomainList(raw)
      if (hosts.length === 0) return
      const now = new Date().toISOString()
      update((s) => {
        const existing = new Set(
          (s.coldEmailDomains ?? []).map((d) => d.domain.toLowerCase()),
        )
        const additions: ColdEmailDomain[] = []
        for (const host of hosts) {
          if (existing.has(host)) continue
          existing.add(host)
          additions.push({
            id: uid('cedom'),
            domain: host,
            provider,
            mailboxes: [],
            createdAt: now,
            updatedAt: now,
          })
        }
        if (additions.length === 0) return s
        return {
          ...s,
          coldEmailDomains: [...additions, ...(s.coldEmailDomains ?? [])],
        }
      })
    },
    [update],
  )

  const updateColdEmailDomain = useCallback(
    (id: string, patch: Partial<{ provider: ColdEmailProvider; domain: string }>) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        coldEmailDomains: (s.coldEmailDomains ?? []).map((row) => {
          if (row.id !== id) return row
          const nextDomain =
            patch.domain !== undefined
              ? normalizeDomainHost(patch.domain) || row.domain
              : row.domain
          const nextProvider: ColdEmailProvider =
            patch.provider === 'google' || patch.provider === 'microsoft'
              ? patch.provider
              : row.provider
          return {
            ...row,
            domain: nextDomain,
            provider: nextProvider,
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const removeColdEmailDomain = useCallback(
    (id: string) => {
      update((s) => ({
        ...s,
        coldEmailDomains: (s.coldEmailDomains ?? []).filter((row) => row.id !== id),
      }))
    },
    [update],
  )

  const addColdEmailMailboxes = useCallback(
    (domainId: string, raw: string) => {
      const locals = parseMailboxList(raw)
      if (locals.length === 0) return
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        coldEmailDomains: (s.coldEmailDomains ?? []).map((row) => {
          if (row.id !== domainId) return row
          const existing = new Set(row.mailboxes.map((m) => m.localPart))
          const additions: ColdEmailMailbox[] = []
          for (const localPart of locals) {
            if (existing.has(localPart)) continue
            existing.add(localPart)
            additions.push({
              id: uid('mbox'),
              localPart,
              password: '',
              createdAt: now,
            })
          }
          if (additions.length === 0) return row
          return {
            ...row,
            mailboxes: [...row.mailboxes, ...additions],
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const updateColdEmailMailbox = useCallback(
    (
      domainId: string,
      mailboxId: string,
      patch: Partial<{ localPart: string; password: string }>,
    ) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        coldEmailDomains: (s.coldEmailDomains ?? []).map((row) => {
          if (row.id !== domainId) return row
          return {
            ...row,
            mailboxes: row.mailboxes.map((box) => {
              if (box.id !== mailboxId) return box
              const nextLocal =
                patch.localPart !== undefined
                  ? normalizeMailboxLocalPart(patch.localPart) || box.localPart
                  : box.localPart
              return {
                ...box,
                localPart: nextLocal,
                password: patch.password !== undefined ? patch.password : box.password,
              }
            }),
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const removeColdEmailMailbox = useCallback(
    (domainId: string, mailboxId: string) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        coldEmailDomains: (s.coldEmailDomains ?? []).map((row) => {
          if (row.id !== domainId) return row
          return {
            ...row,
            mailboxes: row.mailboxes.filter((m) => m.id !== mailboxId),
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const addCompanyDecision = useCallback(
    (input: { title: string; why?: string; decideBy: string; options?: string[] }) => {
      const title = input.title.trim()
      if (!title) return
      const now = new Date().toISOString()
      const decideBy =
        typeof input.decideBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.decideBy)
          ? input.decideBy
          : todayDateKey()
      const options: CompanyDecisionOption[] = (input.options ?? [])
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ id: uid('dopt'), text }))
      update((s) => ({
        ...s,
        companyDecisions: [
          {
            id: uid('decision'),
            title,
            why: (input.why ?? '').trim(),
            decideBy,
            options,
            status: 'open',
            chosenOptionId: null,
            createdAt: now,
            updatedAt: now,
          },
          ...(s.companyDecisions ?? []),
        ],
      }))
    },
    [update],
  )

  const updateCompanyDecision = useCallback(
    (
      id: string,
      patch: Partial<{
        title: string
        why: string
        decideBy: string
        status: CompanyDecision['status']
        chosenOptionId: string | null
      }>,
    ) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyDecisions: (s.companyDecisions ?? []).map((decision) => {
          if (decision.id !== id) return decision
          const title =
            patch.title !== undefined ? patch.title.trim() || decision.title : decision.title
          const why = patch.why !== undefined ? patch.why : decision.why
          const decideBy =
            patch.decideBy !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(patch.decideBy)
              ? patch.decideBy
              : decision.decideBy
          let status = patch.status !== undefined ? patch.status : decision.status
          let chosenOptionId =
            patch.chosenOptionId !== undefined ? patch.chosenOptionId : decision.chosenOptionId
          if (status === 'decided') {
            const valid =
              chosenOptionId && decision.options.some((o) => o.id === chosenOptionId)
            if (!valid) {
              status = 'open'
              chosenOptionId = null
            }
          } else {
            chosenOptionId = null
          }
          return {
            ...decision,
            title,
            why,
            decideBy,
            status,
            chosenOptionId,
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const addCompanyDecisionOption = useCallback(
    (decisionId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyDecisions: (s.companyDecisions ?? []).map((decision) => {
          if (decision.id !== decisionId) return decision
          return {
            ...decision,
            options: [...decision.options, { id: uid('dopt'), text: trimmed }],
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const removeCompanyDecisionOption = useCallback(
    (decisionId: string, optionId: string) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyDecisions: (s.companyDecisions ?? []).map((decision) => {
          if (decision.id !== decisionId) return decision
          const options = decision.options.filter((o) => o.id !== optionId)
          const chosenLost = decision.chosenOptionId === optionId
          return {
            ...decision,
            options,
            chosenOptionId: chosenLost ? null : decision.chosenOptionId,
            status: chosenLost ? 'open' : decision.status,
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const decideCompanyDecision = useCallback(
    (decisionId: string, optionId: string) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyDecisions: (s.companyDecisions ?? []).map((decision) => {
          if (decision.id !== decisionId) return decision
          if (!decision.options.some((o) => o.id === optionId)) return decision
          return {
            ...decision,
            status: 'decided',
            chosenOptionId: optionId,
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const reopenCompanyDecision = useCallback(
    (decisionId: string) => {
      const now = new Date().toISOString()
      update((s) => ({
        ...s,
        companyDecisions: (s.companyDecisions ?? []).map((decision) => {
          if (decision.id !== decisionId) return decision
          return {
            ...decision,
            status: 'open',
            chosenOptionId: null,
            updatedAt: now,
          }
        }),
      }))
    },
    [update],
  )

  const removeCompanyDecision = useCallback(
    (id: string) => {
      update((s) => ({
        ...s,
        companyDecisions: (s.companyDecisions ?? []).filter((d) => d.id !== id),
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
    let streak = 0
    let cursor = state.selectedDate
    if (!hitTarget(cursor)) {
      cursor = addDays(cursor, -1)
    }
    for (let i = 0; i < 365; i++) {
      const mins = state.timeEntries
        .filter((e) => e.date === cursor && isDeepWorkId(e.projectId))
        .reduce((s, e) => s + e.minutes, 0)
      const hasData = state.timeEntries.some((e) => e.date === cursor)
      if (!hasData && mins === 0) break
      if (mins >= state.dailyDeepWorkTargetMinutes) {
        streak += 1
        cursor = addDays(cursor, -1)
      } else {
        break
      }
    }
    return streak
  }, [state.selectedDate, state.timeEntries, state.dailyDeepWorkTargetMinutes, hitTarget])

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
    (realm: FinanceRealm) => state[ledgerKey(realm)],
    [state],
  )

  return {
    state,
    cloudSync,
    cloudError,
    cloudSource,
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
    setMentorMessages,
    addJournalEntry,
    updateJournalEntry,
    removeJournalEntry,
    saveMentorInsight,
    markPrescriptionInstalled,
    resolveMentorCharge,
    actionMentorCharge,
    appendCoSMessage,
    saveCoSBrief,
    markCoSBriefRead,
    markCoSBriefSlackSent,
    saveCoSInsight,
    setCoSProactive,
    setCoSBriefHours,
    hasCoSBrief,
    addCalendarBlock,
    updateCalendarBlock,
    removeCalendarBlock,
    skipBlockOccurrence,
    detachBlockOccurrence,
    addExpenseCategory,
    updateExpenseCategory,
    removeExpenseCategory,
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
    addCompanyDocument,
    updateCompanyDocument,
    removeCompanyDocument,
    addVisionGoal,
    updateVisionGoal,
    removeVisionGoal,
    addCompanyIdea,
    updateCompanyIdea,
    removeCompanyIdea,
    addCompanyLogin,
    updateCompanyLogin,
    removeCompanyLogin,
    addColdEmailDomains,
    updateColdEmailDomain,
    removeColdEmailDomain,
    addColdEmailMailboxes,
    updateColdEmailMailbox,
    removeColdEmailMailbox,
    addCompanyDecision,
    updateCompanyDecision,
    addCompanyDecisionOption,
    removeCompanyDecisionOption,
    decideCompanyDecision,
    reopenCompanyDecision,
    removeCompanyDecision,
    minutesFor,
    resetToSeed,
    parseDateKey,
    toDateKey,
  }
}

export type Store = ReturnType<typeof useStore>
