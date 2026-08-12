import { useState, type FormEvent } from 'react'
import type { Store } from '../../hooks/useStore'
import { formatMoney, parseAmount } from '../../utils/finance'
import { HudPanel } from '../HudPanel'

const REALM = 'personal' as const

export function WishlistPanel({
  store,
  embedded = false,
}: {
  store: Store
  embedded?: boolean
}) {
  const ledger = store.financeFor(REALM)
  const wishlist = ledger.wishlist ?? []
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseAmount(amount)
    if (!name.trim() || parsed === null) return
    store.addWishlistItem(REALM, { name, amount: parsed })
    setName('')
    setAmount('')
  }

  const total = wishlist.reduce((sum, item) => sum + item.amount, 0)

  return (
    <HudPanel label="WISHLIST" embedded={embedded}>
      <p className="finance-hint">
        Things you want to buy. Item + rough price — park it here before it becomes a spend.
      </p>

      <form className="finance-form-row wishlist-form" onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item (e.g. Noise-cancelling headphones)"
          aria-label="Wishlist item"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Rough $"
          inputMode="decimal"
          aria-label="Rough price"
        />
        <button type="submit" className="btn-primary compact">
          Add
        </button>
      </form>

      {wishlist.length === 0 ? (
        <p className="finance-empty">Empty wishlist. Capture the next want.</p>
      ) : (
        <>
          <ul className="finance-list">
            {wishlist.map((item) => (
              <li key={item.id} className="finance-expense">
                <div className="finance-expense-row">
                  <div className="finance-expense-main">
                    <span className="finance-expense-name">{item.name}</span>
                    <span className="finance-expense-meta">Rough estimate</span>
                  </div>
                  <span className="finance-expense-amount">{formatMoney(item.amount)}</span>
                  <button
                    type="button"
                    className="x-btn visible"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => store.removeWishlistItem(REALM, item.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="wishlist-total">
            <span>Wishlist total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
        </>
      )}
    </HudPanel>
  )
}
