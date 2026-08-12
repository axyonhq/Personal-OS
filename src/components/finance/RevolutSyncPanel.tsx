import { useEffect, useMemo, useState } from 'react'
import type { Store } from '../../hooks/useStore'
import {
  childCategories,
  formatMoney,
  topLevelCategories,
} from '../../utils/finance'
import {
  fetchRevolutAccounts,
  fetchRevolutStatus,
  fetchRevolutTransactions,
  loadRevolutAppSecret,
  loadRevolutRefreshToken,
  saveRevolutAppSecret,
  saveRevolutRefreshToken,
  type RevolutAccountDto,
} from '../../utils/revolutApi'
import { todayDateKey } from '../../utils/time'
import { HudPanel } from '../HudPanel'

const UNEXPECTED = '__unexpected__'
const REALM = 'personal' as const

type CategoryPick = {
  topId: string
  childId: string
}

export function RevolutSyncPanel({
  store,
  onSynced,
  embedded = false,
}: {
  store: Store
  /** Fired after a successful day sync. */
  onSynced?: () => void
  embedded?: boolean
}) {
  const sync = store.state.revolutSync
  const savedIds = sync.personalAccountIds
  const queue = sync.personalQueue
  const ledger = store.financeFor(REALM)
  const tops = topLevelCategories(ledger)

  const [appSecret, setAppSecret] = useState(() => loadRevolutAppSecret())
  const [secretDraft, setSecretDraft] = useState('')
  const [editingSecret, setEditingSecret] = useState(() => !loadRevolutAppSecret())
  const [editingAccounts, setEditingAccounts] = useState(false)
  const [draftIds, setDraftIds] = useState<string[]>(savedIds)
  const [date, setDate] = useState(() => todayDateKey())
  const [accounts, setAccounts] = useState<RevolutAccountDto[]>([])
  const [statusOk, setStatusOk] = useState<boolean | null>(null)
  const [statusDetail, setStatusDetail] = useState('')
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [picks, setPicks] = useState<Record<string, CategoryPick>>({})
  const [authTick, setAuthTick] = useState(0)

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  )
  const linkedAccounts = savedIds
    .map((id) => accountById.get(id))
    .filter((a): a is RevolutAccountDto => Boolean(a))
  const setupComplete = Boolean(appSecret) && savedIds.length > 0 && !editingAccounts && !editingSecret

  useEffect(() => {
    if (!appSecret) {
      setStatusOk(null)
      setStatusDetail('')
      setNeedsReconnect(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const status = await fetchRevolutStatus(appSecret)
        if (cancelled) return

        if (status.ok) {
          setStatusOk(true)
          setNeedsReconnect(false)
          setStatusDetail(`Connected · ${status.env}`)
          const { accounts: list } = await fetchRevolutAccounts(appSecret)
          if (!cancelled) setAccounts(list)
          return
        }

        setStatusOk(false)
        if (status.authError || (!status.hasRefreshToken && status.serverReady)) {
          setNeedsReconnect(true)
          setStatusDetail(status.authError || 'Revolut login needed')
        } else {
          setNeedsReconnect(false)
          setStatusDetail(
            status.missing?.length
              ? `Missing on server: ${status.missing.join(', ')}`
              : 'Not connected',
          )
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Connection failed'
        setStatusOk(false)
        setStatusDetail(message)
        setNeedsReconnect(/expired|invalid|refresh token|reconnect|login/i.test(message))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [appSecret, authTick])

  // After OAuth callback saves refresh token, pick it up when returning to the tab
  useEffect(() => {
    const onFocus = () => {
      if (loadRevolutRefreshToken()) setAuthTick((t) => t + 1)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // First-time: open account editor once connected and nothing saved yet
  useEffect(() => {
    if (statusOk && savedIds.length === 0) {
      setEditingAccounts(true)
      setDraftIds([])
    }
  }, [statusOk, savedIds.length])

  const saveSecret = () => {
    const next = secretDraft.trim()
    if (!next) {
      setError('Enter your app secret first.')
      return
    }
    saveRevolutAppSecret(next)
    setAppSecret(next)
    setSecretDraft('')
    setEditingSecret(false)
    setError('')
    setMessage('')
  }

  const clearSecret = () => {
    saveRevolutAppSecret('')
    saveRevolutRefreshToken('')
    setAppSecret('')
    setSecretDraft('')
    setEditingSecret(true)
    setAccounts([])
    setStatusOk(null)
    setStatusDetail('')
    setNeedsReconnect(false)
  }

  const startEditAccounts = () => {
    setDraftIds(savedIds)
    setEditingAccounts(true)
    setMessage('')
    setError('')
  }

  const cancelEditAccounts = () => {
    setDraftIds(savedIds)
    setEditingAccounts(false)
  }

  const toggleDraft = (id: string) => {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const saveAccounts = () => {
    if (draftIds.length === 0) {
      setError('Select at least one account.')
      return
    }
    store.setRevolutAccountIds(REALM, draftIds)
    setEditingAccounts(false)
    setError('')
    setMessage(
      `Saved ${draftIds.length} account${draftIds.length === 1 ? '' : 's'}.`,
    )
  }

  const runSync = async () => {
    if (!appSecret) {
      setError('Link with your app secret first.')
      return
    }
    if (savedIds.length === 0) {
      setError('Save the accounts to sync first.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await fetchRevolutTransactions(appSecret, date, savedIds)
      store.mergeRevolutReviewItems(REALM, result.transactions)
      const pendingOut = result.transactions.filter((t) => t.direction === 'out').length
      const pendingIn = result.transactions.filter((t) => t.direction === 'in').length
      setMessage(
        `Pulled ${result.count} for ${date} · ${pendingOut} out · ${pendingIn} in`,
      )
      onSynced?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  const getPick = (id: string): CategoryPick =>
    picks[id] ?? { topId: tops[0]?.id ?? UNEXPECTED, childId: '' }

  const setTop = (id: string, topId: string) => {
    setPicks((prev) => ({
      ...prev,
      [id]: { topId, childId: '' },
    }))
  }

  const setChild = (id: string, childId: string) => {
    setPicks((prev) => ({
      ...prev,
      [id]: { ...getPick(id), childId },
    }))
  }

  const addItem = (itemId: string) => {
    const pick = getPick(itemId)
    if (pick.topId === UNEXPECTED) {
      const item = queue.find((q) => q.id === itemId)
      store.categorizeRevolutReviewItem(REALM, itemId, {
        kind: 'unexpected',
        label: item?.merchant || item?.description || 'Revolut spend',
      })
      return
    }

    const kids = childCategories(ledger, pick.topId)
    if (kids.length > 0) {
      if (!pick.childId) {
        setError('Pick the specific bill / sub-expense.')
        return
      }
      store.categorizeRevolutReviewItem(REALM, itemId, {
        kind: 'category',
        categoryId: pick.childId,
      })
      return
    }

    store.categorizeRevolutReviewItem(REALM, itemId, {
      kind: 'category',
      categoryId: pick.topId,
    })
  }

  return (
    <HudPanel
      label="REVOLUT SYNC"
      embedded={embedded}
      action={
        statusOk ? (
          <span className="revolut-pill ok">{statusDetail}</span>
        ) : statusOk === false ? (
          <span className="revolut-pill bad">{statusDetail || 'Not connected'}</span>
        ) : null
      }
    >
      {/* Step 1: secret (hidden once saved) */}
      {editingSecret || !appSecret ? (
        <div className="revolut-card">
          <div className="revolut-card-head">
            <h3>Connect</h3>
            <p>Paste the same secret as <code>REVOLUT_APP_SECRET</code> on Vercel.</p>
          </div>
          <div className="revolut-inline">
            <input
              type="password"
              value={secretDraft}
              onChange={(e) => setSecretDraft(e.target.value)}
              placeholder="App secret"
              aria-label="Revolut app secret"
              autoComplete="off"
            />
            <button type="button" className="btn-primary compact" onClick={saveSecret}>
              Save
            </button>
            {appSecret && (
              <button
                type="button"
                className="btn-secondary compact"
                onClick={() => {
                  setEditingSecret(false)
                  setSecretDraft('')
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : null}

      {needsReconnect && appSecret && !editingSecret && (
        <div className="revolut-card revolut-card-warn">
          <div className="revolut-card-head">
            <h3>Revolut login expired</h3>
            <p>
              Revolut replaced or expired the refresh token (common after re-approving access).
              Reconnect once — the new token is saved in this browser automatically.
            </p>
          </div>
          <div className="revolut-actions">
            <a className="btn-primary compact" href="/api/revolut/oauth/start">
              Reconnect Revolut
            </a>
            <button
              type="button"
              className="btn-secondary compact"
              onClick={() => setAuthTick((t) => t + 1)}
            >
              I’ve reconnected — retry
            </button>
          </div>
        </div>
      )}

      {/* Step 2: account linking */}
      {appSecret && statusOk && editingAccounts && (
        <div className="revolut-card">
          <div className="revolut-card-head">
            <h3>Accounts</h3>
            <p>Tick the Revolut accounts to sync, then save.</p>
          </div>
          <ul className="revolut-account-grid">
            {accounts.map((account) => {
              const checked = draftIds.includes(account.id)
              return (
                <li key={account.id}>
                  <label className={`revolut-account-tile${checked ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDraft(account.id)}
                    />
                    <span className="revolut-account-copy">
                      <span className="revolut-account-name">{account.name}</span>
                      <span className="revolut-account-meta">
                        {account.currency} · {formatMoney(account.balance)}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {accounts.length === 0 && (
            <p className="finance-empty">Loading accounts…</p>
          )}
          <div className="revolut-actions">
            <button type="button" className="btn-primary compact" onClick={saveAccounts}>
              Save accounts
            </button>
            {savedIds.length > 0 && (
              <button
                type="button"
                className="btn-secondary compact"
                onClick={cancelEditAccounts}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ready state: compact sync */}
      {setupComplete && (
        <div className="revolut-ready">
          <div className="revolut-linked">
            <div className="revolut-linked-head">
              <span className="revolut-linked-label">
                {linkedAccounts.length || savedIds.length} linked account
                {(linkedAccounts.length || savedIds.length) === 1 ? '' : 's'}
              </span>
              <div className="revolut-linked-tools">
                <button type="button" className="revolut-text-btn" onClick={startEditAccounts}>
                  Edit accounts
                </button>
                <button
                  type="button"
                  className="revolut-text-btn"
                  onClick={() => {
                    setEditingSecret(true)
                    setSecretDraft('')
                  }}
                >
                  Change secret
                </button>
                <button type="button" className="revolut-text-btn muted" onClick={clearSecret}>
                  Disconnect
                </button>
              </div>
            </div>
            <div className="revolut-chips">
              {(linkedAccounts.length
                ? linkedAccounts
                : savedIds.map((id) => ({
                    id,
                    name: id.slice(0, 8),
                    currency: '',
                    balance: 0,
                    state: '',
                  }))
              ).map((account) => (
                <span key={account.id} className="revolut-chip">
                  {account.name}
                  {account.currency ? (
                    <em>
                      {account.currency}
                    </em>
                  ) : null}
                </span>
              ))}
            </div>
          </div>

          <div className="revolut-sync-row">
            <label className="finance-field">
              <span>Day</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Sync date"
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void runSync()}
              disabled={busy || !statusOk}
            >
              {busy ? 'Syncing…' : 'Sync day'}
            </button>
          </div>
        </div>
      )}

      {!appSecret && (
        <p className="finance-hint revolut-hint">
          One-time setup: connect, pick accounts, save. After that just sync.
        </p>
      )}

      {message && <p className="revolut-feedback ok">{message}</p>}
      {error && <p className="revolut-feedback bad">{error}</p>}

      {/* Review queue */}
      {(setupComplete || queue.length > 0) && (
        <div className="revolut-review">
          <div className="revolut-review-head">
            <span>
              Review · {queue.length}
            </span>
          </div>
          {queue.length === 0 ? (
            <p className="finance-empty">
              No pending transactions. Sync a day to pull them in. Discarded ones come back on
              re-sync; logged spends stay hidden.
            </p>
          ) : (
            <ul className="revolut-txn-list">
              {queue.map((item) => {
                const isOut = item.direction === 'out'
                const pick = getPick(item.id)
                const kids =
                  pick.topId !== UNEXPECTED ? childCategories(ledger, pick.topId) : []
                return (
                  <li key={item.id} className="revolut-txn">
                    <div className="revolut-txn-top">
                      <div className="revolut-txn-main">
                        <span className="revolut-txn-name">
                          {item.merchant || item.description}
                        </span>
                        <span className="revolut-txn-meta">
                          <span className={isOut ? 'dir out' : 'dir in'}>
                            {isOut ? 'Out' : 'In'}
                          </span>
                          <span>{item.type.replaceAll('_', ' ')}</span>
                          {item.cardLastFour ? <span>••{item.cardLastFour}</span> : null}
                          <span>{item.accountName}</span>
                        </span>
                      </div>
                      <span className={`revolut-txn-amt${isOut ? '' : ' in'}`}>
                        {isOut ? '−' : '+'}
                        {formatMoney(item.amount)}
                        {item.currency ? ` ${item.currency}` : ''}
                      </span>
                    </div>

                    {isOut ? (
                      <div className="revolut-txn-actions">
                        <select
                          value={pick.topId}
                          onChange={(e) => setTop(item.id, e.target.value)}
                          aria-label={`Category for ${item.merchant}`}
                        >
                          {tops.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                          <option value={UNEXPECTED}>Unexpected</option>
                        </select>

                        {kids.length > 0 && (
                          <select
                            value={pick.childId}
                            onChange={(e) => setChild(item.id, e.target.value)}
                            aria-label={`Specific expense under category`}
                          >
                            <option value="">Select specific…</option>
                            {kids.map((kid) => (
                              <option key={kid.id} value={kid.id}>
                                {kid.name}
                              </option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          className="btn-primary compact"
                          onClick={() => {
                            setError('')
                            addItem(item.id)
                          }}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="btn-secondary compact"
                          onClick={() => store.discardRevolutReviewItem(REALM, item.id)}
                        >
                          Discard
                        </button>
                      </div>
                    ) : (
                      <div className="revolut-txn-actions">
                        <span className="revolut-income-tag">Incoming — discard when done</span>
                        <button
                          type="button"
                          className="btn-secondary compact"
                          onClick={() => store.discardRevolutReviewItem(REALM, item.id)}
                        >
                          Discard
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </HudPanel>
  )
}
