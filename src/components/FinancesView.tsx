import { useState } from 'react'
import type { Store } from '../hooks/useStore'
import { formatMoney, totalAllocated, totalMonthlyExpenses, totalSpent } from '../utils/finance'
import { CashAllocationPanel } from './finance/CashAllocationPanel'
import { CashTrackerPanel } from './finance/CashTrackerPanel'
import { RevolutSyncPanel } from './finance/RevolutSyncPanel'
import { SetExpensesPanel } from './finance/SetExpensesPanel'
import { WishlistPanel } from './finance/WishlistPanel'
import { Modal } from './ui/Modal'

type FinanceModal = 'allocate' | 'expenses' | 'spend' | 'revolut' | 'wishlist' | null

export function FinancesView({ store }: { store: Store }) {
  const ledger = store.financeFor('personal')
  const monthly = totalMonthlyExpenses(ledger)
  const allocated = totalAllocated(ledger)
  const spent = totalSpent(ledger)
  const [modal, setModal] = useState<FinanceModal>(null)

  const pendingReview = store.state.revolutSync.personalQueue.length

  return (
    <div className="layout-stack finance-view finance-view-clean">
      <div className="finance-overview">
        <div className="finance-stat">
          <span className="finance-stat-label">Monthly set expenses</span>
          <strong className="finance-stat-value">{formatMoney(monthly)}</strong>
        </div>
        <div className="finance-stat">
          <span className="finance-stat-label">Cash allocated</span>
          <strong className="finance-stat-value">{formatMoney(allocated)}</strong>
        </div>
        <div className="finance-stat">
          <span className="finance-stat-label">Cash spent</span>
          <strong className="finance-stat-value">{formatMoney(spent)}</strong>
        </div>
      </div>

      <section className="action-board">
        <header className="action-board-head">
          <h2 className="action-board-title">Actions</h2>
          <p className="action-board-copy">Open only what you need. Keep the board clear.</p>
        </header>
        <div className="action-board-grid">
          <button type="button" className="action-tile" onClick={() => setModal('allocate')}>
            <span className="action-tile-kicker">Cash in</span>
            <span className="action-tile-name">Allocate cash</span>
            <span className="action-tile-desc">Split incoming money across buckets</span>
          </button>
          <button type="button" className="action-tile" onClick={() => setModal('expenses')}>
            <span className="action-tile-kicker">Fixed</span>
            <span className="action-tile-name">Set expenses</span>
            <span className="action-tile-desc">Recurring budgets and micro-expenses</span>
          </button>
          <button type="button" className="action-tile" onClick={() => setModal('spend')}>
            <span className="action-tile-kicker">Outflow</span>
            <span className="action-tile-name">Log spend</span>
            <span className="action-tile-desc">Daily cash tracker</span>
          </button>
          <button type="button" className="action-tile" onClick={() => setModal('wishlist')}>
            <span className="action-tile-kicker">Want</span>
            <span className="action-tile-name">Wishlist</span>
            <span className="action-tile-desc">
              {(ledger.wishlist?.length ?? 0) > 0
                ? `${ledger.wishlist.length} item${ledger.wishlist.length === 1 ? '' : 's'} parked`
                : 'Item + rough price before you buy'}
            </span>
          </button>
          <button type="button" className="action-tile accent" onClick={() => setModal('revolut')}>
            <span className="action-tile-kicker">Bank</span>
            <span className="action-tile-name">Sync Revolut</span>
            <span className="action-tile-desc">
              {pendingReview > 0
                ? `${pendingReview} transaction${pendingReview === 1 ? '' : 's'} to review`
                : 'Connect, sync day, categorize'}
            </span>
          </button>
        </div>
      </section>

      <Modal
        open={modal === 'allocate'}
        onClose={() => setModal(null)}
        title="Allocate cash"
        size="lg"
      >
        <CashAllocationPanel store={store} embedded />
      </Modal>

      <Modal
        open={modal === 'expenses'}
        onClose={() => setModal(null)}
        title="Set expenses"
        size="lg"
      >
        <SetExpensesPanel store={store} embedded />
      </Modal>

      <Modal open={modal === 'spend'} onClose={() => setModal(null)} title="Log spend" size="lg">
        <CashTrackerPanel store={store} embedded />
      </Modal>

      <Modal
        open={modal === 'wishlist'}
        onClose={() => setModal(null)}
        title="Spendings wishlist"
        size="md"
      >
        <WishlistPanel store={store} embedded />
      </Modal>

      <Modal
        open={modal === 'revolut'}
        onClose={() => setModal(null)}
        title="Sync Revolut"
        size="xl"
      >
        <RevolutSyncPanel store={store} embedded />
      </Modal>
    </div>
  )
}
