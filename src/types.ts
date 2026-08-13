export type ProjectId = 'chase' | 'myProject' | 'rav' | 'personal' | 'sundayAdmin'

export interface Project {
  id: ProjectId
  name: string
  color: string
}

export interface Task {
  id: string
  text: string
  done: boolean
  /** Planned for execution today vs backlog brain-dump */
  forToday: boolean
  /** YYYY-MM-DD when this task is planned; null/undefined = undated backlog */
  plannedDate?: string | null
  /** Freeform notes for the task */
  notes?: string
  /** Completed tasks are archived and hidden from active lists */
  archived?: boolean
  /**
   * Sunday Admin deferral counter. Incremented when a Saturday Dump completes
   * without allocating this task to that Sunday. At 2 → purged. Reset to 0 when allocated.
   */
  sundayDeferCount?: number
}

export type AddTaskOptions = {
  plannedDate?: string | null
  notes?: string
  /** @deprecated prefer plannedDate — kept for call-site convenience */
  forToday?: boolean
}

/** Pattern noticed in Sunday Center reflection */
export interface WeekPattern {
  id: string
  pattern: string
  evolution: string
}

/** One of the three weekly goals set in Sunday Center */
export interface WeeklyGoal {
  id: string
  text: string
  /** Reviewed the following Sunday — null = not reviewed yet */
  hit: boolean | null
  why: string
  /** Optional link up to a Vision goal — horizon cascade */
  visionGoalId?: string | null
}

/** Reflection answers for a closed week (keyed by that week’s Monday) */
export interface WeekReflection {
  proud: string
  patterns: WeekPattern[]
  improve: string
  productivityShortfall: string
  productivityRemedy: string
}

export interface WeeklyGoalsArchiveEntry {
  weekStart: string
  goals: WeeklyGoal[]
}

export interface Habit {
  id: string
  name: string
  /** Consecutive days completed ending on lastCompletedDate */
  streak: number
  /** YYYY-MM-DD of the last day this was ticked (Bali calendar) */
  lastCompletedDate: string | null
}

export interface OpenLoop {
  id: string
  text: string
  done: boolean
}

/** A single pause segment within a work session */
export interface PauseSegment {
  /** Epoch ms when the pause started */
  startedAt: number
  /** How long the pause lasted in ms */
  durationMs: number
}

/** How a finished deep-work session felt — captured at session end */
export type SessionFeeling = 'weapon' | 'solid' | 'meh' | 'dragged'

/** Tags selected in the post-session debrief */
export type SessionTag =
  | 'flow'
  | 'productive'
  | 'distracted'
  | 'phone'
  | 'low-energy'
  | 'high-energy'
  | 'scattered'
  | 'clear'
  | 'rushed'
  | 'deep'

export const SESSION_FEELINGS: { id: SessionFeeling; label: string; hint: string }[] = [
  { id: 'weapon', label: 'Weapon', hint: 'Locked in. Operated at full capacity.' },
  { id: 'solid', label: 'Solid', hint: 'Good work. Not transcendent, not wasted.' },
  { id: 'meh', label: 'Meh', hint: 'Half there. Output without fire.' },
  { id: 'dragged', label: 'Dragged', hint: 'Fought myself the whole way.' },
]

export const SESSION_TAGS: { id: SessionTag; label: string }[] = [
  { id: 'flow', label: 'Flow' },
  { id: 'productive', label: 'Productive' },
  { id: 'deep', label: 'Deep focus' },
  { id: 'clear', label: 'Clear mind' },
  { id: 'high-energy', label: 'High energy' },
  { id: 'low-energy', label: 'Low energy' },
  { id: 'distracted', label: 'Distracted' },
  { id: 'phone', label: 'Phone pulled' },
  { id: 'scattered', label: 'Scattered' },
  { id: 'rushed', label: 'Rushed' },
]

export interface SessionDebrief {
  feeling: SessionFeeling
  tags: SessionTag[]
  note?: string
}

export interface TimeEntry {
  id: string
  projectId: ProjectId
  date: string // YYYY-MM-DD
  minutes: number
  note?: string
  /** Planned session length when the block started (minutes) */
  targetMinutes?: number
  /** Epoch ms when the session started (enables duration + time-of-day analytics) */
  startedAt?: number
  /** Epoch ms when the session ended */
  endedAt?: number
  /** Total paused time during this session (minutes) */
  pausedMinutes?: number
  /** Number of pause events in this session */
  pauseCount?: number
  /** Individual pause segments for time-of-day pause trends */
  pauses?: PauseSegment[]
  /** Post-session feeling check — how the block actually went */
  debrief?: SessionDebrief
}

export type MentorChatRole = 'user' | 'mentor' | 'system'

export interface MentorMessage {
  id: string
  role: MentorChatRole
  text: string
  createdAt: string
}

export interface JournalEntry {
  id: string
  /** Entry date the page belongs to (YYYY-MM-DD) */
  date: string
  sourceName: string
  /** OCR / vision-extracted text from the photo */
  extractedText: string
  status: 'pending' | 'extracted' | 'failed'
  error?: string
  createdAt: string
  /** How the date was chosen */
  dateSource?: 'manual' | 'extracted' | 'fallback'
  /** Raw date string detected on the page (e.g. "July 19th") */
  detectedDateRaw?: string
}

export interface MentorInsight {
  id: string
  createdAt: string
  summary: string
  weapons: string[]
  drags: string[]
  blindSpots: string[]
  prescriptions: string[]
  /** Prescription texts the operator installed into the OS */
  installed?: string[]
}

/** Persistent accountability item from Mentor synthesis — survives new runs. */
export type MentorChargeKind = 'blindSpot' | 'prescription'
export type MentorChargeStatus = 'open' | 'actioned' | 'dismissed'
export type MentorChargeInstall =
  | 'habit'
  | 'oneThing'
  | 'calendar'
  | 'reminder'
  | 'manual'

export interface MentorCharge {
  id: string
  kind: MentorChargeKind
  text: string
  status: MentorChargeStatus
  sourceInsightId?: string
  createdAt: string
  updatedAt: string
  actionedAt?: string
  actionNote?: string
  installKind?: MentorChargeInstall
}

/** End-of-day body / energy signal for Mentor correlation */
export interface DailyBodyLog {
  sleepHours: number | null
  /** Subjective energy 1–5 */
  energy: 1 | 2 | 3 | 4 | 5 | null
  trained: boolean
  trainNote?: string
  note?: string
}

export interface MentorState {
  messages: MentorMessage[]
  journalEntries: JournalEntry[]
  latestInsight: MentorInsight | null
  insightHistory: MentorInsight[]
  /** Open + recently cleared blind spots / prescriptions on file */
  charges: MentorCharge[]
}

export function emptyMentorState(): MentorState {
  return {
    messages: [
      {
        id: 'welcome',
        role: 'system',
        text: 'Mentor online. I read your deep work, breaks, spend, journals, and Sunday logs — then call the patterns you miss. Ask anything, or run a full synthesis.',
        createdAt: new Date(0).toISOString(),
      },
    ],
    journalEntries: [],
    latestInsight: null,
    insightHistory: [],
    charges: [],
  }
}

/** Normalize charge text for dedupe across syntheses. */
export function mentorChargeKey(kind: MentorChargeKind, text: string): string {
  return `${kind}:${text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 140)}`
}

/** Recurrence rule for a calendar block. */
export interface BlockRepeat {
  /** Days of week the block repeats on: 0 = Sunday … 6 = Saturday. Daily = all 7. */
  days: number[]
  /** Optional inclusive end date (YYYY-MM-DD). Absent = repeats forever. */
  until?: string
}

export interface CalendarBlock {
  id: string
  title: string
  date: string // YYYY-MM-DD — one-off date, or first day of a repeating series
  startMinutes: number // minutes from midnight
  endMinutes: number
  projectId?: ProjectId
  color?: string
  /** When present the block repeats on these weekdays from `date` onward. */
  repeat?: BlockRepeat
  /** Series dates hidden because that occurrence was deleted or edited individually. */
  skipDates?: string[]
}

export interface ActiveTimer {
  projectId: ProjectId
  /** When the current active segment started (resets on resume) */
  startedAt: number
  /** Original session start — preserved across pauses */
  sessionStartedAt: number
  /** Slight Edge Focus — one skill/habit to improve this block */
  focusNote: string
  /** Planned session length in minutes; used for live progress vs target */
  targetMinutes?: number
  /** Accumulated active (work) ms before the current segment */
  elapsedBefore: number
  /** Accumulated pause ms from completed pauses */
  pausedBefore: number
  /** When the current pause started; undefined while running */
  pausedAt?: number
  /** Number of pause events this session */
  pauseCount: number
  /** Completed pause segments (current pause finalized on resume) */
  pauses: PauseSegment[]
}

/** Per-day one-liner: the single outcome that matters */
export type DailyOneThing = Record<string, string>

/** Projects that count toward deep work target */
export const DEEP_WORK_IDS = ['chase', 'myProject', 'rav'] as const

export type DeepWorkId = (typeof DEEP_WORK_IDS)[number]

/** How the daily deep work total is allocated across the three deep-work projects */
export type DailyDeepWorkSplit = Record<DeepWorkId, number>

export function isDeepWorkId(id: ProjectId): id is DeepWorkId {
  return (DEEP_WORK_IDS as readonly ProjectId[]).includes(id)
}

/** Split a total evenly across the three deep-work projects (remainder to chase). */
export function equalDeepWorkSplit(totalMinutes: number): DailyDeepWorkSplit {
  const base = Math.floor(totalMinutes / 3)
  const rem = totalMinutes - base * 3
  return {
    chase: base + rem,
    myProject: base,
    rav: base,
  }
}

/** Scale an existing split so its parts sum to `totalMinutes` (preserves ratios). */
export function scaleDeepWorkSplit(
  split: DailyDeepWorkSplit,
  totalMinutes: number,
): DailyDeepWorkSplit {
  const sum = DEEP_WORK_IDS.reduce((s, id) => s + split[id], 0)
  if (sum <= 0) return equalDeepWorkSplit(totalMinutes)
  const scaled = Object.fromEntries(
    DEEP_WORK_IDS.map((id) => [id, Math.round((split[id] / sum) * totalMinutes)]),
  ) as DailyDeepWorkSplit
  // Fix rounding drift on chase
  const scaledSum = DEEP_WORK_IDS.reduce((s, id) => s + scaled[id], 0)
  scaled.chase += totalMinutes - scaledSum
  return scaled
}

/** Top-level product surface */
export type AppTab =
  | 'dashboard'
  | 'calendar'
  | 'tasks'
  | 'personalFinances'
  | 'autopilot'
  | 'mentor'
  | 'vision'

const APP_TABS: readonly AppTab[] = [
  'dashboard',
  'calendar',
  'tasks',
  'personalFinances',
  'autopilot',
  'mentor',
  'vision',
]

/** Long-term inspiring goals on the Vision surface */
export interface VisionGoal {
  id: string
  title: string
  /** Why it pulls you — vivid picture, feeling, stake */
  body: string
  createdAt: string
  updatedAt: string
}

/** When each Autopilot ritual was completed — used to lock until the next period */
export interface AutopilotCompletions {
  /** YYYY-MM-DD evening wind down completed */
  eveningWindDownDate: string | null
  /** Sunday YYYY-MM-DD Sunday Admin session completed */
  sundayAdminDate: string | null
  /** Monday YYYY-MM-DD of the week Sunday Center planned for */
  sundayCenterWeekStart: string | null
  /** YYYY-MM-DD miss-day repair completed */
  missRepairDate: string | null
}

export const EMPTY_AUTOPILOT_COMPLETIONS: AutopilotCompletions = {
  eveningWindDownDate: null,
  sundayAdminDate: null,
  sundayCenterWeekStart: null,
  missRepairDate: null,
}

/** Map persisted / legacy tab ids onto current AppTab values. */
export function normalizeActiveTab(tab: unknown): AppTab {
  if (tab === 'deepWork') return 'calendar'
  if (tab === 'companyFinances') return 'personalFinances'
  if (typeof tab === 'string' && (APP_TABS as readonly string[]).includes(tab)) {
    return tab as AppTab
  }
  return 'dashboard'
}

/**
 * Finance realm string for store methods.
 * Personal OS only — kept so call sites / useStore stay compatible during migration.
 */
export type FinanceRealm = 'personal'

export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** Set-expense category / bucket. Bills is seeded as a preset parent for micro expenses. */
export interface ExpenseCategory {
  id: string
  name: string
  frequency: ExpenseFrequency
  /** Budget for one frequency period. For parents with children, effective budget is sum of children. */
  amount: number
  /** Present when this is a micro-expense under Bills (or another parent). */
  parentId?: string
  /** Seeded presets like Bills cannot be deleted. */
  isPreset?: boolean
}

export interface CashAllocationLine {
  id: string
  kind: 'category' | 'custom'
  categoryId?: string
  customLabel?: string
  amount: number
}

/** Income event: total cash in, split across buckets and/or one-off expenses. */
export interface CashAllocation {
  id: string
  date: string
  totalAmount: number
  note?: string
  lines: CashAllocationLine[]
}

/** Outflow logged against a set expense or as unexpected / ad-hoc spend. */
export interface SpendEntry {
  id: string
  date: string
  amount: number
  kind: 'category' | 'unexpected'
  categoryId?: string
  label?: string
  note?: string
  /** Revolut leg key (`txnId:legId`) when imported from sync */
  revolutId?: string
}

/** Want-to-buy item on the personal spendings wishlist */
export interface WishlistItem {
  id: string
  name: string
  /** Rough price estimate */
  amount: number
  createdAt: string
}

export interface FinanceLedger {
  categories: ExpenseCategory[]
  allocations: CashAllocation[]
  spends: SpendEntry[]
  /** Personal spendings wishlist (item + rough price) */
  wishlist: WishlistItem[]
  /** Bumped on every finance edit so cloud hydrate cannot roll amounts back. */
  updatedAt?: string
}

/** Pending Revolut row awaiting categorize / discard in a finance realm. */
export interface RevolutReviewItem {
  id: string
  revolutTransactionId: string
  legId: string
  accountId: string
  accountName: string
  date: string
  createdAt: string
  amount: number
  currency: string
  direction: 'in' | 'out'
  type: string
  state: string
  merchant: string
  description: string
  reference?: string
  cardLastFour?: string
  /** True when money only moved between own Revolut accounts */
  internal?: boolean
}

export interface RevolutSyncState {
  /** Revolut account IDs synced into Personal Finances */
  personalAccountIds: string[]
  personalQueue: RevolutReviewItem[]
  /**
   * Transaction / leg ids that should never reappear in a review queue.
   * Includes discarded rows and logged spends (belt-and-suspenders with SpendEntry.revolutId).
   */
  settledIds: string[]
}

/** Revolut browser secrets — also persisted in Supabase under the signed-in user. */
export interface RevolutCredentials {
  appSecret: string
  refreshToken: string
}

export interface AppState {
  selectedDate: string
  activeTab: AppTab
  identityTitle: string
  identityQuestion: string
  identityBody: string
  weekIntention: string
  openLoops: OpenLoop[]
  reminders: string[]
  habits: Habit[]
  tasks: Record<ProjectId, Task[]>
  timeEntries: TimeEntry[]
  calendarBlocks: CalendarBlock[]
  activeTimer: ActiveTimer | null
  summaryMode: 'day' | 'week' | 'total'
  calendarMonth: string // YYYY-MM
  /** Daily deep work target in minutes (Chase + My Project + Rav) */
  dailyDeepWorkTargetMinutes: number
  /** Minutes allocated to each deep-work project (should sum to dailyDeepWorkTargetMinutes) */
  dailyDeepWorkSplit: DailyDeepWorkSplit
  /** Show backlog tasks across project cards */
  showAllTasks: boolean
  /** Date → most important outcome for that day */
  dailyOneThing: DailyOneThing
  /** Date → body / energy log (sleep, energy, training) */
  bodyLogs: Record<string, DailyBodyLog>
  /** Active weekly goals from Sunday Center (visible all week) */
  weeklyGoals: WeeklyGoal[]
  /** Monday YYYY-MM-DD the active weeklyGoals were set for */
  weeklyGoalsWeekStart: string
  /** Past weeks’ goals (for Sunday review) */
  weeklyGoalsArchive: WeeklyGoalsArchiveEntry[]
  /** Reflections keyed by the Monday of the week reflected on */
  weekReflections: Record<string, WeekReflection>
  /** Sunday date last prepared by Saturday Dump (avoids double-defer on re-edit) */
  lastSaturdayDumpSunday?: string | null
  /** Autopilot ritual completion locks (date / week keys) */
  autopilotCompletions: AutopilotCompletions
  personalFinance: FinanceLedger
  revolutSync: RevolutSyncState
  /** Optional — synced to Supabase so Revolut works across browsers for this user */
  revolutCredentials?: RevolutCredentials
  /** Long-term inspiring goals */
  visionGoals: VisionGoal[]
  /** AI mentor — chat, journal OCR text, pattern insights */
  mentor: MentorState
}

export type SummaryMode = AppState['summaryMode']
