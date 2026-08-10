import type {
  AppState,
  ChiefOfStaffState,
  CoSBrief,
  CoSInsight,
  CompanyTask,
} from '@/types'
import { formatMinutes, todayDateKey } from '@/utils/time'
import { totalAllocated, totalMonthlyExpenses, totalSpent, formatMoney } from '@/utils/finance'

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text: string, max = 280): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export type CoSContextExtras = {
  companyTasks?: CompanyTask[]
}

/** Full-platform dossier for the Chief of Staff. Never includes secrets. */
export function buildChiefOfStaffContext(
  state: AppState,
  extras: CoSContextExtras = {},
): string {
  const today = todayDateKey()
  const tasks = extras.companyTasks || []
  const roots = tasks.filter((t) => !t.parentId && !t.hidden)
  const openTodos = roots.filter((t) => t.status !== 'done')
  const inProgress = openTodos.filter((t) => t.status === 'in_progress')
  const doNow = openTodos.filter((t) => t.priority === 'do')

  const decisions = state.companyDecisions || []
  const openDecisions = decisions.filter((d) => d.status === 'open')
  const overdueDecisions = openDecisions.filter((d) => d.decideBy < today)
  const dueToday = openDecisions.filter((d) => d.decideBy === today)

  const domains = state.coldEmailDomains || []
  const mailboxCount = domains.reduce((n, d) => n + (d.mailboxes?.length || 0), 0)

  const companyLedger = state.companyFinance
  const personalLedger = state.personalFinance
  const companyBurn = totalMonthlyExpenses(companyLedger)
  const companySpent = totalSpent(companyLedger)
  const personalSpent = totalSpent(personalLedger)

  const oneThing = state.dailyOneThing?.[today]
  const openLoops = (state.openLoops || []).filter((l) => !l.done)
  const openMentorCharges = (state.mentor?.charges || []).filter((c) => c.status === 'open')

  const deepToday = (state.timeEntries || [])
    .filter((e) => e.date === today)
    .reduce((n, e) => n + (e.minutes || 0), 0)

  const body = state.bodyLogs?.[today]

  const lines: string[] = [
    `# AXYON platform dossier`,
    `Date (Asia/Makassar): ${today}`,
    '',
    '## Company · Execution',
    `Open company to-dos: ${openTodos.length} (in progress ${inProgress.length}, do-now ${doNow.length})`,
    ...openTodos
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, 20)
      .map((t) => {
        const due = t.deadline ? ` due ${t.deadline}` : ''
        const energy = t.energyRequired ? ` energy=${t.energyRequired}` : ''
        const blocked = t.blockedByIds?.length ? ' (blocked)' : ''
        const note = t.notes ? ` — note: ${truncate(t.notes, 120)}` : ''
        return `- [${t.status}/${t.priority}] ${t.title}${due}${energy}${blocked}${note}`
      }),
    '',
    '## Company · Decision Gate',
    `Open decisions: ${openDecisions.length} (overdue ${overdueDecisions.length}, due today ${dueToday.length})`,
    ...openDecisions
      .slice()
      .sort((a, b) => a.decideBy.localeCompare(b.decideBy))
      .slice(0, 15)
      .map((d) => {
        const opts = (d.options || []).map((o) => o.text).filter(Boolean).join(' | ')
        return `- ${d.title} · decide by ${d.decideBy}${d.decideBy < today ? ' OVERDUE' : ''}${d.why ? ` · why: ${truncate(d.why, 100)}` : ''}${opts ? ` · options: ${truncate(opts, 140)}` : ''}`
      }),
    '',
    '## Company · Ideas',
    `Ideas on file: ${(state.companyIdeas || []).length}`,
    ...(state.companyIdeas || [])
      .slice(0, 12)
      .map((i) => `- ${i.title}${i.text ? `: ${truncate(i.text, 140)}` : ''}`),
    '',
    '## Company · Documents (titles + short body only)',
    `Docs: ${(state.companyDocuments || []).length}`,
    ...(state.companyDocuments || [])
      .slice(0, 12)
      .map((d) => `- ${d.title}: ${truncate(stripHtml(d.content || ''), 160)}`),
    '',
    '## Company · Cold Email (no passwords)',
    `Domains: ${domains.length} · Mailboxes: ${mailboxCount}`,
    ...domains
      .slice(0, 25)
      .map((d) => `- ${d.domain} (${d.provider}) · ${d.mailboxes?.length || 0} mailboxes`),
    '',
    '## Company · Logins vault (NO secrets — labels only)',
    `Saved logins: ${(state.companyLogins || []).length}`,
    ...(state.companyLogins || [])
      .slice(0, 20)
      .map((l) => {
        const label = l.platform || l.url || 'Untitled'
        return `- ${label}${l.username ? ` · user on file` : ''}${l.twoFactorEnabled ? ' · 2FA on' : ''}`
      }),
    '',
    '## Company · Finance',
    `Monthly set expenses (burn): ${formatMoney(companyBurn)}`,
    `Cash spent (ledger): ${formatMoney(companySpent)}`,
    `Cash allocated: ${formatMoney(totalAllocated(companyLedger))}`,
    `Revolut company queue pending: ${state.revolutSync?.companyQueue?.length || 0}`,
    '',
    '## Personal · Capacity (operator)',
    `Today One Thing: ${oneThing?.trim() || '(empty)'}`,
    `Deep work today: ${formatMinutes(deepToday)} / target ${formatMinutes(state.dailyDeepWorkTargetMinutes)}`,
    `Open loops: ${openLoops.length}`,
    ...openLoops.slice(0, 10).map((l) => `- ${l.text}`),
    `Body today: sleep=${body?.sleepHours ?? '—'} energy=${body?.energy ?? '—'} trained=${body?.trained ? 'yes' : 'no'}`,
    `Personal spend (ledger total logged): ${formatMoney(personalSpent)}`,
    `Mentor open charges: ${openMentorCharges.length}`,
    ...openMentorCharges.slice(0, 8).map((c) => `- [${c.kind}] ${c.text}`),
    '',
    '## Personal · Horizon',
    `Week intention: ${state.weekIntention?.trim() || '(empty)'}`,
    `Weekly goals: ${(state.weeklyGoals || []).map((g) => `${g.text}${g.hit === true ? ' ✓' : g.hit === false ? ' ✗' : ''}`).join(' | ') || '(none)'}`,
    `Vision goals: ${(state.visionGoals || []).slice(0, 8).map((g) => g.title).join(' | ') || '(none)'}`,
    '',
    '## Chief of Staff memory',
    formatCoSMemory(state.chiefOfStaff),
  ]

  return lines.join('\n')
}

function formatCoSMemory(cos: ChiefOfStaffState | undefined): string {
  if (!cos) return 'No prior CoS state.'
  const latest = cos.latestInsight
  const recentBriefs = (cos.briefs || []).slice(0, 4)
  return [
    `Proactive briefs: ${cos.proactiveEnabled ? 'ON' : 'OFF'} · morning hour ${cos.morningHour}:00 · night hour ${cos.nightHour}:00`,
    latest
      ? `Latest insight: ${latest.summary}\nPatterns: ${latest.patterns.join(' | ') || '-'}\nBlind spots: ${latest.blindSpots.join(' | ') || '-'}\nUnmade decisions: ${latest.unmadeDecisions.join(' | ') || '-'}\nActions: ${latest.actionItems.join(' | ') || '-'}`
      : 'No full scan yet.',
    recentBriefs.length
      ? `Recent briefs:\n${recentBriefs
          .map(
            (b) =>
              `- ${b.date} ${b.slot}${b.readAt ? '' : ' UNREAD'}: ${truncate(b.summary, 160)} · actions: ${b.actionItems.slice(0, 3).join('; ') || '-'}`,
          )
          .join('\n')}`
      : 'No briefs yet.',
  ].join('\n')
}

export function formatBriefCard(brief: CoSBrief): string {
  return [
    `## ${brief.slot === 'morning' ? 'Morning' : 'Night'} brief · ${brief.date}`,
    brief.summary,
    '',
    'Action items:',
    ...(brief.actionItems.length ? brief.actionItems.map((a, i) => `${i + 1}. ${a}`) : ['(none)']),
    '',
    'Blind spots:',
    ...(brief.blindSpots.length ? brief.blindSpots.map((a) => `- ${a}`) : ['(none)']),
    '',
    'Unmade decisions:',
    ...(brief.unmadeDecisions.length
      ? brief.unmadeDecisions.map((a) => `- ${a}`)
      : ['(none)']),
  ].join('\n')
}

export function formatInsightBrief(insight: CoSInsight): string {
  return [
    insight.summary,
    `Patterns: ${(insight.patterns || []).join(' | ') || '-'}`,
    `Blind spots: ${(insight.blindSpots || []).join(' | ') || '-'}`,
    `Unmade decisions: ${(insight.unmadeDecisions || []).join(' | ') || '-'}`,
    `Actions: ${(insight.actionItems || []).join(' | ') || '-'}`,
  ].join('\n')
}
