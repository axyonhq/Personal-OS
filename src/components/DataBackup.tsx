'use client'

import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import type { Store } from '../hooks/useStore'
import { triggerBackupDownload } from '../utils/backup'
import { useToast } from './ui/Toast'

/**
 * Download or restore a JSON backup of the workspace.
 *
 * Cloud sync is the daily path. This is the safety net: one file you can keep
 * off this browser.
 */
export function DataBackup({ store, onDone }: { store: Store; onDone?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const download = () => {
    triggerBackupDownload(store.exportBackup())
    toast({ title: 'Backup downloaded', tone: 'success' })
    onDone?.()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const raw = await file.text()
      store.importBackup(raw)
      toast({ title: 'Backup restored', tone: 'success' })
      onDone?.()
    } catch (err) {
      toast({
        title: 'Could not restore that file',
        description: err instanceof Error ? err.message : 'Unknown error',
        tone: 'danger',
      })
    }
  }

  return (
    <div className="backup-actions">
      <button type="button" className="mobile-more-item" onClick={download}>
        <span className="rail-icon" aria-hidden="true">
          <Download strokeWidth={1.75} />
        </span>
        <span>
          <strong>Export backup</strong>
          <em>JSON file of this workspace</em>
        </span>
      </button>
      <button type="button" className="mobile-more-item" onClick={() => fileRef.current?.click()}>
        <span className="rail-icon" aria-hidden="true">
          <Upload strokeWidth={1.75} />
        </span>
        <span>
          <strong>Import backup</strong>
          <em>Replace this browser’s copy</em>
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void onFile(file)
        }}
      />
    </div>
  )
}
