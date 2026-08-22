'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useStore } from '../../../hooks/useStore'

const CalendarView = dynamic(
  () => import('../../../components/CalendarView').then((m) => ({ default: m.CalendarView })),
  { ssr: false, loading: () => <PageSkeleton /> },
)

export default function CalendarPage() {
  const store = useStore()
  return <CalendarView store={store} />
}
