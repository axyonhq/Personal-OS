'use client'

import { useState } from 'react'
import type { Store } from '../../hooks/useStore'
import { useToast } from '../ui/Toast'

export function HomeTasks({ store }: { store: Store }) {
  const { toastUndo } = useToast()
  const [draft, setDraft] = useState('')
  const tasks = (store.state.tasks.personal ?? []).filter((t) => !t.done && !t.archived)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    store.addTask('personal', text, { plannedDate: null, forToday: false })
    setDraft('')
  }

  return (
    <section className="home-card">
      <div className="home-card-head">
        <div>
          <span className="home-kicker">Work</span>
          <h2>Tasks</h2>
        </div>
        <span className="home-count">{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="home-muted">Nothing open. Add the next thing.</p>
      ) : (
        <ul className="home-task-list">
          {tasks.map((task) => (
            <li key={task.id} className="home-task">
              <button
                type="button"
                className="home-check"
                onClick={() => store.toggleTask('personal', task.id)}
                aria-label={`Complete ${task.text}`}
              />
              <span>{task.text}</span>
              <button
                type="button"
                className="home-task-x"
                aria-label={`Delete ${task.text}`}
                onClick={() => {
                  const undo = store.removeTask('personal', task.id)
                  toastUndo('Task deleted', undo, task.text)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="home-task-add" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task"
          aria-label="Add a task"
        />
        <button type="submit" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </section>
  )
}
