'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Plus } from 'lucide-react'
import { useCreateTask, type NewTask } from '@/lib/queries/tasks'
import { useTaskPanel } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { TaskRow as Task, TaskStatus } from '@/lib/database.types'
import { TaskRow } from './task-row'
import { StatusIcon } from './status-icon'

export type TaskGroup = {
  id: string
  label: string
  icon?: React.ReactNode
  tasks: Task[]
  /** valores por defecto para tareas creadas en este grupo; null = sin composer */
  defaults: Omit<NewTask, 'title'> | null
  collapsedByDefault?: boolean
  tone?: 'danger'
}

export const LIST_STATUS_ORDER: TaskStatus[] = ['in_progress', 'blocked', 'todo', 'backlog', 'done']

export function groupByStatus(tasks: Task[], workspaceId: string, label: (s: TaskStatus) => string): TaskGroup[] {
  return LIST_STATUS_ORDER.map((status) => {
    const list = tasks.filter((t) => t.status === status)
    list.sort((a, b) =>
      status === 'done' ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '') : a.position - b.position,
    )
    return {
      id: status,
      label: label(status),
      icon: <StatusIcon status={status} />,
      tasks: list,
      defaults: { workspace_id: workspaceId, status },
      collapsedByDefault: status === 'done',
    }
  })
}

export function TaskGroupList({
  groups,
  showWorkspace,
  hideEmpty,
  emptyState,
  className,
}: {
  groups: TaskGroup[]
  showWorkspace?: boolean
  hideEmpty?: boolean
  emptyState?: React.ReactNode
  className?: string
}) {
  const { openId, open } = useTaskPanel()
  const visible = hideEmpty ? groups.filter((g) => g.tasks.length > 0) : groups
  const total = groups.reduce((n, g) => n + g.tasks.length, 0)

  if (total === 0 && emptyState) return <>{emptyState}</>

  return (
    <div className={cn('@container pb-24', className)}>
      {visible.map((g) => (
        <Group key={g.id} group={g} onOpen={open} openId={openId} showWorkspace={showWorkspace} />
      ))}
    </div>
  )
}

function Group({
  group,
  onOpen,
  openId,
  showWorkspace,
}: {
  group: TaskGroup
  onOpen: (id: string) => void
  openId: string | null
  showWorkspace?: boolean
}) {
  const t = useTranslations('tasks')
  const [collapsed, setCollapsed] = useState(Boolean(group.collapsedByDefault))
  const [composing, setComposing] = useState(false)

  return (
    <section>
      <div className="group/header sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-line bg-sidebar/95 px-4 backdrop-blur-[2px]">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex min-w-0 items-center gap-2 text-sm"
          aria-expanded={!collapsed}
        >
          <ChevronRight className={cn('size-3.5 text-fg-subtle transition-transform duration-150', !collapsed && 'rotate-90')} />
          {group.icon}
          <span className={cn('font-medium', group.tone === 'danger' ? 'text-danger' : 'text-fg')}>{group.label}</span>
          <span className="text-xs tabular-nums text-fg-subtle">{group.tasks.length}</span>
        </button>
        {group.defaults ? (
          <button
            type="button"
            onClick={() => {
              setCollapsed(false)
              setComposing(true)
            }}
            className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/header:opacity-100 focus-visible:opacity-100"
            aria-label={t('addTo', { group: group.label })}
          >
            <Plus className="size-4" />
          </button>
        ) : null}
      </div>
      {collapsed ? null : (
        <>
          {group.tasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={onOpen} active={openId === task.id} showWorkspace={showWorkspace} />
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
  const t = useTranslations('tasks.status')
  return useMemo(() => groupByStatus(tasks ?? [], workspaceId, (s) => t(s)), [tasks, workspaceId, t])
}
