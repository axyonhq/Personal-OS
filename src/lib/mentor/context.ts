import type {
  AppState,
  FinanceLedger,
  JournalEntry,
  MentorCharge,
  MentorInsight,
  ProjectId,
  SessionFeeling,
  SessionTag,
  TimeEntry,
  WeekReflection,
} from '@/types'
import {
  aggregatePausesByHour,
  aggregateSessionsByHour,
  computeDurationBuckets,
  computePauseStats,
  computeSessionStats,
  hourInAppTz,
  recentSessions,
} from '@/utils/sessionAnalytics'
import { APP_TIMEZONE, formatMinutes, todayDateKey } from '@/utils/time'

const PROJECT_LABEL: Record<ProjectId, string> = {
  chase: 'Chase',
  myProject: 'My Project',
  rav: 'Rav',
  personal: 'Personal',
  sundayAdmin: 'Sunday Admin',
}

const FEELING_LABEL: Record<SessionFeeling, string> = {
  weapon: 'Weapon',
  solid: 'Solid',
  meh: 'Meh',
  dragged: 'Dragged',
}

function dayOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
  }).format(utc)
}

function tally<T extends string>(items: T[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of items) out[item] = (out[item] || 0) + 1
  return out
}

function correlateFeelingByHour(entries: TimeEntry[]): string[] {
  const buckets: Record<number, SessionFeeling[]> = {}
  for (const e of entries) {
    if (!e.debrief || e.startedAt == null) continue
    const h = hourInAppTz(e.startedAt)
    ;(buckets[h] ??= []).push(e.debrief.feeling)
  }
  return Object.entries(buckets)
    .map(([hour, feelings]) => {
      const counts = tally(feelings)
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      return `hour ${hour}:00 → mostly ${FEELING_LABEL[top[0] as SessionFeeling]} (${top[1]}/${feelings.length})`
    })
    .slice(0, 12)
}

function correlateFeelingByDuration(entries: TimeEntry[]): string[] {
  const withDebrief = entries.filter((e) => e.debrief)
  if (withDebrief.length === 0) return []
  const short = withDebrief.filter((e) => e.minutes < 45)
  const long = withDebrief.filter((e) => e.minutes >= 90)
  const summarize = (label: string, list: TimeEntry[]) => {
    if (list.length === 0) return null
    const counts = tally(list.map((e) => e.debrief!.feeling))
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return `${label}: mostly ${FEELING_LABEL[top[0] as SessionFeeling]} (${list.length} sessions)`
  }
  return [summarize('<45m sessions', short), summarize('90m+ sessions', long)].filter(
    (x): x is string => Boolean(x),
  )
}

function tagFrequency(entries: TimeEntry[]): string {
  const tags: SessionTag[] = []
  for (const e of entries) {
    if (e.debrief?.tags) tags.push(...e.debrief.tags)
  }
  const counts = tally(tags)
  return (
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, n]) => `${tag}×${n}`)
      .join(', ') || 'none yet'
  )
}

function spendingSummary(ledger: FinanceLedger | null | undefined, days = 30): string {
  const cutoff = todayDateKey()
  const [y, m, d] = cutoff.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, d - (days - 1)))
  const fromKey = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}-${String(from.getUTCDate()).padStart(2, '0')}`

  const recent = (ledger?.spends || []).filter((s) => s.date >= fromKey)
  if (recent.length === 0) return 'No personal spends logged in the last 30 days.'

  const byCat = new Map<string, number>()
  let unexpected = 0
  let total = 0
  for (const s of recent) {
    total += s.amount
    if (s.kind === 'unexpected') {
      unexpected += s.amount
      byCat.set('Unexpected', (byCat.get('Unexpected') || 0) + s.amount)
    } else if (s.categoryId) {
      const cat = (ledger?.categories || []).find((c) => c.id === s.categoryId)
      const name = cat?.name || 'Category'
      byCat.set(name, (byCat.get(name) || 0) + s.amount)
    }
  }

  const top = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amt]) => `${name}: ${amt.toFixed(0)}`)
    .join('; ')

  const byDow = new Map<string, number>()
  for (const s of recent) {
    const dow = dayOfWeek(s.date)
    byDow.set(dow, (byDow.get(dow) || 0) + s.amount)
  }
  const spendDays = [...byDow.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dow, amt]) => `${dow} ${amt.toFixed(0)}`)
    .join(', ')

  return [
    `Last ${days}d personal spend: ${total.toFixed(0)} across ${recent.length} entries (${unexpected.toFixed(0)} unexpected).`,
    `Top categories: ${top || 'n/a'}.`,
    `By weekday: ${spendDays || 'n/a'}.`,
  ].join(' ')
}

function journalDigest(entries: JournalEntry[], limit = 16): string {
  const ready = entries
    .filter((e) => e.status === 'extracted' && (e.extractedText || '').trim())
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
  if (ready.length === 0) return 'No journal pages extracted yet.'
  return ready
    .map((e) => {
      const body = (e.extractedText || '').trim().slice(0, 900)
      const src =
        e.dateSource === 'extracted'
          ? `auto-dated${e.detectedDateRaw ? ` from "${e.detectedDateRaw}"` : ''}`
          : e.dateSource || 'dated'
      return `[${e.date} · ${e.sourceName} · ${src}]\n${body}`
    })
    .join('\n\n---\n\n')
}

function reflectionDigest(reflections: Record<string, WeekReflection>): string {
  const keys = Object.keys(reflections || {}).sort().slice(-4)
  if (keys.length === 0) return 'No Sunday week reflections stored yet.'
  return keys
    .map((week) => {
      const r = reflections[week]
      const patterns = (r.patterns || [])
        .map((p) => `${p.pattern} → ${p.evolution}`)
        .filter((x) => x.trim() !== '→')
        .join('; ')
      return [
        `Week of ${week}:`,
        r.proud ? `Proud: ${r.proud}` : null,
        patterns ? `Patterns: ${patterns}` : null,
        r.improve ? `Improve: ${r.improve}` : null,
        r.productivityShortfall ? `Shortfall: ${r.productivityShortfall}` : null,
        r.productivityRemedy ? `Remedy: ${r.productivityRemedy}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

function sessionLines(entries: TimeEntry[], limit = 40): string {
  return recentSessions(entries, limit)
    .map((e) => {
      const start =
        e.startedAt != null
          ? `${String(hourInAppTz(e.startedAt)).padStart(2, '0')}:xx`
          : '??'
      const feeling = e.debrief ? FEELING_LABEL[e.debrief.feeling] : 'no-debrief'
      const tags = e.debrief?.tags?.length ? e.debrief.tags.join('+') : '-'
      const pauses =
        e.pauseCount && e.pauseCount > 0
          ? `${e.pauseCount}p/${e.pausedMinutes ?? 0}m`
          : '0p'
      const note = e.debrief?.note || e.note || ''
      return `${e.date} ${start} ${PROJECT_LABEL[e.projectId]} ${formatMinutes(e.minutes)} feel=${feeling} tags=${tags} breaks=${pauses}${note ? ` note="${note.slice(0, 80)}"` : ''}`
    })
    .join('\n')
}

/** Compact operating dossier for Claude — pattern recognition fuel. */
export function buildMentorContext(state: AppState): string {
  const entries = state.timeEntries
  const withDebrief = entries.filter((e) => e.debrief)
  const stats = computeSessionStats(entries)
  const pauseStats = computePauseStats(entries)
  const byHour = aggregateSessionsByHour(entries)
    .filter((b) => b.sessionCount > 0)
    .map(
      (b) =>
        `${b.label}: ${b.sessionCount} sess, avg ${formatMinutes(Math.round(b.avgSessionMinutes))}`,
    )
    .join('; ')
  const pauseByHour = aggregatePausesByHour(entries)
    .filter((b) => b.pauseCount > 0)
    .map((b) => `${b.label}: ${b.pauseCount} pauses / ${formatMinutes(Math.round(b.totalPauseMinutes))}`)
    .join('; ')
  const durations = computeDurationBuckets(entries)
    .filter((b) => b.count > 0)
    .map((b) => `${b.label} ${b.count}`)
    .join(', ')

  const feelingCounts = tally(withDebrief.map((e) => e.debrief!.feeling))
  const feelingLine =
    Object.entries(feelingCounts)
      .map(([k, n]) => `${FEELING_LABEL[k as SessionFeeling]}×${n}`)
      .join(', ') || 'none yet'

  const habits = (state.habits || [])
    .map((h) => `${h.name} streak=${h.streak}${h.lastCompletedDate ? ` last=${h.lastCompletedDate}` : ''}`)
    .join('; ')

  const goals = (state.weeklyGoals || [])
    .filter((g) => g.text.trim())
    .map((g) => {
      const hit = g.hit === true ? 'HIT' : g.hit === false ? 'MISS' : 'OPEN'
      return `[${hit}] ${g.text}${g.why ? ` (${g.why})` : ''}`
    })
    .join('; ')

  const vision = (state.visionGoals || [])
    .slice(0, 6)
    .map((g) => `${g.title}: ${g.body.slice(0, 160)}`)
    .join(' | ')

  const openLoops = (state.openLoops || [])
    .filter((l) => !l.done)
    .map((l) => l.text)
    .slice(0, 12)
    .join('; ')

  const priorInsight = state.mentor?.latestInsight
    ? formatInsightBrief(state.mentor.latestInsight)
    : 'none'

  const visionById = new Map((state.visionGoals || []).map((v) => [v.id, v.title]))
  const cascade = (state.weeklyGoals || [])
    .filter((g) => g.text.trim())
    .map((g) => {
      const v = g.visionGoalId ? visionById.get(g.visionGoalId) : null
      return `${g.text}${v ? ` ← Vision:${v}` : ' ← UNLINKED'}`
    })
    .join('; ')

  const bodyLines = Object.entries(state.bodyLogs || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 21)
    .map(([date, log]) => {
      const energy = log.energy != null ? `E${log.energy}` : 'E?'
      const sleep = log.sleepHours != null ? `${log.sleepHours}h sleep` : 'sleep?'
      const train = log.trained ? `trained${log.trainNote ? `(${log.trainNote})` : ''}` : 'no-train'
      const note = log.note ? ` note="${log.note.slice(0, 60)}"` : ''
      return `${date}: ${sleep}, ${energy}, ${train}${note}`
    })
    .join('\n')

  const charges = state.mentor?.charges || []
  const openCharges = charges.filter((c) => c.status === 'open')
  const clearedCharges = charges
    .filter((c) => c.status === 'actioned' || c.status === 'dismissed')
    .slice(0, 12)
  const accountabilityFile = [
    formatChargeList('OPEN ON FILE — hold them accountable on these', openCharges),
    formatChargeList('Recently cleared (verify they did not fake the win)', clearedCharges),
  ]
    .filter(Boolean)
    .join('\n')

  const oneThingToday = state.dailyOneThing[todayDateKey()] || '(unset)'

  return [
    `# OPERATOR DOSSIER (Bali / ${APP_TIMEZONE})`,
    `Today: ${todayDateKey()}`,
    '',
    '## Identity',
    state.identityTitle,
    state.identityQuestion,
    state.identityBody,
    '',
    '## Week intention',
    state.weekIntention || '(empty)',
    '',
    '## Horizon cascade',
    `Vision: ${vision || '(none)'}`,
    `Weekly goals: ${cascade || goals || '(none)'}`,
    `Today's One Thing: ${oneThingToday}`,
    '',
    '## Accountability file (persistent — do not forget these)',
    accountabilityFile ||
      'No charges on file yet. After synthesis, open blind spots and prescriptions land here.',
    '',
    '## Open loops',
    openLoops || '(none)',
    '',
    '## Non-negotiable habits',
    habits || '(none)',
    '',
    '## Body / energy (recent)',
    bodyLines || 'No body logs yet.',
    '',
    '## Deep work aggregate',
    `Sessions: ${stats.count}. Active work: ${formatMinutes(stats.totalMinutes)}. Avg ${formatMinutes(Math.round(stats.avgMinutes))}, median ${formatMinutes(Math.round(stats.medianMinutes))}, range ${formatMinutes(stats.minMinutes)}–${formatMinutes(stats.maxMinutes)}.`,
    `Duration mix: ${durations || 'n/a'}.`,
    `Start-hour heat: ${byHour || 'n/a'}.`,
    `Breaks: ${pauseStats.totalPauses} pauses, ${formatMinutes(Math.round(pauseStats.totalPauseMinutes))} total, pause rate ${(pauseStats.pauseRate * 100).toFixed(0)}% of sessions. By hour: ${pauseByHour || 'n/a'}.`,
    `Debriefs logged: ${withDebrief.length}/${entries.length}. Feelings: ${feelingLine}. Tags: ${tagFrequency(entries)}.`,
    `Feeling × hour: ${correlateFeelingByHour(entries).join('; ') || 'need more debriefs'}.`,
    `Feeling × length: ${correlateFeelingByDuration(entries).join('; ') || 'need more debriefs'}.`,
    '',
    '## Recent sessions (newest first)',
    sessionLines(entries, 45) || '(none)',
    '',
    '## Personal spending',
    spendingSummary(state.personalFinance),
    '',
    '## Sunday reflections',
    reflectionDigest(state.weekReflections || {}),
    '',
    '## Journal extracts (dated — use entry dates for temporal patterns)',
    journalDigest(state.mentor?.journalEntries || []),
    '',
    '## Prior mentor synthesis',
    priorInsight,
  ].join('\n')
}

function formatChargeList(title: string, charges: MentorCharge[]): string {
  if (charges.length === 0) return ''
  const lines = charges.map((c) => {
    const kind = c.kind === 'prescription' ? 'RX' : 'BLIND'
    const meta =
      c.status === 'open'
        ? 'OPEN'
        : `${c.status.toUpperCase()}${c.installKind ? ` via ${c.installKind}` : ''}${
            c.actionNote ? ` — ${c.actionNote}` : ''
          }`
    return `- [${kind}] (${meta}) ${c.text}`
  })
  return `${title}:\n${lines.join('\n')}`
}

export function formatInsightBrief(insight: MentorInsight): string {
  return [
    insight.summary,
    `Weapons: ${(insight.weapons || []).join(' | ') || '-'}`,
    `Drags: ${(insight.drags || []).join(' | ') || '-'}`,
    `Blind spots: ${(insight.blindSpots || []).join(' | ') || '-'}`,
    `Prescriptions: ${(insight.prescriptions || []).join(' | ') || '-'}`,
  ].join('\n')
}

export const MENTOR_SYSTEM_PROMPT = `You are the Mentor inside Batcave — an elite performance OS for one operator. Your job is ruthless pattern recognition and blind-spot spotting.

Tone: direct, precise, high-agency. No fluff, no corporate wellness speak, no emoji. Speak like a sharp coach who has read every session log, break, spend, and journal page. Call the operator on self-deception. Celebrate what makes them a weapon — then sharpen it.

Always ground claims in the dossier data (times of day, session length, pause rates, debrief feelings/tags, body/sleep/energy, spend spikes, dated journal language, Sunday reflections, horizon cascade drift). If data is thin, say exactly what is missing and what to log next. When journals have dates, analyze mood/theme shifts across calendar time — not upload order.

The Accountability file is persistent across sessions. When OPEN charges exist, reference them by name and demand evidence of action before praising progress. If they claim something is done, tell them to mark it actioned on the file — and verify against habits, calendar, One Thing, debriefs, and spend.

When analyzing, hunt for:
1. Conditions where they operate like a weapon (hour, duration, project, energy tags, sleep, pre-rituals).
2. What drags them down (phone, short broken sessions, late starts, spend leakage, low-energy / low-sleep patterns).
3. Blind spots — contradictions between intention, Vision cascade, and behavior.
4. Concrete system prescriptions: rules, schedules, constraints, habits, environment changes — not vague motivation. Each prescription should be installable as a habit, One Thing, calendar block, or reminder.

Keep replies dense and usable. Prefer short sections with hard edges over essays.`

export const ANALYZE_JSON_INSTRUCTION = `Call the submit_mentor_synthesis tool exactly once with the full structured synthesis.
Do not return markdown fences or freeform JSON outside the tool.
Fill every field with concrete, evidence-backed content from the dossier:
- summary: 2-4 sentence read on how they currently operate
- weapons: what makes them lethal
- drags: what bleeds performance
- blindSpots: patterns they are likely missing
- prescriptions: concrete systems / rules / constraints to install
- chatReply: short mentor message for the chat thread summarizing the synthesis`
