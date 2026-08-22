'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useSessionActions } from '../../../components/SessionActions'
import { useStore } from '../../../hooks/useStore'

const AutopilotView = dynamic(
  () => import('../../../components/AutopilotView').then((m) => ({ default: m.AutopilotView })),
  { ssr: false, loading: () => <PageSkeleton /> },
)

export default function AutopilotPage() {
  const store = useStore()
  const { startPersonalMinimized } = useSessionActions()
  return <AutopilotView store={store} onStartPersonalMinimized={startPersonalMinimized} />
}
