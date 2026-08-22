'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '../../components/PageSkeleton'
import { useSessionActions } from '../../components/SessionActions'
import { useStore } from '../../hooks/useStore'

const DashboardView = dynamic(
  () => import('../../components/DashboardView').then((m) => ({ default: m.DashboardView })),
  { ssr: false, loading: () => <PageSkeleton /> },
)

export default function TodayPage() {
  const store = useStore()
  const { startSession } = useSessionActions()
  return <DashboardView store={store} onStartProject={startSession} />
}
