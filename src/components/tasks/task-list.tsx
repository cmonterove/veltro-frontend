'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, CalendarDays, CalendarOff, CalendarRange, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleAlert, CircleCheck, GripVertical, Plus } from 'lucide-react'
import { useCreateTask, useUpdateTask, type NewTask } from '@/lib/queries/tasks'
import { cn, positionBetween } from '@/lib/utils'
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

type Order = Record<string, string[]>

const GROUP = 'group:'
const DOCK = 'dock:'

/** Dónde se suelta: una fila o el pie de estados vacíos bajo el puntero; si no, lo más cercano. */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  if (within.length) {
    const dock = within.filter((c) => String(c.id).startsWith(DOCK))
    const rows = within.filter((c) => !String(c.id).startsWith(GROUP) && !String(c.id).startsWith(DOCK))
    return dock.length ? dock : rows.length ? rows : within
  }
  return closestCorners(args)
}

const findGroup = (id: string, order: Order) =>
  id.startsWith(GROUP) ? id.slice(GROUP.length) : id.startsWith(DOCK) ? id.slice(DOCK.length) : (Object.keys(order).find((k) => order[k].includes(id)) ?? null)

export function TaskGroupList({
  groups,
  showWorkspace,
  hideEmpty,
  emptyDock,
  statusCreator,
  emptyState,
  className,
  collapsed,
  onCollapsedChange,
  selectedId,
  onSelect,
}: {
  groups: TaskGroup[]
  showWorkspace?: boolean
  hideEmpty?: boolean
  /**
   * con `hideEmpty`, los estados sin tareas quedan en un renglón al pie: ahí se suelta una tarea
   * (o se agrega una con su +). Solo tiene sentido en los grupos por estado de un espacio.
   */
  emptyDock?: boolean
  /** al final del renglón de vacíos: crear un estado ahí mismo (admins del espacio) */
  statusCreator?: React.ReactNode
  emptyState?: React.ReactNode
  className?: string
  /** controlado desde afuera (para recordarlo o para "abrir y cerrar todo"); si no, cada lista lleva el suyo */
  collapsed?: CollapsedGroups
  onCollapsedChange?: (next: CollapsedGroups) => void
  /** con el vistazo al lado: un clic elige la tarea (se ve al lado) en vez de abrirla */
  selectedId?: string | null
  onSelect?: (id: string) => void
}) {
  const t = useTranslations('tasks')
  const { open } = useOpenTask()
  const update = useUpdateTask()
  const [own, setOwn] = useState<CollapsedGroups>({})
  const state = collapsed ?? own
  const setState = onCollapsedChange ?? setOwn
  // un estado vacío que se abrió con su + (para escribir la primera tarea ahí)
  const [forced, setForced] = useState<string | null>(null)
  const visible = hideEmpty ? groups.filter((g) => g.tasks.length > 0 || g.id === forced) : groups
  const docked = hideEmpty && emptyDock ? groups.filter((g) => g.tasks.length === 0 && g.id !== forced && g.defaults?.status) : []
  const total = groups.reduce((n, g) => n + g.tasks.length, 0)

  // arrastrar de un estado a otro: solo cuando cada grupo es un estado (y se puede editar)
  const dnd = groups.length > 0 && groups.every((g) => Boolean(g.defaults?.status))
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // en el celular, mantener apretado para arrastrar (deslizar sigue desplazando la lista)
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  )
  const base = useMemo<Order>(() => Object.fromEntries(groups.map((g) => [g.id, g.tasks.map((x) => x.id)])), [groups])
  const byId = useMemo(() => new Map(groups.flatMap((g) => g.tasks).map((x) => [x.id, x])), [groups])
  const [order, setOrder] = useState<Order | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const current = order ?? base

  if (total === 0 && emptyState) return <>{emptyState}</>

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setOrder(base)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const overId = String(over.id)
    // el pie de vacíos no se arma como lista mientras se arrastra: se resuelve al soltar
    if (overId.startsWith(DOCK)) return
    setOrder((prev) => {
      const p = prev ?? base
      const from = findGroup(String(active.id), p)
      const to = findGroup(overId, p)
      if (!from || !to || from === to) return p
      const fromItems = p[from].filter((id) => id !== active.id)
      const overIndex = p[to].indexOf(overId)
      const toItems = [...p[to]]
      toItems.splice(overIndex >= 0 ? overIndex : toItems.length, 0, String(active.id))
      return { ...p, [from]: fromItems, [to]: toItems }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    const now = order ?? base
    setActiveId(null)
    setOrder(null)
    const task = byId.get(id)
    if (!over || !task) return
    const overId = String(over.id)
    const origin = groups.find((g) => g.tasks.some((x) => x.id === id))

    // soltada en un estado vacío del pie: va a ese estado, al final
    if (overId.startsWith(DOCK)) {
      const g = groups.find((x) => x.id === overId.slice(DOCK.length))
      if (!g?.defaults?.status || g.id === origin?.id) return
      update.mutate({ id, patch: { status: g.defaults.status, status_id: g.defaults.status_id ?? null, position: positionBetween(g.tasks.at(-1)?.position, null) } })
      return
    }

    const col = findGroup(id, now)
    const g = groups.find((x) => x.id === col)
    if (!col || !g?.defaults?.status) return
    let items = now[col]
    const oldIndex = items.indexOf(id)
    const overIndex = items.indexOf(overId)
    if (overIndex >= 0 && overIndex !== oldIndex) items = arrayMove(items, oldIndex, overIndex)
    const index = items.indexOf(id)
    const before = items[index - 1] ? byId.get(items[index - 1])?.position : null
    const after = items[index + 1] ? byId.get(items[index + 1])?.position : null
    const position = positionBetween(before, after)
    if (origin?.id === col) {
      if (task.position !== position) update.mutate({ id, patch: { position } })
    } else {
      update.mutate({ id, patch: { status: g.defaults.status, status_id: g.defaults.status_id ?? null, position } })
    }
  }

  const active = activeId ? byId.get(activeId) : null

  const list = (
    <div className={cn('@container pb-24 pt-1', className)}>
      {visible.map((g) => (
        <Group
          key={g.id}
          group={g}
          ids={dnd ? (current[g.id] ?? []) : undefined}
          byId={byId}
          collapsed={isGroupCollapsed(g, state)}
          // Alt + clic abre o cierra todos, como en el Finder
          onCollapse={(value, all) =>
            setState(all ? { ...state, ...Object.fromEntries(visible.map((v) => [v.id, value])) } : { ...state, [g.id]: value })
          }
          onOpen={onSelect ?? open}
          showWorkspace={showWorkspace}
          selectedId={selectedId}
          startComposing={g.id === forced}
          onComposeEnd={() => setForced((f) => (f === g.id ? null : f))}
        />
      ))}
      {docked.length || (emptyDock && statusCreator) ? (
        // los estados sin tareas, juntos en un renglón: se suelta ahí o se agrega con su +; y crear otro estado
        <div className="mx-2 mt-2 flex flex-wrap items-center gap-1.5 border-t border-line-soft px-2 pt-3">
          {docked.length ? <span className="mr-1 text-xs text-fg-subtle">{t('emptyStatuses')}</span> : null}
          {docked.map((g) => (
            <DockPill key={g.id} group={g} dragging={Boolean(activeId)} onAdd={() => setForced(g.id)} />
          ))}
          {emptyDock ? statusCreator : null}
        </div>
      ) : null}
    </div>
  )

  if (!dnd) return list

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOrder(null)
      }}
    >
      {list}
      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {active ? (
          <div className="cursor-grabbing rounded-xl bg-panel shadow-lift ring-1 ring-line [&>div]:mx-0">
            <TaskRow task={active} onOpen={() => {}} showWorkspace={showWorkspace} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** Un estado vacío en el pie de la lista: se suelta una tarea ahí, o se agrega con +. */
function DockPill({ group, dragging, onAdd }: { group: TaskGroup; dragging: boolean; onAdd: () => void }) {
  const t = useTranslations('tasks')
  const { setNodeRef, isOver } = useDroppable({ id: DOCK + group.id })
  return (
    <span
      ref={setNodeRef}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-xl border pl-2 pr-1 text-[13px] transition-[background-color,border-color,color] duration-150',
        isOver ? 'border-accent bg-accent-soft text-accent-ink' : dragging ? 'border-dashed border-accent-mid/60 text-fg' : 'border-dashed border-line-strong text-fg-muted',
      )}
    >
      {group.icon}
      <span>{group.label}</span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={t('addTo', { group: group.label })}
        className="inline-flex size-6 items-center justify-center rounded-lg text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40"
      >
        <Plus className="size-3.5" />
      </button>
    </span>
  )
}

/** Una fila que se arrastra a otro estado (o a otro lugar del suyo). El agarre aparece al pasar el mouse. */
function SortableRow({ task, onOpen, showWorkspace, active }: { task: Task; onOpen: (id: string) => void; showWorkspace?: boolean; active?: boolean }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group/drag relative select-none', isDragging && 'opacity-40')}
      {...listeners}
    >
      <GripVertical
        aria-hidden
        className="pointer-events-none absolute left-0.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle opacity-0 transition-opacity group-hover/drag:opacity-100"
      />
      <TaskRow task={task} onOpen={onOpen} showWorkspace={showWorkspace} active={active} />
    </div>
  )
}

function Group({
  group,
  ids,
  byId,
  collapsed,
  onCollapse,
  onOpen,
  showWorkspace,
  selectedId,
  startComposing,
  onComposeEnd,
}: {
  group: TaskGroup
  /** con arrastre: el orden de este momento (mientras se arrastra, ya con la tarea que entra o sale) */
  ids?: string[]
  byId: Map<string, Task>
  collapsed: boolean
  onCollapse: (collapsed: boolean, all: boolean) => void
  onOpen: (id: string) => void
  showWorkspace?: boolean
  selectedId?: string | null
  startComposing?: boolean
  onComposeEnd?: () => void
}) {
  const t = useTranslations('tasks')
  const [composing, setComposing] = useState(Boolean(startComposing))
  const { setNodeRef, isOver } = useDroppable({ id: GROUP + group.id, disabled: !ids })
  const stopComposing = () => {
    setComposing(false)
    onComposeEnd?.()
  }

  return (
    <section ref={setNodeRef} className={cn('rounded-2xl transition-colors duration-150', isOver && ids && 'bg-accent-soft/40')}>
      {/* el encabezado del grupo queda pegado arriba al desplazarse, sobre el blanco de la tarjeta */}
      <div className="group/header sticky top-0 z-10 flex h-10 items-center gap-2 bg-panel/95 px-4 pt-1 backdrop-blur-[2px]">
        <button
          type="button"
          onClick={(e) => onCollapse(!collapsed, e.altKey)}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm outline-none focus-visible:underline"
          aria-expanded={!collapsed}
          title={t('collapseHint')}
        >
          <ChevronRight className={cn('size-3.5 shrink-0 text-fg-subtle transition-transform duration-150', !collapsed && 'rotate-90')} />
          <GroupTile group={group} />
          <span className={cn('truncate font-semibold', group.tone === 'danger' ? 'text-danger' : 'text-fg')}>{group.label}</span>
          <span
            className={cn(
              'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
              group.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-fg/[0.06] text-fg-muted',
            )}
          >
            {group.tasks.length}
          </span>
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
          {ids ? (
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {ids.map((id) => {
                const task = byId.get(id)
                return task ? <SortableRow key={id} task={task} onOpen={onOpen} showWorkspace={showWorkspace} active={selectedId === id} /> : null
              })}
            </SortableContext>
          ) : (
            group.tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={onOpen} showWorkspace={showWorkspace} active={selectedId === task.id} />)
          )}
          {group.defaults && composing ? (
            <TaskComposer defaults={group.defaults} after={group.tasks.at(-1)?.position} onDone={stopComposing} />
          ) : group.defaults ? (
            // agregar al pie del grupo, a la vista (no solo en el + que aparece al pasar el mouse)
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="mx-2 flex h-9 w-[calc(100%-1rem)] items-center gap-2 rounded-xl px-2 text-left text-sm text-fg-subtle transition-colors hover:bg-hover/60 hover:text-fg"
            >
              <span className="flex size-6 items-center justify-center">
                <Plus className="size-4" />
              </span>
              {t('addTo', { group: group.label })}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

/** La ficha del grupo: los grupos por fecha llevan su color (vencidas en rojo, hoy en mandarina…); los demás, su ícono. */
const DATE_TILE: Record<string, { icon: typeof CircleAlert; cls: string }> = {
  overdue: { icon: CircleAlert, cls: 'bg-danger-soft text-danger' },
  today: { icon: CalendarDays, cls: 'bg-warning-soft text-mandarina-ink' },
  week: { icon: CalendarRange, cls: 'bg-accent-soft text-accent-ink' },
  later: { icon: CalendarClock, cls: 'bg-fg/[0.06] text-fg-muted' },
  none: { icon: CalendarOff, cls: 'bg-fg/[0.06] text-fg-muted' },
  done: { icon: CircleCheck, cls: 'bg-done-soft text-done' },
}

function GroupTile({ group }: { group: TaskGroup }) {
  const date = DATE_TILE[group.id]
  if (date && !group.icon) {
    const Icon = date.icon
    return (
      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-lg', date.cls)} aria-hidden>
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
    )
  }
  return group.icon ? (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-fg/[0.05]" aria-hidden>
      {group.icon}
    </span>
  ) : null
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
    <div className={cn('mx-2 flex h-11 items-center gap-2 rounded-xl bg-hover/40 px-2', compact && 'mx-0 bg-transparent px-2.5', className)}>
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
