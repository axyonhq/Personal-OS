'use client'

import { useState } from 'react'
import {
  SESSION_FEELINGS,
  SESSION_TAGS,
  type SessionDebrief,
  type SessionFeeling,
  type SessionTag,
} from '../types'
import { Modal } from './ui/Modal'

export function SessionDebriefModal({
  open,
  projectName,
  minutesLabel,
  onSubmit,
  onSkip,
}: {
  open: boolean
  projectName: string
  minutesLabel: string
  onSubmit: (debrief: SessionDebrief) => void
  onSkip: () => void
}) {
  const [feeling, setFeeling] = useState<SessionFeeling | null>(null)
  const [tags, setTags] = useState<SessionTag[]>([])
  const [note, setNote] = useState('')

  const reset = () => {
    setFeeling(null)
    setTags([])
    setNote('')
  }

  const toggleTag = (tag: SessionTag) => {
    setTags((list) => (list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]))
  }

  const submit = () => {
    if (!feeling) return
    onSubmit({
      feeling,
      tags,
      note: note.trim() || undefined,
    })
    reset()
  }

  const skip = () => {
    reset()
    onSkip()
  }

  return (
    <Modal
      open={open}
      onClose={skip}
      title="How did that session go?"
      size="md"
      className="session-debrief-modal"
      footer={
        <>
          <button type="button" className="ghost-btn" onClick={skip}>
            Skip
          </button>
          <button type="button" className="btn-primary" disabled={!feeling} onClick={submit}>
            Lock in
          </button>
        </>
      }
    >
      <p className="session-debrief-meta">
        {projectName} · {minutesLabel} active
      </p>
      <p className="session-debrief-copy">
        Honest read. Patterns only show up if you log the truth.
      </p>

      <div className="session-debrief-feelings" role="radiogroup" aria-label="Session feeling">
        {SESSION_FEELINGS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={feeling === f.id}
            className={`session-debrief-feeling${feeling === f.id ? ' selected' : ''} feeling-${f.id}`}
            onClick={() => setFeeling(f.id)}
          >
            <span className="session-debrief-feeling-label">{f.label}</span>
            <span className="session-debrief-feeling-hint">{f.hint}</span>
          </button>
        ))}
      </div>

      <div className="session-debrief-tags">
        <span className="field-label">What showed up</span>
        <div className="session-debrief-tag-row">
          {SESSION_TAGS.map((t) => {
            const on = tags.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                className={`session-debrief-tag${on ? ' selected' : ''}`}
                aria-pressed={on}
                onClick={() => toggleTag(t.id)}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <label className="session-debrief-note">
        <span className="field-label">One line (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What actually happened…"
          maxLength={200}
        />
      </label>
    </Modal>
  )
}
