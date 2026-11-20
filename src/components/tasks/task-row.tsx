'use client'

import { createContext, useContext } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, CircleUser, Hourglass, Paperclip } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Tooltip } from '@/components/ui/tooltip'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { AvatarStack } from '@/components/ui/avatar'
import { useUpdateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useAttachmentCounts } from '@/lib/queries/attachments'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow as Task } from '@/lib/database.types'
import { AssigneesMenu, DuePopover, LabelChip, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'
import { WorkspaceMark } from '@/components/app/marks'
import { statusPatch, taskStatusOf, workspaceStatuses } from '@/lib/statuses'
import { assigneesOf, assigneesPatch } from '@/lib/assignees'

/** Días sin cambios desde los que una tarea abierta se marca como quieta. */
const IDLE_DAYS = 5
/** ¿Se marca lo quieto? En «Mías» no (cada quien sabe lo suyo); en las vistas de seguimiento, sí. */
export const ShowIdleContext = createContext(true)

export function TaskRow({
  task,
  onOpen,
  showWorkspace,
  active,
}: {
  task: Task
  onOpen: (id: string) => void
  showWorkspace?: boolean
  active?: boolean
}) {
  const t = useTranslations('tasks')
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const ws = wsMap.get(task.workspace_id)
  const editable = canEdit(ws)
  const update = useUpdateTask()
  const members = useWorkspaceMembers(editable ? task.workspace_id : null)
  const people = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const attachments = useAttachmentCounts(task.workspace_id).get(task.id) ?? 0
  const done = task.status === 'done'
  const showIdle = useContext(ShowIdleContext)
  // quieta: abierta y sin cambios hace días (lo que hay que perseguir en el seguimiento)
  const idle = done || !task.updated_at ? 0 : differenceInCalendarDays(new Date(), parseISO(task.updated_at))

  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p })

  return (
    <div
      role="button"
      tabIndex={0}
      data-task-id={task.id}
      aria-current={active || undefined}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(task.id)
      }}
      className={cn(
        // filas redondeadas y sin raya: el aire separa (como en Pulso); al pasar el mouse, se marca entera
        'group/row mx-2 flex h-11 min-w-0 items-center gap-2 rounded-xl px-2 text-sm outline-none transition-colors duration-150 hover:bg-hover/60 focus-visible:bg-hover',
        active && 'bg-accent-soft hover:bg-accent-soft',
      )}
    >
      <PriorityMenu value={task.priority} onChange={(priority) => patch({ priority })} disabled={!editable} className="size-6 justify-center">
        <PriorityIcon priority={task.priority} />
      </PriorityMenu>

      <span className="hidden w-14 shrink-0 font-mono text-xs text-fg-subtle @lg:block">{ws ? taskRef(ws.key, task.number) : ''}</span>

      <StatusMenu options={workspaceStatuses(ws)} value={taskStatusOf(task, ws)} onChange={(o) => patch(statusPatch(o))} disabled={!editable} className="size-6 justify-center">
        <StatusIcon status={task.status} />
      </StatusMenu>

      <span className={cn('min-w-0 flex-1 truncate text-[14.5px]', done ? 'text-fg-muted line-through decoration-fg-subtle/40' : 'text-fg')}>{task.title}</span>

      {/* esperando a otras tareas (dependencias abiertas) */}
      {!done && task.blocked_by_open ? (
        <Tooltip content={t('deps.waitingHint', { count: task.blocked_by_open })}>
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-danger-soft px-1.5 text-2xs font-medium text-danger">
            <Ban className="size-3" />
            <span className="hidden @xl:inline">{t('deps.waiting', { count: task.blocked_by_open })}</span>
          </span>
        </Tooltip>
      ) : null}

      {showIdle && idle >= IDLE_DAYS ? (
        <Tooltip content={t('idleHint', { count: idle })}>
          <span className="hidden h-5 shrink-0 items-center gap-1 rounded-full bg-warning-soft px-1.5 text-2xs font-medium text-mandarina-ink @xl:inline-flex">
            <Hourglass className="size-3" />
            {t('idle', { count: idle })}
          </span>
        </Tooltip>
      ) : null}

      {task.labels.length ? (
        <span className="hidden items-center gap-1 @3xl:flex">
          {task.labels.slice(0, 2).map((l) => (
            <LabelChip key={l} label={l} />
          ))}
          {task.labels.length > 2 ? <span className="text-2xs text-fg-subtle">+{task.labels.length - 2}</span> : null}
        </span>
      ) : null}

      {attachments ? (
        <span className="hidden items-center gap-0.5 text-xs text-fg-subtle @md:inline-flex">
          <Paperclip className="size-3.5" />
          {attachments}
        </span>
      ) : null}

      {showWorkspace && ws ? (
        <span className={cn('ws-' + ws.color, 'inline-flex h-5 shrink-0 items-center gap-1 rounded-full text-2xs text-fg-muted @2xl:border @2xl:border-line @2xl:px-2')} title={ws.name}>
          <WorkspaceMark ws={ws} size={14} />
          <span className="hidden max-w-24 truncate @2xl:inline">{ws.name}</span>
        </span>
      ) : null}

      <DuePopover value={task.due_date} onChange={(due_date) => patch({ due_date })} disabled={!editable} className="h-6 px-1.5">
        {task.due_date ? (
          <DueDate due={task.due_date} done={done} repeats={Boolean(task.recurrence)} />
        ) : (
          <span className="text-xs text-fg-subtle opacity-0 transition-opacity group-hover/row:opacity-100">{t('addDate')}</span>
        )}
      </DuePopover>

      <AssigneesMenu
        value={assigneesOf(task)}
        members={members}
        onChange={(ids) => patch(assigneesPatch(ids))}
        disabled={!editable}
        className="h-6 min-w-6 justify-center rounded-full px-0.5"
      >
        {people.length ? <AvatarStack people={people} size={20} /> : <CircleUser className="size-4 text-fg-subtle" />}
      </AssigneesMenu>
    </div>
  )
}
