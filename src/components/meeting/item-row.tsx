'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CircleUser, Trash2 } from 'lucide-react'
import { useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { AssigneeMenu, DuePopover } from '@/components/tasks/pickers'
import { DueDate } from '@/components/tasks/due-date'
import { StatusIcon } from '@/components/tasks/status-icon'
import { useTask } from '@/lib/queries/tasks'
import { cn, taskRef } from '@/lib/utils'
import type { MeetingItemRow } from '@/lib/database.types'
import type { Member } from '@/lib/types'
import { KIND_STYLE, KindChip } from './kinds'
import { useOpenTask } from '@/lib/use-open-task'

export function ItemRow({
  item,
  members,
  editable,
  onChange,
  onRemove,
  time,
}: {
  item: MeetingItemRow
  members: Member[]
  editable: boolean
  onChange: (patch: Partial<MeetingItemRow>) => void
  onRemove: () => void
  time?: string
}) {
  const t = useTranslations('meeting')
  const memberMap = useMemberMap()
  const [text, setText] = useState(item.text)
  const assignee = item.assignee_id ? memberMap.get(item.assignee_id) : undefined
  const isAction = item.kind === 'action'

  return (
    <div className={cn('group/item grid grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3 rounded-lg px-2 py-2 sm:grid-cols-[44px_96px_minmax(0,1fr)]', KIND_STYLE[item.kind].row)}>
      <span className="pt-1 font-mono text-2xs tabular-nums text-fg-subtle">{time}</span>
      <span className="hidden pt-0.5 sm:block">{item.kind === 'note' ? null : <KindChip kind={item.kind} />}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        {item.kind === 'note' ? null : (
          <span className="sm:hidden">
            <KindChip kind={item.kind} />
          </span>
        )}
        <div className="flex items-start gap-2">
          <textarea
            ref={autoGrow}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              autoGrow(e.target)
            }}
            onBlur={() => text.trim() !== item.text && text.trim() && onChange({ text: text.trim() })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
            readOnly={!editable}
            className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent [field-sizing:content] text-[15px] leading-relaxed text-fg outline-none"
            aria-label={t('itemText')}
          />
          {editable ? (
            <button
              type="button"
              onClick={onRemove}
              className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle opacity-0 hover:text-danger group-hover/item:opacity-100 focus-visible:opacity-100"
              aria-label={t('remove')}
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
        {isAction ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <AssigneeMenu
              value={item.assignee_id}
              members={members}
              onChange={(assignee_id) => onChange({ assignee_id })}
              disabled={!editable}
              className="h-6 rounded-full border border-line bg-panel px-1.5 text-xs"
            >
              {assignee ? (
                <>
                  <Avatar name={assignee.full_name} src={assignee.avatar_url} seed={assignee.id} size={16} />
                  {assignee.full_name.split(' ')[0]}
                </>
              ) : (
                <>
                  <CircleUser className="size-3.5 text-mandarina-ink" />
                  <span className="text-mandarina-ink">{t('noOwner')}</span>
                </>
              )}
            </AssigneeMenu>
            <DuePopover value={item.due_date} onChange={(due_date) => onChange({ due_date })} disabled={!editable} className="h-6 rounded-full border border-line bg-panel px-2 text-xs">
              {item.due_date ? <DueDate due={item.due_date} /> : <span className="text-fg-subtle">{t('noDate')}</span>}
            </DuePopover>
            {item.task_id ? <TaskLink taskId={item.task_id} /> : <span className="text-2xs text-fg-subtle">{t('willBecomeTask')}</span>}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function TaskLink({ taskId, className }: { taskId: string; className?: string }) {
  const { data: task } = useTask(taskId)
  const ws = useWorkspaceMap().get(task?.workspace_id ?? '')
  const { open } = useOpenTask()
  if (!task) return null
  return (
    <button
      type="button"
      onClick={() => open(task.id)}
      className={cn('inline-flex h-6 items-center gap-1.5 rounded-full bg-panel px-2 text-xs shadow-card hover:bg-hover', className)}
    >
      <StatusIcon status={task.status} className="size-3" />
      <span className="font-mono text-2xs text-fg-muted">{ws ? taskRef(ws.key, task.number) : ''}</span>
    </button>
  )
}

/** Ajusta la altura de un textarea a su contenido (los ítems largos bajan de línea en vez de cortarse). */
function autoGrow(el: HTMLTextAreaElement | null) {
  // Donde existe `field-sizing: content` el navegador lo resuelve solo (y se adapta al cambiar el ancho).
  if (!el || (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content'))) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
