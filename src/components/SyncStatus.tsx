'use client'

import type { Store } from '../hooks/useStore'

/**
 * Cloud sync state, visible on every screen size.
 *
 * The old indicator was desktop-only, so a phone user had no way to know their
 * data had stopped reaching the cloud.
 */
export function SyncStatus({ store }: { store: Store }) {
  const { cloudSync, cloudError } = store

  if (cloudSync === 'idle') return null

  if (cloudSync === 'error') {
    return (
      <div className="sync-status sync-status-error" role="alert">
        <span className="sync-status-dot" aria-hidden="true" />
        <span className="sync-status-text">
          <strong>Not saving to cloud</strong>
          <em>{cloudError || 'Sync failed'}</em>
        </span>
        <button
          type="button"
          className="sync-status-retry"
          onClick={() => void store.pushBrowserToCloud()}
        >
          Retry
        </button>
      </div>
    )
  }

  if (cloudSync === 'loading') {
    return (
      <div className="sync-status sync-status-loading" aria-live="polite">
        <span className="sync-status-dot" aria-hidden="true" />
        <span className="sync-status-text">Syncing…</span>
      </div>
    )
  }

  return (
    <div className="sync-status sync-status-ready" aria-live="polite">
      <span className="sync-status-dot" aria-hidden="true" />
      <span className="sync-status-text">Saved</span>
    </div>
  )
}
