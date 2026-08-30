'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker so hashed static files still load offline.
 *
 * `updateViaCache: 'none'` so browsers actually fetch a new `/sw.js` after
 * deploy. If an older worker was already in control, reload once when the new
 * one takes over — that is how stuck login tabs recover.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const hadController = Boolean(navigator.serviceWorker.controller)

    const onControllerChange = () => {
      if (!hadController) return
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        void reg.update()
      })
      .catch(() => {
        // Registration failing should never break the app.
      })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])
  return null
}
