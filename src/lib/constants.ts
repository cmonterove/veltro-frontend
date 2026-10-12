import type { TaskPriority, TaskStatus } from '@/lib/database.types'

export const TASK_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done']
export const TASK_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none']

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
}

/** Paleta de espacios. Los valores reales viven en globals.css (--ws-*), con variante dark. */
export const WORKSPACE_COLORS = ['violet', 'mandarina', 'ink', 'lavender', 'blue', 'teal', 'green', 'pink', 'red', 'amber'] as const
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number]

export const RESERVED_LABEL_LIMIT = 8

/** Barra lateral colapsada. Va en cookie (no localStorage) para que el servidor la dibuje ya colapsada y no salte al cargar. */
export const SIDEBAR_COOKIE = 'veltro-sidebar-collapsed'
