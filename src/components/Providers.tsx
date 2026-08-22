'use client'

import type { ReactNode } from 'react'
import { StoreProvider } from '../hooks/useStore'
import { ToastProvider } from './ui/Toast'
import { PwaRegister } from './PwaRegister'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <PwaRegister />
        {children}
      </ToastProvider>
    </StoreProvider>
  )
}
