'use client'

import { Modal } from './Modal'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  altLabel,
  danger = false,
  onConfirm,
  onCancel,
  onAlt,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Optional middle action (e.g. Save before leaving). */
  altLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  onAlt?: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="btn-row platform-confirm-actions">
          {/*
            Cancel takes focus, never the destructive action. Previously the
            confirm button was autofocused, so opening a "Reset work" dialog and
            pressing Enter wiped data with no further input.
          */}
          <button type="button" className="btn-secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          {altLabel && onAlt && (
            <button type="button" className="btn-primary" onClick={onAlt}>
              {altLabel}
            </button>
          )}
          <button
            type="button"
            className={danger ? 'btn-primary danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="platform-confirm-message">{message}</p>
    </Modal>
  )
}
