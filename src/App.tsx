'use client'

import { UserButton } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { AxyonMark } from './components/brand/AxyonMark'
import { ColdEmailView } from './components/business/ColdEmailView'
import { CommandDeckView } from './components/business/CommandDeckView'
import { CompanyDecisionGateView } from './components/business/CompanyDecisionGateView'
import { CompanyDocumentsView } from './components/business/CompanyDocumentsView'
import { CompanyIdeasView } from './components/business/CompanyIdeasView'
import { CompanyLoginsView } from './components/business/CompanyLoginsView'
import { CompanyTodosView } from './components/business/CompanyTodosView'
import { AutopilotView } from './components/AutopilotView'
import { CalendarView } from './components/CalendarView'
import { DashboardView } from './components/DashboardView'
import { DeepWorkTimerHost } from './components/DeepWorkTimerHost'
import { FinancesView } from './components/FinancesView'
import { LayerGate } from './components/LayerGate'
import { MentorView } from './components/MentorView'
import { TasksView } from './components/TasksView'
import { VisionView } from './components/VisionView'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { ModalPortal } from './components/ui/ModalPortal'
import { useStore } from './hooks/useStore'
import type { AppLayer, AppTab, BusinessTab, DeepWorkId, ProjectId } from './types'
import { formatLongDate, formatMinutes, todayDateKey } from './utils/time'

const LAYER_KEY = 'batcave-app-layer-v1'
const BUSINESS_TAB_KEY = 'batcave-business-tab-v1'

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
    label: 'Personal Finances',
    shortLabel: 'Money',
    mark: '$',
    sub: 'Personal Finances',
  },
  { id: 'mentor', label: 'Mentor', shortLabel: 'Mentor', mark: 'M', sub: 'Synthesis' },
]

/** Phone bottom bar — everything else lives in More. */
const PERSONAL_PRIMARY: AppTab[] = ['dashboard', 'tasks', 'autopilot', 'mentor']
const PERSONAL_MORE: AppTab[] = ['vision', 'calendar', 'personalFinances']

type BusinessNavItem = {
  id: BusinessTab
  label: string
  shortLabel: string
  mark: string
  enabled: boolean
  group: 'deck' | 'build' | 'machine' | 'vault'
  sub: string
}

const BUSINESS_TABS: BusinessNavItem[] = [
  {
    id: 'commandDeck',
    label: 'Command Deck',
    shortLabel: 'Deck',
    mark: '✦',
    enabled: true,
    group: 'deck',
    sub: 'Pulse',
  },
  {
    id: 'todos',
    label: 'To-Dos',
    shortLabel: 'To-Dos',
    mark: 'T',
    enabled: true,
    group: 'deck',
    sub: 'Execution',
  },
  {
    id: 'decisions',
    label: 'Decision Gate',
    shortLabel: 'Decide',
    mark: 'G',
    enabled: true,
    group: 'deck',
    sub: 'Open loops',
  },
  {
    id: 'ideas',
    label: 'Ideas',
    shortLabel: 'Ideas',
    mark: 'I',
    enabled: true,
    group: 'build',
    sub: 'Brain dump',
  },
  {
    id: 'coldEmail',
    label: 'Cold Email',
    shortLabel: 'Email',
    mark: 'E',
    enabled: true,
    group: 'build',
    sub: 'Domains & mailboxes',
  },
  {
    id: 'metaAds',
    label: 'Meta Ads',
    shortLabel: 'Ads',
    mark: 'A',
    enabled: false,
    group: 'machine',
    sub: 'Coming soon',
  },
  {
    id: 'agents',
    label: 'Agents',
    shortLabel: 'Agents',
    mark: 'N',
    enabled: false,
    group: 'machine',
    sub: 'Coming soon',
  },
  {
    id: 'documents',
    label: 'Documents',
    shortLabel: 'Docs',
    mark: 'D',
    enabled: true,
    group: 'vault',
    sub: 'Library',
  },
  {
    id: 'logins',
    label: 'Logins',
    shortLabel: 'Logins',
    mark: 'L',
    enabled: true,
    group: 'vault',
    sub: 'Credentials',
  },
  {
    id: 'finance',
    label: 'Finance',
    shortLabel: 'Finance',
    mark: '$',
    enabled: true,
    group: 'vault',
    sub: 'Cash & burn',
  },
]

const BUSINESS_NAV_GROUPS: { id: BusinessNavItem['group']; label: string }[] = [
  { id: 'deck', label: 'Deck' },
  { id: 'build', label: 'Build' },
  { id: 'machine', label: 'Machine' },
  { id: 'vault', label: 'Vault' },
]

const BUSINESS_PRIMARY: BusinessTab[] = ['commandDeck', 'todos', 'finance', 'ideas']
const BUSINESS_MORE: BusinessTab[] = ['decisions', 'coldEmail', 'documents', 'logins']

const BUSINESS_TAB_IDS = new Set<BusinessTab>(BUSINESS_TABS.map((t) => t.id))

function readLayer(): AppLayer {
  try {
    const raw = localStorage.getItem(LAYER_KEY)
    if (raw === 'personal' || raw === 'business' || raw === 'gate') return raw
  } catch {
    // ignore
  }
  return 'gate'
}

function writeLayer(layer: AppLayer) {
  try {
    localStorage.setItem(LAYER_KEY, layer)
  } catch {
    // ignore
  }
}

function readBusinessTab(): BusinessTab {
  try {
    const raw = localStorage.getItem(BUSINESS_TAB_KEY)
    if (raw && BUSINESS_TAB_IDS.has(raw as BusinessTab)) {
      const tab = BUSINESS_TABS.find((t) => t.id === raw)
      if (tab?.enabled) return raw as BusinessTab
    }
  } catch {
    // ignore
  }
  return 'commandDeck'
}

function writeBusinessTab(tab: BusinessTab) {
  try {
    localStorage.setItem(BUSINESS_TAB_KEY, tab)
  } catch {
    // ignore
  }
}

function requestDocsLeave(proceed: () => void) {
  window.dispatchEvent(
    new CustomEvent('batcave:docs-leave', {
      detail: { proceed },
    }),
  )
}

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
  const [layer, setLayer] = useState<AppLayer>('gate')
  const [businessTab, setBusinessTab] = useState<BusinessTab>('commandDeck')
  const [pendingSession, setPendingSession] = useState<ProjectId | null>(null)
  const [pendingSessionMinimized, setPendingSessionMinimized] = useState(false)
  const [pendingFocusNote, setPendingFocusNote] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [docsDirty, setDocsDirty] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [clockLabel, setClockLabel] = useState('')

  useEffect(() => {
    setLayer(readLayer())
    setBusinessTab(readBusinessTab())
    setHydrated(true)
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const day = now
        .toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
        .toUpperCase()
      const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      setClockLabel(`${day} · ${time}`)
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    writeLayer(layer)
  }, [layer, hydrated])

  useEffect(() => {
    if (!hydrated) return
    writeBusinessTab(businessTab)
  }, [businessTab, hydrated])

  useEffect(() => {
    if (layer === 'personal' && store.state.activeTab === 'companyFinances') {
      store.setActiveTab('personalFinances')
    }
  }, [layer, store])

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

  const tab = store.state.activeTab === 'companyFinances' ? 'personalFinances' : store.state.activeTab
  const activePersonal = PERSONAL_TABS.find((t) => t.id === tab) ?? PERSONAL_TABS[0]
  const activeBusiness = BUSINESS_TABS.find((t) => t.id === businessTab) ?? BUSINESS_TABS[0]
  const personalMoreActive = PERSONAL_MORE.includes(tab)
  const businessMoreActive = BUSINESS_MORE.includes(businessTab)
  const businessSoon = BUSINESS_TABS.filter((t) => !t.enabled)
  const businessMoreTabs = BUSINESS_TABS.filter((t) => BUSINESS_MORE.includes(t.id) && t.enabled)

  const deepToday = store.deepWorkMinutesForDate(store.state.selectedDate)
  const targetHit = store.hitTarget(store.state.selectedDate)
  const allTime = store.minutesFor('all', 'total')

  const clearPendingSession = useCallback(() => {
    setPendingSession(null)
    setPendingSessionMinimized(false)
    setPendingFocusNote('')
  }, [])

  const openTasks = () => {
    if (layer !== 'personal') setLayer('personal')
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

  const leaveDocumentsIfNeeded = useCallback(
    (proceed: () => void) => {
      if (layer === 'business' && businessTab === 'documents' && docsDirty) {
        requestDocsLeave(proceed)
        return
      }
      proceed()
    },
    [layer, businessTab, docsDirty],
  )

  const enterPersonal = () => {
    if (store.state.activeTab === 'companyFinances') store.setActiveTab('dashboard')
    setLayer('personal')
  }

  const enterBusiness = () => {
    setBusinessTab((t) => (t === 'metaAds' || t === 'agents' ? 'commandDeck' : t))
    setLayer('business')
  }

  const switchLayerToGate = () => {
    leaveDocumentsIfNeeded(() => {
      setDocsDirty(false)
      setMoreOpen(false)
      setLayer('gate')
    })
  }

  const switchBusinessTab = (next: BusinessTab) => {
    if (next === businessTab) return
    leaveDocumentsIfNeeded(() => {
      setDocsDirty(false)
      setBusinessTab(next)
      setMoreOpen(false)
    })
  }

  const browseKey =
    layer === 'business' ? `biz:${businessTab}` : layer === 'personal' ? `per:${tab}` : 'gate'

  if (!hydrated) {
    return <div className="app-shell layer-loading">Loading…</div>
  }

  if (layer === 'gate') {
    return (
      <div className="app-shell gate-shell gate-shell-bare">
        <LayerGate
          onEnterPersonal={enterPersonal}
          onEnterBusiness={enterBusiness}
          accountSlot={<UserButton />}
        />
      </div>
    )
  }

  const isBusiness = layer === 'business'
  const pageTitle = isBusiness ? activeBusiness.label : activePersonal.label
  const pageSub = activePersonal.sub

  const personalPrimaryTabs = PERSONAL_TABS.filter((t) => PERSONAL_PRIMARY.includes(t.id))
  const personalMoreTabs = PERSONAL_TABS.filter((t) => PERSONAL_MORE.includes(t.id))
  const businessPrimaryTabs = BUSINESS_TABS.filter((t) => BUSINESS_PRIMARY.includes(t.id))

  return (
    <div className={`app-shell app-shell-rail${isBusiness ? ' layer-business' : ' layer-personal'}`}>
      <aside className="app-rail" aria-label={isBusiness ? 'AXYON navigation' : 'Command Center navigation'}>
        <div className="rail-brand">
          {isBusiness ? (
            <>
              <AxyonMark size={34} className="rail-axyon-mark" />
              <div className="rail-brand-copy">
                <span className="brand-name axyon-wordmark">AXYON</span>
                <span className="brand-sub">Company OS</span>
              </div>
            </>
          ) : (
            <>
              <span className="rail-mark" aria-hidden="true">
                <span className="rail-mark-core" />
              </span>
              <div className="rail-brand-copy">
                <span className="brand-name">COMMAND</span>
                <span className="brand-sub">Center</span>
              </div>
            </>
          )}
        </div>

        {/* Desktop: full vertical list */}
        <nav
          className="rail-nav rail-nav-desktop"
          role="tablist"
          aria-label={isBusiness ? 'AXYON sections' : 'Command Center sections'}
        >
          {isBusiness
            ? BUSINESS_NAV_GROUPS.map((group) => {
                const items = BUSINESS_TABS.filter((t) => t.group === group.id)
                return (
                  <div key={group.id} className="rail-group">
                    <p className="rail-group-label">{group.label}</p>
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={businessTab === t.id}
                        className={`rail-item${businessTab === t.id ? ' active' : ''}${t.enabled ? '' : ' disabled'}`}
                        disabled={!t.enabled}
                        onClick={() => {
                          if (t.enabled) switchBusinessTab(t.id)
                        }}
                      >
                        <span className="rail-active-pip" aria-hidden="true" />
                        <NavGlyph kind={t.id} mark={t.mark} />
                        <span className="rail-item-label">{t.label}</span>
                        {!t.enabled && <span className="tab-soon">Soon</span>}
                      </button>
                    ))}
                  </div>
                )
              })
            : PERSONAL_TABS.map((t) => {
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
          aria-label={isBusiness ? 'AXYON sections' : 'Command Center sections'}
        >
          {isBusiness
            ? businessPrimaryTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={businessTab === t.id}
                  className={`rail-item${businessTab === t.id ? ' active' : ''}`}
                  onClick={() => switchBusinessTab(t.id)}
                >
                  <NavGlyph kind={t.id} mark={t.mark} />
                  <span className="rail-item-label">{t.shortLabel}</span>
                </button>
              ))
            : personalPrimaryTabs.map((t) => (
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
            className={`rail-item rail-item-more${moreOpen || (!isBusiness && personalMoreActive) || (isBusiness && businessMoreActive) ? ' active' : ''}`}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-sheet"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <NavGlyph kind="more" mark="+" />
            <span className="rail-item-label">More</span>
          </button>
        </nav>

        <div className="rail-foot rail-foot-desktop">
          {isBusiness && (
            <div className="rail-systems-live" aria-live="polite">
              <span className="rail-systems-dot" aria-hidden="true" />
              <span>All systems live</span>
            </div>
          )}
          <button type="button" className="rail-switch" onClick={switchLayerToGate}>
            <span className="rail-switch-kicker">Layer</span>
            <span className="rail-switch-label">Switch layer</span>
          </button>
        </div>
      </aside>

      <div className="app-stage">
        <header className={`command-bar${isBusiness ? ' axyon-command-bar' : ''}`}>
          <div className="brand-lockup stage-title">
            {isBusiness ? (
              <>
                <span className="brand-crumb desktop-only">Axyon</span>
                <span className="brand-crumb-sep desktop-only" aria-hidden="true">
                  /
                </span>
                <span className="brand-name">{pageTitle}</span>
              </>
            ) : (
              <>
                <span className="brand-name">{pageTitle}</span>
                <span className="brand-sub desktop-only">{pageSub}</span>
              </>
            )}
          </div>
          <div className="status-pills">
            {isBusiness ? (
              <>
                <span className="status-pill status-pill-date desktop-only">{clockLabel}</span>
                <button
                  type="button"
                  className="ghost-btn desktop-only"
                  title="Force-upload personal OS browser state to Supabase"
                  onClick={() => void store.pushBrowserToCloud()}
                  disabled={store.cloudSync === 'loading'}
                >
                  Upload → cloud
                </button>
                {store.cloudSync === 'ready' && (
                  <span className="status-pill hit desktop-only">CLOUD</span>
                )}
                {store.cloudSync === 'error' && (
                  <span className="status-pill miss desktop-only" title={store.cloudError || 'Cloud sync error'}>
                    SYNC ERR
                  </span>
                )}
                <UserButton />
              </>
            ) : (
              <>
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
                {store.cloudSync === 'loading' && (
                  <span className="status-pill desktop-only" title="Loading cloud state">
                    SYNC…
                  </span>
                )}
                {store.cloudSync === 'ready' && (
                  <span className="status-pill hit desktop-only" title="Saved to Supabase">
                    CLOUD
                  </span>
                )}
                {store.cloudSync === 'error' && (
                  <span className="status-pill miss desktop-only" title={store.cloudError || 'Cloud sync error'}>
                    SYNC ERR
                  </span>
                )}
                <UserButton />
              </>
            )}
          </div>
        </header>

        <main className="app-content" key={browseKey}>
          {isBusiness ? (
            <>
              {businessTab === 'commandDeck' && (
                <CommandDeckView store={store} onNavigate={switchBusinessTab} />
              )}
              {businessTab === 'todos' && <CompanyTodosView />}
              {businessTab === 'finance' && <FinancesView store={store} realm="company" />}
              {businessTab === 'documents' && (
                <CompanyDocumentsView store={store} onDirtyChange={setDocsDirty} />
              )}
              {businessTab === 'ideas' && <CompanyIdeasView store={store} />}
              {businessTab === 'logins' && <CompanyLoginsView store={store} />}
              {businessTab === 'decisions' && <CompanyDecisionGateView store={store} />}
              {businessTab === 'coldEmail' && <ColdEmailView store={store} />}
            </>
          ) : (
            <>
              {tab === 'dashboard' && <DashboardView store={store} onStartProject={startSession} />}
              {tab === 'vision' && <VisionView store={store} />}
              {tab === 'autopilot' && (
                <AutopilotView store={store} onStartPersonalMinimized={startPersonalMinimized} />
              )}
              {tab === 'calendar' && <CalendarView store={store} />}
              {tab === 'tasks' && <TasksView store={store} onStartSession={startSession} />}
              {tab === 'personalFinances' && <FinancesView store={store} realm="personal" />}
              {tab === 'mentor' && <MentorView store={store} />}
            </>
          )}
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
                {!isBusiness &&
                  personalMoreTabs.map((t) => (
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
                {isBusiness &&
                  businessMoreTabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`mobile-more-item${businessTab === t.id ? ' active' : ''}`}
                      onClick={() => switchBusinessTab(t.id)}
                    >
                      <NavGlyph kind={t.id} mark={t.mark} />
                      <span>
                        <strong>{t.label}</strong>
                        <em>{t.sub}</em>
                      </span>
                    </button>
                  ))}
                {isBusiness &&
                  businessSoon.map((t) => (
                    <button key={t.id} type="button" className="mobile-more-item disabled" disabled>
                      <NavGlyph kind={t.id} mark={t.mark} />
                      <span>
                        <strong>{t.label}</strong>
                        <em>Coming soon</em>
                      </span>
                    </button>
                  ))}
                <button type="button" className="mobile-more-item" onClick={switchLayerToGate}>
                  <NavGlyph kind="layers" mark="L" />
                  <span>
                    <strong>Switch layer</strong>
                    <em>Personal ↔ AXYON</em>
                  </span>
                </button>
                {!isBusiness && (
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
                )}
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
        message="Reset deep-work data (tasks, timers, habits)? Personal and company finances are kept."
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
