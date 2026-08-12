import { useState } from 'react'
import { PROJECT_MAP } from '../data/seed'
import type { Store } from '../hooks/useStore'
import type { SessionDebrief } from '../types'
import { formatMinutes, formatTimer, todayDateKey } from '../utils/time'
import { SessionDebriefModal } from './SessionDebriefModal'
import { TaskRow } from './TaskRow'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { ModalPortal } from './ui/ModalPortal'

const DISCARD_CONFIRM_AFTER_SEC = 5 * 60

export function TimerOverlay({
  store,
  minimized,
  onMinimize,
  onExpand,
}: {
  store: Store
  minimized: boolean
  onMinimize: () => void
  onExpand: () => void
}) {
  const timer = store.state.activeTimer
  const [taskText, setTaskText] = useState('')
  const [debriefOpen, setDebriefOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  if (!timer) return null

  const project = PROJECT_MAP[timer.projectId]
  if (!project) {
    // Corrupt / stale timer — clear it so Deep Work + backlog stay usable.
    return (
      <ModalPortal>
        <button type="button" className="mini-timer" onClick={() => store.discardTimer()}>
          <span className="digits">Bad timer · tap to clear</span>
        </button>
      </ModalPortal>
    )
  }

  const displayToday = store.projectMinutesToday[timer.projectId]
  const paused = store.isTimerPaused
  const hasPauses = timer.pauseCount > 0 || paused
  const today = todayDateKey()
  const todayTasks = (store.state.tasks[timer.projectId] ?? []).filter((t) => {
    if (t.archived || t.done) return false
    return typeof t.plannedDate === 'string' ? t.plannedDate === today : t.forToday
  })
  const openCount = todayTasks.filter((t) => !t.done).length
  const minutesLabel = formatMinutes(Math.max(1, Math.round(store.liveTimerSeconds / 60)))

  const targetMinutes = timer.targetMinutes
  const elapsedMinutes = store.liveTimerSeconds / 60
  const targetPct =
    targetMinutes && targetMinutes > 0
      ? Math.min(100, Math.round((elapsedMinutes / targetMinutes) * 100))
      : null
  const targetHit = targetPct != null && targetPct >= 100
  const remainingToTarget =
    targetMinutes && targetMinutes > 0
      ? Math.max(0, Math.ceil(targetMinutes - elapsedMinutes))
      : null

  const commitFinish = (debrief?: SessionDebrief) => {
    setDebriefOpen(false)
    store.finishTimer(debrief)
  }

  const requestDiscard = () => {
    if (store.liveTimerSeconds >= DISCARD_CONFIRM_AFTER_SEC) {
      setDiscardOpen(true)
      return
    }
    store.discardTimer()
  }

  if (minimized && !debriefOpen && !discardOpen) {
    return (
      <ModalPortal>
        <button
          type="button"
          className={`mini-timer${paused ? ' paused' : ''}${targetPct != null ? ' has-target' : ''}${targetHit ? ' target-hit' : ''}`}
          onClick={onExpand}
        >
          <span className="dot" style={{ background: project.color, color: project.color }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.12em' }}>
            {paused ? 'PAUSED' : project.name.toUpperCase()}
          </span>
          <span className="digits">{formatTimer(store.liveTimerSeconds)}</span>
          {targetPct != null && (
            <span className="mini-target-bar" aria-hidden>
              <i style={{ width: `${targetPct}%` }} />
            </span>
          )}
          {paused && (
            <span className="mini-pause-badge">{formatTimer(store.livePauseSeconds)}</span>
          )}
        </button>
      </ModalPortal>
    )
  }

  return (
    <ModalPortal>
      {!debriefOpen && !discardOpen && (
        <div className={`timer-overlay${paused ? ' timer-paused' : ''}`}>
          <div className="timer-stage">
            {paused && (
              <div className="timer-paused-banner">
                <span className="timer-paused-dot" />
                PAUSED · {formatTimer(store.livePauseSeconds)} on break
              </div>
            )}
            <div className="timer-project">
              <span className="dot" style={{ background: project.color, color: project.color }} />
              {project.name.toUpperCase()}
            </div>
            {timer.focusNote && (
              <div className="timer-slight-edge">
                <span className="timer-slight-edge-label">Slight Edge Focus</span>
                <p className="timer-focus-note">{timer.focusNote}</p>
              </div>
            )}
            <div className={`timer-digits${paused ? ' frozen' : ''}`}>{formatTimer(store.liveTimerSeconds)}</div>

            {targetMinutes != null && targetPct != null && (
              <div className="timer-session-target" aria-live="polite">
                <div className={`target-bar${targetHit ? ' hit' : ''}`}>
                  <i style={{ width: `${targetPct}%` }} />
                </div>
                <div className="timer-session-target-stats">
                  <span>
                    {formatMinutes(Math.floor(elapsedMinutes))} / {formatMinutes(targetMinutes)}
                  </span>
                  <span className={targetHit ? 'status-hit' : 'status-miss'}>
                    {targetHit
                      ? 'TARGET HIT'
                      : remainingToTarget != null
                        ? `${remainingToTarget}m to target`
                        : `${targetPct}%`}
                  </span>
                </div>
              </div>
            )}

            <div className="timer-today">TODAY TOTAL · {formatMinutes(displayToday)}</div>
            {hasPauses && (
              <div className="timer-pause-stats">
                {timer.pauseCount} pause{timer.pauseCount === 1 ? '' : 's'} · {formatTimer(store.livePauseSeconds)} total break
              </div>
            )}

            <div className="timer-todos">
              <div className="todo-header">
                <span className="todo-label">TODAY&apos;S TASKS</span>
                <span className="todo-meta">{openCount} open</span>
              </div>
              <ul className="check-list">
                {todayTasks.length === 0 && (
                  <li className="empty-tasks">No tasks for today — add one below</li>
                )}
                {todayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    project={project}
                    store={store}
                    showScope={false}
                  />
                ))}
              </ul>
              <form
                className="inline-add"
                onSubmit={(e) => {
                  e.preventDefault()
                  store.addTask(timer.projectId, taskText, true)
                  setTaskText('')
                }}
              >
                <input
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                  placeholder="+ Add today's task"
                  aria-label={`Add task to ${project.name}`}
                />
              </form>
            </div>

            <div className="timer-actions">
              {paused ? (
                <button className="btn-primary" type="button" onClick={() => store.resumeTimer()}>
                  Resume Session
                </button>
              ) : (
                <>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => setDebriefOpen(true)}
                  >
                    Finish Session
                  </button>
                  <button className="btn-secondary btn-pause" type="button" onClick={() => store.pauseTimer()}>
                    Pause
                  </button>
                </>
              )}
              {!paused && (
                <button className="btn-secondary" type="button" onClick={onMinimize}>
                  Minimize
                </button>
              )}
              <button
                className="ghost-btn"
                type="button"
                style={{ marginTop: '0.5rem' }}
                onClick={requestDiscard}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <SessionDebriefModal
        open={debriefOpen}
        projectName={project.name}
        minutesLabel={minutesLabel}
        onSubmit={(debrief) => commitFinish(debrief)}
        onSkip={() => commitFinish()}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Discard this session?"
        message={`${minutesLabel} on ${project.name} will not be logged. This cannot be undone.`}
        confirmLabel="Discard"
        cancelLabel="Keep timer"
        danger
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false)
          store.discardTimer()
        }}
      />
    </ModalPortal>
  )
}
