'use client'

import { useAuth, useSession } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Store } from '../../hooks/useStore'
import { listCompanyTasks } from '../../lib/supabase/companyTodos'
import type { BusinessTab, CompanyTask } from '../../types'
import { formatMoney, totalMonthlyExpenses } from '../../utils/finance'
import { todayDateKey } from '../../utils/time'

type Props = {
  store: Store
  onNavigate: (tab: BusinessTab) => void
}

function pickOneThing(tasks: CompanyTask[]): CompanyTask | null {
  const roots = tasks.filter((t) => !t.parentId && t.status !== 'done' && !t.hidden)
  const inProgress = roots.find((t) => t.status === 'in_progress')
  if (inProgress) return inProgress
  const doFirst = roots
    .filter((t) => t.priority === 'do')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
  if (doFirst[0]) return doFirst[0]
  const any = roots.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
  )
  return any[0] ?? null
}

export function CommandDeckView({ store, onNavigate }: Props) {
  const { userId, isLoaded } = useAuth()
  const { session } = useSession()
  const [tasks, setTasks] = useState<CompanyTask[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session || !userId) return
    setLoading(true)
    try {
      const rows = await listCompanyTasks(session, userId)
      setTasks(rows)
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [session, userId])

  useEffect(() => {
    if (!isLoaded) return
    if (!userId || !session) {
      setLoading(false)
      return
    }
    void refresh()
  }, [isLoaded, userId, session, refresh])

  const oneThing = useMemo(() => pickOneThing(tasks), [tasks])
  const openTodos = useMemo(
    () => tasks.filter((t) => !t.parentId && t.status !== 'done' && !t.hidden),
    [tasks],
  )
  const inProgress = useMemo(
    () => openTodos.filter((t) => t.status === 'in_progress'),
    [openTodos],
  )

  const domains = store.state.coldEmailDomains
  const domainCount = domains.length
  const mailboxCount = domains.reduce((n, d) => n + d.mailboxes.length, 0)
  const openDecisions = store.state.companyDecisions.filter((d) => d.status === 'open')
  const ideasCount = store.state.companyIdeas.length
  const docsCount = store.state.companyDocuments.length
  const ledger = store.financeFor('company')
  const monthlyBurn = totalMonthlyExpenses(ledger)
  const today = todayDateKey()

  const fronts = useMemo(() => {
    const fromTodos = inProgress.slice(0, 3).map((t) => ({
      id: t.id,
      kind: 'todo' as const,
      title: t.title,
      meta: t.priority === 'do' ? 'Do now' : t.priority,
    }))
    if (fromTodos.length >= 3) return fromTodos
    const fromDecisions = openDecisions
      .slice()
      .sort((a, b) => a.decideBy.localeCompare(b.decideBy))
      .slice(0, 3 - fromTodos.length)
      .map((d) => ({
        id: d.id,
        kind: 'decision' as const,
        title: d.title,
        meta:
          d.decideBy < today
            ? 'Overdue'
            : d.decideBy === today
              ? 'Decide today'
              : `By ${d.decideBy}`,
      }))
    return [...fromTodos, ...fromDecisions]
  }, [inProgress, openDecisions, today])

  const metricBars = [
    {
      label: 'Domains',
      value: String(domainCount),
      hint: domainCount === 0 ? 'Not started' : 'Cold email',
      tone: domainCount === 0 ? 'danger' : 'ok',
      progress: Math.min(1, domainCount / 25),
      tab: 'coldEmail' as BusinessTab,
    },
    {
      label: 'Mailboxes live',
      value: String(mailboxCount),
      hint: mailboxCount === 0 ? 'None yet' : 'Sending seats',
      tone: mailboxCount === 0 ? 'warn' : mailboxCount >= 40 ? 'ok' : 'warn',
      progress: Math.min(1, mailboxCount / 100),
      tab: 'coldEmail' as BusinessTab,
    },
    {
      label: 'Open decisions',
      value: String(openDecisions.length),
      hint: openDecisions.length === 0 ? 'Clear' : 'In the gate',
      tone: openDecisions.length === 0 ? 'ok' : openDecisions.length > 3 ? 'warn' : 'info',
      progress: Math.min(1, openDecisions.length / 5),
      tab: 'decisions' as BusinessTab,
    },
    {
      label: 'Monthly burn',
      value: formatMoney(monthlyBurn),
      hint: 'Set expenses',
      tone: 'info',
      progress: monthlyBurn > 0 ? 0.55 : 0.08,
      tab: 'finance' as BusinessTab,
    },
  ]

  return (
    <div className="command-deck">
      <section className="deck-hero">
        <div className="deck-hero-glow" aria-hidden="true" />
        <p className="deck-kicker">The one thing · Today</p>
        {loading ? (
          <h2 className="deck-hero-title deck-muted">Loading priorities…</h2>
        ) : oneThing ? (
          <>
            <h2 className="deck-hero-title">{oneThing.title}</h2>
            <p className="deck-hero-copy">
              {oneThing.status === 'in_progress'
                ? 'Already in motion. Protect this until it ships.'
                : 'Highest-leverage open company task. Start it, or pick another from To-Dos.'}
            </p>
          </>
        ) : (
          <>
            <h2 className="deck-hero-title">No open company task yet</h2>
            <p className="deck-hero-copy">
              Capture the single outcome that moves AXYON today. Everything else waits.
            </p>
          </>
        )}
        <div className="deck-hero-actions">
          <button type="button" className="btn-primary" onClick={() => onNavigate('todos')}>
            {oneThing ? 'Open to-dos →' : 'Add a to-do →'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => onNavigate('decisions')}>
            Decision gate
          </button>
        </div>
      </section>

      <section className="deck-metrics" aria-label="Company pulse">
        {metricBars.map((m) => (
          <button
            key={m.label}
            type="button"
            className={`deck-metric tone-${m.tone}`}
            onClick={() => onNavigate(m.tab)}
          >
            <span className="deck-metric-label">{m.label}</span>
            <strong className="deck-metric-value">{m.value}</strong>
            <span className="deck-metric-hint">{m.hint}</span>
            <span className="deck-metric-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(m.progress * 100)}%` }} />
            </span>
          </button>
        ))}
      </section>

      <section className="deck-fronts">
        <header className="deck-fronts-head">
          <h3>Active fronts</h3>
          <span>
            {fronts.length} OPEN · MAX 3
          </span>
        </header>
        {fronts.length === 0 ? (
          <p className="deck-empty">
            No active fronts. Start a to-do or park a decision in the gate.
          </p>
        ) : (
          <ul className="deck-front-list">
            {fronts.map((f) => (
              <li key={`${f.kind}-${f.id}`}>
                <button
                  type="button"
                  className="deck-front-item"
                  onClick={() => onNavigate(f.kind === 'todo' ? 'todos' : 'decisions')}
                >
                  <span className={`deck-front-kind kind-${f.kind}`}>
                    {f.kind === 'todo' ? 'Task' : 'Decide'}
                  </span>
                  <span className="deck-front-title">{f.title}</span>
                  <span className="deck-front-meta">{f.meta}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="deck-vault-strip" aria-label="Vault snapshot">
        <button type="button" className="deck-vault-chip" onClick={() => onNavigate('ideas')}>
          <em>Ideas</em>
          <strong>{ideasCount}</strong>
        </button>
        <button type="button" className="deck-vault-chip" onClick={() => onNavigate('documents')}>
          <em>Docs</em>
          <strong>{docsCount}</strong>
        </button>
        <button type="button" className="deck-vault-chip" onClick={() => onNavigate('logins')}>
          <em>Logins</em>
          <strong>{store.state.companyLogins.length}</strong>
        </button>
        <button type="button" className="deck-vault-chip" onClick={() => onNavigate('finance')}>
          <em>Finance</em>
          <strong>{formatMoney(monthlyBurn)}/mo</strong>
        </button>
      </section>
    </div>
  )
}
