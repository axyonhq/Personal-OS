import { useMemo, useState, type FormEvent } from 'react'
import type { Store } from '../../hooks/useStore'
import type { CashAllocationLine } from '../../types'
import {
  allocatableBuckets,
  formatMoney,
  parseAmount,
} from '../../utils/finance'
import { formatLongDate, todayDateKey } from '../../utils/time'
import { HudPanel } from '../HudPanel'

const REALM = 'personal' as const

type DraftLine = {
  key: string
  kind: 'category' | 'custom'
  categoryId: string
  customLabel: string
  amount: string
}

function emptyLine(buckets: ReturnType<typeof allocatableBuckets>): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    kind: 'category',
    categoryId: buckets[0]?.id ?? '',
    customLabel: '',
    amount: '',
  }
}

export function CashAllocationPanel({
  store,
  embedded = false,
}: {
  store: Store
  embedded?: boolean
}) {
  const ledger = store.financeFor(REALM)
  const buckets = allocatableBuckets(ledger)
  const catName = useMemo(() => {
    const map = new Map(ledger.categories.map((c) => [c.id, c.name]))
    return (id?: string) => (id ? map.get(id) ?? 'Unknown' : 'Unknown')
  }, [ledger.categories])

  const [total, setTotal] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine(buckets)])

  const parsedTotal = parseAmount(total)
  const lineSum = lines.reduce((sum, l) => sum + (parseAmount(l.amount) ?? 0), 0)
  const remaining =
    parsedTotal === null ? null : Math.round((parsedTotal - lineSum) * 100) / 100

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (parsedTotal === null || parsedTotal <= 0) return
    const built: Omit<CashAllocationLine, 'id'>[] = []
    for (const line of lines) {
      const amt = parseAmount(line.amount)
      if (amt === null || amt <= 0) continue
      if (line.kind === 'category') {
        if (!line.categoryId) continue
        built.push({ kind: 'category', categoryId: line.categoryId, amount: amt })
      } else {
        const label = line.customLabel.trim()
        if (!label) continue
        built.push({ kind: 'custom', customLabel: label, amount: amt })
      }
    }
    if (built.length === 0) return
    store.addCashAllocation(REALM, {
      date: todayDateKey(),
      totalAmount: parsedTotal,
      note,
      lines: built,
    })
    setTotal('')
    setNote('')
    setLines([emptyLine(buckets)])
  }

  return (
    <HudPanel label="CASH ALLOCATION" embedded={embedded}>
      <p className="finance-hint">
        When cash lands, enter the total and split it into set-expense buckets or a one-off custom
        expense.
      </p>

      <form className="finance-alloc-form" onSubmit={submit}>
        <div className="finance-form-grid two">
          <label className="finance-field">
            <span>Total cash in</span>
            <input
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>
          <label className="finance-field">
            <span>Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Paycheck, transfer…"
            />
          </label>
        </div>

        <div className="finance-alloc-lines">
          {lines.map((line) => (
            <div key={line.key} className="finance-alloc-line">
              <select
                value={line.kind}
                onChange={(e) =>
                  updateLine(line.key, {
                    kind: e.target.value as 'category' | 'custom',
                  })
                }
                aria-label="Allocation type"
              >
                <option value="category">Bucket</option>
                <option value="custom">One-off expense</option>
              </select>

              {line.kind === 'category' ? (
                <select
                  value={line.categoryId}
                  onChange={(e) => updateLine(line.key, { categoryId: e.target.value })}
                  aria-label="Bucket"
                  disabled={buckets.length === 0}
                >
                  {buckets.length === 0 && <option value="">Add set expenses first</option>}
                  {buckets.map((b) => {
                    const parent = b.parentId
                      ? ledger.categories.find((c) => c.id === b.parentId)
                      : null
                    const label = parent ? `${parent.name} → ${b.name}` : b.name
                    return (
                      <option key={b.id} value={b.id}>
                        {label}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <input
                  value={line.customLabel}
                  onChange={(e) => updateLine(line.key, { customLabel: e.target.value })}
                  placeholder="Custom expense name"
                  aria-label="Custom expense name"
                />
              )}

              <input
                value={line.amount}
                onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                placeholder="Amount"
                inputMode="decimal"
                aria-label="Line amount"
              />

              <button
                type="button"
                className="ghost-btn"
                disabled={lines.length <= 1}
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="btn-row finance-alloc-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setLines((prev) => [...prev, emptyLine(buckets)])}
          >
            + Add line
          </button>
          <span
            className={`finance-remaining${
              remaining !== null && Math.abs(remaining) > 0.009 ? ' warn' : ''
            }`}
          >
            {remaining === null
              ? 'Enter a total to allocate'
              : remaining === 0
                ? 'Fully allocated'
                : `Remaining ${formatMoney(remaining)}`}
          </span>
          <button type="submit" className="btn-primary" disabled={parsedTotal === null || parsedTotal <= 0}>
            Save allocation
          </button>
        </div>
      </form>

      {ledger.allocations.length > 0 && (
        <div className="finance-history">
          <div className="panel-label">
            <span>RECENT ALLOCATIONS</span>
          </div>
          <ul className="finance-list">
            {ledger.allocations.slice(0, 8).map((a) => (
              <li key={a.id} className="finance-history-item">
                <div className="finance-expense-row">
                  <div className="finance-expense-main">
                    <span className="finance-expense-name">{formatMoney(a.totalAmount)}</span>
                    <span className="finance-expense-meta">
                      {formatLongDate(a.date)}
                      {a.note ? ` · ${a.note}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="x-btn visible"
                    aria-label="Remove allocation"
                    onClick={() => store.removeCashAllocation(REALM, a.id)}
                  >
                    ×
                  </button>
                </div>
                <ul className="finance-micro-list">
                  {a.lines.map((line) => (
                    <li key={line.id} className="finance-micro-row">
                      <span>
                        {line.kind === 'custom'
                          ? `One-off · ${line.customLabel}`
                          : catName(line.categoryId)}
                      </span>
                      <span className="finance-expense-amount">{formatMoney(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </HudPanel>
  )
}
