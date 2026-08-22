'use client'

import dynamic from 'next/dynamic'
import { PageSkeleton } from '../../../components/PageSkeleton'
import { useStore } from '../../../hooks/useStore'

const FinancesView = dynamic(
  () => import('../../../components/FinancesView').then((m) => ({ default: m.FinancesView })),
  { ssr: false, loading: () => <PageSkeleton /> },
)

export default function MoneyPage() {
  const store = useStore()
  return <FinancesView store={store} />
}
