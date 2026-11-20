'use client'

import { useTranslations } from 'next-intl'
import { ArrowUpRight, Check, CircleUser, RotateCcw } from 'lucide-react'
import { canEdit, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CARD } from '@/components/ui/surface'
import { useSubtasks, useTask, useUpdateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useOpenTask } from '@/lib/use-open-task'
import { assigneesOf, assigneesPatch } from '@/lib/assignees'
import { statusPatch, taskStatusOf, workspaceStatuses } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import { AssigneesMenu, DuePopover, LabelChip, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'

/** Pastilla por estado y por prioridad (los mismos tonos de la Tabla): lo que no dice nada queda neutro. */
const STATUS_PILL: Record<string, string> = {
  backlog: 'bg-fg/[0.05] text-fg-muted',
  todo: 'bg-fg/[0.06] text-fg',
  in_progress: 'bg-warning-soft text-mandarina-ink',
  blocked: 'bg-danger-soft text-danger',
  done: 'bg-done-soft text-done',
}
const PRIORITY_PILL: Record<string, string> = {
  urgent: 'bg-danger-soft text-danger',
  high: 'bg-warning-soft text-mandarina-ink',
  medium: 'bg-fg/[0.06] text-fg',
  low: 'bg-fg/[0.05] text-fg-muted',
  none: 'bg-fg/[0.04] text-fg-subtle',
}

/**
 * El vistazo de la Lista: la tarea elegida al lado, sin salir de la lista. Qué es y dónde está, en qué
 * estado, la descripción, sus propiedades (se cambian ahí mismo), las subtareas y dos salidas: marcarla
 * como hecha o abrirla entera. ↑ ↓ cambian de tarea y Enter la abre (lo maneja la lista).
 */
export function TaskPreview({ task: row, className }: { task: TaskRow; className?: string }) {
  const t = useTranslations('tasks')
  const tPriority = useTranslations('tasks.priority')
  const statusName = useStatusName()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const { open } = useOpenTask()
  const update = useUpdateTask()
  // la fila no trae la descripción: se pide la tarea completa (mientras, se ve la de la lista)
  const { data: full } = useTask(row.id)
  const task = full ?? row
  const { data: subtasks } = useSubtasks(row.id)
  const ws = wsMap.get(task.workspace_id)
  const editable = canEdit(ws)
  const members = useWorkspaceMembers(editable ? task.workspace_id : null)
  const people = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const done = task.status === 'done'
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p })
  const description = (task.description_text ?? '').trim()
  const subDone = (subtasks ?? []).filter((x) => x.status === 'done').length

  const row2 = 'grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 py-1.5'
  const label = 'text-xs font-medium text-fg-subtle'

  return (
    <aside className={cn(CARD, 'flex min-h-0 flex-col overflow-hidden', className)} aria-label={task.title}>
      {/* qué es: dónde vive, el título y su estado de un vistazo */}
      <header className="shrink-0 border-b border-line-soft bg-canvas/60 px-5 pb-4 pt-4">
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          {ws ? <WorkspaceMark ws={ws} size={16} /> : null}
          <span className="truncate">{ws?.name}</span>
          {ws ? <span className="font-mono text-fg-subtle">· {taskRef(ws.key, task.number)}</span> : null}
        </p>
        <h2 className={cn('mt-2 text-lg font-semibold leading-snug tracking-[-0.015em]', done ? 'text-fg-muted line-through decoration-fg-subtle/40' : 'text-fg')}>{task.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', STATUS_PILL[task.status])}>
            <StatusIcon status={task.status} className="size-3.5" />
            {statusName(taskStatusOf(task, ws))}
          </span>
          {task.priority !== 'none' ? (
            <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', PRIORITY_PILL[task.priority])}>
              <PriorityIcon priority={task.priority} />
              {tPriority(task.priority)}
            </span>
          ) : null}
          {task.due_date ? (
            <span className="inline-flex h-6 items-center rounded-full bg-fg/[0.05] px-2.5 text-xs">
              <DueDate due={task.due_date} done={done} repeats={Boolean(task.recurrence)} />
            </span>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
        {/* la descripción, leída tranquila (editarla es en la tarea) */}
        <section>
          <p className={label}>{t('description')}</p>
          {full ? (
            description ? (
              <p className="mt-1.5 line-clamp-[8] whitespace-pre-line text-sm leading-relaxed text-fg">{description}</p>
            ) : (
              <p className="mt-1.5 text-sm text-fg-subtle">{t('noDescription')}</p>
            )
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-full rounded-full" />
              <Skeleton className="h-3.5 w-2/3 rounded-full" />
            </div>
          )}
        </section>

        {/* las propiedades: se cambian aquí mismo */}
        <section className="mt-5 border-t border-line-soft pt-3">
          <div className={row2}>
            <span className={label}>{t('statusLabel')}</span>
            <StatusMenu options={workspaceStatuses(ws)} value={taskStatusOf(task, ws)} onChange={(o) => patch(statusPatch(o))} disabled={!editable} className="h-8 w-fit px-2">
              <StatusIcon status={task.status} />
              <span className="truncate">{statusName(taskStatusOf(task, ws))}</span>
            </StatusMenu>
          </div>
          <div className={row2}>
            <span className={label}>{t('priorityLabel')}</span>
            <PriorityMenu value={task.priority} onChange={(priority) => patch({ priority })} disabled={!editable} className="h-8 w-fit px-2">
              <PriorityIcon priority={task.priority} />
              <span className={cn('text-sm', task.priority === 'none' && 'text-fg-subtle')}>{tPriority(task.priority)}</span>
            </PriorityMenu>
          </div>
          <div className={row2}>
            <span className={label}>{t('dueLabel')}</span>
            <DuePopover value={task.due_date} onChange={(due_date) => patch({ due_date })} disabled={!editable} className="h-8 w-fit px-2">
              {task.due_date ? <DueDate due={task.due_date} done={done} repeats={Boolean(task.recurrence)} /> : <span className="text-sm text-fg-subtle">{t('addDate')}</span>}
            </DuePopover>
          </div>
          <div className={row2}>
            <span className={label}>{t('assignees')}</span>
            <AssigneesMenu value={assigneesOf(task)} members={members} onChange={(ids) => patch(assigneesPatch(ids))} disabled={!editable} className="h-8 w-fit max-w-full px-2">
              {people.length ? (
                <>
                  <AvatarStack people={people} size={20} />
                  <span className="truncate text-sm">{people.map((p) => p.full_name.split(' ')[0]).join(', ')}</span>
                </>
              ) : (
                <>
                  <CircleUser className="size-4 text-fg-subtle" />
                  <span className="text-sm text-fg-subtle">{t('unassigned')}</span>
                </>
              )}
            </AssigneesMenu>
          </div>
          {task.labels.length ? (
            <div className={row2}>
              <span className={label}>{t('labels')}</span>
              <span className="flex flex-wrap gap-1 px-2">
                {task.labels.map((l) => (
                  <LabelChip key={l} label={l} />
                ))}
              </span>
            </div>
          ) : null}
        </section>

        {/* las subtareas: cuántas van y cuáles */}
        <section className="mt-4 border-t border-line-soft pt-3">
          <p className="flex items-center gap-2">
            <span className={label}>{t('subtasks')}</span>
            {subtasks?.length ? <span className="text-xs tabular-nums text-fg-muted">{t('subtasksDone', { done: subDone, total: subtasks.length })}</span> : null}
          </p>
          {subtasks?.length ? (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
                <div className="h-full rounded-full bg-done transition-[width] duration-300 ease-out" style={{ width: `${(subDone / subtasks.length) * 100}%` }} />
              </div>
              <ul className="-mx-2 mt-2 flex flex-col">
                {subtasks.slice(0, 6).map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => open(x.id)} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-hover/60">
                      <StatusIcon status={x.status} />
                      <span className={cn('min-w-0 flex-1 truncate', x.status === 'done' ? 'text-fg-subtle line-through' : 'text-fg')}>{x.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-fg-subtle">{t('noSubtasks')}</p>
          )}
        </section>
      </div>

      {/* las dos salidas: cerrarla o abrirla entera */}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
        {editable ? (
          <Button variant={done ? 'secondary' : 'primary'} size="md" onClick={() => patch({ status: done ? 'todo' : 'done' })}>
            {done ? <RotateCcw /> : <Check />}
            {done ? t('reopen') : t('markDone')}
          </Button>
        ) : null}
        <Button variant="secondary" size="md" onClick={() => open(task.id)}>
          {t('openFull')}
          <ArrowUpRight />
        </Button>
        <span className="ml-auto hidden text-2xs text-fg-subtle 2xl:inline">{t('previewKeys')}</span>
      </footer>
    </aside>
  )
}
