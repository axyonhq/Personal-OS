import { useEffect, useState, type FormEvent } from 'react'
import type { Store } from '../../hooks/useStore'
import type { ExpenseCategory, ExpenseFrequency } from '../../types'
import {
  categoryEffectiveAmount,
  childCategories,
  FREQUENCIES,
  formatMoney,
  parseAmount,
  topLevelCategories,
  totalMonthlyExpenses,
} from '../../utils/finance'
import { HudPanel } from '../HudPanel'

const REALM = 'personal' as const

function AmountField({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number
  ariaLabel: string
  onCommit: (amount: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = parseAmount(draft)
    if (parsed === null) {
      setDraft(String(value))
      return
    }
    if (parsed !== value) onCommit(parsed)
    else setDraft(String(value))
  }

  return (
    <input
      className="finance-expense-amount-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
        if (e.key === 'Escape') {
          setDraft(String(value))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      inputMode="decimal"
      aria-label={ariaLabel}
    />
  )
}

function NameField({
  value,
  ariaLabel,
  onCommit,
}: {
  value: string
  ariaLabel: string
  onCommit: (name: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    const next = draft.trim()
    if (!next) {
      setDraft(value)
      return
    }
    if (next !== value) onCommit(next)
  }

  return (
    <input
      className="finance-expense-name-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
        if (e.key === 'Escape') {
          setDraft(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      aria-label={ariaLabel}
    />
  )
}

export function SetExpensesPanel({
  store,
  embedded = false,
}: {
  store: Store
  embedded?: boolean
}) {
  const ledger = store.financeFor(REALM)
  const tops = topLevelCategories(ledger)
  const monthlyTotal = totalMonthlyExpenses(ledger)

  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<ExpenseFrequency>('monthly')
  const [amount, setAmount] = useState('')
  const [microParentId, setMicroParentId] = useState<string | null>(null)
  const [microName, setMicroName] = useState('')
  const [microAmount, setMicroAmount] = useState('')

  const patch = (id: string, next: Partial<Pick<ExpenseCategory, 'name' | 'frequency' | 'amount'>>) => {
    store.updateExpenseCategory(REALM, id, next)
  }

  const submitCategory = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseAmount(amount)
    if (!name.trim() || parsed === null) return
    store.addExpenseCategory(REALM, { name, frequency, amount: parsed })
    setName('')
    setAmount('')
    setFrequency('monthly')
  }

  const submitMicro = (e: FormEvent) => {
    e.preventDefault()
    if (!microParentId) return
    const parsed = parseAmount(microAmount)
    if (!microName.trim() || parsed === null) return
    const parent = ledger.categories.find((c) => c.id === microParentId)
    store.addExpenseCategory(REALM, {
      name: microName,
      frequency: parent?.frequency ?? 'monthly',
      amount: parsed,
      parentId: microParentId,
    })
    setMicroName('')
    setMicroAmount('')
  }

  return (
    <HudPanel label="SET EXPENSES" embedded={embedded}>
      <p className="finance-hint">
        Recurring budgets by category. Click any amount (or title) to edit. Bills is preset — add
        micro expenses under it (YouTube, subscriptions, etc.).
      </p>

      <ul className="finance-list">
        {tops.map((cat) => {
          const kids = childCategories(ledger, cat.id)
          const effective = categoryEffectiveAmount(cat, ledger.categories)
          const hasKids = kids.length > 0
          return (
            <li key={cat.id} className="finance-expense">
              <div className="finance-expense-row">
                <div className="finance-expense-main">
                  {cat.isPreset ? (
                    <span className="finance-expense-name">{cat.name}</span>
                  ) : (
                    <NameField
                      value={cat.name}
                      ariaLabel={`Edit ${cat.name} title`}
                      onCommit={(next) => patch(cat.id, { name: next })}
                    />
                  )}
                  <div className="finance-expense-meta-row">
                    {cat.isPreset ? (
                      <span className="finance-expense-meta">{cat.frequency}</span>
                    ) : (
                      <select
                        className="finance-expense-freq"
                        value={cat.frequency}
                        aria-label={`${cat.name} frequency`}
                        onChange={(e) =>
                          patch(cat.id, { frequency: e.target.value as ExpenseFrequency })
                        }
                      >
                        {FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    )}
                    {hasKids && <span className="finance-expense-meta">· micro roll-up</span>}
                  </div>
                </div>
                {hasKids ? (
                  <span
                    className="finance-expense-amount"
                    title="Sum of micro expenses — edit the lines below"
                  >
                    {formatMoney(effective)}
                  </span>
                ) : (
                  <AmountField
                    value={cat.amount}
                    ariaLabel={`Edit ${cat.name} amount`}
                    onCommit={(next) => patch(cat.id, { amount: next })}
                  />
                )}
                {!cat.isPreset && (
                  <button
                    type="button"
                    className="x-btn visible"
                    aria-label={`Remove ${cat.name}`}
                    onClick={() => store.removeExpenseCategory(REALM, cat.id)}
                  >
                    ×
                  </button>
                )}
              </div>

              {kids.length > 0 && (
                <ul className="finance-micro-list">
                  {kids.map((kid) => (
                    <li key={kid.id} className="finance-micro-row">
                      <NameField
                        value={kid.name}
                        ariaLabel={`Edit ${kid.name} title`}
                        onCommit={(next) => patch(kid.id, { name: next })}
                      />
                      <AmountField
                        value={kid.amount}
                        ariaLabel={`Edit ${kid.name} amount`}
                        onCommit={(next) => patch(kid.id, { amount: next })}
                      />
                      <button
                        type="button"
                        className="x-btn visible"
                        aria-label={`Remove ${kid.name}`}
                        onClick={() => store.removeExpenseCategory(REALM, kid.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {(cat.isPreset || cat.name.toLowerCase() === 'bills') && (
                <div className="finance-micro-actions">
                  {microParentId === cat.id ? (
                    <form className="finance-form-row" onSubmit={submitMicro}>
                      <input
                        value={microName}
                        onChange={(e) => setMicroName(e.target.value)}
                        placeholder="Micro expense (e.g. YouTube)"
                        aria-label="Micro expense name"
                      />
                      <input
                        value={microAmount}
                        onChange={(e) => setMicroAmount(e.target.value)}
                        placeholder="Amount"
                        inputMode="decimal"
                        aria-label="Micro expense amount"
                      />
                      <button type="submit" className="btn-primary compact">
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn-secondary compact"
                        onClick={() => {
                          setMicroParentId(null)
                          setMicroName('')
                          setMicroAmount('')
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setMicroParentId(cat.id)}
                    >
                      + Add micro expense
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <form className="finance-form-grid" onSubmit={submitCategory}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Expense title"
          aria-label="Expense title"
        />
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
          aria-label="Frequency"
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          inputMode="decimal"
          aria-label="Expense amount"
        />
        <button type="submit" className="btn-primary">
          Add expense
        </button>
      </form>

      <div className="finance-total-bar">
        <span>Total monthly expenses</span>
        <strong>{formatMoney(monthlyTotal)}</strong>
      </div>
    </HudPanel>
  )
}
