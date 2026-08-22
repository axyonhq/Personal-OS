'use client'

import { UserButton } from '@clerk/nextjs'
import { Cloud, Command, Download, RotateCcw, Upload } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { DataBackup } from './components/DataBackup'
import { DeepWorkTimerHost } from './components/DeepWorkTimerHost'
import { MoreIcon, MORE_TABS, NAV_ITEMS, PRIMARY_TABS, navItem } from './components/nav'
import { Onboarding } from './components/Onboarding'
import { SessionActionsProvider } from './components/SessionActions'
import { SyncStatus } from './components/SyncStatus'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { IconButton } from './components/ui/Button'
import { ModalPortal } from './components/ui/ModalPortal'
import { useToast } from './components/ui/Toast'
import { useNavigateTab } from './hooks/useNavigateTab'
import { useStore } from './hooks/useStore'
import type { DeepWorkId, ProjectId } from './types'
import { triggerBackupDownload } from './utils/backup'
import { tabFromPathname } from './utils/tabPath'
import { formatLongDate, todayDateKey } from './utils/time'

export default function App({ children }: { children: ReactNode }) {
  const store = useStore()
  const navigateTab = useNavigateTab()
  const pathname = usePathname()
  const { toast } = useToast()
  const importRef = useRef<HTMLInputElement>(null)
  const [pendingSession, setPendingSession] = useState<ProjectId | null>(null)
  const [pendingSessionMinimized, setPendingSessionMinimized] = useState(false)
  const [pendingFocusNote, setPendingFocusNote] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // URL is the source of truth. Back, forward and a pasted link all land here.
  useEffect(() => {
    const fromUrl = tabFromPathname(pathname)
    if (fromUrl !== store.state.activeTab) store.setActiveTab(fromUrl)
  }, [pathname, store])

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
  const active = navItem(tab)
  const moreActive = MORE_TABS.includes(tab)
  const showOnboarding = store.hydrateReady && !store.state.migrations?.onboarded

  const clearPendingSession = useCallback(() => {
    setPendingSession(null)
    setPendingSessionMinimized(false)
    setPendingFocusNote('')
  }, [])

  const startSession = useCallback(
    (projectId: DeepWorkId | ProjectId) => {
      store.setSelectedDate(todayDateKey())
      navigateTab('tasks')
      setPendingSessionMinimized(false)
      setPendingFocusNote('')
      setPendingSession(projectId)
    },
    [navigateTab, store],
  )

  const startPersonalMinimized = useCallback((focusNote: string) => {
    setPendingSessionMinimized(true)
    setPendingFocusNote(focusNote)
    setPendingSession('personal')
  }, [])

  const sessionActions = useMemo(
    () => ({ startSession, startPersonalMinimized }),
    [startSession, startPersonalMinimized],
  )

  const exportBackup = useCallback(() => {
    triggerBackupDownload(store.exportBackup())
    toast({ title: 'Backup downloaded', tone: 'success' })
  }, [store, toast])

  const importBackupFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      try {
        store.importBackup(await file.text())
        toast({ title: 'Backup restored', tone: 'success' })
      } catch (err) {
        toast({
          title: 'Could not restore that file',
          description: err instanceof Error ? err.message : 'Unknown error',
          tone: 'danger',
        })
      }
    },
    [store, toast],
  )

  const browseKey = `per:${tab}`
  const primaryTabs = NAV_ITEMS.filter((t) => PRIMARY_TABS.includes(t.id))
  const moreTabs = NAV_ITEMS.filter((t) => MORE_TABS.includes(t.id))

  return (
    <SessionActionsProvider value={sessionActions}>
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
          <nav className="rail-nav rail-nav-desktop" role="tablist" aria-label="Sections">
            {NAV_ITEMS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`rail-item${tab === t.id ? ' active' : ''}`}
                  onClick={() => navigateTab(t.id)}
                >
                  <span className="rail-icon" aria-hidden="true">
                    <Icon strokeWidth={1.75} />
                  </span>
                  <span className="rail-item-label">{t.label}</span>
                </button>
              )
            })}
          </nav>

          <button type="button" className="rail-palette-hint" onClick={() => setPaletteOpen(true)}>
            <Command aria-hidden="true" />
            <span>Quick actions</span>
            <kbd>⌘K</kbd>
          </button>

          {/* Phone: 4 primary + More */}
          <nav className="rail-nav rail-nav-mobile" role="tablist" aria-label="Sections">
            {primaryTabs.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`rail-item${tab === t.id ? ' active' : ''}`}
                  onClick={() => {
                    setMoreOpen(false)
                    navigateTab(t.id)
                  }}
                >
                  <span className="rail-icon" aria-hidden="true">
                    <Icon strokeWidth={1.75} />
                  </span>
                  <span className="rail-item-label">{t.shortLabel}</span>
                </button>
              )
            })}
            <button
              type="button"
              className={`rail-item rail-item-more${moreOpen || moreActive ? ' active' : ''}`}
              aria-expanded={moreOpen}
              aria-controls="mobile-more-sheet"
              onClick={() => setMoreOpen((v) => !v)}
            >
              <span className="rail-icon" aria-hidden="true">
                <MoreIcon strokeWidth={1.75} />
              </span>
              <span className="rail-item-label">More</span>
            </button>
          </nav>
        </aside>

        <div className="app-stage">
          <header className="command-bar">
            <div className="brand-lockup stage-title">
              <span className="brand-name">{active.label}</span>
              <span className="brand-sub desktop-only">{active.sub}</span>
            </div>
            <div className="status-pills">
              <span className="status-pill status-pill-date">
                {formatLongDate(store.state.selectedDate)}
              </span>
              <IconButton
                label="Quick actions (⌘K)"
                size="sm"
                className="desktop-only"
                onClick={() => setPaletteOpen(true)}
              >
                <Command />
              </IconButton>
              <IconButton
                label="Download a JSON backup"
                size="sm"
                className="desktop-only"
                onClick={exportBackup}
              >
                <Download />
              </IconButton>
              <IconButton
                label="Restore a JSON backup"
                size="sm"
                className="desktop-only"
                onClick={() => importRef.current?.click()}
              >
                <Upload />
              </IconButton>
              <IconButton
                label="Upload everything in this browser to the cloud"
                size="sm"
                className="desktop-only"
                disabled={store.cloudSync === 'loading'}
                onClick={() => void store.pushBrowserToCloud()}
              >
                <Cloud />
              </IconButton>
              <IconButton
                label="Reset deep-work data (finances are kept)"
                size="sm"
                className="desktop-only"
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw />
              </IconButton>
              <SyncStatus store={store} />
              <UserButton />
            </div>
          </header>

          <main className="app-content">{children}</main>
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
                  {moreTabs.map((t) => {
                    const Icon = t.icon
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`mobile-more-item${tab === t.id ? ' active' : ''}`}
                        onClick={() => {
                          navigateTab(t.id)
                          setMoreOpen(false)
                        }}
                      >
                        <span className="rail-icon" aria-hidden="true">
                          <Icon strokeWidth={1.75} />
                        </span>
                        <span>
                          <strong>{t.label}</strong>
                          <em>{t.sub}</em>
                        </span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className="mobile-more-item"
                    onClick={() => {
                      setMoreOpen(false)
                      setPaletteOpen(true)
                    }}
                  >
                    <span className="rail-icon" aria-hidden="true">
                      <Command strokeWidth={1.75} />
                    </span>
                    <span>
                      <strong>Quick actions</strong>
                      <em>Search and jump anywhere</em>
                    </span>
                  </button>
                  <DataBackup store={store} onDone={() => setMoreOpen(false)} />
                  <button
                    type="button"
                    className="mobile-more-item"
                    disabled={store.cloudSync === 'loading'}
                    onClick={() => {
                      void store.pushBrowserToCloud()
                      setMoreOpen(false)
                    }}
                  >
                    <span className="rail-icon" aria-hidden="true">
                      <Cloud strokeWidth={1.75} />
                    </span>
                    <span>
                      <strong>Upload to cloud</strong>
                      <em>
                        {store.cloudSync === 'ready'
                          ? 'Synced'
                          : store.cloudSync === 'error'
                            ? store.cloudError || 'Sync error'
                            : 'Force push this browser'}
                      </em>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mobile-more-item"
                    onClick={() => {
                      setMoreOpen(false)
                      setResetOpen(true)
                    }}
                  >
                    <span className="rail-icon" aria-hidden="true">
                      <RotateCcw strokeWidth={1.75} />
                    </span>
                    <span>
                      <strong>Reset work</strong>
                      <em>Deep-work data only</em>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        <CommandPalette
          store={store}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onStartSession={startSession}
        />

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
          message="Reset deep-work data (tasks, timers, habits)? Finances and vision are kept."
          confirmLabel="Reset work"
          danger
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            setResetOpen(false)
            store.resetToSeed()
          }}
        />

        {showOnboarding && <Onboarding store={store} />}

        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void importBackupFile(file)
          }}
        />
      </div>
    </SessionActionsProvider>
  )
}
