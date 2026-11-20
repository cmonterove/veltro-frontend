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
import { useTaskStats, useTasks } from '@/lib/queries/tasks'
import type { TaskRow } from '@/lib/database.types'
import { CollapseAllButton, TaskGroupList, isGroupCollapsed, type CollapsedGroups } from '@/components/tasks/task-list'
import { TaskPreview } from '@/components/tasks/task-preview'
import { useOpenTask } from '@/lib/use-open-task'
import { GROUP_BYS, useTaskGroupsBy, type GroupBy } from '@/components/tasks/my-task-groups'
import { GroupByMenu, TaskFilterBar } from '@/components/tasks/task-filters'
import { TaskBoard } from '@/components/tasks/task-board'
import { TaskCalendar } from '@/components/tasks/task-calendar'
import { TaskGrid } from '@/components/tasks/task-grid'
import { TasksDashboard } from '@/components/tasks/tasks-dashboard'
import { ScopeChips } from '@/components/app/scope-menu'
import { SavedViewsMenu } from '@/components/tasks/saved-views'
import { TasksMoreMenu } from '@/components/tasks/task-transfer'
import { ShowIdleContext } from '@/components/tasks/task-row'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { toDateKey } from '@/lib/dates'
import { isTypingTarget, useLocalStorage, useMediaQuery } from '@/lib/hooks'
import { isCounter, useScopes } from '@/lib/scope'
import { NO_FILTERS, activeFilterCount, counterFilters, matchesTaskFilters, matchesTaskQuery, parseTaskFilters, writeTaskFilters, type TaskFilters } from '@/lib/task-filters'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'
import { CARD } from '@/components/ui/surface'
import { FullscreenExitButton } from '@/components/app/fullscreen'

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
  const collapsed = useMemo(() => collapsedBy[groupBy] ?? {}, [collapsedBy, groupBy])
  const setCollapsed = (next: CollapsedGroups) => setCollapsedBy((prev) => ({ ...prev, [groupBy]: next }))
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (tabParam && TABS.includes(tabParam) && tabParam !== lastTab) setLastTab(tabParam)
  }, [tabParam, lastTab, setLastTab])


  // el alcance lo resuelve la API (mías, mi equipo, un departamento, una persona o toda la empresa,
  // que incluye las que no tienen responsable); búsqueda y filtros siguen en el navegador
  const hasSpaces = workspaces.length + observedWorkspaces.length > 0
  const tasksQuery = useTasks(hasSpaces ? { kind: 'scope', scopeId: scope.id } : null)
  // sin espacios no hay nada que pedir: vacío, no "cargando"
  const scoped = hasSpaces ? tasksQuery.data : NO_TASKS
  const isLoading = hasSpaces && tasksQuery.isLoading
  // cifras del Resumen (últimos 14 días), en paralelo con la lista
  const [statsFrom, statsTo] = useMemo(() => [toDateKey(subDays(new Date(), 13)), toDateKey(new Date())], [])
  const stats = useTaskStats(scope.id, { from: statsFrom, to: statsTo, enabled: tab === 'summary' })

  const q = query.trim().toLowerCase()
  const searched = useMemo(() => scoped?.filter((x) => matchesTaskQuery(x, q, wsMap.get(x.workspace_id)?.key)), [scoped, q, wsMap])
  const shown = useMemo(() => {
    const now = new Date()
    return searched?.filter((x) => matchesTaskFilters(x, filters, now))
  }, [searched, filters])
  const filtering = activeFilterCount(filters) > 0 || q !== ''
  const onlyDone = filters.status.length > 0 && filters.status.every((s) => s === 'done')
  const grouped = useTaskGroupsBy(shown, groupBy, { ownOnly: scope.kind === 'me', expandDone: onlyDone })
  const wide = useMediaQuery('(min-width: 1280px)')
  const { open: openTask } = useOpenTask()
  // la tarea del vistazo: la elegida o, si no hay, la primera de la lista (en el orden que se ve)
  const ordered = useMemo(() => grouped.filter((g) => g.tasks.length && !isGroupCollapsed(g, collapsed)).flatMap((g) => g.tasks), [grouped, collapsed])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const selected = ordered.find((x) => x.id === pickedId) ?? ordered[0] ?? null

  // ↑ ↓ cambian de tarea, Enter la abre (si no se está escribiendo ni hay un menú abierto)
  const peekOn = tab === 'list' && wide
  useEffect(() => {
    if (!peekOn || !selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      if (e.key === 'Enter') {
        // Enter sobre otro botón es de ese botón
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
  }, [peekOn, selected, ordered, openTask])

  // lo que se exporta: lo que se ve (en Resumen, todo el alcance)
  const exportable = useMemo(() => {
    if (tab === 'summary') return scoped
    const weekAgo = subDays(new Date(), 7).toISOString()
    return shown?.filter((x) => tab !== 'list' || x.status !== 'done' || (x.completed_at ?? '') >= weekAgo)
  }, [tab, scoped, shown])

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

  // la Lista con su vistazo al lado (en pantallas anchas): la tarea elegida se ve sin salir
  const peek = tab === 'list' && wide

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4 pt-4 sm:px-6">
      {/* encabezado compacto: lo que importa es el contenido de abajo */}
      <header className="flex shrink-0 flex-col gap-3 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{t('title')}</h1>
            <p className="truncate text-[13px] text-fg-muted">
              {!scoped ? '\u00a0' : scope.kind === 'me' ? t('subtitle', { count: open }) : t('subtitleScoped', { count: open, who: `${scope.display} · ${scope.hint}` })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* exportar lo que se ve (con búsqueda y filtros) e importar de Excel, CSV o Trello */}
            <TasksMoreMenu tasks={exportable} />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus />
              {t('newTask')}
            </Button>
            <FullscreenExitButton />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {/* las vistas son la navegación de la página: un control segmentado, la activa en relieve */}
          <nav className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl bg-fg/[0.05] p-1 scrollbar-none" aria-label={t('title')}>
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
                  'inline-flex h-8 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                  tab === id ? 'bg-panel text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon className={cn('size-4 transition-colors', tab === id ? 'text-accent' : 'text-fg-subtle')} />
                {label}
              </button>
            ))}
          </nav>

          {/* de quién son las tareas (a la vista, no en un menú) y las vistas guardadas */}
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <ScopeChips options={options} value={scope} onChange={(id) => setParam('scope', id === 'me' ? null : id)} />
            {/* vistas guardadas: alcance, filtros, pestaña y agrupación con nombre */}
            <SavedViewsMenu
              groupBy={groupBy}
              onApply={(query, group) => {
                window.history.replaceState(null, '', `${pathname}${query ? `?${query}` : ''}`)
                if (group && (GROUP_BYS as readonly string[]).includes(group)) setGroupPref(group as GroupBy)
              }}
            />
          </div>
        </div>
      </header>

      {tab === 'summary' ? (
        // el Resumen arma sus propias tarjetas; aquí solo se desplaza (con aire para sus sombras)
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-1 scrollbar-thin sm:-mx-6 sm:px-6">
          {tasksQuery.isError ? (
            <ErrorState onRetry={() => tasksQuery.refetch()} />
          ) : isLoading || !scoped ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-24 rounded-[22px]" />
              <div className="grid gap-4 lg:grid-cols-12">
                <Skeleton className="h-56 rounded-[24px] lg:col-span-7" />
                <Skeleton className="h-56 rounded-[24px] lg:col-span-5" />
              </div>
            </div>
          ) : (
            <TasksDashboard
              tasks={scoped}
              stats={stats.data}
              scope={scope}
              onFilter={(c) => setFilters({ ...NO_FILTERS, ...counterFilters(c) }, 'list')}
              onTab={(next) => setFilters(NO_FILTERS, next)}
            />
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
        {/* filtros y vista en una tarjeta hasta abajo (para verla más grande: la pantalla completa general, F) */}
        <section
          className={cn(CARD, 'flex min-h-0 flex-1 flex-col overflow-hidden')}
        >
          {/* búsqueda y filtros: comunes a Lista, Tabla, Tablero y Calendario */}
          {searched && scoped ? (
            <TaskFilterBar
              brand
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

          <div className={cn('min-h-0 flex-1', tab === 'list' ? 'overflow-y-auto scrollbar-thin' : '')}>
            {tasksQuery.isError ? (
              <div className="px-6">
                <ErrorState onRetry={() => tasksQuery.refetch()} />
              </div>
            ) : isLoading || !shown || !scoped ? (
              <div className="flex flex-col gap-2 p-5">
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
              </div>
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
              <ShowIdleContext.Provider value={scope.kind !== 'me'}>
                <TaskGroupList
                  groups={grouped}
                  showWorkspace={groupBy !== 'space'}
                  hideEmpty
                  collapsed={collapsed}
                  onCollapsedChange={setCollapsed}
                  selectedId={peek ? selected?.id : undefined}
                  onSelect={peek ? setPickedId : undefined}
                />
              </ShowIdleContext.Provider>
            ) : tab === 'table' ? (
              <TaskGrid tasks={shown} />
            ) : tab === 'board' ? (
              <TaskBoard tasks={shown} />
            ) : (
              <TaskCalendar tasks={shown} editable={false} />
            )}
          </div>
        </section>
        {/* el vistazo: la tarea elegida, al lado de la lista */}
        {peek && selected && counted.shown > 0 ? <TaskPreview key={selected.id} task={selected} className="w-[380px] shrink-0 animate-in fade-in-0 duration-200" /> : null}
        </div>
      )}

      <QuickTaskDialog open={creating} onOpenChange={setCreating} defaults={{
          dueDate: filters.due.length === 1 && filters.due[0] === 'today' ? toDateKey(new Date()) : null,
          workspaceId: filters.ws.length === 1 ? filters.ws[0] : undefined,
          // nueva tarea para quien se está mirando; mirando a un grupo, queda sin asignar
          assigneeIds: scope.kind === 'me' || scope.kind === 'person' ? [...scope.userIds] : [],
        }} />
    </div>
  )
}
