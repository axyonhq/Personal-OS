import { useState } from 'react'
import type { Store } from '../hooks/useStore'
import type { SessionDebrief } from '../types'
import { formatMinutes, formatTimer } from '../utils/time'
import { SessionDebriefModal } from './SessionDebriefModal'
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
  const [debriefOpen, setDebriefOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  if (!timer) return null

  const paused = store.isTimerPaused
  const hasPauses = timer.pauseCount > 0 || paused
  const minutesLabel = formatMinutes(Math.max(1, Math.round(store.liveTimerSeconds / 60)))

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
          className={`mini-timer${paused ? ' paused' : ''}`}
          onClick={onExpand}
        >
          <span className="dot" style={{ background: 'var(--accent)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.12em' }}>
            {paused ? 'PAUSED' : 'DEEP WORK'}
          </span>
          <span className="digits">{formatTimer(store.liveTimerSeconds)}</span>
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
            <div className="timer-project">Deep work</div>
            <div className={`timer-digits${paused ? ' frozen' : ''}`}>{formatTimer(store.liveTimerSeconds)}</div>
            {hasPauses && (
              <div className="timer-pause-stats">
                {timer.pauseCount} pause{timer.pauseCount === 1 ? '' : 's'} · {formatTimer(store.livePauseSeconds)} total break
              </div>
            )}
            <div className="timer-actions">
              {paused ? (
                <button className="btn-primary" type="button" onClick={() => store.resumeTimer()}>
                  Resume
                </button>
              ) : (
                <>
                  <button className="btn-primary" type="button" onClick={() => setDebriefOpen(true)}>
                    Finish session
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
        projectName="Deep work"
        minutesLabel={minutesLabel}
        onSubmit={(debrief) => commitFinish(debrief)}
        onSkip={() => commitFinish()}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Discard this session?"
        message={`${minutesLabel} will not be logged. This cannot be undone.`}
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
