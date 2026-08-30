'use client'

import {
  ArrowRight,
  CheckCircle2,
  CornerDownLeft,
  Download,
  Play,
  Search,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Store } from '../hooks/useStore'
import { triggerBackupDownload } from '../utils/backup'
import { useToast } from './ui/Toast'

type Command = {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ReactNode
  run: () => void
  keywords?: string
}

export function CommandPalette({
  store,
  open,
  onOpenChange,
  onStartSession,
}: {
  store: Store
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartSession: () => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus())
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.cancelAnimationFrame(raf)
      document.body.style.overflow = prev
    }
  }, [open])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'timer:start',
        label: 'Start deep work',
        group: 'Session',
        keywords: 'focus session start timer',
        icon: <Play strokeWidth={1.75} />,
        run: () => {
          onStartSession()
          close()
        },
      },
    ]

    for (const task of store.state.tasks.personal || []) {
      if (task.done || task.archived) continue
      list.push({
        id: `task:${task.id}`,
        label: task.text,
        hint: 'Mark done',
        group: 'Tasks',
        keywords: 'task todo',
        icon: <CheckCircle2 strokeWidth={1.75} />,
        run: () => {
          store.toggleTask('personal', task.id)
          close()
        },
      })
    }

    list.push(
      {
        id: 'backup:export',
        label: 'Export backup',
        hint: 'JSON file, no bank secrets',
        group: 'Data',
        keywords: 'download backup export json',
        icon: <Download strokeWidth={1.75} />,
        run: () => {
          triggerBackupDownload(store.exportBackup())
          close()
        },
      },
      {
        id: 'backup:import',
        label: 'Import backup',
        hint: 'Replace this browser’s copy',
        group: 'Data',
        keywords: 'upload restore import json',
        icon: <Upload strokeWidth={1.75} />,
        run: () => {
          importRef.current?.click()
        },
      },
    )

    return list
  }, [store, close, onStartSession])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.filter((c) => c.group === 'Session' || c.group === 'Tasks').slice(0, 12)
    const terms = q.split(/\s+/)
    return commands
      .filter((c) => {
        const haystack = `${c.label} ${c.hint || ''} ${c.keywords || ''} ${c.group}`.toLowerCase()
        return terms.every((t) => haystack.includes(t))
      })
      .slice(0, 40)
  }, [commands, query])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open || typeof document === 'undefined') return null

  const grouped: { group: string; items: { command: Command; index: number }[] }[] = []
  results.forEach((command, index) => {
    const last = grouped[grouped.length - 1]
    if (last && last.group === command.group) last.items.push({ command, index })
    else grouped.push({ group: command.group, items: [{ command, index }] })
  })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (results.length === 0 ? 0 : (c - 1 + results.length) % results.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      results[cursor]?.run()
    }
  }

  return createPortal(
    <div className="ui-palette-root" role="presentation" onClick={close}>
      <div
        className="ui-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-palette-search">
          <Search aria-hidden="true" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Start a session, complete a task…"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="ui-palette-list" ref={listRef} role="listbox" aria-label="Results">
          {results.length === 0 && (
            <p className="ui-palette-empty">Nothing matches “{query}”.</p>
          )}
          {grouped.map((section) => (
            <div key={section.group} className="ui-palette-group">
              <p className="ui-kicker ui-palette-group-label">{section.group}</p>
              {section.items.map(({ command, index }) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  data-index={index}
                  className={`ui-palette-item${index === cursor ? ' is-active' : ''}`}
                  onMouseEnter={() => setCursor(index)}
                  onClick={command.run}
                >
                  <span className="ui-palette-icon" aria-hidden="true">
                    {command.icon}
                  </span>
                  <span className="ui-palette-copy">
                    <span className="ui-palette-label">{command.label}</span>
                    {command.hint && <span className="ui-palette-hint">{command.hint}</span>}
                  </span>
                  {index === cursor ? (
                    <CornerDownLeft className="ui-palette-enter" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="ui-palette-chevron" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        <footer className="ui-palette-foot">
          <span>Selecting a task marks it done</span>
          <span className="ui-palette-keys">
            <kbd>↑</kbd>
            <kbd>↓</kbd> move <kbd>↵</kbd> run
          </span>
        </footer>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            void file
              .text()
              .then((raw) => {
                store.importBackup(raw)
                toast({ title: 'Backup restored', tone: 'success' })
                close()
              })
              .catch((err: unknown) => {
                toast({
                  title: 'Could not restore that file',
                  description: err instanceof Error ? err.message : 'Unknown error',
                  tone: 'danger',
                })
              })
          }}
        />
      </div>
    </div>,
    document.body,
  )
}
