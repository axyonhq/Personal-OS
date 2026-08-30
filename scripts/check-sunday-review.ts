/**
 * Sunday review window math, countdown, and lifestyle spend (no OpenAI).
 * Run: npx --yes tsx scripts/check-sunday-review.ts
 */
import { emptyFinanceLedger } from '../src/utils/finance'
import {
  isFoodOrDrinkCategoryName,
} from '../src/utils/finance'
import {
  lifestyleBucketForSpend,
  lifestyleSpendByDay,
  summarizeLifestyleSeries,
} from '../src/utils/lifestyleSpend'
import { baliDateTimeToUtc, sundayOnOrBefore } from '../src/utils/time'
import {
  formatReviewCountdown,
  isSundayReviewVisible,
  msUntilNextReview,
  reviewDateKeys,
  sundayReviewSlot,
} from '../src/utils/sundayReview'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

// Sunday 30 Aug 2026 is a Sunday.
assert(sundayOnOrBefore('2026-08-30') === '2026-08-30', 'sunday stays sunday')
assert(sundayOnOrBefore('2026-08-31') === '2026-08-30', 'monday → prior sunday')
assert(sundayOnOrBefore('2026-08-29') === '2026-08-23', 'saturday → prior sunday')

const fourPm = baliDateTimeToUtc('2026-08-30', 16, 0, 0)
assert(fourPm.toISOString() === '2026-08-30T08:00:00.000Z', `4pm Bali → 08:00 UTC, got ${fourPm.toISOString()}`)

const atFour = sundayReviewSlot(fourPm)
assert(atFour.sundayDate === '2026-08-30', 'slot sunday at 4pm')
assert(atFour.windowEnd.getTime() === fourPm.getTime(), 'window end is 4pm')
assert(
  atFour.windowStart.toISOString() === '2026-08-23T08:00:00.000Z',
  `7 days back, got ${atFour.windowStart.toISOString()}`,
)
assert(isSundayReviewVisible(fourPm), 'visible at 4pm sunday')
assert(
  atFour.visibleUntil.getTime() === baliDateTimeToUtc('2026-09-06', 16, 0, 0).getTime(),
  'stays until next sunday 4pm',
)

const beforeFour = new Date(fourPm.getTime() - 60_000)
assert(isSundayReviewVisible(beforeFour), 'last week still showing 1 min before 4pm')
const beforeSlot = sundayReviewSlot(beforeFour)
assert(beforeSlot.sundayDate === '2026-08-23', 'before 4pm uses last sunday')

const mondayAfternoon = baliDateTimeToUtc('2026-08-31', 15, 59, 0)
assert(isSundayReviewVisible(mondayAfternoon), 'still visible monday 15:59 Bali')

const mondayFour = baliDateTimeToUtc('2026-08-31', 16, 0, 0)
assert(isSundayReviewVisible(mondayFour), 'still visible monday 4pm Bali')

const tuesday = baliDateTimeToUtc('2026-09-01', 10, 0, 0)
assert(isSundayReviewVisible(tuesday), 'still visible on tuesday')

const saturday = baliDateTimeToUtc('2026-09-05', 20, 0, 0)
assert(isSundayReviewVisible(saturday), 'still visible saturday')

const nextSundayAlmost = baliDateTimeToUtc('2026-09-06', 15, 59, 0)
assert(isSundayReviewVisible(nextSundayAlmost), 'still visible 1 min before next review')

const nextSunday = baliDateTimeToUtc('2026-09-06', 16, 0, 0)
assert(isSundayReviewVisible(nextSunday), 'new slot is visible at next sunday 4pm')
const nextSlot = sundayReviewSlot(nextSunday)
assert(nextSlot.sundayDate === '2026-09-06', 'slot flips to the new sunday at 4pm')

assert(
  reviewDateKeys('2026-08-30').join(',') ===
    '2026-08-24,2026-08-25,2026-08-26,2026-08-27,2026-08-28,2026-08-29,2026-08-30',
  'review days are Mon–Sun ending on the review sunday',
)

assert(
  formatReviewCountdown((((6 * 24 + 17) * 60) + 24) * 60_000) ===
    '6 days, 17 hours and 24 minutes until the next review',
  'countdown 6d 17h 24m',
)
assert(
  formatReviewCountdown((17 * 60 + 24) * 60_000) === '17 hours and 24 minutes until the next review',
  'countdown hours and minutes',
)
assert(formatReviewCountdown(8 * 60_000) === '8 minutes until the next review', 'countdown minutes only')
assert(
  formatReviewCountdown((1 * 24 * 60 + 1) * 60_000) === '1 day and 1 minute until the next review',
  'countdown skips zero hours',
)
assert(formatReviewCountdown(0) === 'the next review is due now', 'countdown zero')

const justAfter = new Date(fourPm.getTime() + 60_000)
const untilNext = msUntilNextReview(justAfter)
assert(untilNext > 6 * 24 * 60 * 60 * 1000, 'just after generation, almost 7 days remain')
assert(untilNext < 7 * 24 * 60 * 60 * 1000, 'just after generation, under 7 days remain')

assert(isFoodOrDrinkCategoryName('Food & Drink'), 'food & drink name')
assert(isFoodOrDrinkCategoryName('Drink'), 'drink name')

const ledger = emptyFinanceLedger('bills')
ledger.categories.push(
  { id: 'food', name: 'Food & Drink', frequency: 'weekly', amount: 185 },
  { id: 'rent', name: 'Rent', frequency: 'monthly', amount: 800 },
  { id: 'bike', name: 'Motorbike', frequency: 'monthly', amount: 60 },
  { id: 'spend', name: 'Spendings', frequency: 'weekly', amount: 50 },
)
ledger.spends.push(
  { id: 's1', date: '2026-08-20', amount: 12, kind: 'category', categoryId: 'food' },
  { id: 's2', date: '2026-08-20', amount: 800, kind: 'category', categoryId: 'rent' },
  { id: 's3', date: '2026-08-21', amount: 60, kind: 'category', categoryId: 'bike' },
  { id: 's4', date: '2026-08-21', amount: 9, kind: 'category', categoryId: 'spend' },
  { id: 's5', date: '2026-08-21', amount: 4, kind: 'unexpected', label: 'Coffee' },
  { id: 's6', date: '2026-08-22', amount: 30, kind: 'unexpected', label: 'Rent top-up' },
)

assert(lifestyleBucketForSpend(ledger.spends[0], ledger) === 'food', 'food spend is food')
assert(lifestyleBucketForSpend(ledger.spends[1], ledger) === null, 'rent is excluded')
assert(lifestyleBucketForSpend(ledger.spends[2], ledger) === null, 'motorbike is excluded')
assert(lifestyleBucketForSpend(ledger.spends[3], ledger) === 'spendings', 'spendings category')
assert(lifestyleBucketForSpend(ledger.spends[4], ledger) === 'spendings', 'unexpected coffee')
assert(lifestyleBucketForSpend(ledger.spends[5], ledger) === null, 'unexpected rent label excluded')

const series = summarizeLifestyleSeries(
  lifestyleSpendByDay(ledger, ['2026-08-20', '2026-08-21', '2026-08-22']),
)
assert(series.foodTotal === 12, `food total 12, got ${series.foodTotal}`)
assert(series.spendingsTotal === 13, `spendings 9+4=13, got ${series.spendingsTotal}`)
assert(series.total === 25, `lifestyle total 25, got ${series.total}`)
assert(series.peak?.date === '2026-08-21', 'peak day is the 21st')

console.log('sunday review checks passed')
