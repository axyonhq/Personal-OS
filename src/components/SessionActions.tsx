'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { DeepWorkId, ProjectId } from '../types'

type SessionActions = {
  startSession: (projectId: DeepWorkId | ProjectId) => void
  startPersonalMinimized: (focusNote: string) => void
}

const SessionActionsContext = createContext<SessionActions | null>(null)

export function SessionActionsProvider({
  value,
  children,
}: {
  value: SessionActions
  children: ReactNode
}) {
  return <SessionActionsContext.Provider value={value}>{children}</SessionActionsContext.Provider>
}

export function useSessionActions(): SessionActions {
  const ctx = useContext(SessionActionsContext)
  if (!ctx) {
    throw new Error('useSessionActions must be used inside the app shell')
  }
  return ctx
}
