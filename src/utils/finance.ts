import type {
  ExpenseCategory,
  ExpenseFrequency,
  FinanceLedger,
  SpendEntry,
  WishlistItem,
} from '../types'
import { addDays, startOfWeekMonday, weekDays } from './time'

export const FREQUENCIES: ExpenseFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

export function formatMoney(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `−$${formatted}` : `$${formatted}`
}

export function toMonthlyAmount(amount: number, frequency: ExpenseFrequency): number {
  if (frequency === 'daily') return amount * 30
  if (frequency === 'weekly') return amount * (52 / 12)
  if (frequency === 'yearly') return amount / 12
  return amount
}

export function categoryEffectiveAmount(cat: ExpenseCategory, all: ExpenseCategory[]): number {
  const children = all.filter((c) => c.parentId === cat.id)
  if (children.length === 0) return cat.amount
  return children.reduce((sum, c) => sum + c.amount, 0)
}

export function topLevelCategories(ledger: FinanceLedger): ExpenseCategory[] {
  return ledger.categories.filter((c) => !c.parentId)
}

export function childCategories(ledger: FinanceLedger, parentId: string): ExpenseCategory[] {
  return ledger.categories.filter((c) => c.parentId === parentId)
}

/** Flattened list of allocatable buckets: leaf categories (children) + parents without children. */
export function allocatableBuckets(ledger: FinanceLedger): ExpenseCategory[] {
  const tops = topLevelCategories(ledger)
  const result: ExpenseCategory[] = []
  for (const top of tops) {
    const kids = childCategories(ledger, top.id)
    if (kids.length > 0) result.push(...kids)
    else result.push(top)
  }
  return result
}

export function totalMonthlyExpenses(ledger: FinanceLedger): number {
  return topLevelCategories(ledger).reduce((sum, cat) => {
    const amount = categoryEffectiveAmount(cat, ledger.categories)
    return sum + toMonthlyAmount(amount, cat.frequency)
  }, 0)
}

export function periodDatesFor(
  frequency: ExpenseFrequency,
  date: string,
): { start: string; end: string; dates: string[] } {
  if (frequency === 'daily') {
    return { start: date, end: date, dates: [date] }
  }
  if (frequency === 'weekly') {
    const dates = weekDays(date)
    return { start: dates[0], end: dates[6], dates }
  }
  const [y, m] = date.split('-').map(Number)
  if (frequency === 'yearly') {
    const start = `${y}-01-01`
    const end = `${y}-12-31`
    const dates: string[] = []
    let cursor = start
    while (cursor <= end) {
      dates.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return { start, end, dates }
  }
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return { start, end, dates }
}

export function spendsInPeriod(
  spends: SpendEntry[],
  frequency: ExpenseFrequency,
  date: string,
  categoryId?: string,
): SpendEntry[] {
  const { dates } = periodDatesFor(frequency, date)
  const set = new Set(dates)
  return spends.filter((s) => {
    if (!set.has(s.date)) return false
    if (categoryId) {
      return s.kind === 'category' && s.categoryId === categoryId
    }
    return true
  })
}

export function spentForCategory(
  ledger: FinanceLedger,
  categoryId: string,
  date: string,
): number {
  const cat = ledger.categories.find((c) => c.id === categoryId)
  if (!cat) return 0
  // Resolve frequency from the top-level parent when tracking a child
  let freqCat = cat
  if (cat.parentId) {
    const parent = ledger.categories.find((c) => c.id === cat.parentId)
    if (parent) freqCat = parent
  }
  const children = childCategories(ledger, categoryId)
  const ids =
    children.length > 0
      ? new Set([categoryId, ...children.map((c) => c.id)])
      : new Set([categoryId])

  return spendsInPeriod(ledger.spends, freqCat.frequency, date).reduce((sum, s) => {
    if (s.kind === 'category' && s.categoryId && ids.has(s.categoryId)) return sum + s.amount
    return sum
  }, 0)
}

export function budgetForCategory(ledger: FinanceLedger, categoryId: string): number {
  const cat = ledger.categories.find((c) => c.id === categoryId)
  if (!cat) return 0
  if (cat.parentId) return cat.amount
  return categoryEffectiveAmount(cat, ledger.categories)
}

export function allocatedToCategory(ledger: FinanceLedger, categoryId: string): number {
  return ledger.allocations.reduce((sum, a) => {
    return (
      sum +
      a.lines.reduce((lineSum, line) => {
        if (line.kind === 'category' && line.categoryId === categoryId) return lineSum + line.amount
        return lineSum
      }, 0)
    )
  }, 0)
}

export function totalAllocated(ledger: FinanceLedger): number {
  return ledger.allocations.reduce((sum, a) => sum + a.totalAmount, 0)
}

export function totalSpent(ledger: FinanceLedger): number {
  return ledger.spends.reduce((sum, s) => sum + s.amount, 0)
}

export function spentOnDate(ledger: FinanceLedger, date: string): number {
  return ledger.spends.reduce((sum, s) => (s.date === date ? sum + s.amount : sum), 0)
}

export function toDailyAmount(amount: number, frequency: ExpenseFrequency): number {
  return toMonthlyAmount(amount, frequency) / 30
}

export function toWeeklyAmount(amount: number, frequency: ExpenseFrequency): number {
  return toMonthlyAmount(amount, frequency) * (12 / 52)
}

export function spentForCategoryInFrequency(
  ledger: FinanceLedger,
  categoryId: string,
  frequency: ExpenseFrequency,
  date: string,
): number {
  const children = childCategories(ledger, categoryId)
  const ids =
    children.length > 0
      ? new Set([categoryId, ...children.map((c) => c.id)])
      : new Set([categoryId])
  return spendsInPeriod(ledger.spends, frequency, date).reduce((sum, s) => {
    if (s.kind === 'category' && s.categoryId && ids.has(s.categoryId)) return sum + s.amount
    return sum
  }, 0)
}

export function unexpectedSpentInFrequency(
  ledger: FinanceLedger,
  frequency: ExpenseFrequency,
  date: string,
): number {
  return spendsInPeriod(ledger.spends, frequency, date).reduce((sum, s) => {
    if (s.kind === 'unexpected') return sum + s.amount
    return sum
  }, 0)
}

/** Days elapsed in the current period (1-based), plus period length. */
export function periodProgress(
  frequency: ExpenseFrequency,
  date: string,
): { elapsed: number; total: number } {
  const { dates } = periodDatesFor(frequency, date)
  const idx = dates.indexOf(date)
  return { elapsed: Math.max(1, idx + 1), total: Math.max(1, dates.length) }
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

export type CategoryBudgetRow = {
  id: string
  name: string
  frequency: ExpenseFrequency
  budget: number
  spent: number
  remaining: number
  pct: number
  over: boolean
  dailyBudget: number
  dailySpent: number
  weeklyBudget: number
  weeklySpent: number
  monthlyBudget: number
  monthlySpent: number
  paceExpected: number
  ahead: number
  children: Array<{
    id: string
    name: string
    budget: number
    spent: number
    remaining: number
    pct: number
    over: boolean
  }>
}

export function categoryBudgetRows(ledger: FinanceLedger, date: string): CategoryBudgetRow[] {
  return topLevelCategories(ledger).map((cat) => {
    const budget = budgetForCategory(ledger, cat.id)
    const spent = spentForCategory(ledger, cat.id, date)
    const remaining = roundMoney(budget - spent)
    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : spent > 0 ? 100 : 0
    const over = remaining < 0
    const { elapsed, total } = periodProgress(cat.frequency, date)
    const paceExpected = roundMoney(budget * (elapsed / total))
    const kids = childCategories(ledger, cat.id)
    return {
      id: cat.id,
      name: cat.name,
      frequency: cat.frequency,
      budget,
      spent,
      remaining,
      pct,
      over,
      dailyBudget: roundMoney(toDailyAmount(budget, cat.frequency)),
      dailySpent: roundMoney(spentForCategoryInFrequency(ledger, cat.id, 'daily', date)),
      weeklyBudget: roundMoney(toWeeklyAmount(budget, cat.frequency)),
      weeklySpent: roundMoney(spentForCategoryInFrequency(ledger, cat.id, 'weekly', date)),
      monthlyBudget: roundMoney(toMonthlyAmount(budget, cat.frequency)),
      monthlySpent: roundMoney(spentForCategoryInFrequency(ledger, cat.id, 'monthly', date)),
      paceExpected,
      ahead: roundMoney(paceExpected - spent),
      children: kids.map((kid) => {
        const kidBudget = budgetForCategory(ledger, kid.id)
        const kidSpent = spentForCategory(ledger, kid.id, date)
        const kidRemaining = roundMoney(kidBudget - kidSpent)
        return {
          id: kid.id,
          name: kid.name,
          budget: kidBudget,
          spent: kidSpent,
          remaining: kidRemaining,
          pct:
            kidBudget > 0
              ? Math.min(100, Math.round((kidSpent / kidBudget) * 100))
              : kidSpent > 0
                ? 100
                : 0,
          over: kidRemaining < 0,
        }
      }),
    }
  })
}

export function emptyFinanceLedger(billsId: string): FinanceLedger {
  return {
    categories: [
      {
        id: billsId,
        name: 'Bills',
        frequency: 'monthly',
        amount: 0,
        isPreset: true,
      },
    ],
    allocations: [],
    spends: [],
    wishlist: [],
    updatedAt: new Date().toISOString(),
  }
}

export function migrateWishlist(raw: unknown): WishlistItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<WishlistItem>
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      const amount = typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : NaN
      if (!name || !(amount >= 0)) return null
      return {
        id: typeof row.id === 'string' && row.id ? row.id : `wish-${Math.random().toString(36).slice(2)}`,
        name,
        amount: Math.round(amount * 100) / 100,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
      } satisfies WishlistItem
    })
    .filter((item): item is WishlistItem => item != null)
}

export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function normalizeExpenseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFoodName(name: string): boolean {
  const n = normalizeExpenseName(name)
  return n === 'food' || n === 'foods'
}

function isDrinkName(name: string): boolean {
  const n = normalizeExpenseName(name)
  return n === 'drink' || n === 'drinks'
}

function isFoodAndDrinkName(name: string): boolean {
  const n = normalizeExpenseName(name)
  return (
    n === 'food and drink' ||
    n === 'food and drinks' ||
    n === 'foods and drinks' ||
    n === 'food drink'
  )
}

/**
 * One-time merge of legacy personal Food + Drink rows into a single top-level
 * "Food & Drink" category. Remaps spends / allocations onto the keeper.
 *
 * After the categories are already combined, leave the user's amount and
 * frequency alone — never force $185 weekly on every load (that made edits
 * look like they "always revert").
 */
export function mergePersonalFoodAndDrink(ledger: FinanceLedger): FinanceLedger {
  const COMBINED_NAME = 'Food & Drink'
  const COMBINED_AMOUNT = 185
  const COMBINED_FREQUENCY: ExpenseFrequency = 'weekly'

  const foodLike = ledger.categories.filter(
    (c) => isFoodName(c.name) || isDrinkName(c.name) || isFoodAndDrinkName(c.name),
  )
  if (foodLike.length === 0) return ledger

  // Already a single Food & Drink bucket — migration done; do not overwrite edits.
  const alreadyCombined =
    foodLike.length === 1 && isFoodAndDrinkName(foodLike[0].name) && !foodLike[0].parentId

  if (alreadyCombined) return ledger

  const combined = foodLike.find((c) => isFoodAndDrinkName(c.name))
  const food = foodLike.find((c) => isFoodName(c.name))
  const drink = foodLike.find((c) => isDrinkName(c.name))
  const keeper = combined ?? food ?? drink ?? foodLike[0]
  if (!keeper) return ledger

  const absorbIds = new Set(
    foodLike.filter((c) => c.id !== keeper.id).map((c) => c.id),
  )

  // Also absorb direct children of categories being removed (keeps micro-spend history)
  for (const cat of ledger.categories) {
    if (cat.parentId && absorbIds.has(cat.parentId)) absorbIds.add(cat.id)
  }

  // First-time merge only: seed the default weekly $185 when collapsing Food+Drink.
  // If the keeper was already named Food & Drink, keep its amount/frequency.
  const seedDefaults = !isFoodAndDrinkName(keeper.name)

  const categories = ledger.categories
    .filter((c) => !absorbIds.has(c.id))
    .map((c) => {
      if (c.id !== keeper.id) {
        if (c.parentId && absorbIds.has(c.parentId)) {
          return { ...c, parentId: keeper.id }
        }
        return c
      }
      return {
        ...c,
        name: COMBINED_NAME,
        frequency: seedDefaults ? COMBINED_FREQUENCY : c.frequency,
        amount: seedDefaults ? COMBINED_AMOUNT : c.amount,
        parentId: undefined,
      }
    })
  const spends = ledger.spends.map((s) => {
    if (s.kind !== 'category' || !s.categoryId || !absorbIds.has(s.categoryId)) return s
    return { ...s, categoryId: keeper.id }
  })

  const allocations = ledger.allocations.map((a) => ({
    ...a,
    lines: a.lines.map((line) => {
      if (line.kind !== 'category' || !line.categoryId || !absorbIds.has(line.categoryId)) {
        return line
      }
      return { ...line, categoryId: keeper.id }
    }),
  }))

  // Collapse duplicate allocation lines that now point at the same category
  const collapsedAllocations = allocations.map((a) => {
    const mergedLines: typeof a.lines = []
    for (const line of a.lines) {
      if (line.kind === 'category' && line.categoryId === keeper.id) {
        const existing = mergedLines.find(
          (l) => l.kind === 'category' && l.categoryId === keeper.id,
        )
        if (existing) {
          existing.amount = Math.round((existing.amount + line.amount) * 100) / 100
          continue
        }
      }
      mergedLines.push({ ...line })
    }
    return { ...a, lines: mergedLines }
  })

  return {
    ...ledger,
    categories,
    allocations: collapsedAllocations,
    spends,
  }
}

export { startOfWeekMonday }
