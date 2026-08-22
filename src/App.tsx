'use client'

import { UserButton } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { AutopilotView } from './components/AutopilotView'
import { CalendarView } from './components/CalendarView'
import { DashboardView } from './components/DashboardView'
import { DeepWorkTimerHost } from './components/DeepWorkTimerHost'
import { FinancesView } from './components/FinancesView'
import { MentorView } from './components/MentorView'
import { SyncStatus } from './components/SyncStatus'
import { TasksView } from './components/TasksView'
import { VisionView } from './components/VisionView'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { ModalPortal } from './components/ui/ModalPortal'
import { useStore } from './hooks/useStore'
import type { AppTab, DeepWorkId, ProjectId } from './types'
import { formatLongDate, formatMinutes, todayDateKey } from './utils/time'

const PERSONAL_TABS: {
  id: AppTab
  label: string
  shortLabel: string
  mark: string
  sub: string
  enabled?: boolean
}[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', mark: 'H', sub: 'Command Center' },
  { id: 'vision', label: 'Vision', shortLabel: 'Vision', mark: 'V', sub: 'Horizon' },
  { id: 'autopilot', label: 'Autopilot', shortLabel: 'Auto', mark: 'A', sub: 'Set paths' },
  { id: 'calendar', label: 'Calendar', shortLabel: 'Cal', mark: 'C', sub: 'Schedule' },
  { id: 'tasks', label: 'Tasks', shortLabel: 'Tasks', mark: 'T', sub: 'Projects' },
  {
    id: 'personalFinances',
    label: 'Money',
    shortLabel: 'Money',
    mark: '$',
    sub: 'Personal Finances',
  },
  { id: 'mentor', label: 'Mentor', shortLabel: 'Mentor', mark: 'M', sub: 'Synthesis' },
]

/** Phone bottom bar — everything else lives in More. */
const PERSONAL_PRIMARY: AppTab[] = ['dashboard', 'tasks', 'autopilot', 'mentor']
const PERSONAL_MORE: AppTab[] = ['vision', 'calendar', 'personalFinances']

function NavGlyph({ kind, mark }: { kind: string; mark: string }) {
  return (
    <span className={`nav-glyph nav-glyph-${kind}`} aria-hidden="true">
      <span className="nav-glyph-core" />
      <span className="nav-glyph-mark">{mark}</span>
    </span>
  )
}

export default function App() {
  const store = useStore()
  const [pendingSession, setPendingSession] = useState<ProjectId | null>(null)
  const [pendingSessionMinimized, setPendingSessionMinimized] = useState(false)
  const [pendingFocusNote, setPendingFocusNote] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [moreOpen])

  const tab = store.state.activeTab
  const activePersonal = PERSONAL_TABS.find((t) => t.id === tab) ?? PERSONAL_TABS[0]
  const personalMoreActive = PERSONAL_MORE.includes(tab)

  const deepToday = store.deepWorkMinutesForDate(store.state.selectedDate)
  const targetHit = store.hitTarget(store.state.selectedDate)
  const allTime = store.minutesFor('all', 'total')

  const clearPendingSession = useCallback(() => {
    setPendingSession(null)
    setPendingSessionMinimized(false)
    setPendingFocusNote('')
  }, [])

  const openTasks = () => {
    store.setActiveTab('tasks')
    store.setSelectedDate(todayDateKey())
  }

  const startSession = (projectId: DeepWorkId | ProjectId) => {
    store.setSelectedDate(todayDateKey())
    openTasks()
    setPendingSessionMinimized(false)
    setPendingFocusNote('')
    setPendingSession(projectId)
  }

  const startPersonalMinimized = (focusNote: string) => {
    setPendingSessionMinimized(true)
    setPendingFocusNote(focusNote)
    setPendingSession('personal')
  }

  const browseKey = `per:${tab}`
  const pageTitle = activePersonal.label
  const pageSub = activePersonal.sub

  const personalPrimaryTabs = PERSONAL_TABS.filter((t) => PERSONAL_PRIMARY.includes(t.id))
  const personalMoreTabs = PERSONAL_TABS.filter((t) => PERSONAL_MORE.includes(t.id))

  return (
    <div className="app-shell app-shell-rail layer-personal">
      <aside className="app-rail" aria-label="Command Center navigation">
        <div className="rail-brand">
          <span className="rail-mark" aria-hidden="true">
            <span className="rail-mark-core" />
          </span>
          <div className="rail-brand-copy">
            <span className="brand-name">COMMAND</span>
            <span className="brand-sub">Center</span>
          </div>
        </div>

        {/* Desktop: full vertical list */}
        <nav
          className="rail-nav rail-nav-desktop"
          role="tablist"
          aria-label="Command Center sections"
        >
          {PERSONAL_TABS.map((t) => {
            const enabled = t.enabled !== false
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`rail-item${tab === t.id ? ' active' : ''}${enabled ? '' : ' disabled'}`}
                disabled={!enabled}
                onClick={() => {
                  if (enabled) store.setActiveTab(t.id)
                }}
              >
                <NavGlyph kind={t.id} mark={t.mark} />
                <span className="rail-item-label">{t.label}</span>
                {!enabled && <span className="tab-soon">Soon</span>}
              </button>
            )
          })}
        </nav>

        {/* Phone: 4 primary + More */}
        <nav
          className="rail-nav rail-nav-mobile"
          role="tablist"
          aria-label="Command Center sections"
        >
          {personalPrimaryTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`rail-item${tab === t.id ? ' active' : ''}`}
              onClick={() => {
                setMoreOpen(false)
                store.setActiveTab(t.id)
              }}
            >
              <NavGlyph kind={t.id} mark={t.mark} />
              <span className="rail-item-label">{t.shortLabel}</span>
            </button>
          ))}
          <button
            type="button"
            className={`rail-item rail-item-more${moreOpen || personalMoreActive ? ' active' : ''}`}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-sheet"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <NavGlyph kind="more" mark="+" />
            <span className="rail-item-label">More</span>
          </button>
        </nav>
      </aside>

      <div className="app-stage">
        <header className="command-bar">
          <div className="brand-lockup stage-title">
            <span className="brand-name">{pageTitle}</span>
            <span className="brand-sub desktop-only">{pageSub}</span>
          </div>
          <div className="status-pills">
            <span className="status-pill status-pill-date">{formatLongDate(store.state.selectedDate)}</span>
            {(tab === 'calendar' || tab === 'tasks') && (
              <>
                <span className={`status-pill desktop-only ${targetHit ? 'hit' : 'miss'}`}>
                  DEEP <strong>{formatMinutes(deepToday)}</strong>
                  <span style={{ opacity: 0.7 }}>
                    {' '}
                    / {formatMinutes(store.state.dailyDeepWorkTargetMinutes)}
                  </span>
                </span>
                <span className="status-pill desktop-only">
                  STREAK <strong>{store.targetStreak}</strong>
                </span>
                <span className="status-pill desktop-only">
                  TOTAL <strong>{formatMinutes(allTime)}</strong>
                </span>
                {store.state.activeTimer && (
                  <span className={`status-pill desktop-only${store.isTimerPaused ? ' paused' : ' live'}`}>
                    {store.isTimerPaused ? '⏸ PAUSED' : '● LIVE'}
                  </span>
                )}
              </>
            )}
            <button
              className="ghost-btn desktop-only"
              type="button"
              title="Resets deep-work data only — finances are kept"
              onClick={() => setResetOpen(true)}
            >
              Reset work
            </button>
            <button
              className="ghost-btn desktop-only"
              type="button"
              title="Force-upload everything in this browser to Supabase under your account"
              onClick={() => void store.pushBrowserToCloud()}
              disabled={store.cloudSync === 'loading'}
            >
              Upload → cloud
            </button>
            <SyncStatus store={store} />
            <UserButton />
          </div>
        </header>

        <main className="app-content" key={browseKey}>
          {tab === 'dashboard' && <DashboardView store={store} onStartProject={startSession} />}
          {tab === 'vision' && <VisionView store={store} />}
          {tab === 'autopilot' && (
            <AutopilotView store={store} onStartPersonalMinimized={startPersonalMinimized} />
          )}
          {tab === 'calendar' && <CalendarView store={store} />}
          {tab === 'tasks' && <TasksView store={store} onStartSession={startSession} />}
          {tab === 'personalFinances' && <FinancesView store={store} />}
          {tab === 'mentor' && <MentorView store={store} />}
        </main>
      </div>

      {moreOpen && (
        <ModalPortal>
          <div className="mobile-more-root" id="mobile-more-sheet">
            <button
              type="button"
              className="mobile-more-backdrop"
              aria-label="Close menu"
              onClick={() => setMoreOpen(false)}
            />
            <div className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="More">
              <div className="mobile-more-handle" aria-hidden="true" />
              <p className="mobile-more-title">More</p>
              <div className="mobile-more-list">
                {personalMoreTabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`mobile-more-item${tab === t.id ? ' active' : ''}`}
                    onClick={() => {
                      store.setActiveTab(t.id)
                      setMoreOpen(false)
                    }}
                  >
                    <NavGlyph kind={t.id} mark={t.mark} />
                    <span>
                      <strong>{t.label}</strong>
                      <em>{t.sub}</em>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="mobile-more-item"
                  onClick={() => {
                    setMoreOpen(false)
                    setResetOpen(true)
                  }}
                >
                  <NavGlyph kind="reset" mark="R" />
                  <span>
                    <strong>Reset work</strong>
                    <em>Deep-work data only</em>
                  </span>
                </button>
                <button
                  type="button"
                  className="mobile-more-item"
                  disabled={store.cloudSync === 'loading'}
                  onClick={() => {
                    void store.pushBrowserToCloud()
                    setMoreOpen(false)
                  }}
                >
                  <NavGlyph kind="cloud" mark="↑" />
                  <span>
                    <strong>Upload → cloud</strong>
                    <em>
                      {store.cloudSync === 'ready'
                        ? 'Synced'
                        : store.cloudSync === 'error'
                          ? store.cloudError || 'Sync error'
                          : 'Force push to Supabase'}
                    </em>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <DeepWorkTimerHost
        store={store}
        pendingSession={pendingSession}
        pendingSessionMinimized={pendingSessionMinimized}
        pendingFocusNote={pendingFocusNote}
        onPendingSessionHandled={clearPendingSession}
        browseKey={browseKey}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Reset deep work"
        message="Reset deep-work data (tasks, timers, habits)? Finances are kept."
        confirmLabel="Reset work"
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false)
          store.resetToSeed()
        }}
      />
    </div>
  )
}
