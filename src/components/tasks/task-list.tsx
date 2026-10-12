'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react'
import { useCreateTask, type NewTask } from '@/lib/queries/tasks'
import { cn } from '@/lib/utils'
import type { TaskRow as Task, TaskStatus, WorkspaceRow } from '@/lib/database.types'
import { useWorkspaceMap } from '@/components/app/app-context'
import { statusKey, statusPatch, taskStatusOf, workspaceStatuses, type StatusOption } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { TaskRow } from './task-row'
import { StatusIcon } from './status-icon'
import { useOpenTask } from '@/lib/use-open-task'
import { Tooltip } from '@/components/ui/tooltip'
import { GroupSummary } from './group-summary'

export type TaskGroup = {
  id: string
  label: string
  icon?: React.ReactNode
  tasks: Task[]
  /** valores por defecto para tareas creadas en este grupo; null = sin composer */
  defaults: Omit<NewTask, 'title'> | null
  collapsedByDefault?: boolean
  tone?: 'danger'
  /** lo que se ve a la derecha del encabezado cuando el grupo está plegado */
  summary?: React.ReactNode
}

/** Grupos plegados por id; lo que no está, sigue `collapsedByDefault`. */
export type CollapsedGroups = Record<string, boolean>

export const isGroupCollapsed = (g: TaskGroup, state: CollapsedGroups) => state[g.id] ?? Boolean(g.collapsedByDefault)

/** Abrir o cerrar todos los grupos con contenido de una vez. */
export function CollapseAllButton({
  groups,
  collapsed,
  onChange,
}: {
  groups: TaskGroup[]
  collapsed: CollapsedGroups
  onChange: (next: CollapsedGroups) => void
}) {
  const t = useTranslations('tasks')
  const withTasks = groups.filter((g) => g.tasks.length > 0)
  const allClosed = withTasks.length > 0 && withTasks.every((g) => isGroupCollapsed(g, collapsed))
  const label = allClosed ? t('expandAll') : t('collapseAll')
  const Icon = allClosed ? ChevronsUpDown : ChevronsDownUp
  return (
    <Tooltip content={label}>
      <button
        type="button"
        disabled={!withTasks.length}
        onClick={() => onChange({ ...collapsed, ...Object.fromEntries(withTasks.map((g) => [g.id, !allClosed])) })}
        aria-label={label}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 disabled:opacity-40"
      >
        <Icon className="size-4" />
      </button>
    </Tooltip>
  )
}

export const LIST_STATUS_ORDER: TaskStatus[] = ['in_progress', 'blocked', 'todo', 'backlog', 'done']

export function groupByStatus(
  tasks: Task[],
  workspaceId: string,
  label: (o: StatusOption) => string,
  ws?: Pick<WorkspaceRow, 'task_statuses'> | null,
): TaskGroup[] {
  // Orden de lectura por categoría (lo activo primero); dentro de cada categoría, el orden del espacio
  const options = workspaceStatuses(ws)
  const ordered = LIST_STATUS_ORDER.flatMap((c) => options.filter((o) => o.category === c))
  return ordered.map((o) => {
    const key = statusKey(o)
    const list = tasks.filter((t) => statusKey(taskStatusOf(t, ws)) === key)
    list.sort((a, b) => (o.category === 'done' ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '') : a.position - b.position))
    return {
      id: key,
      label: label(o),
      icon: <StatusIcon status={o.category} />,
      tasks: list,
      defaults: { workspace_id: workspaceId, ...statusPatch(o) },
      collapsedByDefault: o.category === 'done',
      summary: <GroupSummary tasks={list} omit={['status', 'spaces']} />,
    }
  })
}

export function TaskGroupList({
  groups,
  showWorkspace,
  hideEmpty,
  emptyState,
  className,
  collapsed,
  onCollapsedChange,
}: {
  groups: TaskGroup[]
  showWorkspace?: boolean
  hideEmpty?: boolean
  emptyState?: React.ReactNode
  className?: string
  /** controlado desde afuera (para recordarlo o para "abrir y cerrar todo"); si no, cada lista lleva el suyo */
  collapsed?: CollapsedGroups
  onCollapsedChange?: (next: CollapsedGroups) => void
}) {
  const { open } = useOpenTask()
  const [own, setOwn] = useState<CollapsedGroups>({})
  const state = collapsed ?? own
  const setState = onCollapsedChange ?? setOwn
  const visible = hideEmpty ? groups.filter((g) => g.tasks.length > 0) : groups
  const total = groups.reduce((n, g) => n + g.tasks.length, 0)

  if (total === 0 && emptyState) return <>{emptyState}</>

  return (
    <div className={cn('@container pb-24', className)}>
      {visible.map((g) => (
        <Group
          key={g.id}
          group={g}
          collapsed={isGroupCollapsed(g, state)}
          // Alt + clic abre o cierra todos, como en el Finder
          onCollapse={(value, all) =>
            setState(all ? { ...state, ...Object.fromEntries(visible.map((v) => [v.id, value])) } : { ...state, [g.id]: value })
          }
          onOpen={open}
          showWorkspace={showWorkspace}
        />
      ))}
    </div>
  )
}

function Group({
  group,
  collapsed,
  onCollapse,
  onOpen,
  showWorkspace,
}: {
  group: TaskGroup
  collapsed: boolean
  onCollapse: (collapsed: boolean, all: boolean) => void
  onOpen: (id: string) => void
  showWorkspace?: boolean
}) {
  const t = useTranslations('tasks')
  const [composing, setComposing] = useState(false)

  return (
    <section>
      <div className="group/header sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-line bg-sidebar/95 px-4 backdrop-blur-[2px]">
        <button
          type="button"
          onClick={(e) => onCollapse(!collapsed, e.altKey)}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm outline-none focus-visible:underline"
          aria-expanded={!collapsed}
          title={t('collapseHint')}
        >
          <ChevronRight className={cn('size-3.5 shrink-0 text-fg-subtle transition-transform duration-150', !collapsed && 'rotate-90')} />
          {group.icon}
          <span className={cn('truncate font-medium', group.tone === 'danger' ? 'text-danger' : 'text-fg')}>{group.label}</span>
          <span className="text-xs tabular-nums text-fg-subtle">{group.tasks.length}</span>
          {collapsed ? group.summary : null}
        </button>
        {group.defaults ? (
          <button
            type="button"
            onClick={() => {
              onCollapse(false, false)
              setComposing(true)
            }}
            className="inline-flex size-6 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/header:opacity-100 focus-visible:opacity-100"
            aria-label={t('addTo', { group: group.label })}
          >
            <Plus className="size-4" />
          </button>
        ) : null}
      </div>
      {collapsed ? null : (
        <>
          {group.tasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={onOpen} showWorkspace={showWorkspace} />
          ))}
          {group.defaults && composing ? (
            <TaskComposer
              defaults={group.defaults}
              after={group.tasks.at(-1)?.position}
              onDone={() => setComposing(false)}
            />
          ) : null}
        </>
      )}
    </section>
  )
}

export function TaskComposer({
  defaults,
  after,
  onDone,
  placeholder,
  className,
  compact,
  autoFocus = true,
}: {
  defaults: Omit<NewTask, 'title'>
  after?: number
  onDone?: () => void
  placeholder?: string
  className?: string
  compact?: boolean
  autoFocus?: boolean
}) {
  const t = useTranslations('tasks')
  const create = useCreateTask()
  const [title, setTitle] = useState('')
  const lastPos = useRef(after ?? 0)

  const submit = () => {
    const value = title.trim()
    if (!value) return
    lastPos.current = (lastPos.current || 0) + 1000
    create.mutate({ ...defaults, title: value, position: lastPos.current })
    setTitle('')
  }

  return (
    <div className={cn('flex h-10 items-center gap-2 border-b border-line/70 px-4', compact && 'border-0 px-2.5', className)}>
      {compact ? null : (
        <>
          <span className="size-6" />
          <span className="hidden w-14 @lg:block" />
        </>
      )}
      <StatusIcon status={(defaults.status as TaskStatus) ?? 'todo'} className={compact ? undefined : 'mx-[5px]'} />
      <input
        autoFocus={autoFocus}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') {
            setTitle('')
            onDone?.()
          }
        }}
        onBlur={() => {
          if (!title.trim()) onDone?.()
        }}
        placeholder={placeholder ?? t('composerPlaceholder')}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        maxLength={500}
      />
      {compact ? null : <span className="hidden shrink-0 text-xs text-fg-subtle @xl:inline">{t('composerHint')}</span>}
    </div>
  )
}

export function useStatusGroups(tasks: Task[] | undefined, workspaceId: string) {
  const name = useStatusName()
  const ws = useWorkspaceMap().get(workspaceId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => groupByStatus(tasks ?? [], workspaceId, name, ws), [tasks, workspaceId, ws?.task_statuses])
}
