'use client'

import { useAuth, useSession } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HudPanel } from '../HudPanel'
import { Checkbox } from '../ui/Checkbox'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import {
  createCompanyTask,
  deleteCompanyTask,
  listCompanyTasks,
  reorderCompanyTasks,
  unhideAllCompanyTasks,
  updateCompanyTask,
} from '../../lib/supabase/companyTodos'
import type {
  CompanyTask,
  CompanyTaskEnergy,
  CompanyTaskStatus,
  EisenhowerQuadrant,
} from '../../types'
import { deadlineTone, formatDeadlineCountdown } from '../../utils/deadline'
import { EISENHOWER_META, EISENHOWER_OPTIONS, EISENHOWER_ORDER } from '../../utils/eisenhower'
import { todayDateKey } from '../../utils/time'

type FocusFilter = 'focus' | 'all' | 'waiting' | 'done'

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

const ENERGY_OPTIONS = [
  { value: '', label: 'Energy' },
  { value: 'max', label: 'Max' },
  { value: 'medium', label: 'Medium' },
  { value: 'little', label: 'Little' },
]

const ESTIMATE_OPTIONS = [
  { value: '', label: 'Time' },
  { value: '1', label: '1 hour' },
  { value: '2', label: '2 hours' },
  { value: '3', label: '3 hours' },
  { value: '4', label: '4 hours' },
  { value: '6', label: '6 hours' },
  { value: '8', label: '8 hours' },
  { value: '10', label: '10 hours' },
  { value: '12', label: '12 hours' },
  { value: '16', label: '16 hours' },
  { value: '20', label: '20 hours' },
  { value: '24', label: '24 hours' },
]

function estimateSelectValue(hours: number | null): string {
  if (hours == null) return ''
  const match = ESTIMATE_OPTIONS.find((o) => o.value === String(hours))
  if (match) return match.value
  return String(hours)
}

function estimateOptionsFor(hours: number | null) {
  const value = estimateSelectValue(hours)
  if (!value || ESTIMATE_OPTIONS.some((o) => o.value === value)) return ESTIMATE_OPTIONS
  const label = Number(value) === 1 ? '1 hour' : `${value} hours`
  return [...ESTIMATE_OPTIONS, { value, label }]
}

function compareBySortOrder(a: CompanyTask, b: CompanyTask) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.createdAt.localeCompare(b.createdAt)
}

export function CompanyTodosView() {
  const { userId, isLoaded } = useAuth()
  const { session } = useSession()
  const [tasks, setTasks] = useState<CompanyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<EisenhowerQuadrant>('do')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<FocusFilter>('focus')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CompanyTask | null>(null)
  const [subDraft, setSubDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [deadlineTask, setDeadlineTask] = useState<CompanyTask | null>(null)
  const [deadlineDraft, setDeadlineDraft] = useState('')
  const [deadlineSaving, setDeadlineSaving] = useState(false)
  const dragListIdsRef = useRef<string[]>([])
  const today = todayDateKey()

  const refresh = useCallback(async () => {
    if (!session || !userId) return
    setLoading(true)
    setError(null)
    try {
      const rows = await listCompanyTasks(session, userId)
      setTasks(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [session, userId])

  useEffect(() => {
    if (!isLoaded) return
    if (!userId || !session) {
      setLoading(false)
      return
    }
    void refresh()
  }, [isLoaded, userId, session, refresh])

  const roots = useMemo(() => tasks.filter((t) => !t.parentId), [tasks])
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, CompanyTask[]>()
    for (const t of tasks) {
      if (!t.parentId) continue
      const list = map.get(t.parentId) || []
      list.push(t)
      map.set(t.parentId, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }
    return map
  }, [tasks])

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of roots) map.set(t.id, t.title)
    return map
  }, [roots])

  const openTask = useMemo(
    () => (openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null),
    [openTaskId, tasks],
  )

  const openSubs = useMemo(
    () => (openTask ? subtasksByParent.get(openTask.id) || [] : []),
    [openTask, subtasksByParent],
  )

  const isBlocked = useCallback(
    (task: CompanyTask) => {
      const openBlockers = task.blockedByIds.filter((id) => {
        const blocker = roots.find((t) => t.id === id)
        return blocker && blocker.status !== 'done'
      })
      return openBlockers.length > 0
    },
    [roots],
  )

  const openRoots = useMemo(
    () =>
      roots
        .filter((t) => t.status !== 'done')
        .sort((a, b) => {
          const order = compareBySortOrder(a, b)
          if (order !== 0) return order
          const pa = EISENHOWER_META[a.priority].order
          const pb = EISENHOWER_META[b.priority].order
          if (pa !== pb) return pa - pb
          const ba = isBlocked(a) ? 1 : 0
          const bb = isBlocked(b) ? 1 : 0
          if (ba !== bb) return ba - bb
          return 0
        }),
    [roots, isBlocked],
  )

  const focusTasks = useMemo(() => {
    return openRoots.filter((t) => {
      if (isBlocked(t)) return false
      return t.priority === 'do' || t.priority === 'schedule'
    })
  }, [openRoots, isBlocked])

  const waitingTasks = useMemo(() => openRoots.filter((t) => isBlocked(t)), [openRoots, isBlocked])

  const doneRoots = useMemo(
    () =>
      roots
        .filter((t) => t.status === 'done')
        .sort((a, b) => {
          const order = compareBySortOrder(a, b)
          if (order !== 0) return order
          return b.updatedAt.localeCompare(a.updatedAt)
        }),
    [roots],
  )

  const visible = useMemo(() => {
    if (filter === 'focus') return focusTasks
    if (filter === 'waiting') return waitingTasks
    if (filter === 'done') return doneRoots
    return openRoots
  }, [filter, focusTasks, waitingTasks, doneRoots, openRoots])

  const groupedAll = useMemo(() => {
    if (filter !== 'all') return null
    return EISENHOWER_ORDER.map((q) => ({
      quadrant: q,
      tasks: openRoots.filter((t) => t.priority === q && !isBlocked(t)),
    })).filter((g) => g.tasks.length > 0)
  }, [filter, openRoots, isBlocked])

  const hiddenCount = useMemo(() => roots.filter((t) => t.hidden).length, [roots])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !userId || !title.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await createCompanyTask(session, { userId, title, priority })
      setTitle('')
      setPriority('do')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(task: CompanyTask, status: CompanyTaskStatus) {
    if (!session) return
    try {
      await updateCompanyTask(session, task.id, { status })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  async function setTaskPriority(task: CompanyTask, next: EisenhowerQuadrant) {
    if (!session) return
    try {
      await updateCompanyTask(session, task.id, { priority: next })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update priority')
    }
  }

  async function setTaskEnergy(task: CompanyTask, next: CompanyTaskEnergy | null) {
    if (!session) return
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, energyRequired: next } : t)),
    )
    try {
      await updateCompanyTask(session, task.id, { energyRequired: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update energy')
      await refresh()
    }
  }

  async function setTaskEstimate(task: CompanyTask, next: number | null) {
    if (!session) return
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, estimateHours: next } : t)),
    )
    try {
      await updateCompanyTask(session, task.id, { estimateHours: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update time estimate')
      await refresh()
    }
  }

  function openDeadlineEditor(task: CompanyTask) {
    if (task.hidden) return
    setDeadlineTask(task)
    setDeadlineDraft(task.deadline ?? today)
  }

  async function closeDeadlineEditor() {
    if (deadlineSaving) return
    setDeadlineTask(null)
    setDeadlineDraft('')
  }

  async function saveDeadline(clear = false) {
    if (!session || !deadlineTask || deadlineSaving) return
    const next = clear ? null : deadlineDraft || null
    setDeadlineSaving(true)
    setError(null)
    setTasks((prev) =>
      prev.map((t) => (t.id === deadlineTask.id ? { ...t, deadline: next } : t)),
    )
    try {
      await updateCompanyTask(session, deadlineTask.id, { deadline: next })
      setDeadlineTask(null)
      setDeadlineDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save deadline')
      await refresh()
    } finally {
      setDeadlineSaving(false)
    }
  }

  async function persistNotes(task: CompanyTask, notes: string) {
    if (!session) return
    try {
      await updateCompanyTask(session, task.id, { notes })
      setNotesDirty(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes')
    }
  }

  async function saveNotesIfDirty(task: CompanyTask | null = openTask) {
    if (!task || !notesDirty) return
    await persistNotes(task, noteDraft)
  }

  async function addSubtask(parent: CompanyTask) {
    if (!session || !userId) return
    const text = subDraft.trim()
    if (!text) return
    try {
      await createCompanyTask(session, {
        userId,
        title: text,
        priority: parent.priority,
        parentId: parent.id,
      })
      setSubDraft('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add sub-task')
    }
  }

  async function hideTask(task: CompanyTask) {
    if (!session || task.hidden) return
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, hidden: true } : t)))
    try {
      await updateCompanyTask(session, task.id, { hidden: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hide task')
      await refresh()
    }
  }

  async function showAllHidden() {
    if (!session || !userId || hiddenCount === 0) return
    setTasks((prev) => prev.map((t) => (t.hidden ? { ...t, hidden: false } : t)))
    try {
      await unhideAllCompanyTasks(session, userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to show all tasks')
      await refresh()
    }
  }

  async function applyReorder(listIds: string[], fromId: string, toId: string) {
    if (!session || fromId === toId) return
    const from = listIds.indexOf(fromId)
    const to = listIds.indexOf(toId)
    if (from < 0 || to < 0) return

    const nextList = [...listIds]
    nextList.splice(from, 1)
    nextList.splice(to, 0, fromId)

    const visibleSet = new Set(listIds)
    const allRootIds = [...roots].sort(compareBySortOrder).map((t) => t.id)
    let vi = 0
    const merged = allRootIds.map((id) => {
      if (!visibleSet.has(id)) return id
      return nextList[vi++]
    })

    const orderById = new Map(merged.map((id, index) => [id, index]))
    setTasks((prev) =>
      prev.map((t) => {
        const nextOrder = orderById.get(t.id)
        return nextOrder === undefined ? t : { ...t, sortOrder: nextOrder }
      }),
    )

    try {
      await reorderCompanyTasks(session, merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder tasks')
      await refresh()
    }
  }

  async function confirmDelete() {
    if (!session || !pendingDelete) return
    const task = pendingDelete
    setPendingDelete(null)
    try {
      await deleteCompanyTask(session, task.id)
      if (openTaskId === task.id || task.parentId === openTaskId) {
        if (openTaskId === task.id) {
          setOpenTaskId(null)
          setNotesDirty(false)
        }
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  function openDetail(task: CompanyTask) {
    if (task.hidden) return
    setOpenTaskId(task.id)
    setNoteDraft(task.notes)
    setNotesDirty(false)
    setSubDraft('')
  }

  async function closeDetail() {
    const task = openTask
    if (task && notesDirty) {
      await persistNotes(task, noteDraft)
    }
    setOpenTaskId(null)
    setSubDraft('')
    setNotesDirty(false)
  }

  function renderTask(task: CompanyTask, listIds: string[]) {
    const meta = EISENHOWER_META[task.priority]
    const blocked = isBlocked(task)
    const blockedNames = task.blockedByIds
      .map((id) => titleById.get(id))
      .filter(Boolean) as string[]
    const subs = subtasksByParent.get(task.id) || []
    const doneSubs = subs.filter((s) => s.status === 'done').length
    const hasNotes = Boolean(task.notes.trim())
    const created = new Date(task.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    const isDragging = dragId === task.id
    const isDropTarget = dropTargetId === task.id && dragId !== task.id

    return (
      <li
        key={task.id}
        className={`company-todo${blocked ? ' blocked' : ''}${task.hidden ? ' is-hidden' : ''}${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
        onDragOver={(e) => {
          if (!dragId || dragId === task.id) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dropTargetId !== task.id) setDropTargetId(task.id)
        }}
        onDrop={(e) => {
          e.preventDefault()
          const fromId = dragId || e.dataTransfer.getData('text/task-id')
          const list = dragListIdsRef.current.length ? dragListIdsRef.current : listIds
          setDragId(null)
          setDropTargetId(null)
          if (fromId) void applyReorder(list, fromId, task.id)
        }}
      >
        <div className="company-todo-main">
          <button
            type="button"
            className="company-todo-drag"
            draggable={!task.hidden}
            aria-label={`Drag to reorder ${task.hidden ? 'hidden task' : task.title}`}
            title="Drag to reorder"
            onDragStart={(e) => {
              if (task.hidden) {
                e.preventDefault()
                return
              }
              dragListIdsRef.current = listIds
              setDragId(task.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/task-id', task.id)
            }}
            onDragEnd={() => {
              setDragId(null)
              setDropTargetId(null)
            }}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
          <Checkbox
            checked={task.status === 'done'}
            onChange={(on) => void setStatus(task, on ? 'done' : 'not_started')}
            aria-label={`Mark ${task.hidden ? 'hidden task' : task.title} done`}
            disabled={task.hidden}
          />
          <button
            type="button"
            className="company-todo-title-btn"
            onClick={() => openDetail(task)}
            aria-label={task.hidden ? 'Hidden task' : `Open ${task.title}`}
            disabled={task.hidden}
          >
            <span className={`company-todo-title-text${task.status === 'done' ? ' done' : ''}`}>
              {task.title}
            </span>
            {subs.length > 0 && (
              <span className="company-todo-subcount">
                {doneSubs}/{subs.length}
              </span>
            )}
            {hasNotes && <span className="company-todo-note-dot" title="Has notes" aria-hidden="true" />}
          </button>
          <div className="company-todo-meta">
            <span className={`hpa-pill ${meta.className}`} title={meta.hint}>
              {meta.label}
            </span>
            <span className="company-todo-date">{created}</span>
            <Select
              className="company-todo-select"
              value={task.priority}
              ariaLabel="Eisenhower quadrant"
              options={EISENHOWER_OPTIONS}
              onChange={(v) => void setTaskPriority(task, v as EisenhowerQuadrant)}
              disabled={task.hidden}
            />
            <Select
              className="company-todo-select"
              value={task.status}
              ariaLabel="Status"
              options={STATUS_OPTIONS}
              onChange={(v) => void setStatus(task, v as CompanyTaskStatus)}
              disabled={task.hidden}
            />
            <button
              type="button"
              className={`company-todo-deadline tone-${deadlineTone(task.deadline, today)}`}
              onClick={() => openDeadlineEditor(task)}
              disabled={task.hidden}
              title={task.deadline ? `Deadline ${task.deadline}` : 'Set deadline'}
              aria-label={
                task.deadline
                  ? `Deadline ${formatDeadlineCountdown(task.deadline, today)}. Change deadline.`
                  : 'Set deadline'
              }
            >
              {formatDeadlineCountdown(task.deadline, today)}
            </button>
            <Select
              className="company-todo-select company-todo-energy"
              value={task.energyRequired ?? ''}
              ariaLabel="Energy required"
              options={ENERGY_OPTIONS}
              onChange={(v) => void setTaskEnergy(task, (v || null) as CompanyTaskEnergy | null)}
              disabled={task.hidden}
            />
            <Select
              className="company-todo-select company-todo-estimate"
              value={estimateSelectValue(task.estimateHours)}
              ariaLabel="Time estimate"
              options={estimateOptionsFor(task.estimateHours)}
              onChange={(v) => void setTaskEstimate(task, v ? Number(v) : null)}
              disabled={task.hidden}
            />
            {!task.hidden && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void hideTask(task)}
                title="Blur this task so you cannot read it"
              >
                Hide
              </button>
            )}
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setPendingDelete(task)}
              disabled={task.hidden}
            >
              Remove
            </button>
          </div>
        </div>

        {blocked && !task.hidden && (
          <p className="company-todo-blocked">Waiting on: {blockedNames.join(', ')}</p>
        )}
      </li>
    )
  }

  const focusHint =
    filter === 'focus'
      ? 'Showing Do First + Schedule only — unblocked work that actually moves the company.'
      : filter === 'waiting'
        ? 'Blocked tasks. Clear the dependency, then they resurface in Focus.'
        : filter === 'done'
          ? 'Completed work archive.'
          : 'Full matrix view by quadrant.'

  const openDoneSubs = openSubs.filter((s) => s.status === 'done').length

  return (
    <div className="layout-stack company-todos">
      <HudPanel label="To-Dos">
        <div className="company-todo-toolbar">
          <p className="finance-hint">{focusHint}</p>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="btn-secondary compact company-todo-show-all"
              onClick={() => void showAllHidden()}
            >
              Show all ({hiddenCount})
            </button>
          )}
        </div>

        <div className="focus-filter-bar" role="tablist" aria-label="Task focus">
          {(
            [
              ['focus', `Focus (${focusTasks.length})`],
              ['all', `Matrix (${openRoots.length})`],
              ['waiting', `Waiting (${waitingTasks.length})`],
              ['done', `Done (${doneRoots.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`focus-filter-btn${filter === id ? ' active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="company-todo-form" onSubmit={(e) => void handleCreate(e)}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a company task…"
            aria-label="New task title"
          />
          <Select
            value={priority}
            onChange={(v) => setPriority(v as EisenhowerQuadrant)}
            options={EISENHOWER_OPTIONS}
            ariaLabel="Eisenhower quadrant"
          />
          <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
            Add
          </button>
        </form>

        {error && <p className="revolut-feedback bad">{error}</p>}
        {loading && <p className="finance-empty">Loading tasks…</p>}
        {!loading && visible.length === 0 && !groupedAll?.length && (
          <p className="finance-empty">
            {filter === 'focus'
              ? 'Nothing in focus. Add a Do First or Schedule task — or clear a blocker.'
              : 'No tasks here.'}
          </p>
        )}

        {!loading && filter === 'all' && groupedAll && (
          <ul className="company-todo-list">
            {groupedAll.map((group) => {
              const listIds = group.tasks.map((t) => t.id)
              return (
                <li key={group.quadrant} className="company-todo-group">
                  <div className="company-todo-group-head">
                    <span className={`hpa-pill ${EISENHOWER_META[group.quadrant].className}`}>
                      {EISENHOWER_META[group.quadrant].label}
                    </span>
                    <span className="company-todo-group-hint">
                      {EISENHOWER_META[group.quadrant].hint}
                    </span>
                    <span className="company-todo-group-count">{group.tasks.length}</span>
                  </div>
                  <ul>{group.tasks.map((task) => renderTask(task, listIds))}</ul>
                </li>
              )
            })}
            {waitingTasks.length > 0 && (
              <li className="company-todo-group">
                <div className="company-todo-group-head">
                  <span className="hpa-pill eq-waiting">Waiting</span>
                  <span className="company-todo-group-hint">Blocked by dependencies</span>
                  <span className="company-todo-group-count">{waitingTasks.length}</span>
                </div>
                <ul>
                  {waitingTasks.map((task) =>
                    renderTask(
                      task,
                      waitingTasks.map((t) => t.id),
                    ),
                  )}
                </ul>
              </li>
            )}
          </ul>
        )}

        {!loading && filter !== 'all' && visible.length > 0 && (
          <ul className="company-todo-list">
            <li className="company-todo-group">
              <ul>
                {visible.map((task) =>
                  renderTask(
                    task,
                    visible.map((t) => t.id),
                  ),
                )}
              </ul>
            </li>
          </ul>
        )}
      </HudPanel>

      <Modal
        open={!!openTask}
        onClose={() => void closeDetail()}
        title={openTask?.title ?? 'Task'}
        size="lg"
        className="company-task-modal"
      >
        {openTask && (
          <div className="company-task-detail">
            <div className="company-task-detail-meta">
              <span className={`hpa-pill ${EISENHOWER_META[openTask.priority].className}`}>
                {EISENHOWER_META[openTask.priority].label}
              </span>
              <Select
                className="company-todo-select"
                value={openTask.priority}
                ariaLabel="Eisenhower quadrant"
                options={EISENHOWER_OPTIONS}
                onChange={(v) => void setTaskPriority(openTask, v as EisenhowerQuadrant)}
              />
              <Select
                className="company-todo-select"
                value={openTask.status}
                ariaLabel="Status"
                options={STATUS_OPTIONS}
                onChange={(v) => void setStatus(openTask, v as CompanyTaskStatus)}
              />
              <button
                type="button"
                className={`company-todo-deadline tone-${deadlineTone(openTask.deadline, today)}`}
                onClick={() => openDeadlineEditor(openTask)}
                title={openTask.deadline ? `Deadline ${openTask.deadline}` : 'Set deadline'}
                aria-label={
                  openTask.deadline
                    ? `Deadline ${formatDeadlineCountdown(openTask.deadline, today)}. Change deadline.`
                    : 'Set deadline'
                }
              >
                {formatDeadlineCountdown(openTask.deadline, today)}
              </button>
              <Select
                className="company-todo-select company-todo-energy"
                value={openTask.energyRequired ?? ''}
                ariaLabel="Energy required"
                options={ENERGY_OPTIONS}
                onChange={(v) =>
                  void setTaskEnergy(openTask, (v || null) as CompanyTaskEnergy | null)
                }
              />
              <Select
                className="company-todo-select company-todo-estimate"
                value={estimateSelectValue(openTask.estimateHours)}
                ariaLabel="Time estimate"
                options={estimateOptionsFor(openTask.estimateHours)}
                onChange={(v) => void setTaskEstimate(openTask, v ? Number(v) : null)}
              />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  void hideTask(openTask)
                  void closeDetail()
                }}
              >
                Hide
              </button>
            </div>

            <label className="field-label" htmlFor="company-task-notes">
              Notes
            </label>
            <textarea
              id="company-task-notes"
              className="company-todo-notes"
              rows={5}
              placeholder="Context, links, decisions…"
              value={noteDraft}
              onChange={(e) => {
                setNoteDraft(e.target.value)
                setNotesDirty(true)
              }}
              onBlur={() => void saveNotesIfDirty(openTask)}
            />

            <div className="company-todo-subs">
              <div className="company-todo-subs-head">
                <span className="field-label">Sub-tasks</span>
                {openSubs.length > 0 && (
                  <span className="company-todo-group-count">
                    {openDoneSubs}/{openSubs.length}
                  </span>
                )}
              </div>
              <ul className="company-todo-sublist">
                {openSubs.map((sub) => (
                  <li key={sub.id} className="company-todo-subitem">
                    <Checkbox
                      checked={sub.status === 'done'}
                      onChange={(on) => void setStatus(sub, on ? 'done' : 'not_started')}
                      label={sub.title}
                    />
                    <button
                      type="button"
                      className="x-btn visible"
                      aria-label={`Remove ${sub.title}`}
                      onClick={() => setPendingDelete(sub)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="company-todo-subform"
                onSubmit={(e) => {
                  e.preventDefault()
                  void addSubtask(openTask)
                }}
              >
                <input
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  placeholder="Break this into a sub-task…"
                  aria-label="New sub-task"
                />
                <button type="submit" className="btn-secondary compact" disabled={!subDraft.trim()}>
                  Add
                </button>
              </form>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deadlineTask}
        onClose={() => void closeDeadlineEditor()}
        title="Deadline"
        size="sm"
        className="company-deadline-modal"
        footer={
          <div className="btn-row company-deadline-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void saveDeadline(true)}
              disabled={deadlineSaving || !deadlineTask?.deadline}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-secondary compact"
              onClick={() => void closeDeadlineEditor()}
              disabled={deadlineSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary compact"
              onClick={() => void saveDeadline(false)}
              disabled={deadlineSaving || !deadlineDraft}
            >
              {deadlineSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        {deadlineTask && (
          <div className="company-deadline-editor">
            <p className="finance-hint">
              Pick a due date. The list shows a countdown after you save.
            </p>
            <label className="field-label" htmlFor="company-task-deadline">
              Due date
            </label>
            <input
              id="company-task-deadline"
              type="date"
              value={deadlineDraft}
              onChange={(e) => setDeadlineDraft(e.target.value)}
              aria-label="Deadline date"
            />
            {deadlineDraft && (
              <p className={`company-todo-deadline-preview tone-${deadlineTone(deadlineDraft, today)}`}>
                Preview: {formatDeadlineCountdown(deadlineDraft, today)}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete task"
        message={
          pendingDelete
            ? `Delete “${pendingDelete.title}”?${pendingDelete.parentId ? '' : ' Sub-tasks will be removed too.'}`
            : ''
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
