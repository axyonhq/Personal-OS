'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Store } from '../../hooks/useStore'
import type { ColdEmailDomain, ColdEmailProvider } from '../../types'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { HudPanel } from '../HudPanel'

function MicrosoftLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  )
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function ProviderIcon({ provider, size }: { provider: ColdEmailProvider; size?: number }) {
  return provider === 'google' ? <GoogleLogo size={size} /> : <MicrosoftLogo size={size} />
}

function ProviderSelect({
  value,
  onChange,
}: {
  value: ColdEmailProvider
  onChange: (next: ColdEmailProvider) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (next: ColdEmailProvider) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="cold-email-provider" ref={rootRef}>
      <button
        type="button"
        className="cold-email-provider-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={value === 'google' ? 'Google' : 'Microsoft'}
        title={value === 'google' ? 'Google' : 'Microsoft'}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <ProviderIcon provider={value} />
        <span className="cold-email-provider-caret" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className="cold-email-provider-menu" role="listbox" aria-label="Provider">
          <li role="option" aria-selected={value === 'microsoft'}>
            <button
              type="button"
              className={value === 'microsoft' ? 'active' : ''}
              onClick={(e) => {
                e.stopPropagation()
                pick('microsoft')
              }}
              aria-label="Microsoft"
              title="Microsoft"
            >
              <MicrosoftLogo />
            </button>
          </li>
          <li role="option" aria-selected={value === 'google'}>
            <button
              type="button"
              className={value === 'google' ? 'active' : ''}
              onClick={(e) => {
                e.stopPropagation()
                pick('google')
              }}
              aria-label="Google"
              title="Google"
            >
              <GoogleLogo />
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

export function ColdEmailView({ store }: { store: Store }) {
  const domains = store.state.coldEmailDomains ?? []
  const [domainDraft, setDomainDraft] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mailboxDrafts, setMailboxDrafts] = useState<Record<string, string>>({})
  const [addingMailboxFor, setAddingMailboxFor] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ColdEmailDomain | null>(null)
  const [pendingMailboxDelete, setPendingMailboxDelete] = useState<{
    domainId: string
    mailboxId: string
    label: string
  } | null>(null)

  const canAddDomains = Boolean(domainDraft.trim())

  const submitDomains = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canAddDomains) return
    store.addColdEmailDomains(domainDraft)
    setDomainDraft('')
  }

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id))
    setAddingMailboxFor(null)
  }

  const submitMailboxes = (domainId: string) => {
    const raw = mailboxDrafts[domainId] ?? ''
    if (!raw.trim()) return
    store.addColdEmailMailboxes(domainId, raw)
    setMailboxDrafts((m) => ({ ...m, [domainId]: '' }))
    setAddingMailboxFor(null)
    setExpandedId(domainId)
  }

  return (
    <div className="layout-stack cold-email">
      <HudPanel label="Domains">
        <p className="finance-hint">
          Add sending domains, pick Microsoft or Google for each, then attach mailboxes.
        </p>

        <form className="cold-email-capture" onSubmit={submitDomains}>
          <textarea
            value={domainDraft}
            onChange={(e) => setDomainDraft(e.target.value)}
            placeholder={'axyonhq.com\notherdomain.com'}
            rows={3}
            aria-label="Domains to add"
          />
          <button type="submit" className="btn-primary" disabled={!canAddDomains}>
            Add domains
          </button>
        </form>

        {domains.length === 0 && (
          <p className="finance-empty">No domains yet. Add one above.</p>
        )}

        <ul className="cold-email-list">
          {domains.map((domain) => {
            const open = expandedId === domain.id
            const adding = addingMailboxFor === domain.id
            const draft = mailboxDrafts[domain.id] ?? ''
            return (
              <li
                key={domain.id}
                className={`cold-email-domain${open ? ' is-open' : ''}`}
              >
                <div className="cold-email-domain-row">
                  <button
                    type="button"
                    className="cold-email-domain-toggle"
                    aria-expanded={open}
                    onClick={() => toggleExpand(domain.id)}
                  >
                    <span className="cold-email-chevron" aria-hidden="true" />
                    <span className="cold-email-domain-name">{domain.domain}</span>
                    <span className="cold-email-mailbox-count">
                      {domain.mailboxes.length}{' '}
                      {domain.mailboxes.length === 1 ? 'mailbox' : 'mailboxes'}
                    </span>
                  </button>

                  <div
                    className="cold-email-domain-controls"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ProviderSelect
                      value={domain.provider}
                      onChange={(provider) =>
                        store.updateColdEmailDomain(domain.id, { provider })
                      }
                    />
                    <button
                      type="button"
                      className="cold-email-add-mailbox"
                      aria-label={`Add mailbox to ${domain.domain}`}
                      title="Add mailbox"
                      onClick={() => {
                        setExpandedId(domain.id)
                        setAddingMailboxFor(domain.id)
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ghost-btn compact"
                      onClick={() => setPendingDelete(domain)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="cold-email-mailboxes">
                    {domain.mailboxes.length === 0 && !adding && (
                      <p className="cold-email-empty-mailboxes">
                        No mailboxes yet. Hit + to add one.
                      </p>
                    )}

                    {domain.mailboxes.length > 0 && (
                      <ul className="cold-email-mailbox-list">
                        {domain.mailboxes.map((box) => (
                          <li key={box.id} className="cold-email-mailbox">
                            <code>
                              {box.localPart}@{domain.domain}
                            </code>
                            <button
                              type="button"
                              className="ghost-btn compact"
                              onClick={() =>
                                setPendingMailboxDelete({
                                  domainId: domain.id,
                                  mailboxId: box.id,
                                  label: `${box.localPart}@${domain.domain}`,
                                })
                              }
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {adding && (
                      <form
                        className="cold-email-mailbox-capture"
                        onSubmit={(e) => {
                          e.preventDefault()
                          submitMailboxes(domain.id)
                        }}
                      >
                        <textarea
                          value={draft}
                          onChange={(e) =>
                            setMailboxDrafts((m) => ({
                              ...m,
                              [domain.id]: e.target.value,
                            }))
                          }
                          placeholder={'nick@\nteam@\nsales'}
                          rows={2}
                          aria-label={`Mailboxes for ${domain.domain}`}
                          autoFocus
                        />
                        <div className="btn-row">
                          <button
                            type="submit"
                            className="btn-primary compact"
                            disabled={!draft.trim()}
                          >
                            Add mailboxes
                          </button>
                          <button
                            type="button"
                            className="ghost-btn compact"
                            onClick={() => {
                              setAddingMailboxFor(null)
                              setMailboxDrafts((m) => ({ ...m, [domain.id]: '' }))
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </HudPanel>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete domain?"
        message={
          pendingDelete
            ? `Remove ${pendingDelete.domain} and all its mailboxes?`
            : ''
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (pendingDelete) {
            store.removeColdEmailDomain(pendingDelete.id)
            if (expandedId === pendingDelete.id) setExpandedId(null)
          }
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingMailboxDelete != null}
        title="Remove mailbox?"
        message={
          pendingMailboxDelete
            ? `Remove ${pendingMailboxDelete.label}?`
            : ''
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (pendingMailboxDelete) {
            store.removeColdEmailMailbox(
              pendingMailboxDelete.domainId,
              pendingMailboxDelete.mailboxId,
            )
          }
          setPendingMailboxDelete(null)
        }}
        onCancel={() => setPendingMailboxDelete(null)}
      />
    </div>
  )
}
