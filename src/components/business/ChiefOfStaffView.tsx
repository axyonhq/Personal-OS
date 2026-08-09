'use client'

import { useAuth, useSession } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Store } from '../../hooks/useStore'
import {
  buildChiefOfStaffContext,
  formatBriefCard,
} from '../../lib/chiefOfStaff/context'
import { listCompanyTasks } from '../../lib/supabase/companyTodos'
import type { CoSBrief, CompanyTask } from '../../types'
import { todayDateKey, nowMinutesInAppTz } from '../../utils/time'

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

export function ChiefOfStaffView({ store }: { store: Store }) {
  const cos = store.state.chiefOfStaff
  const { userId, isLoaded } = useAuth()
  const { session } = useSession()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'chat' | 'scan' | 'brief' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tasks, setTasks] = useState<CompanyTask[]>([])
  const threadRef = useRef<HTMLDivElement>(null)

  const refreshTasks = useCallback(async () => {
    if (!session || !userId) {
      setTasks([])
      return
    }
    try {
      const rows = await listCompanyTasks(session, userId)
      setTasks(rows)
    } catch {
      setTasks([])
    }
  }, [session, userId])

  useEffect(() => {
    if (!isLoaded) return
    void refreshTasks()
  }, [isLoaded, refreshTasks])

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [cos.messages, busy])

  const context = useMemo(
    () => buildChiefOfStaffContext(store.state, { companyTasks: tasks }),
    [store.state, tasks],
  )

  const unreadBriefs = useMemo(
    () => (cos.briefs || []).filter((b) => !b.readAt).slice(0, 6),
    [cos.briefs],
  )

  const openDecisions = store.state.companyDecisions.filter((d) => d.status === 'open').length
  const openTodos = tasks.filter((t) => !t.parentId && t.status !== 'done' && !t.hidden).length
  const domains = store.state.coldEmailDomains.length

  const sendChat = async (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setError(null)
    setBusy('chat')
    store.appendCoSMessage({ role: 'user', text })

    try {
      await refreshTasks()
      const history = [...store.state.chiefOfStaff.messages]
        .filter((m) => m.role === 'user' || m.role === 'cos')
        .slice(-16)
        .map((m) => ({
          role: m.role === 'cos' ? ('assistant' as const) : ('user' as const),
          content: m.text,
        }))

      const res = await fetch('/api/chief-of-staff/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: buildChiefOfStaffContext(store.state, { companyTasks: tasks }),
          history: history.slice(0, -1),
        }),
      })
      const data = (await res.json()) as { reply?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Chief of Staff unavailable')
      store.appendCoSMessage({ role: 'cos', text: data.reply || '…' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat failed'
      setError(message)
      store.appendCoSMessage({ role: 'system', text: `Chat failed: ${message}` })
    } finally {
      setBusy(null)
    }
  }

  const runScan = async () => {
    if (busy) return
    setError(null)
    setBusy('scan')
    store.appendCoSMessage({
      role: 'system',
      text: 'Full platform scan… company + personal capacity.',
    })
    try {
      await refreshTasks()
      const res = await fetch('/api/chief-of-staff/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: buildChiefOfStaffContext(store.state, { companyTasks: tasks }),
        }),
      })
      const data = (await res.json()) as {
        insight?: {
          summary: string
          patterns: string[]
          blindSpots: string[]
          unmadeDecisions: string[]
          actionItems: string[]
          chatReply: string
        }
        error?: string
      }
      if (!res.ok || !data.insight) throw new Error(data.error || 'Scan failed')
      store.saveCoSInsight({
        summary: data.insight.summary,
        patterns: data.insight.patterns || [],
        blindSpots: data.insight.blindSpots || [],
        unmadeDecisions: data.insight.unmadeDecisions || [],
        actionItems: data.insight.actionItems || [],
        chatReply: data.insight.chatReply,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed'
      setError(message)
      store.appendCoSMessage({ role: 'system', text: `Scan failed: ${message}` })
    } finally {
      setBusy(null)
    }
  }

  const runBriefNow = async (slot: 'morning' | 'night') => {
    if (busy) return
    setError(null)
    setBusy('brief')
    const date = todayDateKey()
    store.appendCoSMessage({
      role: 'system',
      text: `Writing ${slot} brief for ${date}…`,
    })
    try {
      await refreshTasks()
      const res = await fetch('/api/chief-of-staff/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          date,
          context: buildChiefOfStaffContext(store.state, { companyTasks: tasks }),
        }),
      })
      const data = (await res.json()) as {
        brief?: {
          summary: string
          actionItems: string[]
          blindSpots: string[]
          unmadeDecisions: string[]
          chatReply: string
        }
        error?: string
      }
      if (!res.ok || !data.brief) throw new Error(data.error || 'Brief failed')
      store.saveCoSBrief({
        date,
        slot,
        summary: data.brief.summary,
        actionItems: data.brief.actionItems || [],
        blindSpots: data.brief.blindSpots || [],
        unmadeDecisions: data.brief.unmadeDecisions || [],
        chatReply: data.brief.chatReply,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Brief failed'
      setError(message)
      store.appendCoSMessage({ role: 'system', text: `Brief failed: ${message}` })
    } finally {
      setBusy(null)
    }
  }

  const openBrief = (brief: CoSBrief) => {
    store.markCoSBriefRead(brief.id)
    store.appendCoSMessage({
      role: 'system',
      text: `Opened ${brief.slot} brief · ${brief.date}`,
    })
    store.appendCoSMessage({
      role: 'cos',
      text: formatBriefCard(brief),
      briefId: brief.id,
    })
  }

  const currentHour = Math.floor(nowMinutesInAppTz() / 60)

  return (
    <div className="layout-stack cos-view">
      <section className="cos-hero">
        <div className="cos-hero-copy">
          <p className="deck-kicker">Agents · Chief of Staff</p>
          <h2 className="cos-hero-title">Your CoS scans the whole OS.</h2>
          <p className="cos-hero-sub">
            First principles. Simple words. Blind spots, stuck decisions, and the one move that
            matters. Morning + night briefs on by default ({cos.morningHour}:00 / {cos.nightHour}
            :00 Asia/Makassar).
          </p>
        </div>
        <div className="cos-hero-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={!!busy}
            onClick={() => void runScan()}
          >
            {busy === 'scan' ? 'Scanning…' : 'Full platform scan'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!!busy}
            onClick={() => void runBriefNow(currentHour < 14 ? 'morning' : 'night')}
          >
            Brief me now
          </button>
        </div>
      </section>

      <div className="cos-signal-row" aria-label="Platform signals">
        <div className="cos-signal">
          <strong>{openTodos}</strong>
          <span>Open to-dos</span>
        </div>
        <div className="cos-signal">
          <strong>{openDecisions}</strong>
          <span>Open decisions</span>
        </div>
        <div className="cos-signal">
          <strong>{domains}</strong>
          <span>Domains</span>
        </div>
        <div className="cos-signal">
          <strong>{unreadBriefs.length}</strong>
          <span>Unread briefs</span>
        </div>
      </div>

      {error && <p className="cos-error">{error}</p>}

      <div className="cos-layout">
        <section className="cos-chat hud-panel">
          <div className="cos-panel-head">
            <div>
              <h3>Conversation</h3>
              <p className="cos-panel-sub">Ask anything. He already read the dossier.</p>
            </div>
            <label className="cos-toggle">
              <input
                type="checkbox"
                checked={cos.proactiveEnabled}
                onChange={(e) => store.setCoSProactive(e.target.checked)}
              />
              <span>Proactive briefs</span>
            </label>
          </div>

          <div className="cos-thread" ref={threadRef}>
            {cos.messages.map((m) => (
              <div
                key={m.id}
                className={`cos-bubble cos-bubble-${m.role === 'cos' ? 'cos' : m.role}`}
              >
                <span className="cos-bubble-role">
                  {m.role === 'user' ? 'You' : m.role === 'cos' ? 'CoS' : 'System'}
                </span>
                <p>{m.text}</p>
                <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
              </div>
            ))}
            {busy && (
              <div className="cos-bubble cos-bubble-system">
                <span className="cos-bubble-role">System</span>
                <p>{busy === 'chat' ? 'Thinking…' : busy === 'scan' ? 'Scanning…' : 'Writing brief…'}</p>
              </div>
            )}
          </div>

          <form className="cos-compose" onSubmit={(e) => void sendChat(e)}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What am I missing? What should I decide?"
              rows={3}
              disabled={!!busy}
              aria-label="Message Chief of Staff"
            />
            <button type="submit" className="btn-primary" disabled={!!busy || !draft.trim()}>
              Send
            </button>
          </form>
        </section>

        <aside className="cos-side">
          <section className="hud-panel cos-briefs">
            <div className="cos-panel-head">
              <div>
                <h3>Briefs</h3>
                <p className="cos-panel-sub">Morning + night. Auto when the app is open.</p>
              </div>
            </div>
            {cos.briefs.length === 0 ? (
              <p className="finance-empty">No briefs yet. They land at {cos.morningHour}:00 and {cos.nightHour}:00.</p>
            ) : (
              <ul className="cos-brief-list">
                {cos.briefs.slice(0, 8).map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={`cos-brief-item${!b.readAt ? ' unread' : ''}`}
                      onClick={() => openBrief(b)}
                    >
                      <span className="cos-brief-slot">
                        {b.slot} · {b.date}
                        {!b.readAt ? ' · NEW' : ''}
                      </span>
                      <strong>{b.summary}</strong>
                      <em>{b.actionItems.slice(0, 2).join(' · ') || 'No actions'}</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="cos-brief-tools">
              <button
                type="button"
                className="btn-secondary compact"
                disabled={!!busy}
                onClick={() => void runBriefNow('morning')}
              >
                Force morning
              </button>
              <button
                type="button"
                className="btn-secondary compact"
                disabled={!!busy}
                onClick={() => void runBriefNow('night')}
              >
                Force night
              </button>
            </div>
          </section>

          {cos.latestInsight && (
            <section className="hud-panel cos-insight">
              <div className="cos-panel-head">
                <div>
                  <h3>Latest scan</h3>
                  <p className="cos-panel-sub">{formatTime(cos.latestInsight.createdAt)}</p>
                </div>
              </div>
              <p className="cos-insight-summary">{cos.latestInsight.summary}</p>
              <div className="cos-insight-grid">
                <div>
                  <h4>Blind spots</h4>
                  <ul>
                    {cos.latestInsight.blindSpots.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Unmade decisions</h4>
                  <ul>
                    {cos.latestInsight.unmadeDecisions.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Actions</h4>
                  <ul>
                    {cos.latestInsight.actionItems.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <p className="cos-dossier-hint" title={context.slice(0, 500)}>
            Live dossier size: {Math.round(context.length / 1000)}k chars · secrets stripped
          </p>
        </aside>
      </div>
    </div>
  )
}
