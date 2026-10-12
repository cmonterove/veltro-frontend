'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, Columns3, List, ListTodo, Plus, Search, Table2, X } from 'lucide-react'
import { useApp, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useTasks } from '@/lib/queries/tasks'
import { useLocalStorage } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { track } from '@/lib/telemetry'
import type { TaskRow } from '@/lib/database.types'
import { CollapseAllButton, TaskGroupList, useStatusGroups, type CollapsedGroups } from '@/components/tasks/task-list'
import { TaskBoard } from '@/components/tasks/task-board'
import { TaskCalendar } from '@/components/tasks/task-calendar'
import { TaskTable } from '@/components/tasks/task-table'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { isAssignedTo } from '@/lib/assignees'

type View = 'list' | 'table' | 'board' | 'calendar'

export function WorkspaceTasks({ workspaceId, initialTasks }: { workspaceId: string; initialTasks: TaskRow[] }) {
  const t = useTranslations('tasks')
  const { user } = useApp()
  const ws = useWorkspaceMap().get(workspaceId)
  const editable = canEdit(ws)
  const { data: tasks = initialTasks } = useTasks({ kind: 'workspace', workspaceId }, initialTasks)
  const [view, setView] = useLocalStorage<View>(`veltro:tasks-view:${workspaceId}`, 'list')
  const [collapsed, setCollapsed] = useLocalStorage<CollapsedGroups>(`veltro:tasks-collapsed:${workspaceId}`, {})
  const [mine, setMine] = useState(false)
  const [query, setQuery] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter(
      (x) =>
        (!mine || isAssignedTo(x, user.id)) &&
        (!q || x.title.toLowerCase().includes(q) || x.labels.some((l) => l.toLowerCase().includes(q)) || String(x.number) === q),
    )
  }, [tasks, mine, query, user.id])

  const statusGroups = useStatusGroups(filtered, workspaceId)
  const groups = useMemo(
    () => (editable ? statusGroups : statusGroups.map((g) => ({ ...g, defaults: null }))),
    [editable, statusGroups],
  )

  const views: { id: View; label: string; icon: typeof List }[] = [
    { id: 'list', label: t('views.list'), icon: List },
    { id: 'table', label: t('views.table'), icon: Table2 },
    { id: 'board', label: t('views.board'), icon: Columns3 },
    { id: 'calendar', label: t('views.calendar'), icon: CalendarDays },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 sm:px-6">
        <div className="flex items-center rounded-md bg-hover p-0.5">
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setView(id)
                if (id !== 'list') track(`feature.task_view_${id}`, { workspaceId })
              }}
              aria-pressed={view === id}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm transition-colors',
                view === id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMine(!mine)}
          aria-pressed={mine}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
            mine ? 'border-accent-mid/50 bg-accent-soft text-accent-ink' : 'border-line text-fg-muted hover:bg-hover hover:text-fg',
          )}
        >
          {t('onlyMine')}
        </button>

        {view === 'list' ? (
          <span className="ml-auto">
            <CollapseAllButton groups={groups} collapsed={collapsed} onChange={setCollapsed} />
          </span>
        ) : null}
        <div className={cn('relative flex items-center', view !== 'list' && 'ml-auto')}>
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filterPlaceholder')}
            className="h-7 w-40 rounded-md border border-line bg-panel pl-8 pr-7 text-sm outline-none transition-[width] duration-200 placeholder:text-fg-subtle focus:w-56 focus:border-accent-mid"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 text-fg-subtle hover:text-fg" aria-label={t('clearFilter')}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {editable ? (
          <Button variant="primary" size="sm" onClick={() => setQuickOpen(true)}>
            <Plus />
            {t('newTask')}
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {tasks.length === 0 ? (
          <div className="px-6">
            <EmptyState
              icon={<ListTodo />}
              title={t('empty.title')}
              description={t('empty.description')}
              action={
                editable ? (
                  <Button variant="primary" size="sm" onClick={() => setQuickOpen(true)}>
                    <Plus />
                    {t('newTask')}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          // la búsqueda o "Solo mías" no dejan nada: se dice y se ofrece volver atrás
          <div className="px-6">
            <EmptyState
              icon={<Search />}
              title={t('noMatches')}
              description={t('noMatchesHint')}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setMine(false)
                  }}
                >
                  {t('clearFilter')}
                </Button>
              }
            />
          </div>
        ) : view === 'table' ? (
          <TaskTable tasks={filtered} workspaceId={workspaceId} />
        ) : view === 'board' ? (
          <TaskBoard tasks={filtered} workspaceId={workspaceId} />
        ) : view === 'calendar' ? (
          <TaskCalendar tasks={filtered} workspaceId={workspaceId} editable={editable} />
        ) : (
          <TaskGroupList groups={groups} collapsed={collapsed} onCollapsedChange={setCollapsed} />
        )}
      </div>

      <QuickTaskDialog open={quickOpen} onOpenChange={setQuickOpen} defaults={{ workspaceId }} />
    </div>
  )
}
