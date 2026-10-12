'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Paperclip, Plus, ArrowUpRight } from 'lucide-react'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { AvatarStack } from '@/components/ui/avatar'
import { useUpdateTask } from '@/lib/queries/tasks'
import { useAttachmentCounts } from '@/lib/queries/attachments'
import { statusKey, statusPatch, taskStatusOf, workspaceStatuses, type StatusOption } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { cn, positionBetween, taskRef } from '@/lib/utils'
import type { TaskRow as Task, TaskStatus, WorkspaceRow } from '@/lib/database.types'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'
import { LabelChip } from './pickers'
import { TaskComposer } from './task-list'
import { useOpenTask } from '@/lib/use-open-task'
import { TASK_STATUSES } from '@/lib/constants'
import { WorkspaceMark } from '@/components/app/marks'
import { assigneesOf } from '@/lib/assignees'

// Una columna por estado del espacio (propios o estándar); la clave es el id propio o la categoría
type Columns = Record<string, string[]>

function toColumns(tasks: Task[], options: StatusOption[], ws?: WorkspaceRow): Columns {
  const cols = Object.fromEntries(options.map((o) => [statusKey(o), [] as string[]])) as Columns
  ;[...tasks]
    .sort((a, b) => a.position - b.position)
    .forEach((t) => {
      // si el estado propio ya no existe, va a la primera columna de su categoría
      const fallback = options.find((o) => o.category === t.status) ?? options[0]
      ;(cols[statusKey(taskStatusOf(t, ws))] ?? cols[statusKey(fallback)]).push(t.id)
    })
  return cols
}

/**
 * Tablero por estado. Con `workspaceId`, una columna por estado del espacio; sin él (tareas de varios
 * espacios), una por categoría, y al soltar una tarjeta se usa el estado equivalente de su espacio.
 */
export function TaskBoard({ tasks, workspaceId }: { tasks: Task[]; workspaceId?: string }) {
  const statusName = useStatusName()
  const wsMap = useWorkspaceMap()
  const cross = !workspaceId
  const ws = workspaceId ? wsMap.get(workspaceId) : undefined
  const editable = cross || canEdit(ws)
  const options = useMemo<StatusOption[]>(() => (cross ? TASK_STATUSES.map((category) => ({ id: null, name: null, category })) : workspaceStatuses(ws)), [cross, ws])
  const optionByKey = useMemo(() => new Map(options.map((o) => [statusKey(o), o])), [options])
  const update = useUpdateTask()
  const { open } = useOpenTask()
  const byId = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks])
  const [columns, setColumns] = useState<Columns>(() => toColumns(tasks, options, ws))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [composer, setComposer] = useState<string | null>(null)

  useEffect(() => {
    if (!activeId) setColumns(toColumns(tasks, options, ws))
  }, [tasks, activeId, options, ws])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findColumn = (id: string): string | null => {
    if (optionByKey.has(id)) return id
    return Object.keys(columns).find((k) => columns[k].includes(id)) ?? null
  }

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const from = findColumn(String(active.id))
    const to = findColumn(String(over.id))
    if (!from || !to || from === to) return
    setColumns((prev) => {
      const fromItems = prev[from].filter((id) => id !== active.id)
      const overIndex = prev[to].indexOf(String(over.id))
      const toItems = [...prev[to]]
      toItems.splice(overIndex >= 0 ? overIndex : toItems.length, 0, String(active.id))
      return { ...prev, [from]: fromItems, [to]: toItems }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    setActiveId(null)
    if (!over) return setColumns(toColumns(tasks, options, ws))
    const col = findColumn(id)
    if (!col) return
    let items = columns[col]
    const oldIndex = items.indexOf(id)
    const overIndex = items.indexOf(String(over.id))
    if (overIndex >= 0 && overIndex !== oldIndex) {
      items = [...items]
      items.splice(oldIndex, 1)
      items.splice(overIndex, 0, id)
      setColumns((prev) => ({ ...prev, [col]: items }))
    }
    const index = items.indexOf(id)
    const before = items[index - 1] ? byId.get(items[index - 1])?.position : null
    const after = items[index + 1] ? byId.get(items[index + 1])?.position : null
    const task = byId.get(id)
    if (!task) return
    const position = positionBetween(before, after)
    const target = optionByKey.get(col)
    if (!target) return
    if (statusKey(taskStatusOf(task, ws)) !== col || task.position !== position) {
      // varios espacios: la columna es una categoría; se guarda el primer estado de esa categoría en el espacio de la tarea
      const own = cross ? (workspaceStatuses(wsMap.get(task.workspace_id)).find((o) => o.category === target.category) ?? target) : target
      update.mutate({ id, patch: { ...statusPatch(own), position } })
    }
  }

  const active = activeId ? byId.get(activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setColumns(toColumns(tasks, options, ws))
      }}
    >
      {/* solo scroll horizontal aquí; cada columna scrollea por dentro y su encabezado queda a la vista */}
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-3 scrollbar-thin">
        {options.map((o) => {
          const key = statusKey(o)
          const ids = columns[key] ?? []
          return (
          <Column key={key} id={key} status={o.category} label={statusName(o)} count={ids.length} onAdd={editable && !cross ? () => setComposer(key) : undefined}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {ids.map((id) => {
                const task = byId.get(id)
                return task ? (
                  <SortableCard key={id} task={task} onOpen={open} disabled={!editable || (cross && !canEdit(wsMap.get(task.workspace_id)))} showWorkspace={cross} />
                ) : null
              })}
            </SortableContext>
            {composer === key ? (
              <div className="overflow-hidden rounded-lg border border-line bg-panel">
                <TaskComposer
                  defaults={{ workspace_id: workspaceId!, ...statusPatch(o) }}
                  after={byId.get(ids.at(-1) ?? '')?.position}
                  onDone={() => setComposer(null)}
                  compact
                />
              </div>
            ) : null}
          </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {active ? <Card task={active} dragging showWorkspace={cross} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  id,
  status,
  label,
  count,
  onAdd,
  children,
}: {
  id: string
  status: TaskStatus
  label: string
  count: number
  onAdd?: () => void
  children: React.ReactNode
}) {
  const t = useTranslations('tasks')
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="flex min-h-0 w-[272px] shrink-0 flex-col">
      <div className="group/col flex h-9 items-center gap-2 px-1">
        <StatusIcon status={status} />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-fg-subtle">{count}</span>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
            aria-label={t('addTo', { group: label })}
          >
            <Plus className="size-4" />
          </button>
        ) : null}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1 transition-colors scrollbar-thin',
          isOver ? 'bg-accent-soft/50' : 'bg-hover/40',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function SortableCard({ task, onOpen, disabled, showWorkspace }: { task: Task; onOpen: (id: string) => void; disabled?: boolean; showWorkspace?: boolean }) {
  const t = useTranslations('tasks')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group/card relative', isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
    >
      <Card task={task} showWorkspace={showWorkspace} />
      {/* con teclado, Enter y Espacio son para arrastrar: abrir va en su propio botón */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onOpen(task.id)
        }}
        aria-label={t('openTask', { title: task.title })}
        className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md bg-panel text-fg-subtle opacity-0 shadow-card outline-none transition-opacity hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-mid/40 group-hover/card:opacity-100"
      >
        <ArrowUpRight className="size-3.5" />
      </button>
    </div>
  )
}

function Card({ task, dragging, showWorkspace }: { task: Task; dragging?: boolean; showWorkspace?: boolean }) {
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const ws = wsMap.get(task.workspace_id)
  const people = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const attachments = useAttachmentCounts(task.workspace_id).get(task.id) ?? 0
  const done = task.status === 'done'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-line bg-panel p-3 text-sm shadow-card transition-shadow hover:border-line-strong',
        dragging && 'rotate-[1.5deg] shadow-lift',
      )}
    >
      <div className="flex items-center gap-2">
        {showWorkspace && ws ? <WorkspaceMark ws={ws} size={16} /> : null}
        <span className="font-mono text-2xs text-fg-subtle">{ws ? taskRef(ws.key, task.number) : ''}</span>
        <span className="ml-auto">
          <AvatarStack people={people} size={18} ring="panel" />
        </span>
      </div>
      <p className={cn('line-clamp-3 leading-snug', done ? 'text-fg-muted line-through decoration-fg-subtle/50' : 'text-fg')}>
        {task.title}
      </p>
      {task.priority !== 'none' || task.due_date || task.labels.length || attachments ? (
        <div className="flex flex-wrap items-center gap-2">
          {task.priority !== 'none' ? <PriorityIcon priority={task.priority} /> : null}
          {attachments ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-fg-subtle">
              <Paperclip className="size-3.5" />
              {attachments}
            </span>
          ) : null}
          {task.due_date ? <DueDate due={task.due_date} done={done} /> : null}
          {task.labels.slice(0, 2).map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
