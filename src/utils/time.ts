/** Bali / Central Indonesia (WITA) — app wall-clock timezone */
export const APP_TIMEZONE = 'Asia/Makassar'

export function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60)
  const mins = m % 60
  if (h === 0) return `${mins}m`
  if (mins === 0) return `${h}h`
  return `${h}h ${mins}m`
}

export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`
  return `${pad2(m)}:${pad2(sec)}`
}

/** Calendar parts for an instant in the app timezone (Bali). */
export function zonedParts(
  date: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Minutes since midnight right now in the app timezone (Bali). */
export function nowMinutesInAppTz(date: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  return get('hour') * 60 + get('minute')
}

/** Today's YYYY-MM-DD in Bali (Asia/Makassar). */
export function todayDateKey(date: Date = new Date()): string {
  const { year, month, day } = zonedParts(date)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** YYYY-MM for the current Bali calendar month. */
export function todayMonthKey(date: Date = new Date()): string {
  const { year, month } = zonedParts(date)
  return `${year}-${pad2(month)}`
}

/** Local calendar YYYY-MM-DD from a Date (for date-key math, not wall-clock “now”). */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

export function startOfWeekMonday(key: string): string {
  const d = parseDateKey(key)
  const day = d.getDay() // 0 Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return toDateKey(d)
}

/** Today if Sunday, otherwise the next upcoming Sunday. */
export function upcomingSunday(key: string = todayDateKey()): string {
  const dow = parseDateKey(key).getDay()
  if (dow === 0) return key
  return addDays(key, 7 - dow)
}

/** Calendar Sunday on or before this date key. */
export function sundayOnOrBefore(key: string): string {
  const dow = parseDateKey(key).getDay()
  return addDays(key, -dow)
}

/**
 * Bali wall-clock → UTC Date.
 * Asia/Makassar (WITA) is UTC+8 all year, no daylight saving.
 */
export function baliDateTimeToUtc(
  dateKey: string,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour - 8, minute, second))
}

export function weekDays(selectedDate: string): string[] {
  const start = startOfWeekMonday(selectedDate)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function formatDayLabel(key: string): { dow: string; day: number } {
  const d = parseDateKey(key)
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return { dow: dows[d.getDay()], day: d.getDate() }
}

export function formatLongDate(key: string): string {
  const d = parseDateKey(key)
  const dows = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${dows[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
}

export function formatMonthYear(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return `${months[m - 1]} ${y}`
}

export function monthGrid(ym: string): (string | null)[] {
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  let startDow = first.getDay() // 0 Sun
  // Convert to Monday-first: Mon=0 ... Sun=6
  startDow = startDow === 0 ? 6 : startDow - 1
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${pad2(m)}-${pad2(d)}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

export function minutesToTimeLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${pad2(m)} ${ampm}`
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
