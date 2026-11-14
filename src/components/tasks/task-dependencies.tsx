'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Ban, Plus, Search, X } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { AvatarStack } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip } from '@/components/ui/tooltip'
import { api } from '@/lib/api/client'
import type { ApiDependencies, ApiDependency, ApiTaskDetail } from '@/lib/api/tareas'
import { toErrorCode } from '@/lib/errors'
import { useTasks } from '@/lib/queries/tasks'
import { useOpenTask } from '@/lib/use-open-task'
import { track } from '@/lib/telemetry'
import type { TaskRow } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { DueDate } from './due-date'
import { StatusIcon } from './status-icon'

/**
 * Dependencias de una tarea: las que la bloquean («Bloqueada por») y las que esperan a esta
 * («Bloquea a»). Cuando se termina la última que la bloquea, la base la libera (si estaba
 * «Bloqueada» pasa a «Por hacer») y avisa a sus responsables.
 */

export const depsKey = (taskId: string) => ['task-deps', taskId] as const

export function useTaskDependencies(taskId: string) {
  return useQuery({
    queryKey: depsKey(taskId),
    staleTime: 30_000,
    queryFn: async () => {
      const d = await api<ApiTaskDetail>(`/v1/tasks/${taskId}`)
      return { blockedBy: d.blockedBy ?? [], blocking: d.blocking ?? [] } satisfies ApiDependencies
    },
  })
}

function useDependencyMutations(taskId: string) {
  const qc = useQueryClient()
  const tErr = useTranslations('errors')
  const settle = (r: ApiDependencies, other: string) => {
    qc.setQueryData(depsKey(taskId), r)
    // la otra tarea también cambió («bloquea a»), y las listas cuentan las que bloquean
    qc.invalidateQueries({ queryKey: depsKey(other) })
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['task', taskId] })
    qc.invalidateQueries({ queryKey: ['task-activity', taskId] })
  }
  const add = useMutation({
    mutationFn: (blockedBy: string) => api<ApiDependencies>(`/v1/tasks/${taskId}/dependencies`, { method: 'POST', body: { blockedBy } }),
    onSuccess: (r, blockedBy) => settle(r, blockedBy),
    onError: (e) => toast.error(tErr(toErrorCode(e as { message?: string }))),
  })
  const remove = useMutation({
    mutationFn: (blockerId: string) => api<ApiDependencies>(`/v1/tasks/${taskId}/dependencies/${blockerId}`, { method: 'DELETE' }),
    onSuccess: (r, blockerId) => settle(r, blockerId),
    onError: (e) => toast.error(tErr(toErrorCode(e as { message?: string }))),
  })
  return { add, remove }
}

export function TaskDependencies({ task, editable }: { task: TaskRow; editable: boolean }) {
  const t = useTranslations('tasks.deps')
  const { data } = useTaskDependencies(task.id)
  const { add, remove } = useDependencyMutations(task.id)
  const blockedBy = data?.blockedBy ?? []
  const blocking = data?.blocking ?? []
  const open = blockedBy.filter((d) => d.status !== 'done').length

  const picker = editable ? (
    <BlockerPicker
      task={task}
      exclude={new Set([task.id, ...blockedBy.map((d) => d.id), ...blocking.map((d) => d.id)])}
      onPick={(id) => {
        add.mutate(id, { onSuccess: () => toast.success(t('added')) })
        track('feature.task_dependency_add')
      }}
      compact={blockedBy.length + blocking.length > 0}
    />
  ) : null

  if (!data) return null
  if (!blockedBy.length && !blocking.length) return picker ? <div className="mt-6">{picker}</div> : null

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">{t('title')}</h2>
        {open ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-px text-2xs font-medium text-danger">
            <Ban className="size-3" />
            {t('openBlockers', { count: open })}
          </span>
        ) : blockedBy.length ? (
          <span className="rounded-md bg-hover px-1.5 py-px text-2xs font-medium text-fg-muted">{t('free')}</span>
        ) : null}
        <span className="ml-auto">{picker}</span>
      </div>
      {blockedBy.length ? (
        <DepList label={t('blockedBy')} items={blockedBy} onRemove={editable ? (id) => remove.mutate(id) : undefined} removeLabel={t('remove')} />
      ) : null}
      {blocking.length ? <DepList label={t('blocking')} items={blocking} /> : null}
    </section>
  )
}

function DepList({ label, items, onRemove, removeLabel }: { label: string; items: ApiDependency[]; onRemove?: (id: string) => void; removeLabel?: string }) {
  const { open } = useOpenTask()
  const memberMap = useMemberMap()
  return (
    <div className="mt-2">
      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      <ul className="flex flex-col overflow-hidden rounded-lg border border-line">
        {items.map((d) => {
          const people = d.assigneeIds.flatMap((id) => memberMap.get(id) ?? [])
          const done = d.status === 'done'
          return (
            <li key={d.id} className="group/dep flex h-11 items-center gap-2.5 border-b border-line-soft px-3 last:border-0 hover:bg-hover/50">
              <StatusIcon status={d.status} />
              <span className="w-16 shrink-0 font-mono text-2xs text-fg-subtle">{d.ref}</span>
              <button type="button" onClick={() => open(d.id)} className={cn('min-w-0 flex-1 truncate text-left text-sm', done && 'text-fg-muted line-through')}>
                {d.title}
              </button>
              {d.dueDate && !done ? <DueDate due={d.dueDate} done={false} withIcon={false} /> : null}
              {people.length ? <AvatarStack people={people} size={20} max={3} /> : null}
              {onRemove ? (
                <Tooltip content={removeLabel}>
                  <button
                    type="button"
                    onClick={() => onRemove(d.id)}
                    aria-label={removeLabel}
                    className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg focus-visible:opacity-100 group-hover/dep:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </Tooltip>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Buscar la tarea que bloquea: por referencia (PRO-5) o por título, en todo lo que veo. */
function BlockerPicker({ task, exclude, onPick, compact }: { task: TaskRow; exclude: Set<string>; onPick: (id: string) => void; compact: boolean }) {
  const t = useTranslations('tasks.deps')
  const { workspaces, observedWorkspaces } = useApp()
  const wsMap = useWorkspaceMap()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const { data: tasks } = useTasks(open ? { kind: 'workspaces', workspaceIds: wsIds } : null)
  const needle = q.trim().toLowerCase()
  const shown = useMemo(() => {
    const list = (tasks ?? []).filter((x) => !exclude.has(x.id) && x.status !== 'done')
    const refOf = (x: TaskRow) => taskRef(wsMap.get(x.workspace_id)?.key ?? '', x.number).toLowerCase()
    const hits = needle ? list.filter((x) => x.title.toLowerCase().includes(needle) || refOf(x).includes(needle)) : list
    // primero las del mismo espacio
    return hits.sort((a, b) => Number(b.workspace_id === task.workspace_id) - Number(a.workspace_id === task.workspace_id) || b.updated_at.localeCompare(a.updated_at)).slice(0, 8)
  }, [tasks, exclude, needle, wsMap, task.workspace_id])

  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQ(''))}>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
          compact ? 'h-7 px-2 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg' : 'h-8 px-2 text-fg-subtle hover:bg-hover hover:text-fg-muted',
        )}
      >
        {compact ? <Plus className="size-3.5" /> : <Ban className="size-3.5" />}
        {compact ? t('add') : t('addFirst')}
      </PopoverTrigger>
      <PopoverContent align={compact ? 'end' : 'start'} className="w-96 p-0">
        <label className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-3.5 shrink-0 text-fg-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder={t('search')}
            aria-label={t('search')}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
        </label>
        <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
          {!tasks ? (
            <p className="px-2 py-3 text-sm text-fg-subtle">{t('loading')}</p>
          ) : shown.length ? (
            shown.map((x) => {
              const ws = wsMap.get(x.workspace_id)
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    onPick(x.id)
                    setOpen(false)
                    setQ('')
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-hover"
                >
                  <StatusIcon status={x.status} />
                  <span className="w-16 shrink-0 font-mono text-2xs text-fg-subtle">{ws ? taskRef(ws.key, x.number) : ''}</span>
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                </button>
              )
            })
          ) : (
            <p className="px-2 py-3 text-sm text-fg-subtle">{t('noMatches')}</p>
          )}
        </div>
        <p className="border-t border-line px-3 py-2 text-2xs leading-snug text-fg-subtle">{t('hint')}</p>
      </PopoverContent>
    </Popover>
  )
}
