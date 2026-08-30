/**
 * Sunday review window math (no OpenAI).
 * Run: npx --yes tsx scripts/check-sunday-review.ts
 */
import { baliDateTimeToUtc, sundayOnOrBefore } from '../src/utils/time'
import { isSundayReviewVisible, sundayReviewSlot } from '../src/utils/sundayReview'

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

const beforeFour = new Date(fourPm.getTime() - 60_000)
assert(!isSundayReviewVisible(beforeFour), 'hidden 1 min before 4pm')
const beforeSlot = sundayReviewSlot(beforeFour)
assert(beforeSlot.sundayDate === '2026-08-23', 'before 4pm uses last sunday')

const mondayAfternoon = baliDateTimeToUtc('2026-08-31', 15, 59, 0)
assert(isSundayReviewVisible(mondayAfternoon), 'still visible monday 15:59 Bali')

const mondayFour = baliDateTimeToUtc('2026-08-31', 16, 0, 0)
assert(!isSundayReviewVisible(mondayFour), 'gone at monday 4pm Bali (24h later)')

const tuesday = baliDateTimeToUtc('2026-09-01', 10, 0, 0)
assert(!isSundayReviewVisible(tuesday), 'gone on tuesday')

console.log('sunday review checks passed')
