'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useStore } from '../../../hooks/useStore'

const VisionView = dynamic(
  () => import('../../../components/VisionView').then((m) => ({ default: m.VisionView })),
  { ssr: false, loading: () => <PageSkeleton /> },
)

export default function VisionPage() {
  const store = useStore()
  return <VisionView store={store} />
}
