'use client'

import { useState } from 'react'
import type { Store } from '../../hooks/useStore'
import type { VisionGoal } from '../../types'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Modal } from '../ui/Modal'

export function HomeVision({ store }: { store: Store }) {
  const goals = store.state.visionGoals ?? []
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [pendingDelete, setPendingDelete] = useState<VisionGoal | null>(null)
  const [heroOpen, setHeroOpen] = useState(false)

  const canCapture = Boolean(draftTitle.trim() || draftBody.trim())

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCapture) return
    store.addVisionGoal({ title: draftTitle, body: draftBody })
    setDraftTitle('')
    setDraftBody('')
    setAdding(false)
  }

  const startEdit = (goal: VisionGoal) => {
    setEditingId(goal.id)
    setEditTitle(goal.title)
    setEditBody(goal.body)
  }

  const saveEdit = () => {
    if (!editingId) return
    if (!editTitle.trim() && !editBody.trim()) return
    store.updateVisionGoal(editingId, { title: editTitle, body: editBody })
    setEditingId(null)
  }

  return (
    <section className="home-vision">
      <button
        type="button"
        className="home-vision-frame"
        onClick={() => setHeroOpen(true)}
        aria-label="Open vision board"
      >
        <img
          src="/dream-home.webp"
          alt="Dream home vision board"
          className="home-vision-img"
        />
        <span className="home-vision-scrim">
          <span className="home-kicker">Vision</span>
          <span className="home-vision-title">Dream home</span>
        </span>
      </button>

      <div className="home-vision-goals">
        <div className="home-card-head">
          <h2>Goals</h2>
          <button type="button" className="home-text-btn" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Add'}
          </button>
        </div>

        {adding && (
          <form className="home-vision-form" onSubmit={submit}>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="The goal"
              aria-label="Vision goal title"
              autoFocus
            />
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder="Why it matters"
              rows={3}
              aria-label="Vision goal why"
            />
            <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!canCapture}>
              Save goal
            </button>
          </form>
        )}

        {goals.length === 0 && !adding ? (
          <p className="home-muted">No goals yet. Add the ones that pull you forward.</p>
        ) : (
          <ul className="home-goal-list">
            {goals.map((goal) => (
              <li key={goal.id} className="home-goal">
                {editingId === goal.id ? (
                  <div className="home-vision-form">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      aria-label="Edit vision title"
                      autoFocus
                    />
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      aria-label="Edit vision body"
                    />
                    <div className="home-inline-actions">
                      <button type="button" className="home-text-btn" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                      <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={saveEdit}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3>{goal.title}</h3>
                    {goal.body.trim() ? <p>{goal.body}</p> : null}
                    <div className="home-inline-actions">
                      <button type="button" className="home-text-btn" onClick={() => startEdit(goal)}>
                        Edit
                      </button>
                      <button type="button" className="home-text-btn" onClick={() => setPendingDelete(goal)}>
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={heroOpen} onClose={() => setHeroOpen(false)} title="Dream home" size="xl" className="vision-hero-modal">
        <img src="/dream-home.webp" alt="Dream home vision board, full size" className="vision-hero-full" />
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove vision goal"
        message={
          pendingDelete ? `Remove “${pendingDelete.title}” from your vision?` : 'Remove this vision goal?'
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) store.removeVisionGoal(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </section>
  )
}
