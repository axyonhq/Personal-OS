import type {
  CompanyTask,
  CompanyTaskEnergy,
  CompanyTaskStatus,
  EisenhowerQuadrant,
} from '@/types'
import { createClerkSupabaseClient } from './browser'

type TokenSession = { getToken: () => Promise<string | null> }

type TaskRow = {
  id: string
  user_id: string
  title: string
  priority: string
  status: CompanyTaskStatus
  notes: string | null
  parent_id: string | null
  sort_order: number | null
  hidden: boolean | null
  deadline: string | null
  energy_required: string | null
  created_at: string
  updated_at: string
}

const ENERGY_VALUES: Record<string, CompanyTaskEnergy> = {
  max: 'max',
  medium: 'medium',
  little: 'little',
}

function normalizeEnergy(raw: string | null | undefined): CompanyTaskEnergy | null {
  if (!raw) return null
  return ENERGY_VALUES[raw] ?? null
}

const LEGACY_PRIORITY: Record<string, EisenhowerQuadrant> = {
  hpa1: 'do',
  hpa2: 'schedule',
  hpa3: 'delegate',
  do: 'do',
  schedule: 'schedule',
  delegate: 'delegate',
  eliminate: 'eliminate',
}

function normalizePriority(raw: string): EisenhowerQuadrant {
  return LEGACY_PRIORITY[raw] ?? 'schedule'
}

function mapTask(row: TaskRow, blockedByIds: string[]): CompanyTask {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    priority: normalizePriority(row.priority),
    status: row.status,
    notes: row.notes ?? '',
    parentId: row.parent_id,
    sortOrder: row.sort_order ?? 0,
    hidden: Boolean(row.hidden),
    deadline: row.deadline ?? null,
    energyRequired: normalizeEnergy(row.energy_required),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blockedByIds,
  }
}

export async function listCompanyTasks(session: TokenSession, userId: string): Promise<CompanyTask[]> {
  const client = createClerkSupabaseClient(() => session.getToken())
  if (!client) throw new Error('Supabase is not configured')

  const { data: tasks, error } = await client
    .from('company_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  const ids = (tasks || []).map((t) => t.id as string)
  let deps: { blocked_task_id: string; blocking_task_id: string }[] = []
  if (ids.length) {
    const { data: depRows, error: depError } = await client
      .from('company_task_dependencies')
      .select('blocked_task_id, blocking_task_id')
      .in('blocked_task_id', ids)
    if (depError) throw new Error(depError.message)
    deps = (depRows || []) as typeof deps
  }

  const byBlocked = new Map<string, string[]>()
  for (const d of deps) {
    const list = byBlocked.get(d.blocked_task_id) || []
    list.push(d.blocking_task_id)
    byBlocked.set(d.blocked_task_id, list)
  }

  return (tasks || []).map((row) => mapTask(row as TaskRow, byBlocked.get(row.id as string) || []))
}

export async function createCompanyTask(
  session: TokenSession,
  input: {
    userId: string
    title: string
    priority?: EisenhowerQuadrant
    notes?: string
    parentId?: string | null
    blockedByIds?: string[]
    sortOrder?: number
  },
): Promise<CompanyTask> {
  const client = createClerkSupabaseClient(() => session.getToken())
  if (!client) throw new Error('Supabase is not configured')

  let sortOrder = input.sortOrder
  if (sortOrder === undefined && !input.parentId) {
    const { data: maxRows, error: maxError } = await client
      .from('company_tasks')
      .select('sort_order')
      .eq('user_id', input.userId)
      .is('parent_id', null)
      .order('sort_order', { ascending: false })
      .limit(1)
    if (maxError) throw new Error(maxError.message)
    sortOrder = ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1
  }

  const { data, error } = await client
    .from('company_tasks')
    .insert({
      user_id: input.userId,
      title: input.title.trim(),
      priority: input.priority ?? 'do',
      status: 'not_started',
      notes: input.notes?.trim() ?? '',
      parent_id: input.parentId ?? null,
      sort_order: sortOrder ?? 0,
      hidden: false,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  const blockedByIds = [...new Set((input.blockedByIds || []).filter(Boolean))]
  if (blockedByIds.length && !input.parentId) {
    const { error: depError } = await client.from('company_task_dependencies').insert(
      blockedByIds.map((blocking_task_id) => ({
        blocked_task_id: data.id,
        blocking_task_id,
      })),
    )
    if (depError) throw new Error(depError.message)
  }

  return mapTask(data as TaskRow, blockedByIds)
}

export async function updateCompanyTask(
  session: TokenSession,
  taskId: string,
  patch: Partial<{
    title: string
    priority: EisenhowerQuadrant
    status: CompanyTaskStatus
    notes: string
    blockedByIds: string[]
    sortOrder: number
    hidden: boolean
    deadline: string | null
    energyRequired: CompanyTaskEnergy | null
  }>,
): Promise<void> {
  const client = createClerkSupabaseClient(() => session.getToken())
  if (!client) throw new Error('Supabase is not configured')

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof patch.title === 'string') updates.title = patch.title.trim()
  if (patch.priority) updates.priority = patch.priority
  if (patch.status) updates.status = patch.status
  if (typeof patch.notes === 'string') updates.notes = patch.notes
  if (typeof patch.sortOrder === 'number') updates.sort_order = patch.sortOrder
  if (typeof patch.hidden === 'boolean') updates.hidden = patch.hidden
  if (patch.deadline !== undefined) updates.deadline = patch.deadline || null
  if (patch.energyRequired !== undefined) updates.energy_required = patch.energyRequired

  if (Object.keys(updates).length > 1) {
    const { error } = await client.from('company_tasks').update(updates).eq('id', taskId)
    if (error) throw new Error(error.message)
  }

  if (patch.blockedByIds) {
    const next = [...new Set(patch.blockedByIds.filter((id) => id && id !== taskId))]
    const { error: delError } = await client
      .from('company_task_dependencies')
      .delete()
      .eq('blocked_task_id', taskId)
    if (delError) throw new Error(delError.message)
    if (next.length) {
      const { error: insError } = await client.from('company_task_dependencies').insert(
        next.map((blocking_task_id) => ({
          blocked_task_id: taskId,
          blocking_task_id,
        })),
      )
      if (insError) throw new Error(insError.message)
    }
  }
}

/** Persist a new global order for root tasks (ids in display order). */
export async function reorderCompanyTasks(
  session: TokenSession,
  orderedIds: string[],
): Promise<void> {
  const client = createClerkSupabaseClient(() => session.getToken())
  if (!client) throw new Error('Supabase is not configured')

  const now = new Date().toISOString()
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      client.from('company_tasks').update({ sort_order: index, updated_at: now }).eq('id', id),
    ),
  )
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw new Error(firstError.message)
}

/** Clear hidden on every task belonging to the user. */
export async function unhideAllCompanyTasks(session: TokenSession, userId: string): Promise<void> {
  const client = createClerkSupabaseClient(() => session.getToken())
  if (!client) throw new Error('Supabase is not configured')

  const { error } = await client
    .from('company_tasks')
    .update({ hidden: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('hidden', true)
  if (error) throw new Error(error.message)
}

export async function deleteCompanyTask(session: TokenSession, taskId: string): Promise<void> {
  const client = createClerkSupabaseClient(() => session.getToken())
  if (!client) throw new Error('Supabase is not configured')
  const { error } = await client.from('company_tasks').delete().eq('id', taskId)
  if (error) throw new Error(error.message)
}
