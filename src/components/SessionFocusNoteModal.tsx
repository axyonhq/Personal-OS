'use client'

import { useEffect, useRef, useState } from 'react'
import {
  countFocusWords,
  isValidFocusNote,
  isValidSessionTarget,
  MAX_SESSION_TARGET_MINUTES,
  MIN_FOCUS_WORDS,
  MIN_SESSION_TARGET_MINUTES,
  SESSION_TARGET_PRESETS,
} from '../utils/focusNote'
import { addDays, todayDateKey } from '../utils/time'
import { Modal } from './ui/Modal'

const MAX_BACKLOG_MINUTES = 12 * 60

export type SessionFocusConfirm = {
  focusNote: string
  targetMinutes: number
  startedMinutesAgo?: number
  /** Backlog only: write the time entry now instead of opening a live timer. */
  logAsDone?: boolean
  /** Backlog only: Bali calendar day for the session (YYYY-MM-DD). */
  sessionDate?: string
}

export function SessionFocusNoteModal({
  open,
  projectName,
  projectColor,
  initialNote = '',
  backlog = false,
  liveTimerBlocksStart = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  projectName: string
  projectColor: string
  initialNote?: string
  /** When true, also ask how many minutes ago the session already started. */
  backlog?: boolean
  /** When true, only “Log as done” is offered (a live timer already owns the clock). */
  liveTimerBlocksStart?: boolean
  onConfirm: (result: SessionFocusConfirm) => void
  onCancel: () => void
}) {
  const today = todayDateKey()
  const yesterday = addDays(today, -1)
  const [note, setNote] = useState(initialNote)
  const [minutesAgo, setMinutesAgo] = useState('')
  const [targetMinutes, setTargetMinutes] = useState('')
  const [sessionDate, setSessionDate] = useState(today)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const minutesRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<HTMLInputElement>(null)
  const targetTouched = useRef(false)

  useEffect(() => {
    if (!open) return
    setNote(initialNote)
    setMinutesAgo('')
    setTargetMinutes('')
    setSessionDate(todayDateKey())
    targetTouched.current = false
    // Focus the first empty required field
    requestAnimationFrame(() => {
      if (backlog) minutesRef.current?.focus()
      else inputRef.current?.focus()
    })
  }, [open, initialNote, backlog])

  const words = countFocusWords(note)
  const readyNote = isValidFocusNote(note)
  const parsedMinutes = Number.parseInt(minutesAgo, 10)
  const minutesOk =
    !backlog ||
    (Number.isFinite(parsedMinutes) &&
      parsedMinutes >= 1 &&
      parsedMinutes <= MAX_BACKLOG_MINUTES)
  const parsedTarget = Number.parseInt(targetMinutes, 10)
  const targetOk = isValidSessionTarget(parsedTarget)
  const dateOk = !backlog || /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
  const ready = readyNote && minutesOk && targetOk && dateOk
  const remaining = Math.max(0, MIN_FOCUS_WORDS - words)
  const onlyLogAsDone = backlog && liveTimerBlocksStart

  const syncTargetFromMinutesWorked = (raw: string) => {
    setMinutesAgo(raw)
    if (targetTouched.current) return
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) return
    // Mirror minutes worked into target so Log as done isn’t stuck disabled.
    const clamped = Math.min(
      MAX_SESSION_TARGET_MINUTES,
      Math.max(MIN_SESSION_TARGET_MINUTES, n),
    )
    setTargetMinutes(String(clamped))
  }

  const submit = (logAsDone = false) => {
    const trimmed = note.trim().replace(/\s+/g, ' ')
    if (!isValidFocusNote(trimmed)) return
    if (!isValidSessionTarget(parsedTarget)) return
    if (backlog) {
      if (!minutesOk || !dateOk) return
      onConfirm({
        focusNote: trimmed,
        targetMinutes: parsedTarget,
        startedMinutesAgo: parsedMinutes,
        logAsDone: onlyLogAsDone || logAsDone || undefined,
        sessionDate,
      })
    } else {
      onConfirm({ focusNote: trimmed, targetMinutes: parsedTarget })
    }
    setNote('')
    setMinutesAgo('')
    setTargetMinutes('')
    setSessionDate(todayDateKey())
    targetTouched.current = false
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={backlog ? 'Backlog a session' : 'What are you building?'}
      size="md"
      className="session-focus-modal"
      footer={
        <>
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          {backlog && (
            <button
              type="button"
              className={onlyLogAsDone ? 'btn-primary' : 'btn-secondary'}
              disabled={!ready}
              onClick={() => submit(true)}
            >
              Log as done
            </button>
          )}
          {!onlyLogAsDone && (
            <button type="button" className="btn-primary" disabled={!ready} onClick={() => submit(false)}>
              {backlog ? 'Start from then' : 'Start timer'}
            </button>
          )}
        </>
      }
    >
      <p className="session-focus-meta" style={{ ['--project-color' as string]: projectColor }}>
        <span className="session-focus-dot" aria-hidden />
        {projectName}
      </p>
      <p className="session-focus-copy">
        {onlyLogAsDone
          ? 'A live timer is already running. Log this past block without starting another clock.'
          : backlog
            ? 'Forgot to hit start or finish? Enter how long you worked, pick the day, lock Slight Edge Focus + target, then log it or resume the clock.'
            : 'Lock these in before the clock starts. One edge to sharpen, and how long you plan to run.'}
      </p>

      {backlog && (
        <label className="session-focus-minutes">
          <span className="field-label">How many minutes did you work?</span>
          <input
            ref={minutesRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_BACKLOG_MINUTES}
            step={1}
            value={minutesAgo}
            onChange={(e) => syncTargetFromMinutesWorked(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                inputRef.current?.focus()
              }
            }}
            placeholder="e.g. 45"
            aria-describedby="session-backlog-hint"
          />
          <span id="session-backlog-hint" className="session-focus-minutes-hint">
            Log as done saves that block on the day you pick
            {onlyLogAsDone
              ? '.'
              : `. Start from then opens a live timer already counting (max ${MAX_BACKLOG_MINUTES} min).`}
          </span>
        </label>
      )}

      {backlog && (
        <div className="session-focus-date">
          <span className="field-label">Which day was this?</span>
          <div className="session-focus-date-row">
            <input
              type="date"
              value={sessionDate}
              max={today}
              onChange={(e) => setSessionDate(e.target.value)}
              aria-label="Session date"
            />
            <div className="session-focus-presets" role="group" aria-label="Day presets">
              <button
                type="button"
                className={`session-focus-preset${sessionDate === yesterday ? ' active' : ''}`}
                onClick={() => setSessionDate(yesterday)}
              >
                Yesterday
              </button>
              <button
                type="button"
                className={`session-focus-preset${sessionDate === today ? ' active' : ''}`}
                onClick={() => setSessionDate(today)}
              >
                Today
              </button>
            </div>
          </div>
        </div>
      )}

      <label className="session-focus-note">
        <span className="field-label">Slight Edge Focus</span>
        <span className="session-focus-sublabel">
          (1 thing to improve during this work session, e.g. mental model)
        </span>
        <textarea
          ref={inputRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              targetRef.current?.focus()
            }
          }}
          placeholder="e.g. mental model"
          rows={3}
          maxLength={200}
          aria-describedby="session-focus-hint"
        />
      </label>

      <label className="session-focus-minutes session-focus-target">
        <span className="field-label">Target timer</span>
        <span className="session-focus-sublabel">
          How long this block should run (minutes). Progress shows live against this.
        </span>
        <input
          ref={targetRef}
          type="number"
          inputMode="numeric"
          min={MIN_SESSION_TARGET_MINUTES}
          max={MAX_SESSION_TARGET_MINUTES}
          step={1}
          value={targetMinutes}
          onChange={(e) => {
            targetTouched.current = true
            setTargetMinutes(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit(onlyLogAsDone)
            }
          }}
          placeholder="e.g. 50"
          aria-describedby="session-target-hint"
        />
        <div className="session-focus-presets" role="group" aria-label="Target presets">
          {SESSION_TARGET_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`session-focus-preset${parsedTarget === preset ? ' active' : ''}`}
              onClick={() => {
                targetTouched.current = true
                setTargetMinutes(String(preset))
              }}
            >
              {preset}m
            </button>
          ))}
        </div>
        <span id="session-target-hint" className="session-focus-minutes-hint">
          {MIN_SESSION_TARGET_MINUTES}–{MAX_SESSION_TARGET_MINUTES} minutes.
        </span>
      </label>

      <p id="session-focus-hint" className={`session-focus-hint${ready ? ' ready' : ''}`}>
        {!readyNote
          ? `${remaining} more word${remaining === 1 ? '' : 's'} to start`
          : !targetOk
            ? `Set a target (${MIN_SESSION_TARGET_MINUTES}+ min)`
            : backlog && !minutesOk
              ? 'Enter minutes worked (1+)'
              : backlog && !dateOk
                ? 'Pick the day this work happened'
                : backlog
                  ? `${words} words · ${parsedMinutes}m worked · ${parsedTarget}m target`
                  : `${words} words · ${parsedTarget}m target — locked in. Start when ready.`}
      </p>
    </Modal>
  )
}
