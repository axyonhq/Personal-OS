'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ToastTone = 'default' | 'success' | 'danger' | 'warn'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
  /** Milliseconds on screen. Toasts with an action get longer by default. */
  duration?: number
  action?: ToastAction
}

interface Toast extends ToastInput {
  id: number
}

interface ToastApi {
  toast: (input: ToastInput) => number
  dismiss: (id: number) => void
  /**
   * Confirm-by-undo: run the change immediately and offer a short window to
   * put it back. Cheaper and less annoying than an "are you sure?" dialog for
   * reversible actions.
   */
  toastUndo: (title: string, onUndo: () => void, description?: string) => number
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++
      const duration = input.duration ?? (input.action ? 8000 : 4000)
      setToasts((list) => [...list.slice(-3), { ...input, id }])
      const timer = window.setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
      return id
    },
    [dismiss],
  )

  const toastUndo = useCallback(
    (title: string, onUndo: () => void, description?: string) => {
      let id = 0
      id = toast({
        title,
        description,
        action: {
          label: 'Undo',
          onClick: () => {
            onUndo()
            dismiss(id)
          },
        },
      })
      return id
    },
    [toast, dismiss],
  )

  // Clear pending timers if the provider unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(() => ({ toast, dismiss, toastUndo }), [toast, dismiss, toastUndo])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="ui-toast-viewport" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`ui-toast ui-toast-${t.tone || 'default'}`}
          role="status"
          aria-live="polite"
        >
          <div className="ui-toast-copy">
            <p className="ui-toast-title">{t.title}</p>
            {t.description && <p className="ui-toast-desc">{t.description}</p>}
          </div>
          {t.action && (
            <button type="button" className="ui-toast-action" onClick={t.action.onClick}>
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className="ui-toast-close"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
