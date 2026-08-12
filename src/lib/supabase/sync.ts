import type {
  ActiveTimer,
  AppState,
  FinanceLedger,
  RevolutCredentials,
  TimeEntry,
} from '@/types'
import {
  loadRevolutAppSecret,
  loadRevolutRefreshToken,
  saveRevolutAppSecret,
  saveRevolutRefreshToken,
} from '@/utils/revolutApi'

/** Union time entries by id so a sync pick never drops a session that only one side has. */
export function mergeTimeEntries(a: TimeEntry[] = [], b: TimeEntry[] = []): TimeEntry[] {
  const map = new Map<string, TimeEntry>()
  for (const entry of a) {
    if (entry?.id) map.set(entry.id, entry)
  }
  for (const entry of b) {
    if (!entry?.id) continue
    const prev = map.get(entry.id)
    // Prefer the copy that has a debrief / richer pause data when ids collide.
    if (!prev) {
      map.set(entry.id, entry)
      continue
    }
    const prevScore = (prev.debrief ? 2 : 0) + (prev.pauses?.length || 0)
    const nextScore = (entry.debrief ? 2 : 0) + (entry.pauses?.length || 0)
    if (nextScore > prevScore) map.set(entry.id, entry)
  }
  return Array.from(map.values())
}

/**
 * Never drop a live timer on hydrate. If both sides have one, keep the older
 * session start (the block that has been running longer).
 */
export function pickActiveTimer(
  local: ActiveTimer | null | undefined,
  remote: ActiveTimer | null | undefined,
): ActiveTimer | null {
  if (local && remote) {
    return local.sessionStartedAt <= remote.sessionStartedAt ? local : remote
  }
  return local ?? remote ?? null
}

/**
 * Prefer the newer finance ledger when updatedAt exists; else the richer
 * structure. preferOtherOnTie keeps in-memory edits after hydrate/save.
 */
export function mergeFinanceLedgers(
  base: FinanceLedger,
  other: FinanceLedger,
  options?: { preferOtherOnTie?: boolean },
): FinanceLedger {
  const baseAt = Date.parse(base?.updatedAt || '') || 0
  const otherAt = Date.parse(other?.updatedAt || '') || 0
  if (otherAt > baseAt) return other
  if (baseAt > otherAt) return base

  const baseScore = ledgerScore(base)
  const otherScore = ledgerScore(other)
  if (otherScore > baseScore) return other
  if (baseScore > otherScore) return base

  return options?.preferOtherOnTie ? other : base
}

/**
 * After preferRicherState picks a base snapshot, fold in sessions, live timers,
 * and personal finance ledgers from the other side so cloud hydrate cannot erase
 * in-progress work or roll amounts / new expenses back.
 *
 * timerMode:
 * - prefer-either: keep a timer if either side has one (default for local↔remote)
 * - prefer-other: other is authoritative (use after hydrate so discard/finish /
 *   just-added expenses stick)
 */
export function mergeSessionSafeState(
  base: AppState,
  other: AppState,
  options?: { timerMode?: 'prefer-either' | 'prefer-other' },
): AppState {
  const timerMode = options?.timerMode ?? 'prefer-either'
  // After hydrate/save, memory is the source of truth for finance — a richer
  // remote snapshot must not delete an expense you just added.
  const personalFinance =
    timerMode === 'prefer-other'
      ? other.personalFinance
      : mergeFinanceLedgers(base.personalFinance, other.personalFinance)
  return {
    ...base,
    timeEntries: mergeTimeEntries(base.timeEntries, other.timeEntries),
    activeTimer:
      timerMode === 'prefer-other'
        ? other.activeTimer ?? null
        : pickActiveTimer(base.activeTimer, other.activeTimer),
    personalFinance,
  }
}

/** Pull Revolut browser secrets into the AppState payload for cloud upsert. */
export function withLocalRevolutCredentials(state: AppState): AppState {
  const appSecret = loadRevolutAppSecret()
  const refreshToken = loadRevolutRefreshToken()
  const existing = state.revolutCredentials
  const next: RevolutCredentials = {
    appSecret: appSecret || existing?.appSecret || '',
    refreshToken: refreshToken || existing?.refreshToken || '',
  }
  if (!next.appSecret && !next.refreshToken) {
    if (!existing) return state
    return { ...state, revolutCredentials: existing }
  }
  return { ...state, revolutCredentials: next }
}

/** Write cloud credentials back into the browser keys Revolut API reads. */
export function applyRevolutCredentialsToBrowser(credentials?: RevolutCredentials | null) {
  if (!credentials) return
  if (credentials.appSecret) saveRevolutAppSecret(credentials.appSecret)
  if (credentials.refreshToken) saveRevolutRefreshToken(credentials.refreshToken)
}

function ledgerScore(ledger: FinanceLedger | undefined): number {
  if (!ledger) return 0
  return (
    (ledger.categories?.length || 0) * 3 +
    (ledger.allocations?.length || 0) * 5 +
    (ledger.spends?.length || 0) * 4 +
    (ledger.wishlist?.length || 0) * 2
  )
}

/** Higher = more “real” user data (vs empty / seed). */
export function stateRichnessScore(state: Partial<AppState> | null | undefined): number {
  if (!state || typeof state !== 'object') return 0
  const tasks = state.tasks
    ? Object.values(state.tasks).reduce((n, list) => n + (list?.length || 0), 0)
    : 0
  const revolutAccounts = state.revolutSync?.personalAccountIds?.length || 0
  const credentials =
    (state.revolutCredentials?.appSecret ? 8 : 0) +
    (state.revolutCredentials?.refreshToken ? 12 : 0)

  return (
    (state.timeEntries?.length || 0) * 6 +
    tasks * 4 +
    (state.calendarBlocks?.length || 0) * 3 +
    (state.openLoops?.length || 0) * 2 +
    (state.habits?.filter((h) => (h.streak || 0) > 0 || h.lastCompletedDate).length || 0) * 3 +
    Object.keys(state.dailyOneThing || {}).length * 2 +
    ledgerScore(state.personalFinance) +
    revolutAccounts * 10 +
    (state.revolutSync?.personalQueue?.length || 0) +
    credentials +
    (state.weekIntention && state.weekIntention.length > 40 ? 2 : 0) +
    (state.mentor?.journalEntries?.length || 0) * 4 +
    (state.mentor?.messages?.length || 0) +
    (state.mentor?.latestInsight ? 6 : 0) +
    (state.timeEntries?.filter((e) => e.debrief).length || 0) * 3 +
    Object.keys(state.bodyLogs || {}).length * 2
  )
}

export function isThinCloudPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true
  const keys = Object.keys(raw as object)
  if (keys.length === 0) return true
  return stateRichnessScore(raw as Partial<AppState>) < 8
}

/**
 * Prefer the richer snapshot so a thin/empty cloud row never wipes a full browser.
 * Tie → prefer local (this machine is migrating now).
 */
export function preferRicherState(local: AppState, remote: AppState): {
  winner: AppState
  source: 'local' | 'remote'
} {
  const localScore = stateRichnessScore(local)
  const remoteScore = stateRichnessScore(remote)
  if (remoteScore > localScore) return { winner: remote, source: 'remote' }
  return { winner: local, source: 'local' }
}

/** Merge Revolut credentials so we never drop a token present on only one side. */
export function mergeRevolutCredentials(a?: RevolutCredentials, b?: RevolutCredentials): RevolutCredentials | undefined {
  const appSecret = a?.appSecret || b?.appSecret || ''
  const refreshToken = a?.refreshToken || b?.refreshToken || ''
  if (!appSecret && !refreshToken) return undefined
  return { appSecret, refreshToken }
}
