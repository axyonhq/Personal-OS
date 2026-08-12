/**
 * Sanity checks for finance persistence (no test runner in package.json).
 * Run: npx --yes tsx scripts/check-finance-merge.ts
 */
import {
  mergeFinanceLedgers,
  mergeSessionSafeState,
  preferRicherState,
} from '../src/lib/supabase/sync'
import type { AppState, FinanceLedger } from '../src/types'
import { createSeedState } from '../src/data/seed'
import { emptyFinanceLedger, mergePersonalFoodAndDrink } from '../src/utils/finance'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

function ledger(
  partial: Partial<FinanceLedger> & Pick<FinanceLedger, 'categories'>,
): FinanceLedger {
  return {
    allocations: partial.allocations ?? [],
    spends: partial.spends ?? [],
    wishlist: partial.wishlist ?? [],
    updatedAt: partial.updatedAt,
    categories: partial.categories,
  }
}

const older = ledger({
  categories: [
    { id: 'bills', name: 'Bills', frequency: 'monthly', amount: 0, isPreset: true },
    { id: 'food', name: 'Food & Drink', frequency: 'weekly', amount: 185 },
  ],
  updatedAt: '2026-08-01T10:00:00.000Z',
})

const newer = ledger({
  categories: [
    { id: 'bills', name: 'Bills', frequency: 'monthly', amount: 0, isPreset: true },
    { id: 'food', name: 'Food & Drink', frequency: 'weekly', amount: 250 },
  ],
  updatedAt: '2026-08-11T12:00:00.000Z',
})

assert(
  mergeFinanceLedgers(older, newer).categories.find((c) => c.id === 'food')?.amount === 250,
  'newer updatedAt must win on amount edits',
)
assert(
  mergeFinanceLedgers(newer, older).categories.find((c) => c.id === 'food')?.amount === 250,
  'older snapshot must lose even when passed as other',
)

const base = createSeedState() as AppState

// Personal expense added while cloud hydrate is in flight must survive.
const remoteHeavy: AppState = {
  ...base,
  timeEntries: Array.from({ length: 20 }, (_, i) => ({
    id: `t-${i}`,
    projectId: 'chase',
    date: '2026-08-01',
    minutes: 45,
  })),
  personalFinance: ledger({
    categories: [
      { id: 'bills', name: 'Bills', frequency: 'monthly', amount: 0, isPreset: true },
    ],
  }),
}
const localWithMicrosoft: AppState = {
  ...base,
  personalFinance: ledger({
    categories: [
      { id: 'bills', name: 'Bills', frequency: 'monthly', amount: 0, isPreset: true },
      {
        id: 'ms-email',
        name: 'Microsoft emails',
        frequency: 'monthly',
        amount: 72,
      },
    ],
    updatedAt: '2026-08-11T14:00:00.000Z',
  }),
}

const pick = preferRicherState(localWithMicrosoft, remoteHeavy)
assert(pick.source === 'remote', 'remote should win overall richness in this fixture')
const afterPick = mergeSessionSafeState(
  pick.winner,
  pick.source === 'local' ? remoteHeavy : localWithMicrosoft,
)
assert(
  afterPick.personalFinance.categories.some((c) => c.name === 'Microsoft emails'),
  'prefer-either fold must keep personal expense from the richer finance side',
)

const afterHydrate = mergeSessionSafeState(remoteHeavy, localWithMicrosoft, {
  timerMode: 'prefer-other',
})
assert(
  afterHydrate.personalFinance.categories.some((c) => c.name === 'Microsoft emails'),
  'prefer-other must keep just-added personal expense from memory',
)
assert(
  afterHydrate.personalFinance.categories.find((c) => c.id === 'ms-email')?.amount === 72,
  'personal expense amount must survive hydrate fold',
)

const foldedPersonal = mergeSessionSafeState(
  { ...remoteHeavy, personalFinance: older },
  { ...localWithMicrosoft, personalFinance: newer },
  { timerMode: 'prefer-other' },
)
assert(
  foldedPersonal.personalFinance.categories.find((c) => c.id === 'food')?.amount === 250,
  'mergeSessionSafeState prefer-other must keep newer personal finance too',
)

// Food & Drink migration must not force $185 after the user edits the combined row.
const editedFoodDrink = ledger({
  categories: [
    { id: 'bills', name: 'Bills', frequency: 'monthly', amount: 0, isPreset: true },
    { id: 'food', name: 'Food & Drink', frequency: 'weekly', amount: 220 },
  ],
})
const afterLoad = mergePersonalFoodAndDrink(editedFoodDrink)
assert(
  afterLoad.categories.find((c) => c.id === 'food')?.amount === 220,
  'already-combined Food & Drink amount must survive load migration',
)

// First-time Food + Drink collapse still seeds $185 weekly.
const legacySplit = ledger({
  categories: [
    { id: 'bills', name: 'Bills', frequency: 'monthly', amount: 0, isPreset: true },
    { id: 'food-only', name: 'Food', frequency: 'weekly', amount: 100 },
    { id: 'drink-only', name: 'Drink', frequency: 'weekly', amount: 85 },
  ],
})
const collapsed = mergePersonalFoodAndDrink(legacySplit)
const combined = collapsed.categories.find((c) => /food/i.test(c.name) && /drink/i.test(c.name))
assert(combined?.amount === 185, 'first-time Food+Drink merge should seed $185')
assert(combined?.frequency === 'weekly', 'first-time Food+Drink merge should be weekly')
assert(
  collapsed.categories.filter((c) => c.name === 'Food' || c.name === 'Drink').length === 0,
  'legacy Food and Drink rows must be absorbed',
)

// Empty seed ledger still builds.
assert(emptyFinanceLedger('b').categories[0]?.name === 'Bills', 'empty ledger keeps Bills')

console.log('check-finance-merge: ok')
