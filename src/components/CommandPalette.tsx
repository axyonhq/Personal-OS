'use client'

import {
  ArrowRight,
  CheckCircle2,
  CornerDownLeft,
  Download,
  ListTodo,
  Play,
  Search,
  Upload,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PROJECT_MAP, PROJECTS } from '../data/seed'
import { useNavigateTab } from '../hooks/useNavigateTab'
import type { Store } from '../hooks/useStore'
import { DEEP_WORK_IDS, type AppTab, type DeepWorkId, type ProjectId } from '../types'
import { triggerBackupDownload } from '../utils/backup'
import { formatMoney } from '../utils/finance'
import { NAV_ITEMS } from './nav'
import { useToast } from './ui/Toast'

type Command = {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ReactNode
  run: () => void
  /** Extra words matched against the query but not shown. */
  keywords?: string
}

/**
 * Command palette (Cmd/Ctrl+K).
 *
 * The app had no search and no keyboard route to anything: every action needed
 * a tab click, then a modal, then a form. This makes the whole surface
 * reachable in two keystrokes.
 */
export function CommandPalette({
  store,
  open,
  onOpenChange,
  onStartSession,
}: {
  store: Store
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartSession: (projectId: DeepWorkId | ProjectId) => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const navigateTab = useNavigateTab()
  const { toast } = useToast()

  // Global shortcut. Cmd+K on macOS, Ctrl+K elsewhere.
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
    const list: Command[] = []

    for (const item of NAV_ITEMS) {
      const Icon = item.icon
      list.push({
        id: `go:${item.id}`,
        label: item.label,
        hint: item.sub,
        group: 'Go to',
        keywords: item.id,
        icon: <Icon strokeWidth={1.75} />,
        run: () => {
          navigateTab(item.id as AppTab)
          close()
        },
      })
    }

    for (const id of DEEP_WORK_IDS) {
      const project = PROJECT_MAP[id]
      list.push({
        id: `timer:${id}`,
        label: `Start timer — ${project.name}`,
        group: 'Deep work',
        keywords: 'focus session start timer',
        icon: <Play strokeWidth={1.75} />,
        run: () => {
          onStartSession(id)
          close()
        },
      })
    }

    // Open tasks, so a task can be found and completed without leaving the bar.
    for (const project of PROJECTS) {
      for (const task of store.state.tasks[project.id] || []) {
        if (task.done || task.archived) continue
        list.push({
          id: `task:${task.id}`,
          label: task.text,
          hint: project.name,
          group: 'Tasks',
          keywords: `${project.name} task todo`,
          icon: <CheckCircle2 strokeWidth={1.75} />,
          run: () => {
            store.toggleTask(project.id, task.id)
            close()
          },
        })
      }
    }

    for (const category of store.state.personalFinance.categories) {
      if (category.parentId) continue
      list.push({
        id: `money:${category.id}`,
        label: `Log spend — ${category.name}`,
        hint: formatMoney(category.amount),
        group: 'Money',
        keywords: 'spend expense budget money log',
        icon: <Wallet strokeWidth={1.75} />,
        run: () => {
          navigateTab('personalFinances')
          close()
        },
      })
    }

    list.push({
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
    })
    list.push({
      id: 'backup:import',
      label: 'Import backup',
      hint: 'Replace this browser’s copy',
      group: 'Data',
      keywords: 'upload restore import json',
      icon: <Upload strokeWidth={1.75} />,
      run: () => {
        importRef.current?.click()
      },
    })

    return list
  }, [store, close, onStartSession, navigateTab])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // Default view stays short and useful rather than dumping everything.
      return commands.filter((c) => c.group === 'Go to' || c.group === 'Deep work')
    }
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

  // Keep the highlighted row in view while arrowing through a long list.
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
            placeholder="Search tasks, jump to a view, start a timer…"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="ui-palette-list" ref={listRef} role="listbox" aria-label="Results">
          {results.length === 0 && (
            <p className="ui-palette-empty">
              Nothing matches “{query}”. Try a task name, a view, or “timer”.
            </p>
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
          <span>
            <ListTodo aria-hidden="true" strokeWidth={1.75} /> Selecting a task marks it done
          </span>
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
