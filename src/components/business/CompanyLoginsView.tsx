'use client'

import { useState } from 'react'
import type { Store } from '../../hooks/useStore'
import type { CompanyLogin } from '../../types'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Checkbox } from '../ui/Checkbox'
import { HudPanel } from '../HudPanel'

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function platformLabel(login: Pick<CompanyLogin, 'platform' | 'url'>): string {
  if (login.platform.trim()) return login.platform.trim()
  const href = normalizeUrl(login.url)
  if (!href) return 'Untitled'
  try {
    return new URL(href).hostname.replace(/^www\./, '') || href
  } catch {
    return href
  }
}

function PasswordReveal({ value }: { value: string }) {
  const [visible, setVisible] = useState(false)
  if (!value) {
    return <span className="company-login-empty">—</span>
  }
  return (
    <span className="company-login-password">
      <code className="company-login-secret">{visible ? value : '••••••••'}</code>
      <button
        type="button"
        className="ghost-btn compact"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </span>
  )
}

const emptyDraft = {
  platform: '',
  url: '',
  username: '',
  password: '',
  twoFactorEnabled: false,
}

export function CompanyLoginsView({ store }: { store: Store }) {
  const logins = store.state.companyLogins ?? []
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState<CompanyLogin | null>(null)

  const canCapture = Boolean(
    draft.platform.trim() || draft.url.trim() || draft.username.trim(),
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCapture) return
    store.addCompanyLogin({
      platform: draft.platform,
      url: normalizeUrl(draft.url),
      username: draft.username,
      password: draft.password,
      twoFactorEnabled: draft.twoFactorEnabled,
    })
    setDraft(emptyDraft)
  }

  const startEdit = (login: CompanyLogin) => {
    setEditingId(login.id)
    setEdit({
      platform: login.platform,
      url: login.url,
      username: login.username,
      password: login.password,
      twoFactorEnabled: login.twoFactorEnabled,
    })
  }

  const saveEdit = () => {
    if (!editingId) return
    if (!edit.platform.trim() && !edit.url.trim() && !edit.username.trim()) return
    store.updateCompanyLogin(editingId, {
      platform: edit.platform,
      url: normalizeUrl(edit.url),
      username: edit.username,
      password: edit.password,
      twoFactorEnabled: edit.twoFactorEnabled,
    })
    setEditingId(null)
    setEdit(emptyDraft)
  }

  return (
    <div className="layout-stack company-logins">
      <HudPanel label="Logins">
        <p className="finance-hint">
          AXYON vault for platform links, usernames, and passwords. Passwords stay hidden until you
          show them.
        </p>

        <form className="company-logins-capture" onSubmit={submit}>
          <div className="company-logins-fields">
            <input
              value={draft.platform}
              onChange={(e) => setDraft((d) => ({ ...d, platform: e.target.value }))}
              placeholder="Platform name (e.g. Stripe)"
              aria-label="Platform name"
            />
            <input
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="Platform link (https://…)"
              aria-label="Platform link"
              inputMode="url"
              autoComplete="off"
            />
            <input
              value={draft.username}
              onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              placeholder="Username or email"
              aria-label="Username or email"
              autoComplete="off"
            />
            <input
              type="password"
              value={draft.password}
              onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
              placeholder="Password"
              aria-label="Password"
              autoComplete="new-password"
            />
            <Checkbox
              checked={draft.twoFactorEnabled}
              onChange={(checked) => setDraft((d) => ({ ...d, twoFactorEnabled: checked }))}
              label="2FA on"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={!canCapture}>
            Add login
          </button>
        </form>

        {logins.length === 0 && (
          <p className="finance-empty">No logins yet. Add the first platform.</p>
        )}

        {logins.length > 0 && (
          <div className="company-logins-table-wrap">
            <table className="company-logins-table">
              <thead>
                <tr>
                  <th scope="col">Platform</th>
                  <th scope="col">Username / email</th>
                  <th scope="col">Password</th>
                  <th scope="col">2FA</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logins.map((login) => {
                  const href = normalizeUrl(login.url)
                  const label = platformLabel(login)
                  const isEditing = editingId === login.id

                  if (isEditing) {
                    return (
                      <tr key={login.id} className="company-login-edit-row">
                        <td colSpan={5}>
                          <div className="company-login-edit">
                            <input
                              value={edit.platform}
                              onChange={(e) =>
                                setEdit((d) => ({ ...d, platform: e.target.value }))
                              }
                              placeholder="Platform name"
                              aria-label="Edit platform name"
                              autoFocus
                            />
                            <input
                              value={edit.url}
                              onChange={(e) => setEdit((d) => ({ ...d, url: e.target.value }))}
                              placeholder="Platform link"
                              aria-label="Edit platform link"
                              inputMode="url"
                              autoComplete="off"
                            />
                            <input
                              value={edit.username}
                              onChange={(e) =>
                                setEdit((d) => ({ ...d, username: e.target.value }))
                              }
                              placeholder="Username or email"
                              aria-label="Edit username or email"
                              autoComplete="off"
                            />
                            <input
                              type="text"
                              value={edit.password}
                              onChange={(e) =>
                                setEdit((d) => ({ ...d, password: e.target.value }))
                              }
                              placeholder="Password"
                              aria-label="Edit password"
                              autoComplete="off"
                            />
                            <Checkbox
                              checked={edit.twoFactorEnabled}
                              onChange={(checked) =>
                                setEdit((d) => ({ ...d, twoFactorEnabled: checked }))
                              }
                              label="2FA on"
                            />
                            <div className="btn-row">
                              <button
                                type="button"
                                className="btn-secondary compact"
                                onClick={() => {
                                  setEditingId(null)
                                  setEdit(emptyDraft)
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn-primary compact"
                                disabled={
                                  !edit.platform.trim() &&
                                  !edit.url.trim() &&
                                  !edit.username.trim()
                                }
                                onClick={saveEdit}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={login.id}>
                      <td>
                        {href ? (
                          <a
                            className="company-login-link"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {label}
                          </a>
                        ) : (
                          <span className="company-login-platform">{label}</span>
                        )}
                      </td>
                      <td>
                        {login.username ? (
                          <span className="company-login-username">{login.username}</span>
                        ) : (
                          <span className="company-login-empty">—</span>
                        )}
                      </td>
                      <td>
                        <PasswordReveal value={login.password} />
                      </td>
                      <td>
                        <span
                          className={`company-login-2fa ${login.twoFactorEnabled ? 'on' : 'off'}`}
                        >
                          {login.twoFactorEnabled ? 'On' : 'Off'}
                        </span>
                      </td>
                      <td>
                        <div className="company-login-actions">
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => startEdit(login)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => setPendingDelete(login)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </HudPanel>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove login"
        message={
          pendingDelete
            ? `Remove “${platformLabel(pendingDelete)}” from the vault?`
            : ''
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) store.removeCompanyLogin(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
