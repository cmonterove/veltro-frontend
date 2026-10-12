import { differenceInCalendarDays, parseISO } from 'date-fns'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants'
import { assigneesOf } from '@/lib/assignees'
import { isCounter, type Counter } from '@/lib/scope'
import type { TaskPriority, TaskRow, TaskStatus } from '@/lib/database.types'

/** Cuándo vence una tarea abierta. Mismos tramos que los grupos de la lista. */
export const DUE_BUCKETS = ['overdue', 'today', 'week', 'later', 'none'] as const
export type DueBucket = (typeof DUE_BUCKETS)[number]

/** Las tareas hechas no tienen tramo: ya no vencen. */
export function dueBucketOf(task: Pick<TaskRow, 'status' | 'due_date'>, now = new Date()): DueBucket | null {
  if (task.status === 'done') return null
  if (!task.due_date) return 'none'
  const d = differenceInCalendarDays(parseISO(task.due_date), now)
  return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= 7 ? 'week' : 'later'
}

/** Filtros de la vista Tareas. Dentro de un filtro se suma (o); entre filtros se acota (y). */
export type TaskFilters = {
  status: TaskStatus[]
  due: DueBucket[]
  ws: string[]
  who: string[]
  prio: TaskPriority[]
  label: string[]
}
export type FilterKey = keyof TaskFilters

export const FILTER_KEYS: FilterKey[] = ['status', 'due', 'ws', 'who', 'prio', 'label']
/** En el filtro de responsable, las tareas que no tienen a nadie. */
export const UNASSIGNED = 'none'

/** Responsables de una tarea para filtrar y contar: sin nadie cuenta como "sin asignar". */
export const whoKeys = (task: Parameters<typeof assigneesOf>[0]) => {
  const ids = assigneesOf(task)
  return ids.length ? ids : [UNASSIGNED]
}
export const NO_FILTERS: TaskFilters = { status: [], due: [], ws: [], who: [], prio: [], label: [] }

const uniq = <T>(xs: T[]) => [...new Set(xs)]
const oneOf =
  <T extends string>(allowed: readonly T[]) =>
  (v: string): v is T =>
    (allowed as readonly string[]).includes(v)

/** Un contador de Pulso o del Resumen expresado como filtro. */
export function counterFilters(c: Counter): Partial<TaskFilters> {
  return c === 'overdue' || c === 'today' ? { due: [c] } : { status: [c] }
}

/** Lee los filtros de la URL (?status=todo&status=blocked&ws=…). Acepta también ?filter= y ?view= de los enlaces de antes. */
export function parseTaskFilters(params: Pick<URLSearchParams, 'get' | 'getAll'>): TaskFilters {
  const list = (k: string) => params.getAll(k).flatMap((v) => (k === 'label' ? [v] : v.split(','))).map((v) => v.trim()).filter(Boolean)
  const f: TaskFilters = {
    status: list('status').filter(oneOf(TASK_STATUSES)),
    due: list('due').filter(oneOf(DUE_BUCKETS)),
    ws: list('ws'),
    who: list('who'),
    prio: list('prio').filter(oneOf(TASK_PRIORITIES)),
    label: list('label'),
  }
  const legacy = params.get('filter') ?? params.get('view')
  if (isCounter(legacy)) {
    const extra = counterFilters(legacy)
    if (extra.due) f.due = [...f.due, ...extra.due]
    if (extra.status) f.status = [...f.status, ...extra.status]
  }
  return Object.fromEntries(FILTER_KEYS.map((k) => [k, uniq(f[k] as string[])])) as TaskFilters
}

/** Escribe los filtros en la URL y borra los parámetros de antes. */
export function writeTaskFilters(params: URLSearchParams, f: TaskFilters) {
  for (const k of [...FILTER_KEYS, 'filter', 'view']) params.delete(k)
  for (const k of FILTER_KEYS) for (const v of f[k]) params.append(k, v)
}

export const activeFilterCount = (f: TaskFilters) => FILTER_KEYS.filter((k) => f[k].length > 0).length

/** `skip` deja fuera un filtro: así cada menú cuenta sus opciones con los demás filtros aplicados. */
export function matchesTaskFilters(task: TaskRow, f: TaskFilters, now = new Date(), skip?: FilterKey) {
  if (skip !== 'status' && f.status.length && !f.status.includes(task.status)) return false
  if (skip !== 'due' && f.due.length) {
    const bucket = dueBucketOf(task, now)
    if (!bucket || !f.due.includes(bucket)) return false
  }
  if (skip !== 'ws' && f.ws.length && !f.ws.includes(task.workspace_id)) return false
  if (skip !== 'who' && f.who.length && !whoKeys(task).some((id) => f.who.includes(id))) return false
  if (skip !== 'prio' && f.prio.length && !f.prio.includes(task.priority)) return false
  if (skip !== 'label' && f.label.length && !task.labels.some((l) => f.label.includes(l))) return false
  return true
}

/** Búsqueda por título, etiqueta o referencia (TV-3, #3 o 3). `q` ya viene en minúsculas y sin espacios de más. */
export function matchesTaskQuery(task: TaskRow, q: string, wsKey?: string) {
  if (!q) return true
  const n = String(task.number)
  return (
    task.title.toLowerCase().includes(q) ||
    task.labels.some((l) => l.toLowerCase().includes(q)) ||
    q === n ||
    q === `#${n}` ||
    (wsKey != null && q === `${wsKey}-${n}`.toLowerCase())
  )
}
