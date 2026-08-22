'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker so the app still opens with no network.
 *
 * Network-first: a new deploy is used when available, the cached copy is only
 * a fallback. API calls are never cached.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing should never break the app.
    })
  }, [])
  return null
}
