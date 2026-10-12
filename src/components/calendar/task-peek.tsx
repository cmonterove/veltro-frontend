'use client'

import { useTranslations } from 'next-intl'
import { ArrowRight, CircleUser, UserPlus } from 'lucide-react'
import { canEdit, useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useUpdateTask } from '@/lib/queries/tasks'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { assigneesOf, assigneesPatch } from '@/lib/assignees'
import { taskStatusOf } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import type { TaskRow } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { StatusIcon } from '@/components/tasks/status-icon'
import { DueDate } from '@/components/tasks/due-date'

/**
 * Ficha de una tarea en el calendario: qué es, en qué está y de quién. Los responsables se cambian
 * aquí mismo con un clic, sin abrir la tarea; si no tiene a nadie, "Asignarme" queda a mano.
 */
export function TaskPeek({ task, onOpen, onChange }: { task: TaskRow; onOpen: () => void; /** avisa que se tocó, p. ej. para no esconderla al instante */ onChange?: () => void }) {
  const t = useTranslations('calendar.task')
  const tt = useTranslations('tasks')
  const statusName = useStatusName()
  const { user } = useApp()
  const ws = useWorkspaceMap().get(task.workspace_id)
  const memberMap = useMemberMap()
  const editable = canEdit(ws)
  const members = useWorkspaceMembers(editable ? task.workspace_id : null)
  const update = useUpdateTask()
  const ids = assigneesOf(task)
  const set = (next: string[]) => {
    onChange?.()
    update.mutate({ id: task.id, patch: assigneesPatch(next) })
  }
  const toggle = (id: string) => set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  // tú primero; sin permiso de edición solo se ven quienes ya la tienen
  const people = editable
    ? [...members].sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id) || a.full_name.localeCompare(b.full_name))
    : ids.flatMap((id) => memberMap.get(id) ?? [])

  return (
    <div className="w-80">
      <div className="border-b border-line p-3">
        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
          {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
          <span className="truncate">{ws?.name}</span>
          {ws ? <span className="font-mono text-fg-subtle">{taskRef(ws.key, task.number)}</span> : null}
        </div>
        <p className="mt-1.5 text-sm font-medium leading-snug text-fg">{task.title}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <StatusIcon status={task.status} />
            {statusName(taskStatusOf(task, ws))}
          </span>
          {task.due_date ? <DueDate due={task.due_date} done={task.status === 'done'} /> : null}
        </div>
      </div>

      <div className="p-3">
        <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{tt('assignees')}</p>
        {ids.length === 0 ? (
          <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-2">
            <CircleUser className="size-4 shrink-0 text-fg-subtle" />
            <span className="flex-1 text-xs text-fg-muted">{t('nobody')}</span>
            {editable ? (
              <Button size="xs" variant="primary" onClick={() => set([user.id])}>
                <UserPlus />
                {t('assignMe')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {people.length ? (
          <div className="flex flex-wrap gap-1.5">
            {people.map((m) => {
              const on = ids.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border pl-0.5 pr-2.5 text-xs transition-colors disabled:cursor-default',
                    on ? 'border-accent-mid/40 bg-accent-soft font-medium text-accent-ink' : 'border-line text-fg-muted enabled:hover:bg-hover enabled:hover:text-fg',
                  )}
                >
                  <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={22} />
                  {m.id === user.id ? t('me') : m.full_name.split(' ')[0]}
                </button>
              )
            })}
          </div>
        ) : null}
        {editable ? <p className="mt-2 text-2xs text-fg-subtle">{t('assignHint')}</p> : null}
      </div>

      <div className="flex justify-end border-t border-line p-1.5">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {t('open')}
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}
