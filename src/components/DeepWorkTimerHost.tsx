'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PROJECT_MAP } from '../data/seed'
import type { Store } from '../hooks/useStore'
import { DEEP_WORK_IDS, isDeepWorkId, type DeepWorkId, type ProjectId } from '../types'
import { formatMinutes, todayDateKey } from '../utils/time'
import { QuickAddTask } from './QuickAddTask'
import { SessionFocusNoteModal } from './SessionFocusNoteModal'
import { TimerOverlay } from './TimerViews'

/**
 * Platform-wide deep work launcher + timer chrome.
 * Mini dock while browsing; fullscreen only when the user expands (or just started).
 * Deep work starts require Slight Edge Focus + a target timer before the clock runs.
 * Backlog mode backdates the start when you forgot to hit start.
 */
export function DeepWorkTimerHost({
  store,
  pendingSession,
  pendingSessionMinimized = false,
  pendingFocusNote = '',
  onPendingSessionHandled,
  browseKey,
}: {
  store: Store
  pendingSession?: ProjectId | null
  /** When true, a pending session starts minimized (e.g. Sunday Admin focus UI owns the screen). */
  pendingSessionMinimized?: boolean
  pendingFocusNote?: string
  onPendingSessionHandled?: () => void
  /** Changes when the user navigates tabs/layers — keeps the timer minimized so UI stays usable */
  browseKey?: string
}) {
  const [timerMinimized, setTimerMinimized] = useState(true)
  const [dockOpen, setDockOpen] = useState(false)
  const [dockMode, setDockMode] = useState<'start' | 'backlog'>('start')
  const [focusPrompt, setFocusPrompt] = useState<{
    projectId: ProjectId
    minimized: boolean
    seedNote: string
    backlog: boolean
  } | null>(null)
  const hadTimer = useRef(false)
  const skipBrowseMinimize = useRef(false)
  const startMinimizedRef = useRef(false)

  const activeTimer = store.state.activeTimer
  const startTimer = store.startTimer
  const logCompletedSession = store.logCompletedSession

  const clearPending = useCallback(() => {
    onPendingSessionHandled?.()
  }, [onPendingSessionHandled])

  const beginTimer = useCallback(
    (
      projectId: ProjectId,
      focusNote: string,
      minimized: boolean,
      opts?: { startedMinutesAgo?: number; targetMinutes?: number },
    ) => {
      startMinimizedRef.current = minimized
      startTimer(projectId, focusNote, opts)
    },
    [startTimer],
  )

  /** Deep work always prompts for Slight Edge Focus + target; other projects start with the note passed. */
  const requestStart = useCallback(
    (projectId: ProjectId, focusNote = '', minimized = false, backlog = false) => {
      // Live clock already on this project → just expand it (unless backlogging a past block).
      if (activeTimer?.projectId === projectId && !backlog) {
        setTimerMinimized(false)
        return
      }
      // A different live session blocks starting another clock — backlog log-as-done is still OK.
      if (activeTimer && !backlog) {
        setTimerMinimized(false)
        return
      }

      if (isDeepWorkId(projectId)) {
        setFocusPrompt({
          projectId,
          minimized,
          seedNote: focusNote.trim(),
          backlog,
        })
        return
      }

      if (activeTimer) return
      beginTimer(projectId, focusNote.trim(), minimized)
    },
    [activeTimer, beginTimer],
  )

  // Fresh start → enter focus (fullscreen) unless caller asked for minimized.
  useEffect(() => {
    const live = !!activeTimer
    if (live && !hadTimer.current) {
      skipBrowseMinimize.current = true
      setTimerMinimized(startMinimizedRef.current)
      startMinimizedRef.current = false
    }
    if (!live) {
      setTimerMinimized(true)
      setDockOpen(false)
    }
    hadTimer.current = live
  }, [activeTimer])

  // Navigating around the OS must never trap the user under the fullscreen overlay
  useEffect(() => {
    if (!browseKey) return
    if (skipBrowseMinimize.current) {
      skipBrowseMinimize.current = false
      return
    }
    if (activeTimer) setTimerMinimized(true)
    setDockOpen(false)
  }, [browseKey, activeTimer])

  // Pending session requests from dashboard / project cards / Sunday Admin
  useEffect(() => {
    if (!pendingSession) return
    if (activeTimer?.projectId === pendingSession) {
      // Already live — stay minimized so Deep Work UI is usable
      setTimerMinimized(true)
      clearPending()
      return
    }
    if (activeTimer) {
      // Different project live — don't stack a second session
      clearPending()
      return
    }

    // Deep work always opens the gate for focus + target
    if (isDeepWorkId(pendingSession)) {
      setFocusPrompt({
        projectId: pendingSession,
        minimized: pendingSessionMinimized,
        seedNote: pendingFocusNote.trim(),
        backlog: false,
      })
      clearPending()
      return
    }

    beginTimer(pendingSession, pendingFocusNote.trim(), pendingSessionMinimized)
    clearPending()
  }, [
    pendingSession,
    pendingSessionMinimized,
    pendingFocusNote,
    activeTimer,
    beginTimer,
    clearPending,
  ])

  const busy = !!activeTimer

  const startProject = (id: DeepWorkId) => {
    const backlog = dockMode === 'backlog'
    setDockOpen(false)
    setDockMode('start')
    requestStart(id, '', false, backlog)
  }

  const focusProject = focusPrompt ? PROJECT_MAP[focusPrompt.projectId] : null

  return (
    <>
      <div className={`corner-dock${busy && timerMinimized ? ' beside-timer' : ''}`}>
        <div className="corner-dock-actions">
          <QuickAddTask store={store} />
          <div className={`deep-dock${dockOpen ? ' open' : ''}`}>
            <button
              type="button"
              className="deep-dock-toggle"
              aria-expanded={dockOpen}
              onClick={() => {
                setDockOpen((v) => {
                  if (v) setDockMode('start')
                  return !v
                })
              }}
            >
              <span className="deep-dock-pulse" aria-hidden />
              Deep work
            </button>
            {dockOpen && (
              <div className="deep-dock-panel" role="menu">
                <p className="deep-dock-hint">
                  {dockMode === 'backlog'
                    ? busy
                      ? 'Pick project — log a past block (live timer stays)'
                      : 'Pick project — then enter how long you worked'
                    : busy
                      ? 'A session is live — expand the timer, or backlog a past block'
                      : 'Set focus + target, then start'}
                </p>
                {DEEP_WORK_IDS.map((id) => {
                  const project = PROJECT_MAP[id]
                  const logged = store.minutesFor(id, 'day', todayDateKey())
                  const target = store.state.dailyDeepWorkSplit[id]
                  const liveHere = activeTimer?.projectId === id
                  return (
                    <button
                      key={id}
                      type="button"
                      className="deep-dock-item"
                      role="menuitem"
                      style={{ ['--project-color' as string]: project.color }}
                      onClick={() => startProject(id)}
                    >
                      <span className="deep-dock-name">
                        {project.name}
                        {liveHere ? ' · live' : ''}
                      </span>
                      <span className="deep-dock-meta">
                        {formatMinutes(logged)} / {formatMinutes(target)}
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  className={`deep-dock-backlog${dockMode === 'backlog' ? ' active' : ''}`}
                  onClick={() =>
                    setDockMode((m) => (m === 'backlog' ? 'start' : 'backlog'))
                  }
                >
                  {dockMode === 'backlog' ? 'Cancel backlog' : 'Already going? Backlog…'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SessionFocusNoteModal
        open={!!focusPrompt && !!focusProject}
        projectName={focusProject?.name ?? ''}
        projectColor={focusProject?.color ?? '#888'}
        initialNote={focusPrompt?.seedNote ?? ''}
        backlog={focusPrompt?.backlog ?? false}
        liveTimerBlocksStart={busy && !!focusPrompt?.backlog}
        onCancel={() => setFocusPrompt(null)}
        onConfirm={({ focusNote, targetMinutes, startedMinutesAgo, logAsDone, sessionDate }) => {
          if (!focusPrompt) return
          const { projectId, minimized } = focusPrompt
          setFocusPrompt(null)
          // Prefer log-as-done when a live timer already owns the clock.
          const mustLog = logAsDone || (!!store.state.activeTimer && startedMinutesAgo != null)
          if (mustLog && startedMinutesAgo != null) {
            logCompletedSession(projectId, focusNote, startedMinutesAgo, {
              targetMinutes,
              date: sessionDate,
            })
            return
          }
          beginTimer(projectId, focusNote, minimized, {
            targetMinutes,
            startedMinutesAgo: startedMinutesAgo ?? 0,
          })
        }}
      />

      {store.state.activeTimer && (
        <TimerOverlay
          store={store}
          minimized={timerMinimized}
          onMinimize={() => setTimerMinimized(true)}
          onExpand={() => setTimerMinimized(false)}
        />
      )}
    </>
  )
}
