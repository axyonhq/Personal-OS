import { useState } from 'react'
import type { Store } from '../hooks/useStore'
import { CashAllocationPanel } from './finance/CashAllocationPanel'
import { CashTrackerPanel } from './finance/CashTrackerPanel'
import { PersonalFinanceDashboard } from './finance/PersonalFinanceDashboard'
import { RevolutSyncPanel } from './finance/RevolutSyncPanel'
import { SetExpensesPanel } from './finance/SetExpensesPanel'
import { WishlistPanel } from './finance/WishlistPanel'
import { Modal } from './ui/Modal'

type FinanceModal = 'allocate' | 'expenses' | 'spend' | 'revolut' | 'wishlist' | null

export function FinancesView({ store }: { store: Store }) {
  const [modal, setModal] = useState<FinanceModal>(null)
  const pendingReview = store.state.revolutSync.personalQueue.length
  const legacyIds = store.state.legacyCompanyCategoryIds ?? []
  const legacyNames = legacyIds
    .map((id) => store.state.personalFinance.categories.find((c) => c.id === id)?.name)
    .filter((name): name is string => Boolean(name))

  return (
    <div className="layout-stack finance-view finance-command">
      {legacyNames.length > 0 && (
        <section className="legacy-company-banner">
          <div className="legacy-company-copy">
            <span className="field-label">Left over from the old company ledger</span>
            <p>
              {legacyNames.length} categor{legacyNames.length === 1 ? 'y' : 'ies'} came from the
              retired company finances: {legacyNames.join(', ')}. They will not come back again
              either way.
            </p>
          </div>
          <div className="legacy-company-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={store.keepLegacyCompanyCategories}
            >
              Keep them
            </button>
            <button
              type="button"
              className="btn-primary danger"
              onClick={store.removeLegacyCompanyCategories}
            >
              Remove them
            </button>
          </div>
        </section>
      )}
      <header className="finance-command-head">
        <div>
          <p className="finance-command-kicker">Personal money</p>
          <h1 className="finance-command-title">Command board</h1>
          <p className="finance-command-copy">
            Live spend vs budget. Buttons stay. The board is the point.
          </p>
        </div>
        <div className="finance-dock">
          <button type="button" className="finance-dock-btn" onClick={() => setModal('allocate')}>
            <span className="finance-dock-kicker">Cash in</span>
            <span className="finance-dock-name">Allocate cash</span>
          </button>
          <button type="button" className="finance-dock-btn" onClick={() => setModal('expenses')}>
            <span className="finance-dock-kicker">Fixed</span>
            <span className="finance-dock-name">Set expenses</span>
          </button>
          <button type="button" className="finance-dock-btn" onClick={() => setModal('spend')}>
            <span className="finance-dock-kicker">Outflow</span>
            <span className="finance-dock-name">Log spend</span>
          </button>
          <button type="button" className="finance-dock-btn" onClick={() => setModal('wishlist')}>
            <span className="finance-dock-kicker">Want</span>
            <span className="finance-dock-name">Wishlist</span>
          </button>
          <button
            type="button"
            className="finance-dock-btn accent"
            onClick={() => setModal('revolut')}
          >
            <span className="finance-dock-kicker">Bank</span>
            <span className="finance-dock-name">Sync Revolut</span>
            {pendingReview > 0 ? <span className="finance-dock-badge">{pendingReview}</span> : null}
          </button>
        </div>
      </header>

      <PersonalFinanceDashboard store={store} />

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
