'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, subDays } from 'date-fns'
import { CircleUser } from 'lucide-react'
import { useApp, canEdit } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { PRIORITY_WEIGHT, TASK_PRIORITIES } from '@/lib/constants'
import { toDateKey } from '@/lib/dates'
import { assigneesOf } from '@/lib/assignees'
import { dueBucketOf } from '@/lib/task-filters'
import type { TaskRow } from '@/lib/database.types'
import { LIST_STATUS_ORDER, type TaskGroup } from './task-list'
import { PriorityIcon, StatusIcon } from './status-icon'
import { GroupSummary, type SummaryPart } from './group-summary'

export const sortTasks = (a: TaskRow, b: TaskRow) =>
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
  PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
  a.position - b.position

/** Hechas en los últimos 7 días, la más reciente primero. */
function recentlyDone(tasks: TaskRow[], now: Date) {
  const since = subDays(now, 7).toISOString()
  return tasks
    .filter((x) => x.status === 'done' && (x.completed_at ?? '') >= since)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
}

/** Agrupa las tareas del usuario por vencimiento: vencidas, hoy, próximos 7 días, más adelante, sin fecha. */
export function useMyTaskGroups(tasks: TaskRow[] | undefined, opts: { includeLater?: boolean; includeDone?: boolean; ownOnly?: boolean } = {}) {
  const t = useTranslations('myTasks.groups')
  const { workspaces, user } = useApp()
  const defaultWs = workspaces.find((w) => canEdit(w))

  return useMemo(() => {
    const now = new Date()
    const today = toDateKey(now)
    const open = (tasks ?? []).filter((x) => x.status !== 'done')
    const inBucket = (b: string) => open.filter((x) => dueBucketOf(x, now) === b).sort(sortTasks)
    // crear desde la lista solo tiene sentido en mis propias tareas (no al mirar las del equipo)
    const base = defaultWs && opts.ownOnly !== false ? { workspace_id: defaultWs.id, assignee_ids: [user.id], status: 'todo' as const } : null
    const groups: TaskGroup[] = [
      { id: 'overdue', label: t('overdue'), tasks: inBucket('overdue'), defaults: null, tone: 'danger' },
      { id: 'today', label: t('today'), tasks: inBucket('today'), defaults: base && { ...base, due_date: today } },
      { id: 'week', label: t('week'), tasks: inBucket('week'), defaults: base && { ...base, due_date: toDateKey(addDays(now, 1)) } },
    ]
    if (opts.includeLater) {
      groups.push(
        { id: 'later', label: t('later'), tasks: inBucket('later'), defaults: null },
        { id: 'none', label: t('none'), tasks: inBucket('none'), defaults: base },
      )
    }
    if (opts.includeDone) {
      groups.push({ id: 'done', label: t('done'), tasks: recentlyDone(tasks ?? [], now), defaults: null, collapsedByDefault: true })
    }
    return groups
  }, [tasks, t, defaultWs, user.id, opts.includeLater, opts.includeDone, opts.ownOnly])
}

export const GROUP_BYS = ['date', 'status', 'space', 'assignee', 'priority'] as const
export type GroupBy = (typeof GROUP_BYS)[number]

/**
 * La lista de Tareas agrupada por fecha, estado, espacio, responsable o prioridad. En todos los casos
 * las hechas de la semana van al final en su propio grupo, plegado salvo que `expandDone`.
 */
export function useTaskGroupsBy(tasks: TaskRow[] | undefined, by: GroupBy, opts: { ownOnly?: boolean; expandDone?: boolean } = {}) {
  const tGroups = useTranslations('myTasks.groups')
  const tStatus = useTranslations('tasks.status')
  const tPriority = useTranslations('tasks.priority')
  const tTasks = useTranslations('tasks')
  const { workspaces, observedWorkspaces, members, user } = useApp()
  const byDate = useMyTaskGroups(tasks, { includeLater: true, includeDone: true, ownOnly: opts.ownOnly })

  return useMemo(() => {
    const now = new Date()
    const list = tasks ?? []
    const open = list.filter((x) => x.status !== 'done').sort(sortTasks)
    const done: TaskGroup = { id: 'done', label: tGroups('done'), tasks: recentlyDone(list, now), defaults: null, collapsedByDefault: true }

    const omit: Record<GroupBy, SummaryPart[]> = { date: ['due'], status: ['status'], space: ['spaces'], assignee: ['people'], priority: [] }
    const withSummary = (g: TaskGroup): TaskGroup => ({ ...g, summary: <GroupSummary tasks={g.tasks} omit={g.id === 'done' ? ['due', 'status'] : omit[by]} /> })

    let groups: TaskGroup[]
    if (by === 'date') {
      groups = byDate
    } else if (by === 'status') {
      groups = LIST_STATUS_ORDER.filter((s) => s !== 'done').map((s) => ({
        id: s,
        label: tStatus(s),
        icon: <StatusIcon status={s} />,
        tasks: open.filter((x) => x.status === s),
        defaults: null,
        tone: s === 'blocked' ? ('danger' as const) : undefined,
      }))
      groups.push(done)
    } else if (by === 'space') {
      groups = [...workspaces, ...observedWorkspaces].map((w) => ({
        id: w.id,
        label: w.name,
        icon: <WorkspaceMark ws={w} size={16} />,
        tasks: open.filter((x) => x.workspace_id === w.id),
        defaults: null,
      }))
      groups.push(done)
    } else if (by === 'assignee') {
      // una tarea con varios responsables aparece con cada uno; tú primero
      const ids = [...new Set(open.flatMap(assigneesOf))]
      const people = ids
        .map((id) => members.find((m) => m.id === id) ?? { id, full_name: '?', avatar_url: null })
        .sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id) || a.full_name.localeCompare(b.full_name))
      groups = people.map((p) => ({
        id: p.id,
        label: p.full_name,
        icon: <Avatar name={p.full_name} src={p.avatar_url} seed={p.id} size={18} />,
        tasks: open.filter((x) => assigneesOf(x).includes(p.id)),
        defaults: null,
      }))
      groups.push(
        { id: 'unassigned', label: tTasks('unassigned'), icon: <CircleUser className="size-4 text-fg-subtle" />, tasks: open.filter((x) => assigneesOf(x).length === 0), defaults: null },
        done,
      )
    } else {
      groups = TASK_PRIORITIES.map((p) => ({
        id: p,
        label: tPriority(p),
        icon: <PriorityIcon priority={p} />,
        tasks: open.filter((x) => x.priority === p),
        defaults: null,
      }))
      groups.push(done)
    }
    groups = groups.map(withSummary)
    // otro id para que el grupo se vuelva a montar abierto cuando el filtro pide solo las hechas
    return opts.expandDone ? groups.map((g) => (g.id === 'done' ? { ...g, id: 'done-open', collapsedByDefault: false } : g)) : groups
  }, [tasks, by, byDate, opts.expandDone, workspaces, observedWorkspaces, members, user.id, tGroups, tStatus, tPriority, tTasks])
}
