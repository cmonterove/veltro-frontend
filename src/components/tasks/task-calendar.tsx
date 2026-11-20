'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, GripVertical, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCreateTask, useUpdateTask } from '@/lib/queries/tasks'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { TaskRow as Task } from '@/lib/database.types'
import { StatusIcon } from './status-icon'
import { useOpenTask } from '@/lib/use-open-task'
import { canEdit, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'

const NO_DATE = 'nodate'

/**
 * Calendario mensual por fecha, para planificar: las tareas se arrastran de un día a otro, y las
 * que no tienen fecha esperan en la bandeja de al lado hasta que se sueltan en un día (o se
 * devuelven a la bandeja para quitarles la fecha). Sin `workspaceId` (varios espacios) cada tarea
 * lleva la marca de su espacio y no se crean desde el día.
 */
export function TaskCalendar({ tasks, workspaceId, editable }: { tasks: Task[]; workspaceId?: string; editable: boolean }) {
  const wsMap = useWorkspaceMap()
  const update = useUpdateTask()
  const [dragId, setDragId] = useState<string | null>(null)
  // un clic abre la tarea; arrastrar empieza después de 5 px
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const movable = (task: Task) => canEdit(wsMap.get(task.workspace_id))
  const cross = !workspaceId
  const t = useTranslations('tasks')
  const locale = useDateLocale()
  const { open } = useOpenTask()
  const create = useCreateTask()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const weekStartsOn = locale.options?.weekStartsOn ?? 1
  // cuántas tareas caben por día según el alto real de la celda (más a pantalla completa)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cellH, setCellH] = useState(104)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const cell = el.firstElementChild as HTMLElement | null
      if (!cell) return
      setCellH(cell.getBoundingClientRect().height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 8 de padding y 26 la fila del número; cada tarea son 26 y el «+N más», 18
  const fitsAll = Math.max(1, Math.floor((cellH - 8 - 26) / 26))
  const perDay = Math.max(1, Math.floor((cellH - 8 - 26 - 18) / 26))

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  })

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.due_date) continue
      if (!map.has(task.due_date)) map.set(task.due_date, [])
      map.get(task.due_date)!.push(task)
    }
    return map
  }, [tasks])

  const undated = tasks.filter((x) => !x.due_date && x.status !== 'done')
  const dragged = dragId ? tasks.find((x) => x.id === dragId) : undefined

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragId(null)
    const task = tasks.find((x) => x.id === active.id)
    if (!task || !over) return
    const target = String(over.id)
    const due = target === NO_DATE ? null : target.slice(4)
    if (due === task.due_date) return
    update.mutate({ id: task.id, patch: { due_date: due } })
  }

  const chip = (task: Task) => (
    <>
      {cross && wsMap.get(task.workspace_id) ? <WorkspaceMark ws={wsMap.get(task.workspace_id)!} size={12} /> : <StatusIcon status={task.status} className="size-3" />}
      <span className={cn('truncate', task.status === 'done' ? 'text-fg-subtle line-through' : 'text-fg')}>{task.title}</span>
    </>
  )

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
    <div className="flex h-full min-h-0 gap-4 px-4 pb-4 pt-4">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 pb-3">
        <h2 className="text-lg font-semibold capitalize tracking-[-0.015em]">{format(month, 'LLLL yyyy', { locale })}</h2>
        {/* moverse de mes: una pastilla con las tres acciones juntas (como en Calendario) */}
        <div className="flex items-center rounded-xl bg-panel p-0.5 shadow-card">
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('prevMonth')}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" className="font-semibold text-fg" onClick={() => setMonth(startOfMonth(new Date()))}>
            {t('thisMonth')}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('nextMonth')}>
            <ChevronRight />
          </Button>
        </div>
        {undated.length ? <span className="ml-auto text-xs text-fg-subtle lg:hidden">{t('noDateCount', { count: undated.length })}</span> : null}
      </div>

      {/* las semanas se estiran para llenar el alto, pero nunca bajan de 6,5rem: si no caben,
          el mes se desplaza (antes las filas se aplastaban y los días se montaban unos sobre otros) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl ring-1 ring-line-soft scrollbar-thin">
        <div className="sticky top-0 z-10 grid shrink-0 grid-cols-7 bg-canvas">
          {days.slice(0, 7).map((d) => (
            <div key={d.toISOString()} className="border-b border-r border-line-soft px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle last:border-r-0">
              {format(d, 'EEE', { locale })}
            </div>
          ))}
        </div>
        <div ref={gridRef} className="grid flex-1 grid-cols-7 [grid-auto-rows:minmax(6.5rem,1fr)]">
          {days.map((d) => {
            const key = toDateKey(d)
            const list = byDay.get(key) ?? []
          const visible = list.length <= fitsAll ? list : list.slice(0, perDay)
            return (
              <DayCell
                key={key}
                id={`day:${key}`}
                className={cn(
                  'group/day flex min-w-0 flex-col gap-0.5 overflow-hidden border-b border-r border-line-soft p-1.5 transition-colors [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0',
                  isToday(d) ? 'bg-highlight/50' : !isSameMonth(d, month) ? 'bg-canvas/70' : isWeekend(d) && 'bg-canvas/40',
                )}
              >
                <div className="flex items-center justify-between px-1">
                  <span
                    className={cn(
                      'inline-flex size-7 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums',
                      isToday(d) ? 'bg-accent text-accent-fg shadow-[0_6px_14px_-8px_var(--accent)]' : isSameMonth(d, month) ? 'text-fg' : 'text-fg-subtle/70',
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  {editable && !cross ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(key)
                        setDraft('')
                      }}
                      className="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle opacity-0 hover:bg-hover hover:text-fg group-hover/day:opacity-100 focus-visible:opacity-100"
                      aria-label={t('addOnDay')}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                {visible.map((task) => (
                  <Draggable
                    key={task.id}
                    id={task.id}
                    disabled={!movable(task)}
                    onOpen={() => open(task.id)}
                    className="flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-panel px-1.5 text-left text-xs shadow-[0_1px_2px_oklch(0.243_0.088_312.7/0.06)] ring-1 ring-line-soft transition-colors hover:ring-line"
                  >
                    {chip(task)}
                  </Draggable>
                ))}
                {list.length > visible.length ? (
                  // el resto del día en un desplegable (antes era un número sin forma de verlas)
                  <Popover>
                    <PopoverTrigger className="self-start rounded-sm px-1 text-2xs font-medium text-fg-muted hover:bg-hover hover:text-fg data-[popup-open]:bg-hover">
                      {t('moreCount', { count: list.length - visible.length })}
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1">
                      <p className="px-2 pb-1 pt-1.5 text-2xs font-medium capitalize text-fg-subtle">{format(d, 'EEEE d MMMM', { locale })}</p>
                      <div className="max-h-72 overflow-y-auto scrollbar-thin">
                        {list.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => open(task.id)}
                            className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-2 text-left text-xs hover:bg-hover"
                          >
                            {cross && wsMap.get(task.workspace_id) ? <WorkspaceMark ws={wsMap.get(task.workspace_id)!} size={12} /> : <StatusIcon status={task.status} className="size-3" />}
                            <span className={cn('truncate', task.status === 'done' ? 'text-fg-subtle line-through' : 'text-fg')}>{task.title}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}
                {adding === key ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => setAdding(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setAdding(null)
                      if (e.key === 'Enter' && draft.trim()) {
                        create.mutate({ workspace_id: workspaceId!, title: draft.trim(), due_date: key, status: 'todo', position: Date.now() / 1000 })
                        setDraft('')
                      }
                    }}
                    placeholder={t('composerPlaceholder')}
                    className="h-6 w-full rounded-sm border border-accent-mid bg-panel px-1.5 text-xs outline-none"
                  />
                ) : null}
              </DayCell>
            )
          })}
        </div>
      </div>
    </div>

    {/* las que no tienen fecha, a mano para soltarlas en un día */}
    {undated.length ? (
      <NoDateTray>
        <p className="flex items-baseline gap-2 text-sm font-semibold text-fg">
          {t('calendarTray.title')}
          <span className="text-xs font-normal tabular-nums text-fg-subtle">{undated.length}</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t('calendarTray.hint')}</p>
        <ul className="mt-3 flex flex-col gap-1">
          {undated.map((task) => (
            <li key={task.id}>
              <Draggable
                id={task.id}
                disabled={!movable(task)}
                onOpen={() => open(task.id)}
                className="group/row flex h-9 w-full min-w-0 items-center gap-2 rounded-lg bg-panel px-2 text-left text-xs shadow-card ring-1 ring-line-soft transition-colors hover:ring-accent-mid/40"
              >
                <GripVertical className="size-3.5 shrink-0 text-fg-subtle/60 group-hover/row:text-fg-subtle" />
                {chip(task)}
              </Draggable>
            </li>
          ))}
        </ul>
      </NoDateTray>
    ) : null}
    </div>
    <DragOverlay dropAnimation={null}>
      {dragged ? <div className="flex h-7 max-w-56 items-center gap-1.5 rounded-md bg-panel px-2 text-xs shadow-lift ring-1 ring-accent-mid/40">{chip(dragged)}</div> : null}
    </DragOverlay>
    </DndContext>
  )
}

/** Un día del mes: recibe tareas arrastradas (se marca al pasar por encima). */
function DayCell({ id, className, children }: { id: string; className: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && 'bg-accent-soft/70 ring-2 ring-inset ring-accent-mid/50')}>
      {children}
    </div>
  )
}

/** La bandeja «Sin fecha»: también recibe (soltar acá le quita la fecha). */
function NoDateTray({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE })
  return (
    <aside
      ref={setNodeRef}
      className={cn(
        'on-frame day-surface hidden w-64 shrink-0 flex-col overflow-y-auto rounded-2xl p-4 shadow-[0_18px_40px_-24px_oklch(0.3_0.12_312/0.55)] transition-shadow scrollbar-thin lg:flex',
        isOver && 'ring-2 ring-accent ring-offset-2 ring-offset-panel',
      )}
    >
      {children}
    </aside>
  )
}

/** Una tarea que se arrastra (si se puede editar su espacio); un clic sin mover la abre. */
function Draggable({ id, disabled, onOpen, className, children }: { id: string; disabled: boolean; onOpen: () => void; className: string; children: React.ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, disabled })
  return (
    <button ref={setNodeRef} type="button" onClick={onOpen} {...listeners} {...attributes} className={cn(className, isDragging && 'opacity-30', !disabled && 'cursor-grab active:cursor-grabbing')}>
      {children}
    </button>
  )
}
