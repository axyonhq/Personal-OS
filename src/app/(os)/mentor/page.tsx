'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useStore } from '../../../hooks/useStore'

const MentorView = dynamic(
  () => import('../../../components/MentorView').then((m) => ({ default: m.MentorView })),
  { ssr: false, loading: () => <PageSkeleton /> },
)

export default function MentorPage() {
  const store = useStore()
  return <MentorView store={store} />
}
