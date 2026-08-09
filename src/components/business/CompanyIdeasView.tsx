'use client'

import { useState } from 'react'
import type { Store } from '../../hooks/useStore'
import type { CompanyIdea } from '../../types'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { HudPanel } from '../HudPanel'

export function CompanyIdeasView({ store }: { store: Store }) {
  const ideas = store.state.companyIdeas
  const [draftTitle, setDraftTitle] = useState('')
  const [draftText, setDraftText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editText, setEditText] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CompanyIdea | null>(null)

  const canCapture = Boolean(draftTitle.trim() || draftText.trim())

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canCapture) return
    store.addCompanyIdea({ title: draftTitle, text: draftText })
    setDraftTitle('')
    setDraftText('')
  }

  const startEdit = (idea: CompanyIdea) => {
    setEditingId(idea.id)
    setEditTitle(idea.title)
    setEditText(idea.text)
  }

  const saveEdit = () => {
    if (!editingId) return
    if (!editTitle.trim() && !editText.trim()) return
    store.updateCompanyIdea(editingId, { title: editTitle, text: editText })
    setEditingId(null)
    setEditTitle('')
    setEditText('')
  }

  return (
    <div className="layout-stack company-ideas">
      <HudPanel label="Ideas">
        <p className="finance-hint">Capture sparks for AXYON. Title it, write it, clear your head.</p>

        <form className="company-ideas-capture" onSubmit={submit}>
          <div className="company-ideas-fields">
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Idea title"
              aria-label="Idea title"
            />
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Details, notes, context…"
              rows={3}
              aria-label="Idea details"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={!canCapture}>
            Capture
          </button>
        </form>

        {ideas.length === 0 && (
          <p className="finance-empty">Empty vault. Capture the next spark.</p>
        )}

        <ul className="company-ideas-list">
          {ideas.map((idea) => (
            <li key={idea.id} className="company-idea">
              {editingId === idea.id ? (
                <div className="company-idea-edit">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Idea title"
                    aria-label="Edit idea title"
                    autoFocus
                  />
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Details, notes, context…"
                    rows={3}
                    aria-label="Edit idea details"
                  />
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn-secondary compact"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary compact"
                      disabled={!editTitle.trim() && !editText.trim()}
                      onClick={saveEdit}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="company-idea-title">{idea.title}</h3>
                  {idea.text ? <p className="company-idea-text">{idea.text}</p> : null}
                  <div className="company-idea-meta">
                    <span>
                      {new Date(idea.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <div className="company-idea-actions">
                      <button type="button" className="ghost-btn" onClick={() => startEdit(idea)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setPendingDelete(idea)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </HudPanel>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove idea"
        message={
          pendingDelete ? `Remove “${pendingDelete.title}” from the vault?` : ''
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) store.removeCompanyIdea(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
