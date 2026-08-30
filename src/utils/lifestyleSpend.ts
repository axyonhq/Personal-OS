import type { ExpenseCategory, FinanceLedger, SpendEntry } from '../types'
import { isFoodOrDrinkCategoryName, normalizeExpenseName, roundMoney } from './finance'
import { addDays } from './time'

export type LifestyleBucket = 'food' | 'spendings'

export type LifestyleDay = {
  date: string
  food: number
  spendings: number
  total: number
}

export type LifestyleSeries = {
  days: LifestyleDay[]
  foodTotal: number
  spendingsTotal: number
  total: number
  avgPerDay: number
  peak: LifestyleDay | null
}

const FIXED_ONE_OFF_NAMES = new Set([
  'rent',
  'housing',
  'home',
  'landlord',
  'apartment',
  'deposit',
  'motorbike',
  'motorcycle',
  'scooter',
  'bike',
  'vespa',
  'visa',
  'insurance',
  'utilities',
  'wifi',
  'internet',
  'bills',
  'electricity',
  'water',
])

const SPENDINGS_NAMES = new Set([
  'spendings',
  'spending',
  'spend',
  'shopping',
  'personal',
  'lifestyle',
  'treats',
  'extras',
  'extra',
  'misc',
  'fun',
])

function isFixedOneOffName(name: string): boolean {
  const n = normalizeExpenseName(name)
  if (!n) return false
  if (FIXED_ONE_OFF_NAMES.has(n)) return true
  return n.includes('rent') || n.includes('motorbike') || n.includes('motorcycle')
}

export function isSpendingsCategoryName(name: string): boolean {
  return SPENDINGS_NAMES.has(normalizeExpenseName(name))
}

function categoryAndParents(cat: ExpenseCategory, ledger: FinanceLedger): ExpenseCategory[] {
  const chain = [cat]
  if (cat.parentId) {
    const parent = ledger.categories.find((c) => c.id === cat.parentId)
    if (parent) chain.unshift(parent)
  }
  return chain
}

/**
 * Food, drink, and day-to-day spendings only.
 * Monthly one-offs (rent, motorbike, bills) return null and stay off the chart.
 */
export function lifestyleBucketForSpend(
  spend: SpendEntry,
  ledger: FinanceLedger,
): LifestyleBucket | null {
  if (spend.kind === 'unexpected') {
    const label = [spend.label, spend.note].filter(Boolean).join(' ')
    if (isFixedOneOffName(label)) return null
    return 'spendings'
  }

  const cat = spend.categoryId
    ? ledger.categories.find((c) => c.id === spend.categoryId)
    : undefined
  if (!cat) return 'spendings'

  const chain = categoryAndParents(cat, ledger)
  if (chain.some((c) => isFoodOrDrinkCategoryName(c.name))) return 'food'
  if (chain.some((c) => isSpendingsCategoryName(c.name))) return 'spendings'
  return null
}

export function lastNDateKeys(today: string, n: number): string[] {
  const count = Math.max(1, Math.round(n))
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)))
}

export function lifestyleSpendByDay(ledger: FinanceLedger, dates: string[]): LifestyleDay[] {
  const wanted = new Set(dates)
  const byDate = new Map<string, { food: number; spendings: number }>()
  for (const date of dates) byDate.set(date, { food: 0, spendings: 0 })

  for (const spend of ledger.spends ?? []) {
    if (!wanted.has(spend.date)) continue
    const bucket = lifestyleBucketForSpend(spend, ledger)
    if (!bucket) continue
    const row = byDate.get(spend.date)
    if (!row) continue
    row[bucket] = roundMoney(row[bucket] + spend.amount)
  }

  return dates.map((date) => {
    const row = byDate.get(date) ?? { food: 0, spendings: 0 }
    return {
      date,
      food: row.food,
      spendings: row.spendings,
      total: roundMoney(row.food + row.spendings),
    }
  })
}

export function summarizeLifestyleSeries(days: LifestyleDay[]): LifestyleSeries {
  const foodTotal = roundMoney(days.reduce((sum, d) => sum + d.food, 0))
  const spendingsTotal = roundMoney(days.reduce((sum, d) => sum + d.spendings, 0))
  const total = roundMoney(foodTotal + spendingsTotal)
  const peak = days.reduce<LifestyleDay | null>((best, day) => {
    if (day.total <= 0) return best
    if (!best || day.total > best.total) return day
    return best
  }, null)
  return {
    days,
    foodTotal,
    spendingsTotal,
    total,
    avgPerDay: days.length > 0 ? roundMoney(total / days.length) : 0,
    peak,
  }
}

export function lifestyleSpendSeries(
  ledger: FinanceLedger,
  today: string,
  days = 30,
): LifestyleSeries {
  return summarizeLifestyleSeries(lifestyleSpendByDay(ledger, lastNDateKeys(today, days)))
}
