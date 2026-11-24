'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, CircleCheck, Columns3, List, ListTodo, Plus, Table2 } from 'lucide-react'
import { useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { CARD } from '@/components/ui/surface'
import { useTasks } from '@/lib/queries/tasks'
import { isTypingTarget, useLocalStorage, useMediaQuery } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { track } from '@/lib/telemetry'
import type { TaskRow } from '@/lib/database.types'
import { NO_FILTERS, activeFilterCount, matchesTaskFilters, matchesTaskQuery, type TaskFilters } from '@/lib/task-filters'
import { CollapseAllButton, TaskGroupList, isGroupCollapsed, useStatusGroups, type CollapsedGroups } from '@/components/tasks/task-list'
import { useTaskGroupsBy } from '@/components/tasks/my-task-groups'
import { GroupByMenu, TaskFilterBar } from '@/components/tasks/task-filters'
import { TaskBoard } from '@/components/tasks/task-board'
import { TaskCalendar } from '@/components/tasks/task-calendar'
import { TaskTable } from '@/components/tasks/task-table'
import { TaskPreview } from '@/components/tasks/task-preview'
import { TasksMoreMenu } from '@/components/tasks/task-transfer'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { useOpenTask } from '@/lib/use-open-task'
import { Tooltip } from '@/components/ui/tooltip'
import { NewStatus, canCreateStatus } from '@/components/tasks/new-status'
import { SpaceHeader } from './workspace-header'

type View = 'list' | 'table' | 'board' | 'calendar'
const GROUPS = ['status', 'date', 'assignee', 'priority'] as const
type WsGroupBy = (typeof GROUPS)[number]

const NO_TASKS: TaskRow[] = []

/**
 * Las tareas del espacio, con la misma forma que la página de Tareas: las vistas arriba, y una
 * tarjeta hasta abajo con la búsqueda y los filtros en su franja; en la Lista, la tarea elegida se
 * ve al lado sin salir (en pantallas anchas).
 */
export function WorkspaceTasks({ workspaceId, initialTasks }: { workspaceId: string; initialTasks?: TaskRow[] }) {
  const t = useTranslations('tasks')
  const tf = useTranslations('myTasks.filters')
  const ws = useWorkspaceMap().get(workspaceId)
  const editable = canEdit(ws)
  // sin datos del servidor: la página se ve al instante y las tareas llegan (o salen de la caché)
  const tasksQuery = useTasks({ kind: 'workspace', workspaceId }, initialTasks)
  const tasks = tasksQuery.data ?? NO_TASKS
  const loading = !tasksQuery.data && !tasksQuery.isError
  const [view, setView] = useLocalStorage<View>(`veltro:tasks-view:${workspaceId}`, 'list')
  const [groupPref, setGroupPref] = useLocalStorage<WsGroupBy>(`veltro:tasks-group:${workspaceId}`, 'status')
  const groupBy: WsGroupBy = (GROUPS as readonly string[]).includes(groupPref) ? groupPref : 'status'
  // grupos plegados, recordados por cada forma de agrupar
  const [collapsedBy, setCollapsedBy] = useLocalStorage<Partial<Record<WsGroupBy, CollapsedGroups>>>(`veltro:tasks-collapsed-by:${workspaceId}`, {})
  const collapsed = useMemo(() => collapsedBy[groupBy] ?? {}, [collapsedBy, groupBy])
  const setCollapsed = (next: CollapsedGroups) => setCollapsedBy((prev) => ({ ...prev, [groupBy]: next }))
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS)
  const [query, setQuery] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const searched = useMemo(() => tasks.filter((x) => matchesTaskQuery(x, q, ws?.key)), [tasks, q, ws?.key])
  const shown = useMemo(() => {
    const now = new Date()
    return searched.filter((x) => matchesTaskFilters(x, filters, now))
  }, [searched, filters])
  const filtering = activeFilterCount(filters) > 0 || q !== ''

  // por estado: los del espacio (con el + para agregar en cada uno); por fecha, persona o prioridad: los de Tareas
  const statusGroups = useStatusGroups(shown, workspaceId)
  const otherGroups = useTaskGroupsBy(shown, groupBy === 'status' ? 'date' : groupBy)
  const groups = useMemo(
    () => (groupBy !== 'status' ? otherGroups : editable ? statusGroups : statusGroups.map((g) => ({ ...g, defaults: null }))),
    [groupBy, otherGroups, statusGroups, editable],
  )

  // la Lista con su vistazo al lado (en pantallas anchas): la tarea elegida se ve sin salir
  const wide = useMediaQuery('(min-width: 1280px)')
  const peek = view === 'list' && wide
  const { open: openTask } = useOpenTask()
  const ordered = useMemo(() => groups.filter((g) => g.tasks.length && !isGroupCollapsed(g, collapsed)).flatMap((g) => g.tasks), [groups, collapsed])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const selected = ordered.find((x) => x.id === pickedId) ?? ordered[0] ?? null

  // ↑ ↓ cambian de tarea, Enter la abre (si no se está escribiendo ni hay un menú abierto)
  useEffect(() => {
    if (!peek || !selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      if (e.key === 'Enter') {
        if (e.target instanceof HTMLElement && e.target.closest('button, a, [role="button"]:not([data-task-id])')) return
        e.preventDefault()
        openTask(selected.id)
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const i = ordered.findIndex((x) => x.id === selected.id)
      const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (!next) return
      setPickedId(next.id)
      document.querySelector(`[data-task-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [peek, selected, ordered, openTask])

  const views: { id: View; label: string; icon: typeof List }[] = [
    { id: 'list', label: t('views.list'), icon: List },
    { id: 'table', label: t('views.table'), icon: Table2 },
    { id: 'board', label: t('views.board'), icon: Columns3 },
    { id: 'calendar', label: t('views.calendar'), icon: CalendarDays },
  ]
  const clearAll = () => {
    setQuery('')
    setFilters(NO_FILTERS)
  }

  const body = tasksQuery.isError ? (
    <div className="px-6">
      <ErrorState onRetry={() => tasksQuery.refetch()} />
    </div>
  ) : loading ? (
    <div className="flex flex-col gap-2 p-5">
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-10 rounded-xl" />
    </div>
  ) : tasks.length === 0 ? (
    <div className="flex h-full items-center justify-center px-6">
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
  ) : shown.length === 0 ? (
    // la búsqueda o los filtros no dejan nada: se dice y se ofrece volver atrás
    <div className="flex h-full items-center justify-center px-6">
      <EmptyState
        icon={<CircleCheck />}
        tone="quiet"
        title={t('noMatches')}
        description={t('noMatchesHint')}
        action={
          <Button size="sm" onClick={clearAll}>
            {tf('clearFilters')}
          </Button>
        }
      />
    </div>
  ) : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-4 pb-4 pt-4 sm:px-6">
      {ws ? (
        <SpaceHeader
          ws={ws}
          section="tasks"
          actions={
            <>
              {/* exportar lo que se ve e importar de Excel, CSV o Trello */}
              <TasksMoreMenu tasks={shown} workspaceId={workspaceId} />
              {editable ? (
                <Button variant="primary" onClick={() => setQuickOpen(true)}>
                  <Plus />
                  {t('newTask')}
                </Button>
              ) : null}
            </>
          }
        />
      ) : null}

      {/* cómo se ve (vistas) y qué se ve (búsqueda y filtros), sueltos sobre el fondo: sin franja */}
      <div className="flex shrink-0 items-center gap-3">
        <nav className="flex shrink-0 items-center gap-0.5 rounded-xl bg-fg/[0.05] p-0.5" aria-label={t('viewsLabel')}>
          {views.map(({ id, label, icon: Icon }) => {
            const on = view === id
            return (
              <Tooltip key={id} content={label}>
                <button
                  type="button"
                  onClick={() => {
                    setView(id)
                    if (id !== 'list') track(`feature.task_view_${id}`, { workspaceId })
                  }}
                  aria-pressed={on}
                  aria-label={label}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                    on ? 'bg-panel text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Icon className={cn('size-4', on ? 'text-accent' : 'text-fg-subtle')} />
                  {/* la activa dice su nombre; las demás, solo el ícono (en pantallas grandes, todas) */}
                  <span className={cn(on ? 'inline' : 'hidden 2xl:inline')}>{label}</span>
                </button>
              </Tooltip>
            )
          })}
        </nav>
        <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
        <TaskFilterBar
          bare
          tasks={searched}
          universe={tasks}
          filters={filters}
          onChange={(update) => {
            setFilters((f) => update(f))
            track('feature.tasks_filter', { workspaceId })
          }}
          query={query}
          onQuery={setQuery}
          showPeople
        >
          {filtering ? <span className="whitespace-nowrap pr-1 text-xs tabular-nums text-fg-subtle">{tf('shownOf', { shown: shown.length, count: tasks.length })}</span> : null}
          {view === 'list' ? <GroupByMenu value={groupBy} options={GROUPS} onChange={(g) => setGroupPref(g as WsGroupBy)} /> : null}
          {view === 'list' ? <CollapseAllButton groups={groups} collapsed={collapsed} onChange={setCollapsed} /> : null}
        </TaskFilterBar>
      </div>

      {view === 'board' && !body ? (
        // el tablero va suelto: carriles teñidos por estado directo sobre el fondo
        <div className="min-h-0 flex-1">
          <TaskBoard tasks={shown} workspaceId={workspaceId} inset={false} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <section className={cn(CARD, 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden')}>
            <div className={cn('min-h-0 flex-1', view === 'list' && !body ? 'overflow-y-auto scrollbar-thin' : '')}>
              {body ??
                (view === 'table' ? (
                  <TaskTable tasks={shown} workspaceId={workspaceId} />
                ) : view === 'calendar' ? (
                  <TaskCalendar tasks={shown} workspaceId={workspaceId} editable={editable} />
                ) : (
                  <TaskGroupList
                    groups={groups}
                    className="pt-2"
                    // los estados sin tareas no ocupan lugar: quedan en un renglón al pie (por estado y sin
                    // filtros), donde se suelta una tarea arrastrada o se agrega con su +
                    hideEmpty
                    emptyDock={groupBy === 'status' && !filtering && editable}
                    statusCreator={ws && canCreateStatus(ws) ? <NewStatus ws={ws} variant="pill" defaultCategory="todo" /> : null}
                    collapsed={collapsed}
                    onCollapsedChange={setCollapsed}
                    selectedId={peek ? selected?.id : undefined}
                    onSelect={peek ? setPickedId : undefined}
                  />
                ))}
            </div>
          </section>
          {/* el vistazo: la tarea elegida, al lado de la lista */}
          {peek && selected && !body ? <TaskPreview key={selected.id} task={selected} className="w-[360px] shrink-0 animate-in fade-in-0 duration-200 2xl:w-[400px]" /> : null}
        </div>
      )}

      <QuickTaskDialog open={quickOpen} onOpenChange={setQuickOpen} defaults={{ workspaceId }} />
    </div>
  )
}
