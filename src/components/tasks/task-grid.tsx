'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowDown, CalendarDays, Check, CircleDashed, CircleUser, Minus, Search, SignalHigh, Trash2, X } from 'lucide-react'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { useDeleteTasksWithUndo, useUpdateTask } from '@/lib/queries/tasks'
import { useCommonWorkspaceMembers, useWorkspaceMembers } from '@/lib/queries/workspace-members'
import type { TaskPatch } from '@/lib/api/tareas'
import { statusKey, statusPatch, taskStatusOf, workspaceStatuses, type StatusOption } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { assigneesOf, assigneesPatch } from '@/lib/assignees'
import { useOpenTask } from '@/lib/use-open-task'
import { TASK_STATUSES } from '@/lib/constants'
import { cn, taskRef } from '@/lib/utils'
import type { TaskPriority, TaskRow } from '@/lib/database.types'
import { AssigneesMenu, DuePopover, LabelChip, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'

type SortKey = 'status' | 'due' | 'priority' | 'title' | 'space'
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const

/**
 * Tabla de tareas de varios espacios. Las columnas son las comunes a todos (los campos propios de
 * cada espacio viven en la tabla de ese espacio); cada celda se edita con las reglas de su espacio.
 * Con las casillas se eligen varias (Shift para un rango) y abajo aparece la barra para cambiarlas juntas.
 */
export function TaskGrid({ tasks }: { tasks: TaskRow[] }) {
  const t = useTranslations('tasks')
  const tb = useTranslations('tasks.bulk')
  const wsMap = useWorkspaceMap()
  const [sort, setSort] = useState<SortKey>('status')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  // la última casilla tocada: desde ahí va el rango con Shift
  const anchor = useRef<string | null>(null)

  const rows = useMemo(() => {
    const cat = new Map(TASK_STATUSES.map((c, i) => [c, i]))
    return [...tasks].sort((a, b) => {
      if (sort === 'due') return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'space') return (wsMap.get(a.workspace_id)?.name ?? '').localeCompare(wsMap.get(b.workspace_id)?.name ?? '') || a.position - b.position
      return (cat.get(a.status) ?? 9) - (cat.get(b.status) ?? 9) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    })
  }, [tasks, sort, wsMap])

  // solo se eligen las que se pueden editar; lo elegido que un filtro saca de la vista deja de contar
  const editableIds = useMemo(() => rows.filter((r) => canEdit(wsMap.get(r.workspace_id))).map((r) => r.id), [rows, wsMap])
  const selected = useMemo(() => rows.filter((r) => picked.has(r.id) && canEdit(wsMap.get(r.workspace_id))), [rows, picked, wsMap])
  const count = selected.length
  const allOn = editableIds.length > 0 && count === editableIds.length
  const clear = () => setPicked(new Set())
  const toggle = (id: string, range: boolean) => {
    const on = !picked.has(id)
    const ids = rows.map((r) => r.id)
    const from = range && anchor.current ? ids.indexOf(anchor.current) : -1
    const to = ids.indexOf(id)
    const span = from >= 0 && to >= 0 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
    setPicked((prev) => {
      const next = new Set(prev)
      for (const x of span) {
        if (!editableIds.includes(x)) continue
        if (on) next.add(x)
        else next.delete(x)
      }
      return next
    })
    anchor.current = id
  }

  // Esc suelta la selección (antes que la pantalla completa; no si hay un menú o un diálogo abierto)
  useEffect(() => {
    if (!count) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role=dialog],[role=alertdialog],[role=menu],[role=listbox]')) return
      e.stopPropagation()
      setPicked(new Set())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [count])

  const head = 'sticky top-0 z-10 h-10 border-b border-line-soft bg-canvas px-2 text-left text-[11.5px] font-semibold text-fg-muted whitespace-nowrap'

  return (
    <div className="relative h-full min-h-0">
    <div className={cn('h-full min-h-0 overflow-auto scrollbar-thin', count > 0 && 'pb-20')}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={cn(head, 'sticky left-0 z-20 w-[380px] min-w-[380px] pl-3')}>
              <span className="flex items-center gap-2.5">
                <RowCheck
                  checked={allOn}
                  mixed={count > 0 && !allOn}
                  disabled={!editableIds.length}
                  visible
                  label={tb('selectAll')}
                  onToggle={() => setPicked(allOn ? new Set() : new Set(editableIds))}
                />
                <SortBtn sort={sort} onSort={setSort} k="title">{t('title')}</SortBtn>
              </span>
            </th>
            <th className={cn(head, 'w-44')}>
              <SortBtn sort={sort} onSort={setSort} k="space">{t('space')}</SortBtn>
            </th>
            <th className={cn(head, 'w-40')}>
              <SortBtn sort={sort} onSort={setSort} k="status">{t('statusLabel')}</SortBtn>
            </th>
            <th className={cn(head, 'w-36')}>
              <SortBtn sort={sort} onSort={setSort} k="priority">{t('priorityLabel')}</SortBtn>
            </th>
            <th className={cn(head, 'w-44')}>{t('assignees')}</th>
            <th className={cn(head, 'w-32')}>
              <SortBtn sort={sort} onSort={setSort} k="due">{t('dueLabel')}</SortBtn>
            </th>
            <th className={cn(head, 'w-56')}>{t('labels')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => (
            <GridRow key={task.id} task={task} picked={picked.has(task.id)} picking={count > 0} onPick={(range) => toggle(task.id, range)} />
          ))}
        </tbody>
      </table>
    </div>
    {count > 0 ? <BulkBar tasks={selected} onClear={clear} /> : null}
    </div>
  )
}

/** Pastilla por estado y por prioridad: lo que no dice nada queda neutro. */
const STATUS_PILL: Record<string, string> = {
  backlog: 'bg-fg/[0.04] text-fg-muted',
  todo: 'bg-fg/[0.05] text-fg',
  in_progress: 'bg-warning-soft text-mandarina-ink',
  blocked: 'bg-danger-soft text-danger',
  done: 'bg-done-soft text-done',
}
const PRIORITY_PILL: Record<string, string> = {
  urgent: 'bg-danger-soft text-danger',
  high: 'bg-warning-soft text-mandarina-ink',
  medium: 'bg-fg/[0.05] text-fg',
  low: 'bg-fg/[0.04] text-fg-muted',
  none: 'text-fg-subtle',
}

function GridRow({ task, picked, picking, onPick }: { task: TaskRow; picked: boolean; picking: boolean; onPick: (range: boolean) => void }) {
  const tb = useTranslations('tasks.bulk')
  const statusName = useStatusName()
  const tPriority = useTranslations('tasks.priority')
  const ws = useWorkspaceMap().get(task.workspace_id)
  const editable = canEdit(ws)
  const memberMap = useMemberMap()
  const members = useWorkspaceMembers(editable ? task.workspace_id : null)
  const update = useUpdateTask()
  const { open } = useOpenTask()
  const people = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p })
  const cell = 'h-11 border-b border-line-soft px-1.5 align-middle'
  const done = task.status === 'done'

  return (
    <tr aria-selected={picked || undefined} className={cn('group/tr transition-colors duration-150', picked ? 'bg-accent-soft/45' : 'hover:bg-hover/50')}>
      <td
        className={cn(
          cell,
          'sticky left-0 z-[1] pl-3',
          picked ? 'bg-[color-mix(in_oklch,var(--accent-soft)_45%,var(--panel))]' : 'bg-panel group-hover/tr:bg-[color-mix(in_oklch,var(--hover)_50%,var(--panel))]',
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <RowCheck checked={picked} disabled={!editable} visible={picking} label={tb('select')} onToggle={onPick} />
          <button type="button" onClick={() => open(task.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="w-14 shrink-0 font-mono text-xs text-fg-subtle">{ws ? taskRef(ws.key, task.number) : ''}</span>
            <span className={cn('truncate font-medium', done ? 'text-fg-muted line-through decoration-fg-subtle/40' : 'text-fg')}>{task.title}</span>
          </button>
        </span>
      </td>
      <td className={cell}>
        {ws ? (
          <span className="flex min-w-0 items-center gap-1.5 px-2 text-sm text-fg-muted">
            <WorkspaceMark ws={ws} size={16} />
            <span className="truncate">{ws.name}</span>
          </span>
        ) : null}
      </td>
      <td className={cell}>
        <StatusMenu
          options={workspaceStatuses(ws)}
          value={taskStatusOf(task, ws)}
          onChange={(o) => patch(statusPatch(o))}
          disabled={!editable}
          className={cn('h-7 rounded-full px-2.5 font-medium', STATUS_PILL[task.status])}
        >
          <StatusIcon status={task.status} />
          <span className="truncate">{statusName(taskStatusOf(task, ws))}</span>
        </StatusMenu>
      </td>
      <td className={cell}>
        <PriorityMenu value={task.priority} onChange={(priority) => patch({ priority })} disabled={!editable} className={cn('h-7 rounded-full px-2.5', PRIORITY_PILL[task.priority])}>
          <PriorityIcon priority={task.priority} />
          <span className="whitespace-nowrap text-sm font-medium">{tPriority(task.priority)}</span>
        </PriorityMenu>
      </td>
      <td className={cell}>
        <AssigneesMenu value={assigneesOf(task)} members={members} onChange={(ids) => patch(assigneesPatch(ids))} disabled={!editable} className="h-7 max-w-full px-2">
          {people.length ? (
            <>
              <AvatarStack people={people} size={18} />
              <span className="truncate">{people.map((p) => p.full_name.split(' ')[0]).join(', ')}</span>
            </>
          ) : (
            <CircleUser className="size-4 text-fg-subtle" />
          )}
        </AssigneesMenu>
      </td>
      <td className={cell}>
        <DuePopover value={task.due_date} onChange={(due_date) => patch({ due_date })} disabled={!editable} className={cn('h-7 rounded-full px-2.5', task.due_date && 'bg-fg/[0.04]')}>
          {task.due_date ? <DueDate due={task.due_date} done={done} repeats={Boolean(task.recurrence)} /> : <span className="text-sm text-fg-subtle">—</span>}
        </DuePopover>
      </td>
      <td className={cell}>
        <span className="flex gap-1 overflow-hidden px-1">
          {task.labels.slice(0, 3).map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </span>
      </td>
    </tr>
  )
}

function SortBtn({ k, sort, onSort, children }: { k: SortKey; sort: SortKey; onSort: (k: SortKey) => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => onSort(k)} aria-pressed={sort === k} className={cn('inline-flex items-center gap-1 hover:text-fg', sort === k && 'text-fg')}>
      {children}
      {sort === k ? <ArrowDown className="size-3 text-accent-ink" /> : null}
    </button>
  )
}

/**
 * La casilla de una fila (y la de «todas» en la cabecera). En las filas aparece al pasar el mouse o con
 * el foco; mientras hay algo elegido se ven todas.
 */
function RowCheck({
  checked,
  mixed = false,
  disabled = false,
  visible,
  label,
  onToggle,
}: {
  checked: boolean
  mixed?: boolean
  disabled?: boolean
  visible: boolean
  label: string
  onToggle: (range: boolean) => void
}) {
  const on = checked || mixed
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e.shiftKey)
      }}
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] outline-none transition-[background-color,box-shadow,opacity] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/50 active:scale-95',
        on ? 'bg-accent text-accent-fg' : 'bg-panel shadow-[inset_0_0_0_1.5px_var(--line-control)] hover:shadow-[inset_0_0_0_1.5px_var(--fg-subtle)]',
        !visible && !on && 'opacity-0 focus-visible:opacity-100 group-hover/tr:opacity-100',
        disabled && 'pointer-events-none opacity-0',
      )}
    >
      {mixed ? <Minus className="size-3" strokeWidth={3} /> : checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </button>
  )
}

/**
 * La barra de abajo cuando hay varias elegidas: cuántas y qué cambiarles a todas juntas (estado,
 * prioridad, responsable, fecha) o borrarlas. Cada cambio deja «Deshacer» con lo que tenían antes. De
 * varios espacios, el estado se elige por tipo y cada tarea toma el primero de ese tipo en el suyo.
 */
function BulkBar({ tasks, onClear }: { tasks: TaskRow[]; onClear: () => void }) {
  const t = useTranslations('tasks')
  const tb = useTranslations('tasks.bulk')
  const wsMap = useWorkspaceMap()
  const update = useUpdateTask()
  const removeAll = useDeleteTasksWithUndo()
  const wsIds = useMemo(() => [...new Set(tasks.map((x) => x.workspace_id))], [tasks])
  const oneWs = wsIds.length === 1 ? wsMap.get(wsIds[0]) : undefined
  const members = useCommonWorkspaceMembers(wsIds)

  // el valor que tienen todas (si es el mismo), para marcarlo en el menú
  const common = <T,>(get: (x: TaskRow) => T): T | undefined => (tasks.every((x) => get(x) === get(tasks[0])) ? get(tasks[0]) : undefined)
  const statusOptions: StatusOption[] = oneWs ? workspaceStatuses(oneWs) : TASK_STATUSES.map((c) => ({ id: null, name: null, category: c }))
  const commonStatus = oneWs ? common((x) => statusKey(taskStatusOf(x, oneWs))) : common((x) => x.status as string)
  const commonPriority = common((x) => x.priority)
  const commonDue = common((x) => x.due_date ?? null)
  const commonAssignee = common((x) => assigneesOf(x).join(','))

  const apply = (next: (x: TaskRow) => TaskPatch, before: (x: TaskRow) => TaskPatch) => {
    const undo = tasks.map((x) => ({ id: x.id, patch: before(x) }))
    for (const x of tasks) update.mutate({ id: x.id, patch: next(x) })
    toast(tb('changed', { count: tasks.length }), {
      action: { label: t('undo'), onClick: () => undo.forEach((u) => update.mutate(u)) },
    })
  }
  const setStatus = (o: StatusOption) =>
    apply(
      (x) => statusPatch(oneWs ? o : (workspaceStatuses(wsMap.get(x.workspace_id)).find((s) => s.category === o.category) ?? o)),
      (x) => ({ status: x.status, status_id: x.status_id }),
    )

  const btn = 'h-8 shrink-0 rounded-lg px-2.5 text-sm font-medium text-fg hover:bg-hover data-[popup-open]:bg-hover [&_svg]:size-4 [&_svg]:text-fg-muted'
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3">
      <div
        role="toolbar"
        aria-label={tb('label')}
        className="on-frame day-surface pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl py-1.5 pl-3.5 pr-1.5 shadow-[0_22px_44px_-18px_oklch(0.25_0.1_312/0.65)] ring-1 ring-line animate-in fade-in-0 slide-in-from-bottom-3 duration-200 ease-out scrollbar-none"
      >
        {/* en el teléfono, solo la cifra: así caben todas las acciones */}
        <span className="mr-1 whitespace-nowrap text-sm font-semibold tabular-nums text-fg sm:mr-2" title={tb('selected', { count: tasks.length })}>
          <span className="max-sm:sr-only">{tb('selected', { count: tasks.length })}</span>
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-fg/[0.14] px-1.5 sm:hidden" aria-hidden>
            {tasks.length}
          </span>
        </span>
        <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
        <StatusMenu
          options={statusOptions}
          value={statusOptions.find((o) => (oneWs ? statusKey(o) : o.category) === commonStatus) ?? { id: '__varios', name: null, category: 'todo' }}
          onChange={setStatus}
          closeOnPick
          aria-label={oneWs ? t('statusLabel') : `${t('statusLabel')}: ${tb('mixed')}`}
          className={btn}
        >
          <CircleDashed />
          <span className="max-sm:sr-only">{t('statusLabel')}</span>
        </StatusMenu>
        <PriorityMenu
          value={commonPriority ?? ('' as TaskPriority)}
          onChange={(priority) => apply(() => ({ priority }), (x) => ({ priority: x.priority }))}
          closeOnPick
          aria-label={t('priorityLabel')}
          className={btn}
        >
          <SignalHigh />
          <span className="max-sm:sr-only">{t('priorityLabel')}</span>
        </PriorityMenu>
        <BulkAssignee
          members={members}
          value={commonAssignee}
          onChange={(id) => apply(() => assigneesPatch(id ? [id] : []), (x) => assigneesPatch(assigneesOf(x)))}
          className={btn}
        />
        <DuePopover
          value={commonDue ?? null}
          onChange={(due_date) => apply(() => ({ due_date }), (x) => ({ due_date: x.due_date }))}
          aria-label={t('dueLabel')}
          className={btn}
        >
          <CalendarDays />
          <span className="max-sm:sr-only">{t('dueLabel')}</span>
        </DuePopover>
        <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
        <button
          type="button"
          onClick={() => {
            removeAll(tasks.map((x) => x.id))
            onClear()
          }}
          className={cn('inline-flex items-center gap-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40 hover:text-danger [&:hover_svg]:text-danger', btn)}
        >
          <Trash2 />
          <span className="max-sm:sr-only">{tb('delete')}</span>
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={tb('clear')}
          title={tb('clear')}
          className="ml-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** Asignar a varias: una persona (o nadie) reemplaza a los responsables de cada una. */
function BulkAssignee({
  members,
  value,
  onChange,
  className,
}: {
  members: ReturnType<typeof useCommonWorkspaceMembers>
  /** los responsables que tienen todas (ids unidos por coma), si es el mismo */
  value: string | undefined
  onChange: (id: string | null) => void
  className?: string
}) {
  const t = useTranslations('tasks')
  const tb = useTranslations('tasks.bulk')
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? members.filter((m) => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) : members
  }, [members, query])
  return (
    <Menu onOpenChange={(o) => !o && setQuery('')}>
      <MenuTrigger className={cn('inline-flex items-center gap-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40', className)} aria-label={t('assignees')}>
        <CircleUser />
        <span className="max-sm:sr-only">{t('assignees')}</span>
      </MenuTrigger>
      <MenuContent className="w-64">
        {members.length > 6 ? (
          <div className="flex items-center gap-2 border-b border-line px-2 pb-1.5 pt-0.5">
            <Search className="size-3.5 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t('searchPeople')}
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
              autoFocus
            />
          </div>
        ) : null}
        <MenuLabel>{tb('assignTo')}</MenuLabel>
        <MenuRadioGroup value={value ?? '__varios'} onValueChange={(v) => onChange(v ? String(v) : null)}>
          {!query ? (
            <MenuRadioItem value="" closeOnClick>
              <CircleUser className="!text-fg-subtle" />
              <span className="truncate text-fg-muted">{t('unassigned')}</span>
            </MenuRadioItem>
          ) : null}
          {shown.map((m) => (
            <MenuRadioItem key={m.id} value={m.id} closeOnClick>
              <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={18} />
              <span className="truncate">{m.full_name}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}
