'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { AppTab } from '../types'
import { pathForTab } from '../utils/tabPath'
import { useStore } from './useStore'

/**
 * Change the current view and the URL together.
 *
 * Callers used to only flip `activeTab`, which left the address bar on `/`.
 * Going through here means the back button, bookmarks and shared links work.
 */
export function useNavigateTab() {
  const store = useStore()
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(
    (tab: AppTab) => {
      if (store.state.activeTab !== tab) store.setActiveTab(tab)
      const path = pathForTab(tab)
      if (pathname !== path) router.push(path)
    },
    [pathname, router, store],
  )
}
