'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, differenceInCalendarDays, parseISO, subDays } from 'date-fns'
import { useApp, canEdit } from '@/components/app/app-context'
import { PRIORITY_WEIGHT } from '@/lib/constants'
import { toDateKey } from '@/lib/dates'
import type { TaskRow } from '@/lib/database.types'
import type { TaskGroup } from './task-list'

const sortTasks = (a: TaskRow, b: TaskRow) =>
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
  PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
  a.position - b.position

/** Agrupa las tareas del usuario por vencimiento: vencidas, hoy, próximos 7 días, más adelante, sin fecha. */
export function useMyTaskGroups(tasks: TaskRow[] | undefined, opts: { includeLater?: boolean; includeDone?: boolean } = {}) {
  const t = useTranslations('myTasks.groups')
  const { workspaces, user } = useApp()
  const defaultWs = workspaces.find((w) => canEdit(w))

  return useMemo(() => {
    const now = new Date()
    const today = toDateKey(now)
    const open = (tasks ?? []).filter((x) => x.status !== 'done')
    const bucket = (x: TaskRow) => {
      if (!x.due_date) return 'none'
      const d = differenceInCalendarDays(parseISO(x.due_date), now)
      if (d < 0) return 'overdue'
      if (d === 0) return 'today'
      if (d <= 7) return 'week'
      return 'later'
    }
    const base = defaultWs ? { workspace_id: defaultWs.id, assignee_id: user.id, status: 'todo' as const } : null
    const groups: TaskGroup[] = [
      { id: 'overdue', label: t('overdue'), tasks: open.filter((x) => bucket(x) === 'overdue').sort(sortTasks), defaults: null, tone: 'danger' },
      { id: 'today', label: t('today'), tasks: open.filter((x) => bucket(x) === 'today').sort(sortTasks), defaults: base && { ...base, due_date: today } },
      { id: 'week', label: t('week'), tasks: open.filter((x) => bucket(x) === 'week').sort(sortTasks), defaults: base && { ...base, due_date: toDateKey(addDays(now, 1)) } },
    ]
    if (opts.includeLater) {
      groups.push(
        { id: 'later', label: t('later'), tasks: open.filter((x) => bucket(x) === 'later').sort(sortTasks), defaults: null },
        { id: 'none', label: t('none'), tasks: open.filter((x) => bucket(x) === 'none').sort(sortTasks), defaults: base },
      )
    }
    if (opts.includeDone) {
      const since = subDays(now, 7).toISOString()
      groups.push({
        id: 'done',
        label: t('done'),
        tasks: (tasks ?? [])
          .filter((x) => x.status === 'done' && (x.completed_at ?? '') >= since)
          .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
        defaults: null,
        collapsedByDefault: true,
      })
    }
    return groups
  }, [tasks, t, defaultWs, user.id, opts.includeLater, opts.includeDone])
}
