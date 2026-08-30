import type {
  ActiveTimer,
  AppState,
  FinanceLedger,
  RevolutCredentials,
  SundayReview,
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

function mergeSundayReviews(a: SundayReview[] = [], b: SundayReview[] = []): SundayReview[] {
  const map = new Map<string, SundayReview>()
  for (const review of [...a, ...b]) {
    if (!review?.sundayDate) continue
    const prev = map.get(review.sundayDate)
    if (!prev) {
      map.set(review.sundayDate, review)
      continue
    }
    const prevAt = Date.parse(prev.generatedAt || '') || 0
    const nextAt = Date.parse(review.generatedAt || '') || 0
    if (nextAt >= prevAt) map.set(review.sundayDate, review)
  }
  return Array.from(map.values()).sort((x, y) => y.sundayDate.localeCompare(x.sundayDate)).slice(0, 12)
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

/** True when the ledger has more than a bare empty Bills preset. */
export function isRichFinanceLedger(ledger: FinanceLedger | undefined | null): boolean {
  if (!ledger) return false
  const cats = ledger.categories || []
  if ((ledger.wishlist?.length || 0) > 0) return true
  if ((ledger.allocations?.length || 0) > 0) return true
  if ((ledger.spends?.length || 0) > 0) return true
  if (cats.length === 0) return false
  if (cats.length > 1) return true
  const only = cats[0]
  if (!only) return false
  if (only.name.toLowerCase() !== 'bills') return true
  if (only.amount > 0) return true
  return cats.some((c) => c.parentId)
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
 * Local/backup recovery helper: never let an empty seed wipe a rich ledger,
 * even when the empty side has a newer updatedAt (common after strip/reseed).
 * When both are rich, fall through to updatedAt-aware merge.
 */
export function preferRicherFinanceLedger(
  current: FinanceLedger,
  candidate: FinanceLedger,
): FinanceLedger {
  const currentRich = isRichFinanceLedger(current)
  const candidateRich = isRichFinanceLedger(candidate)
  if (!currentRich && candidateRich) return candidate
  if (currentRich && !candidateRich) return current
  return mergeFinanceLedgers(current, candidate)
}

function isBillsPreset(cat: FinanceLedger['categories'][number]): boolean {
  return Boolean(cat.isPreset && !cat.parentId && cat.name.toLowerCase() === 'bills')
}

/**
 * Fold a legacy company finance ledger into personal after the company tab
 * was removed. Unions categories / wishlist / cash rows so neither side is
 * dropped when both have real data.
 */
export function absorbLegacyCompanyFinance(
  personal: FinanceLedger,
  company: FinanceLedger | undefined | null,
): FinanceLedger {
  if (!company || !isRichFinanceLedger(company)) return personal
  const migratedAt = new Date().toISOString()
  if (!isRichFinanceLedger(personal)) {
    // Stamp now so a newer empty local seed cannot win the next hydrate fold.
    return { ...company, updatedAt: migratedAt }
  }

  const personalBills = personal.categories.find(isBillsPreset)
  const companyBills = company.categories.find(isBillsPreset)
  const billsIdRemap =
    personalBills && companyBills && personalBills.id !== companyBills.id
      ? companyBills.id
      : null

  const byId = new Map(personal.categories.map((c) => [c.id, c]))
  for (const cat of company.categories) {
    if (billsIdRemap && cat.id === billsIdRemap) {
      // Keep personal Bills preset; fold company Bills amount if personal is $0.
      if (personalBills && personalBills.amount <= 0 && cat.amount > 0) {
        byId.set(personalBills.id, { ...personalBills, amount: cat.amount })
      }
      continue
    }
    const remapped =
      billsIdRemap && cat.parentId === billsIdRemap
        ? { ...cat, parentId: personalBills!.id }
        : cat
    if (!byId.has(remapped.id)) {
      byId.set(remapped.id, remapped)
      continue
    }
    // Same id on both sides — keep the higher amount / non-empty name.
    const existing = byId.get(remapped.id)!
    byId.set(remapped.id, {
      ...existing,
      amount: Math.max(existing.amount || 0, remapped.amount || 0),
      name: existing.name?.trim() ? existing.name : remapped.name,
      frequency: existing.frequency || remapped.frequency,
      parentId: existing.parentId ?? remapped.parentId,
      isPreset: existing.isPreset || remapped.isPreset,
    })
  }

  const allocById = new Map((personal.allocations || []).map((a) => [a.id, a]))
  for (const a of company.allocations || []) {
    if (a?.id && !allocById.has(a.id)) allocById.set(a.id, a)
  }
  const spendById = new Map((personal.spends || []).map((s) => [s.id, s]))
  for (const s of company.spends || []) {
    if (s?.id && !spendById.has(s.id)) spendById.set(s.id, s)
  }
  const wishById = new Map((personal.wishlist || []).map((w) => [w.id, w]))
  for (const w of company.wishlist || []) {
    if (w?.id && !wishById.has(w.id)) wishById.set(w.id, w)
  }

  return {
    categories: Array.from(byId.values()),
    allocations: Array.from(allocById.values()),
    spends: Array.from(spendById.values()),
    wishlist: Array.from(wishById.values()),
    updatedAt: migratedAt,
  }
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
    sundayReviews: mergeSundayReviews(base.sundayReviews, other.sundayReviews),
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
    (state.sundayReviews?.length || 0) * 3 +
    (state.timeEntries?.filter((e) => e.debrief).length || 0) * 3 +
    Object.keys(state.bodyLogs || {}).length * 2
  )
}

/**
 * Only true for a row that holds nothing at all — the `'{}'::jsonb` column
 * default. Anything else is real user data and must be merged, never skipped.
 *
 * This deliberately replaces an older "is it rich enough?" score test, which
 * discarded legitimate small cloud rows (a single logged session scored below
 * the threshold) and so lost data when moving between devices.
 */
export function isEmptyCloudPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true
  return Object.keys(raw as object).length === 0
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
