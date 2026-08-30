'use client'

import { createContext, useContext, type ReactNode } from 'react'

type SessionActions = {
  startSession: () => void
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
