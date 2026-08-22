import { useState } from 'react'
import type { Project, Task } from '../types'
import type { Store } from '../hooks/useStore'
import { useToast } from './ui/Toast'
import { addDays, todayDateKey } from '../utils/time'

function plannedLabel(plannedDate: string | null | undefined, today: string): string {
  if (!plannedDate) return 'Later'
  if (plannedDate === today) return 'Today'
  if (plannedDate === addDays(today, 1)) return 'Tomorrow'
  return plannedDate.slice(5)
}

export function TaskRow({
  task,
  project,
  store,
  showScope,
  showDateAssign = false,
}: {
  task: Task
  project: Project
  store: Store
  showScope: boolean
  /** Quick date chips: Today / Tomorrow / Clear */
  showDateAssign?: boolean
}) {
  const { toastUndo } = useToast()
  const today = todayDateKey()
  const tomorrow = addDays(today, 1)
  const planned = task.plannedDate ?? null
  const notes = task.notes ?? ''
  const [notesOpen, setNotesOpen] = useState(false)
  const [draftNotes, setDraftNotes] = useState(notes)

  const saveNotes = () => {
    if (draftNotes === notes) return
    store.setTaskNotes(project.id, task.id, draftNotes)
  }

  return (
    <li className={`check-item task-row${notesOpen ? ' notes-open' : ''}`}>
      <div className="task-row-main">
        <button
          type="button"
          className={`check-box${task.done ? ' on' : ''}`}
          style={{ borderColor: task.done ? project.color : undefined }}
          onClick={() => store.toggleTask(project.id, task.id)}
          title="Complete and archive"
        >
          {task.done ? '✓' : ''}
        </button>
        <span className={`check-text${task.done ? ' done' : ''}`}>{task.text}</span>
        {showDateAssign && (
          <div className="task-date-assign" role="group" aria-label="Assign date">
            <button
              type="button"
              className={`date-chip${planned === today ? ' active' : ''}`}
              onClick={() => store.setTaskPlannedDate(project.id, task.id, today)}
            >
              Today
            </button>
            <button
              type="button"
              className={`date-chip${planned === tomorrow ? ' active' : ''}`}
              onClick={() => store.setTaskPlannedDate(project.id, task.id, tomorrow)}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className={`date-chip${planned === null ? ' active' : ''}`}
              onClick={() => store.setTaskPlannedDate(project.id, task.id, null)}
              title="Clear planned date"
            >
              Later
            </button>
            <label className="date-chip date-chip-input" title="Pick a date">
              <input
                type="date"
                aria-label="Pick planned date"
                value={planned ?? ''}
                onChange={(e) =>
                  store.setTaskPlannedDate(project.id, task.id, e.target.value || null)
                }
              />
            </label>
          </div>
        )}
        {showScope && !showDateAssign && (
          <button
            type="button"
            className={`scope-toggle ${planned === today || (!planned && task.forToday) ? 'today' : 'future'}`}
            onClick={() => {
              if (planned === today || (!planned && task.forToday)) {
                store.setTaskPlannedDate(project.id, task.id, null)
              } else {
                store.setTaskPlannedDate(project.id, task.id, today)
              }
            }}
            title={
              planned === today || (!planned && task.forToday)
                ? 'Scheduled today — click for backlog'
                : 'Backlog — click for today'
            }
          >
            {plannedLabel(planned, today)}
          </button>
        )}
        <button
          type="button"
          className={`notes-toggle${notes ? ' has-notes' : ''}${notesOpen ? ' open' : ''}`}
          onClick={() => {
            setDraftNotes(task.notes ?? '')
            setNotesOpen((v) => !v)
          }}
          title={notesOpen ? 'Hide notes' : 'Notes'}
          aria-expanded={notesOpen}
        >
          Notes
        </button>
        <button
          type="button"
          className="x-btn"
          aria-label={`Delete task: ${task.text}`}
          onClick={() => {
            const undo = store.removeTask(project.id, task.id)
            toastUndo('Task deleted', undo, task.text)
          }}
        >
          ×
        </button>
      </div>
      {notesOpen && (
        <div className="task-notes">
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Add notes…"
            rows={2}
            aria-label={`Notes for ${task.text}`}
          />
        </div>
      )}
    </li>
  )
}
