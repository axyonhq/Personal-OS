import { useState } from 'react'
import type { Store } from '../hooks/useStore'
import type { FinanceRealm } from '../types'
import { formatMoney, totalAllocated, totalMonthlyExpenses, totalSpent } from '../utils/finance'
import { CashAllocationPanel } from './finance/CashAllocationPanel'
import { CashTrackerPanel } from './finance/CashTrackerPanel'
import { CompanyRevolutBuckets } from './finance/CompanyRevolutBuckets'
import { PersonalFinanceDashboard } from './finance/PersonalFinanceDashboard'
import { RevolutSyncPanel } from './finance/RevolutSyncPanel'
import { SetExpensesPanel } from './finance/SetExpensesPanel'
import { WishlistPanel } from './finance/WishlistPanel'
import { Modal } from './ui/Modal'

type FinanceModal = 'allocate' | 'expenses' | 'spend' | 'revolut' | 'wishlist' | null

export function FinancesView({
  store,
  realm,
}: {
  store: Store
  realm: FinanceRealm
}) {
  const ledger = store.financeFor(realm)
  const [balanceTick, setBalanceTick] = useState(0)
  const [modal, setModal] = useState<FinanceModal>(null)

  const spendMode = realm === 'personal' ? 'daily' : 'simple'
  const pendingReview =
    realm === 'personal'
      ? store.state.revolutSync.personalQueue.length
      : store.state.revolutSync.companyQueue.length

  const actions = (
    <div className={realm === 'personal' ? 'finance-dock' : 'action-board-grid'}>
      <button
        type="button"
        className={realm === 'personal' ? 'finance-dock-btn' : 'action-tile'}
        onClick={() => setModal('allocate')}
      >
        <span className={realm === 'personal' ? 'finance-dock-kicker' : 'action-tile-kicker'}>
          Cash in
        </span>
        <span className={realm === 'personal' ? 'finance-dock-name' : 'action-tile-name'}>
          Allocate cash
        </span>
        {realm !== 'personal' && (
          <span className="action-tile-desc">Split incoming money across buckets</span>
        )}
      </button>
      <button
        type="button"
        className={realm === 'personal' ? 'finance-dock-btn' : 'action-tile'}
        onClick={() => setModal('expenses')}
      >
        <span className={realm === 'personal' ? 'finance-dock-kicker' : 'action-tile-kicker'}>
          Fixed
        </span>
        <span className={realm === 'personal' ? 'finance-dock-name' : 'action-tile-name'}>
          Set expenses
        </span>
        {realm !== 'personal' && (
          <span className="action-tile-desc">Recurring budgets and micro-expenses</span>
        )}
      </button>
      <button
        type="button"
        className={realm === 'personal' ? 'finance-dock-btn' : 'action-tile'}
        onClick={() => setModal('spend')}
      >
        <span className={realm === 'personal' ? 'finance-dock-kicker' : 'action-tile-kicker'}>
          Outflow
        </span>
        <span className={realm === 'personal' ? 'finance-dock-name' : 'action-tile-name'}>
          Log spend
        </span>
        {realm !== 'personal' && (
          <span className="action-tile-desc">Record company spend</span>
        )}
      </button>
      {realm === 'personal' && (
        <button type="button" className="finance-dock-btn" onClick={() => setModal('wishlist')}>
          <span className="finance-dock-kicker">Want</span>
          <span className="finance-dock-name">Wishlist</span>
        </button>
      )}
      <button
        type="button"
        className={
          realm === 'personal' ? 'finance-dock-btn accent' : 'action-tile accent'
        }
        onClick={() => setModal('revolut')}
      >
        <span className={realm === 'personal' ? 'finance-dock-kicker' : 'action-tile-kicker'}>
          Bank
        </span>
        <span className={realm === 'personal' ? 'finance-dock-name' : 'action-tile-name'}>
          Sync Revolut
        </span>
        {realm === 'personal' ? (
          pendingReview > 0 ? (
            <span className="finance-dock-badge">{pendingReview}</span>
          ) : null
        ) : (
          <span className="action-tile-desc">
            {pendingReview > 0
              ? `${pendingReview} transaction${pendingReview === 1 ? '' : 's'} to review`
              : 'Connect, sync day, categorize'}
          </span>
        )}
      </button>
    </div>
  )

  const modals = (
    <>
      <Modal
        open={modal === 'allocate'}
        onClose={() => setModal(null)}
        title="Allocate cash"
        size="lg"
      >
        <CashAllocationPanel store={store} realm={realm} embedded />
      </Modal>

      <Modal
        open={modal === 'expenses'}
        onClose={() => setModal(null)}
        title="Set expenses"
        size="lg"
      >
        <SetExpensesPanel store={store} realm={realm} embedded />
      </Modal>

      <Modal open={modal === 'spend'} onClose={() => setModal(null)} title="Log spend" size="lg">
        <CashTrackerPanel store={store} realm={realm} mode={spendMode} embedded />
      </Modal>

      <Modal
        open={modal === 'wishlist'}
        onClose={() => setModal(null)}
        title="Spendings wishlist"
        size="md"
      >
        <WishlistPanel store={store} realm={realm} embedded />
      </Modal>

      <Modal
        open={modal === 'revolut'}
        onClose={() => setModal(null)}
        title="Sync Revolut"
        size="xl"
      >
        <RevolutSyncPanel
          store={store}
          realm={realm}
          embedded
          onSynced={() => setBalanceTick((t) => t + 1)}
        />
      </Modal>
    </>
  )

  if (realm === 'personal') {
    return (
      <div className="layout-stack finance-view finance-command">
        <header className="finance-command-head">
          <div>
            <p className="finance-command-kicker">Personal money</p>
            <h1 className="finance-command-title">Command board</h1>
            <p className="finance-command-copy">
              Live spend vs budget. Buttons stay. The board is the point.
            </p>
          </div>
          {actions}
        </header>
        <PersonalFinanceDashboard store={store} />
        {modals}
      </div>
    )
  }

  const monthly = totalMonthlyExpenses(ledger)
  const allocated = totalAllocated(ledger)
  const spent = totalSpent(ledger)

  return (
    <div className="layout-stack finance-view finance-view-clean">
      <CompanyRevolutBuckets store={store} refreshTick={balanceTick} />

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
        {actions}
      </section>

      {modals}
    </div>
  )
}
