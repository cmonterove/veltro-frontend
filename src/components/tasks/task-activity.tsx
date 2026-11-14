'use client'

import { Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { useMemberMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { LogoMark } from '@/components/app/logo'
import { StatusIcon } from './status-icon'
import { LabelChip } from './pickers'
import { api } from '@/lib/api/client'
import { taskStatusOf } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { useDateLocale } from '@/lib/dates'
import { recurrenceKey } from '@/lib/recurrence'
import type { TaskRecurrence, TaskRow, TaskStatus } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'

/**
 * Historial de la tarea (GET /v1/tasks/{id}/activity): quién cambió qué y cuándo, del más nuevo al
 * más viejo. Lo escribe la base, así que cuenta también lo que se hizo desde el celular o el
 * asistente. Los cambios seguidos de una misma persona ya vienen juntos.
 */

type TaskEvent = {
  id: string
  kind: 'created' | 'title' | 'status' | 'priority' | 'assignees' | 'due_date' | 'start_date' | 'description' | 'labels' | 'parent' | 'recurrence' | 'blocked_by'
  actor: { id: string; fullName: string; avatarUrl: string | null } | null
  data: Record<string, unknown>
  createdAt: string
}

export const activityKey = (taskId: string) => ['task-activity', taskId] as const

export function useTaskActivity(taskId: string) {
  return useQuery({
    queryKey: activityKey(taskId),
    staleTime: 10_000,
    queryFn: async () => (await api<{ items: TaskEvent[] }>(`/v1/tasks/${taskId}/activity`)).items,
  })
}

export function TaskActivity({ task, ws }: { task: TaskRow; ws: WorkspaceWithRole }) {
  const t = useTranslations('tasks.activity')
  const locale = useDateLocale()
  const { data, isLoading } = useTaskActivity(task.id)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5 w-2/3" />
        ))}
      </div>
    )
  }
  if (!data?.length) return <p className="text-sm text-fg-subtle">{t('empty')}</p>

  return (
    <ol className="relative flex flex-col">
      {/* la línea que une los cambios */}
      <span aria-hidden className="absolute bottom-3 left-[9px] top-3 w-px bg-line" />
      {data.map((e) => (
        <li key={e.id} className="relative flex gap-3 py-2">
          <span className="relative z-[1] mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-canvas ring-4 ring-canvas">
            {e.actor ? (
              <Avatar name={e.actor.fullName} src={e.actor.avatarUrl} seed={e.actor.id} size={20} />
            ) : (
              <span className="flex size-5 items-center justify-center rounded-full bg-highlight">
                <LogoMark className="size-3" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 text-sm leading-relaxed text-fg-muted">
            <EventText e={e} ws={ws} />
            <Tooltip content={format(parseISO(e.createdAt), "d MMM yyyy, HH:mm", { locale })}>
              <span className="ml-1.5 whitespace-nowrap text-xs text-fg-subtle">
                {formatDistanceToNowStrict(parseISO(e.createdAt), { addSuffix: true, locale })}
              </span>
            </Tooltip>
          </div>
        </li>
      ))}
    </ol>
  )
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function EventText({ e, ws }: { e: TaskEvent; ws: WorkspaceWithRole }) {
  const t = useTranslations('tasks.activity')
  const tp = useTranslations('tasks.priority')
  const tr = useTranslations('tasks.recurrence')
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const statusName = useStatusName()
  const who = <b className="font-medium text-fg">{e.actor?.fullName ?? 'Veltro'}</b>
  const strong = (c: React.ReactNode) => <b className="font-medium text-fg">{c}</b>
  const day = (v: unknown) => (str(v) ? format(parseISO(str(v)!), 'EEE d MMM', { locale }) : '')
  const names = (list: string[]) => list.map((id) => memberMap.get(id)?.full_name ?? t('someone')).join(', ')
  const status = (cat: unknown, id: unknown) => {
    const o = taskStatusOf({ status: (str(cat) ?? 'todo') as TaskStatus, status_id: str(id) }, ws)
    return (
      <span className="inline-flex items-center gap-1 align-[-2px] font-medium text-fg">
        <StatusIcon status={o.category} />
        {statusName(o)}
      </span>
    )
  }
  const rule = (v: unknown) => {
    if (!v || typeof v !== 'object') return ''
    const k = recurrenceKey(v as TaskRecurrence)
    return tr(`rules.${k.key}`, { count: k.count ?? 1 }).toLowerCase()
  }
  const d = e.data

  switch (e.kind) {
    case 'created':
      return <>{t.rich(d.recurredFrom ? 'recurred' : 'created', { who: () => who })}</>
    case 'title':
      return <>{t.rich('title', { who: () => who, to: str(d.to) ?? '', b: strong })}</>
    case 'status':
      // la liberó la base al terminarse la última que la bloqueaba
      if (d.unblockedBy)
        return (
          <>
            {t.rich('unblocked', { ref: str(d.ref) ?? t('otherTask'), b: strong })} {status(d.to, d.toId)}
          </>
        )
      return (
        <>
          {t.rich('status', { who: () => who })} {status(d.to, d.toId)}
        </>
      )
    case 'blocked_by':
      return <>{t.rich(d.added ? 'blockedByAdded' : 'blockedByRemoved', { who: () => who, ref: str(d.ref) ?? t('otherTask'), title: str(d.refTitle) ?? '', b: strong })}</>
    case 'priority':
      return <>{t.rich('priority', { who: () => who, to: tp(str(d.to) ?? 'none'), b: strong })}</>
    case 'assignees': {
      const added = ids(d.added)
      const removed = ids(d.removed)
      return (
        <>
          {added.length ? t.rich('assigned', { who: () => who, names: names(added), b: strong }) : null}
          {added.length && removed.length ? ' · ' : null}
          {removed.length ? t.rich(added.length ? 'unassignedShort' : 'unassigned', { who: () => who, names: names(removed), b: strong }) : null}
        </>
      )
    }
    case 'due_date':
    case 'start_date': {
      const which = e.kind === 'due_date' ? 'due' : 'start'
      if (!d.to) return <>{t.rich(`${which}Removed`, { who: () => who })}</>
      return <>{t.rich(d.from ? `${which}Changed` : `${which}Set`, { who: () => who, from: day(d.from), to: day(d.to), b: strong })}</>
    }
    case 'description':
      return <>{t.rich('description', { who: () => who })}</>
    case 'labels': {
      const added = ids(d.added)
      const removed = ids(d.removed)
      return (
        <>
          {t.rich(added.length ? 'labelsAdded' : 'labelsRemoved', { who: () => who })}{' '}
          {(added.length ? added : removed).map((l, i) => (
            <Fragment key={l}>
              {i ? ' ' : null}
              <LabelChip label={l} />
            </Fragment>
          ))}
        </>
      )
    }
    case 'parent':
      return <>{t.rich(d.to ? 'parentSet' : 'parentRemoved', { who: () => who })}</>
    case 'recurrence':
      return <>{t.rich(d.to ? 'recurrenceSet' : 'recurrenceRemoved', { who: () => who, rule: rule(d.to), b: strong })}</>
  }
}
