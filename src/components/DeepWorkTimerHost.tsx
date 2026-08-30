'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Store } from '../hooks/useStore'
import { TimerOverlay } from './TimerViews'

export function DeepWorkTimerHost({
  store,
  pendingStart = false,
  onPendingHandled,
}: {
  store: Store
  pendingStart?: boolean
  onPendingHandled?: () => void
}) {
  const [timerMinimized, setTimerMinimized] = useState(true)
  const hadTimer = useRef(false)
  const startMinimizedRef = useRef(false)
  const activeTimer = store.state.activeTimer
  const startTimer = store.startTimer

  const begin = useCallback(() => {
    if (activeTimer) {
      setTimerMinimized(false)
      return
    }
    startMinimizedRef.current = false
    startTimer('personal', '')
  }, [activeTimer, startTimer])

  useEffect(() => {
    const live = !!activeTimer
    if (live && !hadTimer.current) {
      setTimerMinimized(startMinimizedRef.current)
      startMinimizedRef.current = false
    }
    if (!live) setTimerMinimized(true)
    hadTimer.current = live
  }, [activeTimer])

  useEffect(() => {
    if (!pendingStart) return
    begin()
    onPendingHandled?.()
  }, [pendingStart, begin, onPendingHandled])

  if (!store.state.activeTimer) return null

  return (
    <TimerOverlay
      store={store}
      minimized={timerMinimized}
      onMinimize={() => setTimerMinimized(true)}
      onExpand={() => setTimerMinimized(false)}
    />
  )
}
