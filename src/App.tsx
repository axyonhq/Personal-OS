'use client'

import { UserButton } from '@clerk/nextjs'
import { Cloud, Command, Download, RotateCcw, Upload } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { DeepWorkTimerHost } from './components/DeepWorkTimerHost'
import { Onboarding } from './components/Onboarding'
import { SessionActionsProvider } from './components/SessionActions'
import { SyncStatus } from './components/SyncStatus'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { IconButton } from './components/ui/Button'
import { useToast } from './components/ui/Toast'
import { useStore } from './hooks/useStore'
import { triggerBackupDownload } from './utils/backup'
import { tabFromPathname } from './utils/tabPath'
import { formatLongDate, todayDateKey } from './utils/time'

export default function App({ children }: { children: ReactNode }) {
  const store = useStore()
  const pathname = usePathname()
  const { toast } = useToast()
  const importRef = useRef<HTMLInputElement>(null)
  const [pendingSession, setPendingSession] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const fromUrl = tabFromPathname(pathname)
    if (fromUrl !== store.state.activeTab) store.setActiveTab(fromUrl)
  }, [pathname, store])

  const showOnboarding = store.hydrateReady && !store.state.migrations?.onboarded

  const startSession = useCallback(() => {
    if (store.state.activeTimer) return
    store.setSelectedDate(todayDateKey())
    setPendingSession(true)
  }, [store])

  const clearPendingSession = useCallback(() => setPendingSession(false), [])

  const sessionActions = useMemo(() => ({ startSession }), [startSession])

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

  return (
    <SessionActionsProvider value={sessionActions}>
      <div className="os-shell">
        <header className="os-bar">
          <div className="os-brand">
            <span className="os-mark" aria-hidden="true" />
            <div>
              <span className="os-name">Personal OS</span>
              <span className="os-date">{formatLongDate(store.state.selectedDate)}</span>
            </div>
          </div>
          <div className="os-tools">
            <IconButton label="Quick actions (⌘K)" size="sm" onClick={() => setPaletteOpen(true)}>
              <Command />
            </IconButton>
            <IconButton label="Download a JSON backup" size="sm" className="desktop-only" onClick={exportBackup}>
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
              label="Upload this browser to the cloud"
              size="sm"
              className="desktop-only"
              disabled={store.cloudSync === 'loading'}
              onClick={() => void store.pushBrowserToCloud()}
            >
              <Cloud />
            </IconButton>
            <IconButton
              label="Reset work data (finances and vision are kept)"
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

        <main className="os-main">{children}</main>
      </div>

      <CommandPalette
        store={store}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onStartSession={startSession}
      />

      <DeepWorkTimerHost
        store={store}
        pendingStart={pendingSession}
        onPendingHandled={clearPendingSession}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Reset work"
        message="Reset tasks and timers? Finances and vision are kept."
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
    </SessionActionsProvider>
  )
}
