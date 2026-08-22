import type { AppState } from '../types'

export const BACKUP_KIND = 'command-center-backup'
export const BACKUP_VERSION = 1

type BackupFile = {
  kind: typeof BACKUP_KIND
  version: number
  exportedAt: string
  state: Omit<AppState, 'revolutCredentials'>
}

/**
 * JSON snapshot of the workspace.
 *
 * Bank secrets stay in the browser — a backup file is often emailed or stored
 * in Drive, so the Revolut tokens are left out on purpose.
 */
export function serializeBackup(state: AppState): string {
  const { revolutCredentials: _omit, ...rest } = state
  const file: BackupFile = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: rest,
  }
  return JSON.stringify(file, null, 2)
}

export function parseBackup(raw: string): Partial<AppState> {
  const data = JSON.parse(raw) as unknown
  if (!data || typeof data !== 'object') {
    throw new Error('This file is empty or not JSON.')
  }
  const record = data as Record<string, unknown>
  if (record.kind === BACKUP_KIND && record.state && typeof record.state === 'object') {
    return record.state as Partial<AppState>
  }
  // Older raw AppState dumps still restore.
  if ('tasks' in record && 'personalFinance' in record) {
    return record as Partial<AppState>
  }
  throw new Error('This is not a Command Center backup file.')
}

export function backupFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10)
  return `command-center-${stamp}.json`
}

/** Start a browser download of a backup string. */
export function triggerBackupDownload(json: string, date = new Date()): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFilename(date)
  link.click()
  URL.revokeObjectURL(url)
}
