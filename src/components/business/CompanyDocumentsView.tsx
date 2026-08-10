'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Store } from '../../hooks/useStore'
import type { CompanyDocument } from '../../types'
import { toEditorHtml } from '../../utils/docContent'
import { exportDocumentPdf } from '../../utils/exportDocumentPdf'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { HudPanel } from '../HudPanel'
import { Modal } from '../ui/Modal'
import { DocRichEditor } from './DocRichEditor'

type DocMode = 'view' | 'edit'

type PendingNav =
  | { type: 'close' }
  | { type: 'view' }
  | { type: 'open'; id: string; mode: DocMode }
  | { type: 'create' }
  | { type: 'upload'; file: File }
  | { type: 'external'; proceed: () => void }

export function CompanyDocumentsView({
  store,
  onDirtyChange,
}: {
  store: Store
  onDirtyChange?: (dirty: boolean) => void
}) {
  const docs = store.state.companyDocuments
  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = useState<DocMode>('view')
  const [pendingDelete, setPendingDelete] = useState<CompanyDocument | null>(null)
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedTitleRef = useRef('')
  const savedContentRef = useRef('')
  const seedEditorRef = useRef(false)
  const draftRef = useRef({ title: '', content: '', dirty: false, openId: null as string | null, mode: 'view' as DocMode })
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docsRef = useRef(docs)
  docsRef.current = docs

  const openDoc = useMemo(
    () => (openId ? docs.find((d) => d.id === openId) ?? null : null),
    [docs, openId],
  )

  const isEditing = !!openDoc && mode === 'edit'
  const isOpen = !!openDoc

  // Drop openId if the document was deleted
  useEffect(() => {
    if (openId && !docs.some((d) => d.id === openId)) {
      setOpenId(null)
      setMode('view')
      setDirty(false)
    }
  }, [docs, openId])

  // Seed draft when entering edit for a document
  useEffect(() => {
    if (!openId || mode !== 'edit') return
    const doc = docsRef.current.find((d) => d.id === openId)
    if (!doc) return
    setDraftTitle(doc.title)
    setDraftContent(doc.content)
    savedTitleRef.current = doc.title
    savedContentRef.current = doc.content
    seedEditorRef.current = true
    setDirty(false)
    setSavedFlash(false)
  }, [openId, mode])

  useEffect(() => {
    draftRef.current = {
      title: draftTitle,
      content: draftContent,
      dirty,
      openId,
      mode,
    }
    onDirtyChange?.(isEditing && dirty)
  }, [draftTitle, draftContent, dirty, openId, mode, isEditing, onDirtyChange])

  useEffect(() => {
    return () => {
      onDirtyChange?.(false)
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
    }
  }, [onDirtyChange])

  useEffect(() => {
    if (!(isEditing && dirty)) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isEditing, dirty])

  const markDirtyIfChanged = useCallback((title: string, content: string) => {
    setDirty(title !== savedTitleRef.current || content !== savedContentRef.current)
  }, [])

  const saveActive = useCallback(() => {
    const { openId: id, title, content, dirty: isDirty, mode: currentMode } = draftRef.current
    if (!id || currentMode !== 'edit' || !isDirty) return false
    store.updateCompanyDocument(id, { title, content })
    savedTitleRef.current = title
    savedContentRef.current = content
    draftRef.current = { ...draftRef.current, dirty: false, title, content }
    setDirty(false)
    setSavedFlash(true)
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
    savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 1600)
    return true
  }, [store])

  // Autosave drafts into the store so cloud hydrate / refresh cannot drop them.
  // Save button still works as an immediate flush + return to view.
  useEffect(() => {
    if (!isEditing || !dirty || !openId) return
    const timer = window.setTimeout(() => {
      saveActive()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [isEditing, dirty, openId, draftTitle, draftContent, saveActive])

  // Flush any pending draft on unmount (tab switch / leave) so it never regresses.
  useEffect(() => {
    return () => {
      const { openId: id, title, content, dirty: isDirty, mode: currentMode } = draftRef.current
      if (!id || currentMode !== 'edit' || !isDirty) return
      store.updateCompanyDocument(id, { title, content })
    }
  }, [store])

  const saveAndView = useCallback(() => {
    saveActive()
    setMode('view')
    setDirty(false)
  }, [saveActive])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return
      if (draftRef.current.mode !== 'edit' || !draftRef.current.dirty || !draftRef.current.openId) return
      e.preventDefault()
      saveAndView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveAndView])

  const runNav = useCallback(
    (nav: PendingNav) => {
      switch (nav.type) {
        case 'close':
          setOpenId(null)
          setMode('view')
          setDirty(false)
          break
        case 'view':
          setMode('view')
          setDirty(false)
          break
        case 'open':
          setOpenId(nav.id)
          setMode(nav.mode)
          setDirty(false)
          break
        case 'create': {
          const id = store.addCompanyDocument({ title: 'Untitled document', content: '' })
          setOpenId(id)
          setMode('edit')
          setDirty(false)
          break
        }
        case 'upload': {
          void (async () => {
            const text = await nav.file.text()
            const title = nav.file.name.replace(/\.[^.]+$/, '') || nav.file.name
            const id = store.addCompanyDocument({
              title,
              content: text,
              sourceName: nav.file.name,
            })
            setOpenId(id)
            setMode('view')
            setDirty(false)
          })()
          break
        }
        case 'external':
          nav.proceed()
          break
      }
    },
    [store],
  )

  const requestLeave = useCallback(
    (nav: PendingNav) => {
      if (!(draftRef.current.mode === 'edit' && draftRef.current.dirty)) {
        runNav(nav)
        return
      }
      setPendingNav(nav)
    },
    [runNav],
  )

  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent<{ proceed: () => void }>).detail
      if (!detail?.proceed) return
      requestLeave({ type: 'external', proceed: detail.proceed })
    }
    window.addEventListener('batcave:docs-leave', onAsk as EventListener)
    return () => window.removeEventListener('batcave:docs-leave', onAsk as EventListener)
  }, [requestLeave])

  const discardAndLeave = () => {
    if (!pendingNav) return
    const nav = pendingNav
    setPendingNav(null)
    // Clear before navigation/unmount so the flush effect does not re-save.
    draftRef.current = { ...draftRef.current, dirty: false }
    setDirty(false)
    runNav(nav)
  }

  const saveAndLeave = () => {
    if (!pendingNav) return
    const nav = pendingNav
    saveActive()
    setPendingNav(null)
    runNav(nav)
  }

  const openForView = (id: string) => {
    requestLeave({ type: 'open', id, mode: 'view' })
  }

  const startEdit = () => {
    if (!openDoc) return
    setMode('edit')
  }

  const exportOpen = () => {
    if (!openDoc) return
    const title = mode === 'edit' ? draftTitle : openDoc.title
    const content = mode === 'edit' ? draftContent : openDoc.content
    exportDocumentPdf(title, toEditorHtml(content))
  }

  const viewHtml = openDoc ? toEditorHtml(openDoc.content) : ''

  return (
    <div className="layout-stack company-docs">
      <HudPanel label="Documents" className="company-docs-library">
        <div className="company-docs-toolbar">
          <button
            type="button"
            className="btn-primary compact"
            onClick={() => requestLeave({ type: 'create' })}
          >
            New doc
          </button>
          <button
            type="button"
            className="btn-secondary compact"
            onClick={() => {
              requestLeave({
                type: 'external',
                proceed: () => fileRef.current?.click(),
              })
            }}
          >
            Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.csv,.json,.html,text/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              e.target.value = ''
              if (!file) return
              requestLeave({ type: 'upload', file })
            }}
          />
        </div>

        {docs.length === 0 && (
          <p className="finance-empty">No documents yet. Create or upload one, then open it to view, export, or edit.</p>
        )}

        <ul className="company-docs-list company-docs-list-grid">
          {docs.map((doc) => {
            const isOpenRow = openId === doc.id
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  className={`company-docs-item${isOpenRow ? ' active' : ''}${
                    isOpenRow && isEditing && dirty ? ' unsaved' : ''
                  }`}
                  onClick={() => openForView(doc.id)}
                >
                  <span className="company-docs-item-title">
                    {isOpenRow && isEditing ? draftTitle || doc.title : doc.title}
                    {isOpenRow && isEditing && dirty ? (
                      <span className="company-docs-unsaved-dot" />
                    ) : null}
                  </span>
                  <span className="company-docs-item-meta">
                    {new Date(doc.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                    <span className="company-docs-item-hint">View</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </HudPanel>

      <Modal
        open={isOpen}
        onClose={() => requestLeave({ type: 'close' })}
        title={
          isEditing
            ? 'Edit document'
            : openDoc?.title || 'Document'
        }
        size="xl"
        className="company-doc-modal"
        footer={
          isEditing ? (
            <div className="company-doc-modal-actions">
              <span
                className={`company-docs-save-status${dirty ? ' dirty' : ''}${
                  savedFlash ? ' saved' : ''
                }`}
                aria-live="polite"
              >
                {dirty ? 'Unsaved changes' : savedFlash ? 'Saved' : 'All changes saved'}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => requestLeave({ type: 'view' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!dirty}
                onClick={saveAndView}
                title="Save (Ctrl/Cmd+S)"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="company-doc-modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => openDoc && setPendingDelete(openDoc)}
              >
                Delete
              </button>
              <button type="button" className="btn-secondary" onClick={exportOpen}>
                Export PDF
              </button>
              <button type="button" className="btn-primary" onClick={startEdit}>
                Edit
              </button>
            </div>
          )
        }
      >
        {openDoc && isEditing && (
          <div className="company-docs-edit company-docs-edit-modal">
            <input
              className="company-docs-title-input"
              value={draftTitle}
              onChange={(e) => {
                const title = e.target.value
                setDraftTitle(title)
                markDirtyIfChanged(title, draftContent)
              }}
              aria-label="Document title"
            />
            {openDoc.sourceName && (
              <p className="company-docs-source">Uploaded from {openDoc.sourceName}</p>
            )}
            <DocRichEditor
              key={`${openDoc.id}-edit`}
              content={draftContent}
              onChange={(html) => {
                setDraftContent(html)
                if (seedEditorRef.current) {
                  seedEditorRef.current = false
                  savedContentRef.current = html
                  markDirtyIfChanged(draftTitle, html)
                  return
                }
                markDirtyIfChanged(draftTitle, html)
              }}
              placeholder="Write the offer, breakdown, brief…"
            />
          </div>
        )}

        {openDoc && !isEditing && (
          <div className="company-doc-view">
            {openDoc.sourceName && (
              <p className="company-docs-source">Uploaded from {openDoc.sourceName}</p>
            )}
            {viewHtml ? (
              <div
                className="company-docs-prose company-docs-prose-view"
                dangerouslySetInnerHTML={{ __html: viewHtml }}
              />
            ) : (
              <p className="finance-empty">This document is empty. Click Edit to add content.</p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete document"
        message={pendingDelete ? `Delete “${pendingDelete.title}”? This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            store.removeCompanyDocument(pendingDelete.id)
            setDirty(false)
            if (openId === pendingDelete.id) {
              setOpenId(null)
              setMode('view')
            }
          }
          setPendingDelete(null)
        }}
      />

      <ConfirmDialog
        open={!!pendingNav}
        title="Unsaved changes"
        message="You have unsaved changes in this document. Save before leaving, discard them, or keep editing."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        altLabel="Save"
        danger
        onCancel={() => setPendingNav(null)}
        onAlt={saveAndLeave}
        onConfirm={discardAndLeave}
      />
    </div>
  )
}
