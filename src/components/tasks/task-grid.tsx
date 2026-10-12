'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, CircleUser } from 'lucide-react'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { AvatarStack } from '@/components/ui/avatar'
import { useUpdateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { statusPatch, taskStatusOf, workspaceStatuses } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { assigneesOf, assigneesPatch } from '@/lib/assignees'
import { useOpenTask } from '@/lib/use-open-task'
import { TASK_STATUSES } from '@/lib/constants'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import { AssigneesMenu, DuePopover, LabelChip, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'

type SortKey = 'status' | 'due' | 'priority' | 'title' | 'space'
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const

/**
 * Tabla de tareas de varios espacios. Las columnas son las comunes a todos (los campos propios de
 * cada espacio viven en la tabla de ese espacio); cada celda se edita con las reglas de su espacio.
 */
export function TaskGrid({ tasks }: { tasks: TaskRow[] }) {
  const t = useTranslations('tasks')
  const wsMap = useWorkspaceMap()
  const [sort, setSort] = useState<SortKey>('status')

  const rows = useMemo(() => {
    const cat = new Map(TASK_STATUSES.map((c, i) => [c, i]))
    return [...tasks].sort((a, b) => {
      if (sort === 'due') return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'space') return (wsMap.get(a.workspace_id)?.name ?? '').localeCompare(wsMap.get(b.workspace_id)?.name ?? '') || a.position - b.position
      return (cat.get(a.status) ?? 9) - (cat.get(b.status) ?? 9) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    })
  }, [tasks, sort, wsMap])

  const head = 'sticky top-0 z-10 h-9 border-b border-line bg-sidebar px-2 text-left text-xs font-medium text-fg-muted whitespace-nowrap'

  return (
    <div className="h-full min-h-0 overflow-auto scrollbar-thin">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={cn(head, 'sticky left-0 z-20 w-[380px] min-w-[380px] pl-4')}>
              <SortBtn sort={sort} onSort={setSort} k="title">{t('title')}</SortBtn>
            </th>
            <th className={cn(head, 'w-44')}>
              <SortBtn sort={sort} onSort={setSort} k="space">{t('space')}</SortBtn>
            </th>
            <th className={cn(head, 'w-40')}>
              <SortBtn sort={sort} onSort={setSort} k="status">{t('statusLabel')}</SortBtn>
            </th>
            <th className={cn(head, 'w-36')}>
              <SortBtn sort={sort} onSort={setSort} k="priority">{t('priorityLabel')}</SortBtn>
            </th>
            <th className={cn(head, 'w-44')}>{t('assignees')}</th>
            <th className={cn(head, 'w-32')}>
              <SortBtn sort={sort} onSort={setSort} k="due">{t('dueLabel')}</SortBtn>
            </th>
            <th className={cn(head, 'w-56')}>{t('labels')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => (
            <GridRow key={task.id} task={task} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GridRow({ task }: { task: TaskRow }) {
  const statusName = useStatusName()
  const tPriority = useTranslations('tasks.priority')
  const ws = useWorkspaceMap().get(task.workspace_id)
  const editable = canEdit(ws)
  const memberMap = useMemberMap()
  const members = useWorkspaceMembers(editable ? task.workspace_id : null)
  const update = useUpdateTask()
  const { open } = useOpenTask()
  const people = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p })
  const cell = 'h-10 border-b border-line-soft px-1.5 align-middle'
  const done = task.status === 'done'

  return (
    <tr className="group/tr hover:bg-hover/50">
      <td className={cn(cell, 'sticky left-0 z-[1] bg-canvas pl-4 group-hover/tr:bg-hover')}>
        <button type="button" onClick={() => open(task.id)} className="flex w-full min-w-0 items-center gap-2 text-left">
          <span className="w-14 shrink-0 font-mono text-xs text-fg-subtle">{ws ? taskRef(ws.key, task.number) : ''}</span>
          <span className={cn('truncate', done ? 'text-fg-muted line-through decoration-fg-subtle/40' : 'text-fg')}>{task.title}</span>
        </button>
      </td>
      <td className={cell}>
        {ws ? (
          <span className="flex min-w-0 items-center gap-1.5 px-2 text-sm text-fg-muted">
            <WorkspaceMark ws={ws} size={16} />
            <span className="truncate">{ws.name}</span>
          </span>
        ) : null}
      </td>
      <td className={cell}>
        <StatusMenu options={workspaceStatuses(ws)} value={taskStatusOf(task, ws)} onChange={(o) => patch(statusPatch(o))} disabled={!editable} className="h-7 px-2">
          <StatusIcon status={task.status} />
          <span className="truncate">{statusName(taskStatusOf(task, ws))}</span>
        </StatusMenu>
      </td>
      <td className={cell}>
        <PriorityMenu value={task.priority} onChange={(priority) => patch({ priority })} disabled={!editable} className="h-7 px-2">
          <PriorityIcon priority={task.priority} />
          <span className={cn('whitespace-nowrap text-sm', task.priority === 'none' && 'text-fg-subtle')}>{tPriority(task.priority)}</span>
        </PriorityMenu>
      </td>
      <td className={cell}>
        <AssigneesMenu value={assigneesOf(task)} members={members} onChange={(ids) => patch(assigneesPatch(ids))} disabled={!editable} className="h-7 max-w-full px-2">
          {people.length ? (
            <>
              <AvatarStack people={people} size={18} />
              <span className="truncate">{people.map((p) => p.full_name.split(' ')[0]).join(', ')}</span>
            </>
          ) : (
            <CircleUser className="size-4 text-fg-subtle" />
          )}
        </AssigneesMenu>
      </td>
      <td className={cell}>
        <DuePopover value={task.due_date} onChange={(due_date) => patch({ due_date })} disabled={!editable} className="h-7 px-2">
          {task.due_date ? <DueDate due={task.due_date} done={done} /> : <span className="text-sm text-fg-subtle">—</span>}
        </DuePopover>
      </td>
      <td className={cell}>
        <span className="flex gap-1 overflow-hidden px-1">
          {task.labels.slice(0, 3).map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </span>
      </td>
    </tr>
  )
}

function SortBtn({ k, sort, onSort, children }: { k: SortKey; sort: SortKey; onSort: (k: SortKey) => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => onSort(k)} aria-pressed={sort === k} className={cn('inline-flex items-center gap-1 hover:text-fg', sort === k && 'text-fg')}>
      {children}
      {sort === k ? <ArrowDown className="size-3 text-accent-ink" /> : null}
    </button>
  )
}
