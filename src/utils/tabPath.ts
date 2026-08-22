import { normalizeActiveTab, type AppTab } from '../types'

/**
 * Public URL for each top-level surface.
 *
 * The app used to keep the current view only in memory, so refresh always
 * dropped you on Today and the back button did nothing. These paths are the
 * source of truth now.
 */
export const TAB_PATH: Record<AppTab, string> = {
  dashboard: '/',
  tasks: '/tasks',
  calendar: '/calendar',
  autopilot: '/autopilot',
  personalFinances: '/money',
  mentor: '/mentor',
  vision: '/vision',
}

const PATH_TAB: Record<string, AppTab> = Object.fromEntries(
  Object.entries(TAB_PATH).map(([tab, path]) => [path, tab as AppTab]),
) as Record<string, AppTab>

export function pathForTab(tab: AppTab): string {
  return TAB_PATH[tab]
}

export function tabFromPathname(pathname: string): AppTab {
  const clean = pathname.replace(/\/+$/, '') || '/'
  return normalizeActiveTab(PATH_TAB[clean] ?? 'dashboard')
}
