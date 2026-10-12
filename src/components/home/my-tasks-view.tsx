'use client'

import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { subDays } from 'date-fns'
import { CalendarDays, CircleCheck, Columns3, LayoutDashboard, List, Plus, Table2 } from 'lucide-react'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useTasks } from '@/lib/queries/tasks'
import type { TaskRow } from '@/lib/database.types'
import { CollapseAllButton, TaskGroupList, type CollapsedGroups } from '@/components/tasks/task-list'
import { GROUP_BYS, useTaskGroupsBy, type GroupBy } from '@/components/tasks/my-task-groups'
import { GroupByMenu, TaskFilterBar } from '@/components/tasks/task-filters'
import { TaskBoard } from '@/components/tasks/task-board'
import { TaskCalendar } from '@/components/tasks/task-calendar'
import { TaskGrid } from '@/components/tasks/task-grid'
import { TasksDashboard } from '@/components/tasks/tasks-dashboard'
import { ScopePicker } from '@/components/pulse/brief'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { toDateKey } from '@/lib/dates'
import { useLocalStorage } from '@/lib/hooks'
import { isCounter, useScopes } from '@/lib/scope'
import { NO_FILTERS, activeFilterCount, counterFilters, matchesTaskFilters, matchesTaskQuery, parseTaskFilters, writeTaskFilters, type TaskFilters } from '@/lib/task-filters'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'
import { assigneesOf, isAssignedTo } from '@/lib/assignees'

const TABS = ['summary', 'list', 'table', 'board', 'calendar'] as const
const NO_TASKS: TaskRow[] = []
type Tab = (typeof TABS)[number]

/**
 * Tareas de todos los espacios: las mías, las de mi equipo, un departamento o una persona.
 * Cinco vistas (Resumen, Lista, Tabla, Tablero, Calendario) sobre el mismo alcance; las cuatro últimas
 * comparten búsqueda y filtros, que viven en la URL para poder compartir la vista.
 */
export function MyTasksView() {
  const t = useTranslations('myTasks')
  const tt = useTranslations('tasks')
  const tf = useTranslations('myTasks.filters')
  const pathname = usePathname()
  const params = useSearchParams()
  const { workspaces, observedWorkspaces } = useApp()
  const wsMap = useWorkspaceMap()
  const { options, resolve } = useScopes()
  const scope = resolve(params.get('scope'))
  // optimistas: lo elegido se ve al instante aunque useSearchParams tarde un render en ponerse al día
  const urlFilters = useMemo(() => parseTaskFilters(params), [params])
  const [filters, setOptimisticFilters] = useOptimistic(urlFilters)
  const [, startTransition] = useTransition()
  // los enlaces de Pulso (?filter=overdue) llevan a la lista
  const fromCounter = isCounter(params.get('filter') ?? params.get('view'))
  const [lastTab, setLastTab] = useLocalStorage<Tab>('veltro:tasks-tab', 'summary')
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : fromCounter ? 'list' : TABS.includes(lastTab) ? lastTab : 'summary'
  const multi = scope.kind !== 'me'
  const [groupPref, setGroupPref] = useLocalStorage<GroupBy>('veltro:tasks-group', 'date')
  const groupOptions = GROUP_BYS.filter((g) => g !== 'assignee' || multi)
  const groupBy: GroupBy = groupOptions.includes(groupPref) ? groupPref : 'date'
  // grupos plegados, recordados por cada forma de agrupar
  const [collapsedBy, setCollapsedBy] = useLocalStorage<Partial<Record<GroupBy, CollapsedGroups>>>('veltro:tasks-collapsed', {})
  const collapsed = collapsedBy[groupBy] ?? {}
  const setCollapsed = (next: CollapsedGroups) => setCollapsedBy((prev) => ({ ...prev, [groupBy]: next }))
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (tabParam && TABS.includes(tabParam) && tabParam !== lastTab) setLastTab(tabParam)
  }, [tabParam, lastTab, setLastTab])

  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const tasksQuery = useTasks({ kind: 'workspaces', workspaceIds: wsIds })
  // sin espacios no hay nada que pedir: vacío, no "cargando"
  const all = wsIds.length ? tasksQuery.data : NO_TASKS
  const isLoading = wsIds.length > 0 && tasksQuery.isLoading
  // mirando a toda la empresa también se ven las tareas que todavía no tienen responsable
  const scoped = useMemo(
    () => (all ? all.filter((x) => isAssignedTo(x, scope.userIds) || (scope.kind === 'all' && assigneesOf(x).length === 0)) : undefined),
    [all, scope],
  )

  const q = query.trim().toLowerCase()
  const searched = useMemo(() => scoped?.filter((x) => matchesTaskQuery(x, q, wsMap.get(x.workspace_id)?.key)), [scoped, q, wsMap])
  const shown = useMemo(() => {
    const now = new Date()
    return searched?.filter((x) => matchesTaskFilters(x, filters, now))
  }, [searched, filters])
  const filtering = activeFilterCount(filters) > 0 || q !== ''
  const onlyDone = filters.status.length > 0 && filters.status.every((s) => s === 'done')
  const grouped = useTaskGroupsBy(shown, groupBy, { ownOnly: scope.kind === 'me', expandDone: onlyDone })

  // la lista muestra las hechas de la semana; las demás vistas, todas
  const counted = useMemo(() => {
    const weekAgo = subDays(new Date(), 7).toISOString()
    const inView = (x: { status: string; completed_at: string | null }) => tab !== 'list' || x.status !== 'done' || (x.completed_at ?? '') >= weekAgo
    return { shown: shown?.filter(inView).length ?? 0, total: scoped?.filter(inView).length ?? 0 }
  }, [shown, scoped, tab])

  // La vista es toda de cliente: la URL se reescribe sin navegar (Next la sincroniza con useSearchParams),
  // así los cambios se aplican en orden y sin ir al servidor. De paso, ?filter= queda en su forma nueva.
  const navigate = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(window.location.search)
    writeTaskFilters(next, filters)
    mutate(next)
    const qs = next.toString()
    window.history.replaceState(null, '', `${pathname}${qs ? `?${qs}` : ''}`)
  }
  const setParam = (k: 'tab' | 'scope', v: string | null) => navigate((next) => (v ? next.set(k, v) : next.delete(k)))
  const setFilters = (f: TaskFilters, nextTab?: Tab) =>
    startTransition(() => {
      setOptimisticFilters(f)
      navigate((next) => {
        writeTaskFilters(next, f)
        if (nextTab) next.set('tab', nextTab)
      })
    })
  // cada cambio parte de la URL de este instante, no de lo último dibujado: dos clicks seguidos no se pisan
  const updateFilters = (update: (f: TaskFilters) => TaskFilters) => setFilters(update(parseTaskFilters(new URLSearchParams(window.location.search))))

  const open = (scoped ?? []).filter((x) => x.status !== 'done').length
  const tabs: { id: Tab; label: string; icon: typeof List }[] = [
    { id: 'summary', label: tt('views.summary'), icon: LayoutDashboard },
    { id: 'list', label: tt('views.list'), icon: List },
    { id: 'table', label: tt('views.table'), icon: Table2 },
    { id: 'board', label: tt('views.board'), icon: Columns3 },
    { id: 'calendar', label: tt('views.calendar'), icon: CalendarDays },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
            <p className="truncate text-sm text-fg-muted">
              {!scoped ? '\u00a0' : scope.kind === 'me' ? t('subtitle', { count: open }) : t('subtitleScoped', { count: open, who: `${scope.display} · ${scope.hint}` })}
            </p>
          </div>
          <ScopePicker options={options} value={scope} onChange={(id) => setParam('scope', id === 'me' ? null : id)} />
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            {t('newTask')}
          </Button>
        </div>

        {/* las vistas son la navegación de la página */}
        <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto scrollbar-none" aria-label={t('title')}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setParam('tab', id)
                track(`feature.my_tasks_${id}`)
              }}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-sm outline-none transition-colors focus-visible:bg-hover focus-visible:text-fg',
                tab === id ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* búsqueda y filtros: comunes a Lista, Tabla, Tablero y Calendario */}
      {tab !== 'summary' && searched && scoped ? (
        <TaskFilterBar
          tasks={searched}
          universe={scoped}
          filters={filters}
          onChange={(update) => {
            updateFilters(update)
            track('feature.tasks_filter')
          }}
          query={query}
          onQuery={setQuery}
          showPeople={multi}
        >
          {tab === 'list' ? <CollapseAllButton groups={grouped} collapsed={collapsed} onChange={setCollapsed} /> : null}
          {tab === 'list' ? (
            <GroupByMenu
              value={groupBy}
              options={groupOptions}
              onChange={(g) => {
                setGroupPref(g)
                track(`feature.tasks_group_${g}`)
              }}
            />
          ) : null}
          {/* sin filtros el total ya está en el subtítulo */}
          {filtering ? <span className="whitespace-nowrap pl-1 text-xs tabular-nums text-fg-subtle">{tf('shownOf', { shown: counted.shown, count: counted.total })}</span> : null}
        </TaskFilterBar>
      ) : null}

      <div className={cn('min-h-0 flex-1', tab === 'summary' || tab === 'list' ? 'overflow-y-auto scrollbar-thin' : '')}>
        {tasksQuery.isError ? (
          <div className="px-6">
            <ErrorState onRetry={() => tasksQuery.refetch()} />
          </div>
        ) : isLoading || !shown || !scoped ? (
          <div className="flex flex-col gap-2 p-6">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : tab === 'summary' ? (
          <TasksDashboard
            tasks={scoped}
            scope={scope}
            onFilter={(c) => setFilters({ ...NO_FILTERS, ...counterFilters(c) }, 'list')}
            onTab={(next) => setFilters(NO_FILTERS, next)}
          />
        ) : counted.shown === 0 ? (
          <div className="px-6">
            <EmptyState
              icon={<CircleCheck />}
              title={filtering ? t('emptyFiltered') : t('empty.title')}
              description={filtering ? t('emptyFilteredHint') : t('empty.description')}
              action={
                filtering ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setFilters(NO_FILTERS)
                    }}
                  >
                    {tf('clearFilters')}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : tab === 'list' ? (
          <TaskGroupList groups={grouped} showWorkspace={groupBy !== 'space'} hideEmpty collapsed={collapsed} onCollapsedChange={setCollapsed} />
        ) : tab === 'table' ? (
          <TaskGrid tasks={shown} />
        ) : tab === 'board' ? (
          <TaskBoard tasks={shown} />
        ) : (
          <TaskCalendar tasks={shown} editable={false} />
        )}
      </div>

      <QuickTaskDialog open={creating} onOpenChange={setCreating} defaults={{
          dueDate: filters.due.length === 1 && filters.due[0] === 'today' ? toDateKey(new Date()) : null,
          workspaceId: filters.ws.length === 1 ? filters.ws[0] : undefined,
          // nueva tarea para quien se está mirando; mirando a un grupo, queda sin asignar
          assigneeIds: scope.kind === 'me' || scope.kind === 'person' ? [...scope.userIds] : [],
        }} />
    </div>
  )
}
