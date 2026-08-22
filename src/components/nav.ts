import {
  Calendar,
  Gauge,
  ListTodo,
  type LucideIcon,
  MoreHorizontal,
  Sparkles,
  Telescope,
  Wallet,
  Zap,
} from 'lucide-react'
import type { AppTab } from '../types'

export interface NavItem {
  id: AppTab
  label: string
  shortLabel: string
  sub: string
  icon: LucideIcon
}

/**
 * Navigation model.
 *
 * Icons replace the previous single-letter marks (H, V, A, C, T, $, M), which
 * carried no meaning and were the loudest unfinished-looking part of the shell.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Today', shortLabel: 'Today', sub: 'Command center', icon: Gauge },
  { id: 'tasks', label: 'Tasks', shortLabel: 'Tasks', sub: 'Projects and backlog', icon: ListTodo },
  { id: 'calendar', label: 'Calendar', shortLabel: 'Cal', sub: 'Plan the day', icon: Calendar },
  { id: 'autopilot', label: 'Autopilot', shortLabel: 'Auto', sub: 'Guided rituals', icon: Zap },
  { id: 'personalFinances', label: 'Money', shortLabel: 'Money', sub: 'Spend and budgets', icon: Wallet },
  { id: 'mentor', label: 'Mentor', shortLabel: 'Mentor', sub: 'AI synthesis', icon: Sparkles },
  { id: 'vision', label: 'Vision', shortLabel: 'Vision', sub: 'Long horizon', icon: Telescope },
]

/** Phone bottom bar: four most-used destinations, the rest behind More. */
export const PRIMARY_TABS: AppTab[] = ['dashboard', 'tasks', 'autopilot', 'mentor']
export const MORE_TABS: AppTab[] = ['calendar', 'personalFinances', 'vision']

export const MoreIcon = MoreHorizontal

export function navItem(id: AppTab): NavItem {
  return NAV_ITEMS.find((t) => t.id === id) ?? NAV_ITEMS[0]
}
