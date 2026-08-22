'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'modal-sm',
  md: 'modal-md',
  lg: 'modal-lg',
  xl: 'modal-xl',
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: ModalSize
  footer?: ReactNode
  className?: string
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Unique per instance: nested or stacked dialogs previously shared one id,
  // so aria-labelledby could point at the wrong heading.
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Keep Tab inside the dialog. Without this, focus walks into the page
      // behind the overlay, which is invisible to a keyboard or screen reader user.
      const root = dialogRef.current
      if (!root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        root.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus in, preferring the first control over the dialog shell.
    const raf = window.requestAnimationFrame(() => {
      const root = dialogRef.current
      if (!root) return
      if (root.contains(document.activeElement)) return
      const firstField = root.querySelector<HTMLElement>(FOCUSABLE)
      ;(firstField ?? root).focus()
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      window.cancelAnimationFrame(raf)
      document.body.style.overflow = prevOverflow
      // Send focus back where it came from so the keyboard does not jump to
      // the top of the document on close.
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`modal platform-modal ${SIZE_CLASS[size]}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="platform-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="x-btn visible" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="platform-modal-body">{children}</div>
        {footer && <footer className="platform-modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
