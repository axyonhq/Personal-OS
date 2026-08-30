'use client'

import { RefreshCw, Tags } from 'lucide-react'
import { useState } from 'react'
import type { Store } from '../../hooks/useStore'
import { RevolutSyncPanel } from '../finance/RevolutSyncPanel'
import { SetExpensesPanel } from '../finance/SetExpensesPanel'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function HomeFinances({ store }: { store: Store }) {
  const [modal, setModal] = useState<'categories' | 'revolut' | null>(null)
  const pending = store.state.revolutSync.personalQueue.length

  return (
    <section className="home-card">
      <div className="home-card-head">
        <div>
          <span className="home-kicker">Money</span>
          <h2>Finances</h2>
        </div>
      </div>
      <p className="home-card-copy">Set the buckets. Log spend from Revolut.</p>
      <div className="home-card-actions">
        <Button variant="secondary" iconLeft={<Tags />} onClick={() => setModal('categories')}>
          Edit categories
        </Button>
        <Button variant="primary" iconLeft={<RefreshCw />} onClick={() => setModal('revolut')}>
          Log spend
          {pending > 0 ? ` · ${pending}` : ''}
        </Button>
      </div>

      <Modal open={modal === 'categories'} onClose={() => setModal(null)} title="Categories" size="lg">
        <SetExpensesPanel store={store} embedded />
      </Modal>
      <Modal open={modal === 'revolut'} onClose={() => setModal(null)} title="Log spend · Revolut" size="xl">
        <RevolutSyncPanel store={store} embedded />
      </Modal>
    </section>
  )
}
