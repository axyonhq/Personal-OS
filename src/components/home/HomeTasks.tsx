'use client'

import { useEffect, useState } from 'react'
import { PROJECTS } from '../../data/seed'
import type { Store } from '../../hooks/useStore'
import type { ProjectId, Task } from '../../types'
import { addDays, parseDateKey, todayDateKey } from '../../utils/time'
import { Button } from '../ui/Button'
import { Select, type SelectOption } from '../ui/Select'
import { useToast } from '../ui/Toast'

const BUSINESS_IDS: ProjectId[] = ['chase', 'myProject', 'rav']
const DUE_HORIZON_DAYS = 14

function isOpen(task: Task) {
  return !task.done && !task.archived
}

function dueValue(task: Task, today: string): string {
  if (typeof task.plannedDate === 'string') return task.plannedDate
  if (task.plannedDate === null) return ''
  return task.forToday ? today : ''
}

function isDueToday(task: Task, today: string) {
  return dueValue(task, today) === today
}

function shortDateLabel(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function dueDateOptions(today: string, current: string): SelectOption[] {
  const options: SelectOption[] = [
    { value: '', label: 'No date' },
    { value: today, label: 'Today' },
    { value: addDays(today, 1), label: 'Tomorrow' },
  ]
  for (let i = 2; i <= DUE_HORIZON_DAYS; i += 1) {
    const value = addDays(today, i)
    options.push({ value, label: shortDateLabel(value) })
  }
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: shortDateLabel(current) })
  }
  return options
}

function compareTasks(a: Task, b: Task, today: string) {
  const aDue = dueValue(a, today)
  const bDue = dueValue(b, today)
  if (aDue && !bDue) return -1
  if (!aDue && bDue) return 1
  if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue)
  return 0
}

function TaskTable({
  title,
  projectIds,
  store,
  todayOnly,
  today,
}: {
  title: string
  projectIds: ProjectId[]
  store: Store
  todayOnly: boolean
  today: string
}) {
  const { toastUndo } = useToast()
  const [draft, setDraft] = useState('')
  const [projectId, setProjectId] = useState<ProjectId>(projectIds[0])
  const [due, setDue] = useState('')

  useEffect(() => {
    if (todayOnly) setDue(today)
  }, [todayOnly, today])
  const projects = PROJECTS.filter((project) => projectIds.includes(project.id))
  const showProject = projectIds.length > 1
  const rows = projectIds
    .flatMap((id) =>
      (store.state.tasks[id] ?? []).filter(isOpen).map((task) => ({ task, projectId: id })),
    )
    .filter(({ task }) => (todayOnly ? isDueToday(task, today) : true))
    .sort((a, b) => compareTasks(a.task, b.task, today))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    const target = showProject ? projectId : projectIds[0]
    const plannedDate = due || null
    store.addTask(target, text, { plannedDate, forToday: plannedDate === today })
    setDraft('')
  }

  return (
    <div className="home-todo-panel">
      <div className="home-todo-panel-head">
        <h3>{title}</h3>
        <span className="home-count">{rows.length}</span>
      </div>

      <table className="home-todo-table">
        <thead>
          <tr>
            <th scope="col" aria-label="Done" />
            <th scope="col">Task</th>
            <th scope="col">Due</th>
            <th scope="col" aria-label="Delete" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="home-todo-empty" colSpan={4}>
                {todayOnly ? 'Nothing due today.' : 'Nothing open. Add the next thing.'}
              </td>
            </tr>
          ) : (
            rows.map(({ task, projectId: id }) => {
              const currentDue = dueValue(task, today)
              return (
                <tr key={task.id}>
                  <td>
                    <button
                      type="button"
                      className="home-check"
                      onClick={() => store.toggleTask(id, task.id)}
                      aria-label={`Complete ${task.text}`}
                    />
                  </td>
                  <td className="home-todo-text">{task.text}</td>
                  <td className="home-todo-due">
                    <Select
                      value={currentDue}
                      onChange={(value) => store.setTaskPlannedDate(id, task.id, value || null)}
                      options={dueDateOptions(today, currentDue)}
                      ariaLabel={`Due date for ${task.text}`}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="home-task-x"
                      aria-label={`Delete ${task.text}`}
                      onClick={() => {
                        const undo = store.removeTask(id, task.id)
                        toastUndo('Task deleted', undo, task.text)
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      <form
        className={`home-task-add${showProject ? ' home-task-add-business' : ' home-task-add-personal'}`}
        onSubmit={submit}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={showProject ? 'Add a business task' : 'Add a personal task'}
          aria-label={showProject ? 'Add a business task' : 'Add a personal task'}
        />
        {showProject && (
          <Select
            value={projectId}
            onChange={(value) => setProjectId(value as ProjectId)}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            ariaLabel="Project for the new task"
          />
        )}
        <Select
          value={due}
          onChange={setDue}
          options={dueDateOptions(today, due)}
          ariaLabel={`Due date for the new ${title.toLowerCase()} task`}
        />
        <button type="submit" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  )
}

export function HomeTasks({ store }: { store: Store }) {
  const [todayOnly, setTodayOnly] = useState(false)
  const today = todayDateKey()

  return (
    <section className="home-card home-todos">
      <div className="home-card-head">
        <div>
          <span className="home-kicker">Work</span>
          <h2>Tasks</h2>
        </div>
        <Button
          variant={todayOnly ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={todayOnly}
          onClick={() => setTodayOnly((on) => !on)}
        >
          {todayOnly ? 'Show all' : 'Today only'}
        </Button>
      </div>

      <div className="home-todo-tables">
        <TaskTable
          title="Business"
          projectIds={BUSINESS_IDS}
          store={store}
          todayOnly={todayOnly}
          today={today}
        />
        <TaskTable
          title="Personal"
          projectIds={['personal']}
          store={store}
          todayOnly={todayOnly}
          today={today}
        />
      </div>
    </section>
  )
}
