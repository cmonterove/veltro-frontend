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
import { Paperclip, Plus } from 'lucide-react'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { useUpdateTask } from '@/lib/queries/tasks'
import { useTaskPanel } from '@/lib/hooks'
import { useAttachmentCounts } from '@/lib/queries/attachments'
import { TASK_STATUSES } from '@/lib/constants'
import { cn, positionBetween, taskRef } from '@/lib/utils'
import type { TaskRow as Task, TaskStatus } from '@/lib/database.types'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'
import { LabelChip } from './pickers'
import { TaskComposer } from './task-list'

type Columns = Record<TaskStatus, string[]>

function toColumns(tasks: Task[]): Columns {
  const cols = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as string[]])) as Columns
  ;[...tasks]
    .sort((a, b) => a.position - b.position)
    .forEach((t) => cols[t.status].push(t.id))
  return cols
}

export function TaskBoard({ tasks, workspaceId }: { tasks: Task[]; workspaceId: string }) {
  const t = useTranslations('tasks.status')
  const wsMap = useWorkspaceMap()
  const editable = canEdit(wsMap.get(workspaceId))
  const update = useUpdateTask()
  const { open } = useTaskPanel()
  const byId = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks])
  const [columns, setColumns] = useState<Columns>(() => toColumns(tasks))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [composer, setComposer] = useState<TaskStatus | null>(null)

  useEffect(() => {
    if (!activeId) setColumns(toColumns(tasks))
  }, [tasks, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findColumn = (id: string): TaskStatus | null => {
    if ((TASK_STATUSES as string[]).includes(id)) return id as TaskStatus
    return (Object.keys(columns) as TaskStatus[]).find((s) => columns[s].includes(id)) ?? null
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
    if (!over) return setColumns(toColumns(tasks))
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
    if (task.status !== col || task.position !== position) {
      update.mutate({ id, patch: { status: col, position } })
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
        setColumns(toColumns(tasks))
      }}
    >
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto px-4 pb-6 pt-3 scrollbar-thin">
        {TASK_STATUSES.map((status) => (
          <Column key={status} status={status} label={t(status)} count={columns[status].length} onAdd={editable ? () => setComposer(status) : undefined}>
            <SortableContext items={columns[status]} strategy={verticalListSortingStrategy}>
              {columns[status].map((id) => {
                const task = byId.get(id)
                return task ? <SortableCard key={id} task={task} onOpen={open} disabled={!editable} /> : null
              })}
            </SortableContext>
            {composer === status ? (
              <div className="overflow-hidden rounded-lg border border-line bg-panel">
                <TaskComposer
                  defaults={{ workspace_id: workspaceId, status }}
                  after={byId.get(columns[status].at(-1) ?? '')?.position}
                  onDone={() => setComposer(null)}
                  compact
                />
              </div>
            ) : null}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {active ? <Card task={active} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  label,
  count,
  onAdd,
  children,
}: {
  status: TaskStatus
  label: string
  count: number
  onAdd?: () => void
  children: React.ReactNode
}) {
  const t = useTranslations('tasks')
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="flex w-[272px] shrink-0 flex-col">
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
          'flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1 transition-colors',
          isOver ? 'bg-accent-soft/50' : 'bg-hover/40',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function SortableCard({ task, onOpen, disabled }: { task: Task; onOpen: (id: string) => void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
    >
      <Card task={task} />
    </div>
  )
}

function Card({ task, dragging }: { task: Task; dragging?: boolean }) {
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const ws = wsMap.get(task.workspace_id)
  const assignee = task.assignee_id ? memberMap.get(task.assignee_id) : undefined
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
        <span className="font-mono text-2xs text-fg-subtle">{ws ? taskRef(ws.key, task.number) : ''}</span>
        <span className="ml-auto">
          {assignee ? <Avatar name={assignee.full_name} src={assignee.avatar_url} seed={assignee.id} size={18} /> : null}
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
