'use client'

import { useTranslations } from 'next-intl'
import { CircleUser, Paperclip } from 'lucide-react'
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

  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(task.id)
      }}
      className={cn(
        'group/row flex h-10 min-w-0 items-center gap-2 border-b border-line/70 px-4 text-sm outline-none transition-colors hover:bg-hover/70 focus-visible:bg-hover',
        active && 'bg-accent-soft/60 hover:bg-accent-soft/60',
      )}
    >
      <PriorityMenu value={task.priority} onChange={(priority) => patch({ priority })} disabled={!editable} className="size-6 justify-center">
        <PriorityIcon priority={task.priority} />
      </PriorityMenu>

      <span className="hidden w-14 shrink-0 font-mono text-xs text-fg-subtle @lg:block">{ws ? taskRef(ws.key, task.number) : ''}</span>

      <StatusMenu options={workspaceStatuses(ws)} value={taskStatusOf(task, ws)} onChange={(o) => patch(statusPatch(o))} disabled={!editable} className="size-6 justify-center">
        <StatusIcon status={task.status} />
      </StatusMenu>

      <span className={cn('min-w-0 flex-1 truncate', done ? 'text-fg-muted' : 'text-fg')}>{task.title}</span>

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
          <DueDate due={task.due_date} done={done} />
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
