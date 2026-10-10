'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowDown, CalendarClock, CircleUser, Paperclip, Timer } from 'lucide-react'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { useUpdateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useAttachmentCounts } from '@/lib/queries/attachments'
import { useTaskPanel } from '@/lib/hooks'
import { TASK_STATUSES } from '@/lib/constants'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import { AssigneeMenu, DuePopover, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'
import { AddFieldPopover, FIELD_ICONS, FieldValue } from './custom-fields'
import { TaskComposer } from './task-list'

type SortKey = 'status' | 'due' | 'priority' | 'title'

/** Vista tabla: todos los campos (incluidos los propios del espacio) como columnas editables. */
export function TaskTable({ tasks, workspaceId }: { tasks: TaskRow[]; workspaceId: string }) {
  const t = useTranslations('tasks')
  const tStatus = useTranslations('tasks.status')
  const ws = useWorkspaceMap().get(workspaceId)!
  const editable = canEdit(ws)
  const memberMap = useMemberMap()
  const members = useWorkspaceMembers(workspaceId)
  const counts = useAttachmentCounts(workspaceId)
  const update = useUpdateTask()
  const { open, openId } = useTaskPanel()
  const [sort, setSort] = useState<SortKey>('status')
  const fields = ws.task_fields ?? []

  const rows = useMemo(() => {
    const order = new Map(TASK_STATUSES.map((s, i) => [s, i]))
    const pr = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
    return [...tasks].sort((a, b) => {
      if (sort === 'due') return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
      if (sort === 'priority') return pr[a.priority] - pr[b.priority]
      if (sort === 'title') return a.title.localeCompare(b.title)
      return (order.get(a.status) ?? 0) - (order.get(b.status) ?? 0) || a.position - b.position
    })
  }, [tasks, sort])

  const locale = useLocale()
  const totalEstimate = tasks.reduce((n, x) => n + (Number(x.estimate_hours) || 0), 0)
  const numberFields = fields.filter((f) => f.type === 'number')
  const sumOf = (id: string) => tasks.reduce((n, x) => n + (Number(x.custom?.[id]) || 0), 0)
  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)
  const head = 'sticky top-0 z-10 h-9 border-b border-line bg-sidebar px-2 text-left text-xs font-medium text-fg-muted whitespace-nowrap'
  const cell = 'h-10 border-b border-line-soft px-1.5 align-middle'
  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className={cn('inline-flex items-center gap-1 hover:text-fg', sort === k && 'text-fg')}>
      {children}
      {sort === k ? <ArrowDown className="size-3 text-accent-ink" /> : null}
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={cn(head, 'sticky left-0 z-20 w-[360px] min-w-[360px] pl-4')}>
                <SortBtn k="title">{t('title')}</SortBtn>
              </th>
              <th className={cn(head, 'w-36')}>
                <SortBtn k="status">{t('statusLabel')}</SortBtn>
              </th>
              <th className={cn(head, 'w-32')}>
                <SortBtn k="priority">{t('priorityLabel')}</SortBtn>
              </th>
              <th className={cn(head, 'w-40')}>{t('assignee')}</th>
              <th className={cn(head, 'w-32')}>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {t('startLabel')}
                </span>
              </th>
              <th className={cn(head, 'w-32')}>
                <SortBtn k="due">{t('dueLabel')}</SortBtn>
              </th>
              <th className={cn(head, 'w-24')}>
                <span className="inline-flex items-center gap-1">
                  <Timer className="size-3.5" />
                  {t('estimateShort')}
                </span>
              </th>
              {fields.map((f) => {
                const Icon = FIELD_ICONS[f.type]
                return (
                  <th key={f.id} className={cn(head, 'w-40')}>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3.5" />
                      {f.name}
                    </span>
                  </th>
                )
              })}
              <th className={cn(head, 'w-14')} aria-label={t('attachmentsShort')}>
                <Paperclip className="size-3.5" />
              </th>
              <th className={cn(head, 'w-40 font-normal')}>{ws.my_role === 'admin' ? <AddFieldPopover ws={ws} /> : null}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((task) => {
              const assignee = task.assignee_id ? memberMap.get(task.assignee_id) : undefined
              const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p })
              const n = counts.get(task.id) ?? 0
              return (
                <tr key={task.id} className={cn('group/tr hover:bg-hover/50', openId === task.id && 'bg-accent-soft/50')}>
                  <td className={cn(cell, 'sticky left-0 z-[1] bg-canvas pl-4 group-hover/tr:bg-hover', openId === task.id && 'bg-accent-soft')}>
                    <button type="button" onClick={() => open(task.id)} className="flex w-full min-w-0 items-center gap-2 text-left">
                      <span className="w-14 shrink-0 font-mono text-xs text-fg-subtle">{taskRef(ws.key, task.number)}</span>
                      <span className={cn('truncate', task.status === 'done' ? 'text-fg-muted line-through decoration-fg-subtle/40' : 'text-fg')}>{task.title}</span>
                    </button>
                  </td>
                  <td className={cell}>
                    <StatusMenu value={task.status} onChange={(status) => patch({ status })} disabled={!editable} className="h-7 px-2">
                      <StatusIcon status={task.status} />
                      <span className="truncate">{tStatus(task.status)}</span>
                    </StatusMenu>
                  </td>
                  <td className={cell}>
                    <PriorityMenu value={task.priority} onChange={(priority) => patch({ priority })} disabled={!editable} className="h-7 px-2">
                      <PriorityIcon priority={task.priority} />
                    </PriorityMenu>
                  </td>
                  <td className={cell}>
                    <AssigneeMenu value={task.assignee_id} members={members} onChange={(assignee_id) => patch({ assignee_id })} disabled={!editable} className="h-7 max-w-full px-2">
                      {assignee ? (
                        <>
                          <Avatar name={assignee.full_name} src={assignee.avatar_url} seed={assignee.id} size={18} />
                          <span className="truncate">{assignee.full_name.split(' ')[0]}</span>
                        </>
                      ) : (
                        <CircleUser className="size-4 text-fg-subtle" />
                      )}
                    </AssigneeMenu>
                  </td>
                  <td className={cell}>
                    <DuePopover value={task.start_date} onChange={(start_date) => patch({ start_date })} disabled={!editable} className="h-7 px-2" aria-label={t('startLabel')}>
                      {task.start_date ? <DueDate due={task.start_date} withIcon={false} className="text-sm text-fg" /> : null}
                    </DuePopover>
                  </td>
                  <td className={cell}>
                    <DuePopover value={task.due_date} onChange={(due_date) => patch({ due_date })} disabled={!editable} className="h-7 px-2">
                      {task.due_date ? <DueDate due={task.due_date} done={task.status === 'done'} withIcon={false} className="text-sm" /> : null}
                    </DuePopover>
                  </td>
                  <td className={cell}>
                    <FieldValue
                      field={{ id: 'estimate', name: t('estimateLabel'), type: 'number' }}
                      value={task.estimate_hours}
                      editable={editable}
                      compact
                      onChange={(v) => patch({ estimate_hours: v == null ? null : Number(v) })}
                    />
                  </td>
                  {fields.map((f) => (
                    <td key={f.id} className={cell}>
                      <FieldValue field={f} value={task.custom?.[f.id]} editable={editable} compact onChange={(v) => patch({ custom: { ...(task.custom ?? {}), [f.id]: v } })} />
                    </td>
                  ))}
                  <td className={cn(cell, 'text-xs text-fg-muted')}>
                    {n ? (
                      <button type="button" onClick={() => open(task.id)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-hover">
                        <Paperclip className="size-3.5" />
                        {n}
                      </button>
                    ) : null}
                  </td>
                  <td className={cell} />
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky left-0 bg-canvas px-4 py-2 text-xs text-fg-subtle">{t('rowsCount', { count: tasks.length })}</td>
              <td colSpan={5} />
              <td className="px-3 py-2 text-xs tabular-nums text-fg-muted">{totalEstimate ? `${fmt(totalEstimate)} ${t('hoursShort')}` : ''}</td>
              {fields.map((f) => (
                <td key={f.id} className="px-3 py-2 text-xs tabular-nums text-fg-muted">
                  {numberFields.includes(f) && sumOf(f.id) ? <span title={t('sumLabel')}>Σ {fmt(sumOf(f.id))}</span> : null}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {editable ? (
        <div className="border-t border-line">
          <TaskComposer defaults={{ workspace_id: workspaceId, status: 'todo' }} after={tasks.at(-1)?.position} autoFocus={false} />
        </div>
      ) : null}
    </div>
  )
}
