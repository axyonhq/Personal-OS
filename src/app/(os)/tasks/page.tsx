'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useSessionActions } from '../../../components/SessionActions'
import { useStore } from '../../../hooks/useStore'

const TasksView = dynamic(
  () => import('../../../components/TasksView').then((m) => ({ default: m.TasksView })),
  { ssr: false, loading: () => <PageSkeleton /> },
)

export default function TasksPage() {
  const store = useStore()
  const { startSession } = useSessionActions()
  return <TasksView store={store} onStartSession={startSession} />
}
