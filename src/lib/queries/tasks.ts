'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useApp } from '@/components/app/app-context'
import { api } from '@/lib/api/client'
import {
  allPages,
  browserTimeZone,
  toTaskBody,
  toTaskRow,
  type ApiPage,
  type ApiScopedTasks,
  type ApiTaskBrief,
  type ApiTaskDetail,
  type ApiTaskStats,
  type TaskPatch,
} from '@/lib/api/tareas'
import type { TaskRow } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'
import { isAssignedTo } from '@/lib/assignees'
import { nextAfterDone } from '@/lib/recurrence'
import { useDateLocale } from '@/lib/dates'
import { format, parseISO } from 'date-fns'

export type TaskScope =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'assignee'; userId: string; workspaceIds: string[] }
  | { kind: 'doc'; docId: string }
  | { kind: 'meeting'; meetingId: string }
  | { kind: 'workspaces'; workspaceIds: string[] }
  /** alcance por jerarquía (me, team, all, dept:<id>, person:<id>): la API decide quién entra */
  | { kind: 'scope'; scopeId: string; workspaceIds?: string[]; openOnly?: boolean }

type CacheScope = TaskScope | { kind: 'parent'; parentId: string }

export const taskKeys = {
  all: ['tasks'] as const,
  scope: (scope: TaskScope, accountId?: string) => ['tasks', scope, accountId] as const,
  one: (id: string) => ['task', id] as const,
  subtasks: (parentId: string | null) => ['tasks', { kind: 'parent', parentId }] as const,
  origin: (id: string) => ['task-origin', id] as const,
  stats: ['task-stats'] as const,
}

// Ids de espacios por llamada (la API admite hasta 50).
const WS_CHUNK = 50

/** Todas las páginas de GET /v1/tasks con estos filtros. */
function scopedList(query: Record<string, string | number | undefined>) {
  return allPages((cursor) => api<ApiScopedTasks>('/v1/tasks', { query: { ...query, limit: 500, cursor } }))
}

async function fetchTasks(scope: TaskScope, accountId: string): Promise<TaskRow[]> {
  let rows: ApiTaskBrief[]
  switch (scope.kind) {
    case 'workspace':
      rows = await allPages((cursor) => api<ApiPage<ApiTaskBrief>>(`/v1/workspaces/${scope.workspaceId}/tasks`, { query: { limit: 200, cursor } }))
      break
    case 'workspaces':
    case 'assignee': {
      // "visible": todo lo que veo en esos espacios (los míos enteros; de los observados, lo de mi gente)
      const ids = [...new Set(scope.workspaceIds)]
      const chunks = Array.from({ length: Math.ceil(ids.length / WS_CHUNK) }, (_, i) => ids.slice(i * WS_CHUNK, (i + 1) * WS_CHUNK))
      const who = scope.kind === 'assignee' ? scope.userId : undefined
      rows = (await Promise.all(chunks.map((ws) => scopedList({ accountId, scope: 'visible', ws: ws.join(','), who })))).flat()
      break
    }
    case 'doc':
      rows = await scopedList({ accountId, scope: 'visible', docId: scope.docId })
      break
    case 'meeting':
      rows = await scopedList({ accountId, scope: 'visible', meetingId: scope.meetingId })
      break
    case 'scope':
      rows = await scopedList({
        accountId,
        scope: scope.scopeId,
        ws: scope.workspaceIds?.length ? scope.workspaceIds.join(',') : undefined,
        done: scope.openOnly ? 'none' : undefined,
      })
      break
  }
  return rows.map(toTaskRow)
}

export function useTasks(scope: TaskScope | null, initialData?: TaskRow[]) {
  const { account } = useApp()
  return useQuery({
    queryKey: scope ? taskKeys.scope(scope, account.id) : ['tasks', 'none'],
    enabled: Boolean(scope),
    initialData,
    queryFn: () => fetchTasks(scope!, account.id),
  })
}

/** Guarda en caché lo que trae el detalle: subtareas y de dónde salió (doc o reunión). */
function seedDetail(qc: QueryClient, d: ApiTaskDetail) {
  qc.setQueryData(taskKeys.subtasks(d.id), d.subtasks.map(toTaskRow))
  qc.setQueryData(taskKeys.origin(d.id), { doc: d.doc, meeting: d.meeting })
  if (d.followers) qc.setQueryData(['task-followers', d.id], d.followers)
  if (d.blockedBy && d.blocking) qc.setQueryData(['task-deps', d.id], { blockedBy: d.blockedBy, blocking: d.blocking })
}

async function fetchTask(qc: QueryClient, id: string) {
  const d = await api<ApiTaskDetail>(`/v1/tasks/${id}`)
  seedDetail(qc, d)
  return toTaskRow(d)
}

/** Una tarea completa (con la descripción). Mientras carga, si está en alguna lista, se muestra esa. */
export function useTask(id: string | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: id ? taskKeys.one(id) : ['task', 'none'],
    enabled: Boolean(id),
    staleTime: 10_000,
    placeholderData: () => (id ? findCachedTask(qc, id) : undefined),
    queryFn: () => fetchTask(qc, id!),
  })
}

/** Una tarea por su referencia (TV-3): también las de los espacios que veo por el organigrama. */
export async function fetchTaskByRef(qc: QueryClient, ref: string, accountId: string) {
  const d = await api<ApiTaskDetail>(`/v1/tasks/ref/${encodeURIComponent(ref)}`, { query: { accountId } })
  seedDetail(qc, d)
  const row = toTaskRow(d)
  qc.setQueryData(taskKeys.one(row.id), row)
  return row
}

/** Doc o reunión de donde salió la tarea (viene en el detalle). */
export function useTaskOrigin(id: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: taskKeys.origin(id),
    staleTime: 60_000,
    queryFn: async () => {
      const d = await api<ApiTaskDetail>(`/v1/tasks/${id}`)
      seedDetail(qc, d)
      return { doc: d.doc, meeting: d.meeting }
    },
  })
}

function matchesScope(scope: CacheScope, t: TaskRow) {
  switch (scope.kind) {
    case 'workspace':
      return t.workspace_id === scope.workspaceId && !t.parent_id
    case 'assignee':
      return isAssignedTo(t, scope.userId) && scope.workspaceIds.includes(t.workspace_id) && !t.parent_id
    case 'doc':
      return t.doc_id === scope.docId && !t.parent_id
    case 'meeting':
      return t.meeting_id === scope.meetingId && !t.parent_id
    case 'workspaces':
      return scope.workspaceIds.includes(t.workspace_id) && !t.parent_id
    case 'parent':
      return t.parent_id === scope.parentId
    // quién entra en un alcance lo sabe la API: esas listas se vuelven a pedir
    case 'scope':
      return null
  }
}

export function findCachedTask(qc: QueryClient, id: string) {
  for (const [, list] of qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })) {
    const hit = Array.isArray(list) ? list.find((t) => t.id === id) : undefined
    if (hit) return hit
  }
  return undefined
}

function patchCaches(qc: QueryClient, id: string, patch: Partial<TaskRow>) {
  qc.setQueriesData<TaskRow[]>({ queryKey: taskKeys.all }, (old) => (Array.isArray(old) ? old.map((t) => (t.id === id ? { ...t, ...patch } : t)) : old))
  qc.setQueryData<TaskRow>(taskKeys.one(id), (old) => (old ? { ...old, ...patch } : old))
}

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

/** Tarea recién creada que todavía no volvió de la API (se ve al instante con este id). */
export const isTempTask = (id: string) => id.startsWith('tmp-')
// cambios hechos a una tarea mientras se crea: se aplican a la de verdad cuando llega su id
const queuedPatches = new Map<string, TaskPatch[]>()

export function useUpdateTask() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  const tr = useTranslations('tasks.recurrence')
  const locale = useDateLocale()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) => {
      if (isTempTask(id)) {
        queuedPatches.set(id, [...(queuedPatches.get(id) ?? []), patch])
        return { ...(findCachedTask(qc, id) as TaskRow), ...(patch as Partial<TaskRow>) }
      }
      const d = await api<ApiTaskDetail>(`/v1/tasks/${id}`, { method: 'PATCH', body: toTaskBody(patch) })
      seedDetail(qc, d)
      return toTaskRow(d)
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      const snapshot = qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })
      const single = qc.getQueryData<TaskRow>(taskKeys.one(id))
      // terminar una que se repite: la base crea la siguiente (se avisa cuándo vence)
      const before = single ?? findCachedTask(qc, id)
      const next = patch.status === 'done' && before && before.status !== 'done' && before.recurrence ? nextAfterDone(before.due_date, before.recurrence) : null
      const optimistic: Partial<TaskRow> = { ...(patch as Partial<TaskRow>) }
      if (patch.assignee_ids) optimistic.assignee_id = patch.assignee_ids[0] ?? null
      else if (patch.assignee_id !== undefined) optimistic.assignee_ids = patch.assignee_id ? [patch.assignee_id] : []
      if (patch.status === 'done') optimistic.completed_at = new Date().toISOString()
      else if (patch.status) optimistic.completed_at = null
      patchCaches(qc, id, optimistic)
      return { snapshot, single, next }
    },
    onError: (error, { id }, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      if (ctx?.single) qc.setQueryData(taskKeys.one(id), ctx.single)
      onError(error)
    },
    onSuccess: (task, _v, ctx) => {
      patchCaches(qc, task.id, task)
      if (ctx?.next) {
        toast.success(tr('spawned', { date: format(parseISO(ctx.next), 'EEEE d MMM', { locale }) }))
        qc.invalidateQueries({ queryKey: taskKeys.all })
      }
    },
    onSettled: (_d, _e, { id, patch }) => {
      // las cifras (Pulso, Mesa, Resumen) cambian con casi cualquier cambio
      qc.invalidateQueries({ queryKey: taskKeys.stats })
      // y el historial de la tarea suma el cambio
      qc.invalidateQueries({ queryKey: ['task-activity', id] })
      // Cambios que mueven la tarea entre listas: refrescar todas
      if ('assignee_id' in patch || 'assignee_ids' in patch || 'workspace_id' in patch || 'doc_id' in patch || 'meeting_id' in patch) {
        qc.invalidateQueries({ queryKey: taskKeys.all })
      }
    },
  })
}

export type NewTask = TaskPatch & Pick<TaskRow, 'workspace_id' | 'title'>

// La API crea hasta 100 de una vez (todo o nada).
const BATCH = 100

/**
 * ¿Entra una tarea nueva en esta lista? Lo que decide la API (alcances de equipo, área…) se
 * aproxima solo para «mías», una persona o toda la empresa; el resto se vuelve a pedir.
 */
function fitsOptimistic(scope: CacheScope, t: TaskRow, me: string): boolean {
  const known = matchesScope(scope, t)
  if (known !== null) return known
  if (scope.kind !== 'scope' || t.parent_id) return false
  if (scope.workspaceIds?.length && !scope.workspaceIds.includes(t.workspace_id)) return false
  if (scope.scopeId === 'me') return isAssignedTo(t, me)
  if (scope.scopeId.startsWith('person:')) return isAssignedTo(t, scope.scopeId.slice(7))
  return scope.scopeId === 'all'
}

export function useCreateTask() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  const { user } = useApp()
  return useMutation({
    // una sola tarea: se ve al instante en sus listas y se reemplaza por la de verdad al volver de la API
    onMutate: async (input: NewTask | NewTask[]) => {
      if (Array.isArray(input)) return { tmpId: null }
      await qc.cancelQueries({ queryKey: taskKeys.all })
      const now = new Date().toISOString()
      const assignees = input.assignee_ids ?? (input.assignee_id ? [input.assignee_id] : [])
      const tmp: TaskRow = {
        description: null,
        description_text: '',
        status: 'todo',
        status_id: null,
        priority: 'none',
        due_date: null,
        start_date: null,
        estimate_hours: null,
        custom: {},
        labels: [],
        position: Date.now() / 1000,
        parent_id: null,
        doc_id: null,
        doc_block_id: null,
        meeting_id: null,
        recurrence: null,
        ...(input as Partial<TaskRow>),
        workspace_id: input.workspace_id,
        title: input.title,
        assignee_ids: assignees,
        assignee_id: assignees[0] ?? null,
        id: `tmp-${crypto.randomUUID()}`,
        number: 0,
        created_by: user.id,
        completed_at: null,
        created_at: now,
        updated_at: now,
      }
      for (const [key, list] of qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })) {
        const scope = key[1] as CacheScope | undefined
        if (!Array.isArray(list) || !scope || typeof scope !== 'object') continue
        if (fitsOptimistic(scope, tmp, user.id)) qc.setQueryData(key, [...list, tmp])
      }
      return { tmpId: tmp.id }
    },
    mutationFn: async (input: NewTask | NewTask[]): Promise<TaskRow[]> => {
      if (!Array.isArray(input)) {
        const d = await api<ApiTaskDetail>(`/v1/workspaces/${input.workspace_id}/tasks`, { method: 'POST', body: toTaskBody(input, 'create') })
        seedDetail(qc, d)
        return [toTaskRow(d)]
      }
      const byWs = new Map<string, NewTask[]>()
      for (const row of input) byWs.set(row.workspace_id, [...(byWs.get(row.workspace_id) ?? []), row])
      const out: TaskRow[] = []
      for (const [ws, rows] of byWs) {
        for (let i = 0; i < rows.length; i += BATCH) {
          const part = rows.slice(i, i + BATCH)
          const res = await api<{ items: ApiTaskBrief[] }>(`/v1/workspaces/${ws}/tasks/batch`, {
            method: 'POST',
            body: { tasks: part.map((r) => toTaskBody(r, 'create')) },
          })
          // las de la lista no traen la descripción: la que se mandó es la que quedó
          out.push(...res.items.map((x, n) => ({ ...toTaskRow(x), description: part[n]?.description ?? null })))
        }
      }
      return out
    },
    onSuccess: (tasks, _input, ctx) => {
      // la provisoria pasa a ser la de verdad (con su número y su id)
      const tmpId = ctx?.tmpId
      if (tmpId && tasks[0]) {
        const real = tasks[0]
        qc.setQueriesData<TaskRow[]>({ queryKey: taskKeys.all }, (old) => (Array.isArray(old) ? old.map((t) => (t.id === tmpId ? real : t)) : old))
        const queued = queuedPatches.get(tmpId)
        queuedPatches.delete(tmpId)
        if (queued?.length) {
          const patch = Object.assign({}, ...queued) as TaskPatch
          patchCaches(qc, real.id, patch as Partial<TaskRow>)
          void api<ApiTaskDetail>(`/v1/tasks/${real.id}`, { method: 'PATCH', body: toTaskBody(patch) })
            .then((d) => patchCaches(qc, d.id, toTaskRow(d)))
            .catch(onError)
        }
      }
      let refetch = false
      for (const [key, list] of qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })) {
        const scope = key[1] as CacheScope | undefined
        if (!Array.isArray(list) || !scope || typeof scope !== 'object') continue
        const fits = tasks.map((t) => matchesScope(scope, t))
        if (fits.includes(null)) refetch = true
        const additions = tasks.filter((t, i) => fits[i] && !list.some((x) => x.id === t.id))
        if (additions.length) qc.setQueryData(key, [...list, ...additions])
      }
      tasks.forEach((t) => qc.setQueryData(taskKeys.one(t.id), t))
      if (refetch) qc.invalidateQueries({ queryKey: taskKeys.all, predicate: (q) => (q.queryKey[1] as CacheScope | undefined)?.kind === 'scope' })
      qc.invalidateQueries({ queryKey: taskKeys.stats })
    },
    onError: (error, _input, ctx) => {
      const tmpId = ctx?.tmpId
      if (tmpId) {
        queuedPatches.delete(tmpId)
        qc.setQueriesData<TaskRow[]>({ queryKey: taskKeys.all }, (old) => (Array.isArray(old) ? old.filter((t) => t.id !== tmpId) : old))
      }
      onError(error)
    },
  })
}

/**
 * Eliminar con "Deshacer": la tarea desaparece al instante y el borrado real ocurre a los 5 s,
 * salvo que la persona se arrepienta desde el aviso.
 */
export function useDeleteTaskWithUndo() {
  const qc = useQueryClient()
  const t = useTranslations('tasks')
  const onError = useErrorToast()
  return (task: Pick<TaskRow, 'id'>, ref: string) => {
    const snapshot = qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })
    qc.setQueriesData<TaskRow[]>({ queryKey: taskKeys.all }, (old) => (Array.isArray(old) ? old.filter((x) => x.id !== task.id) : old))
    let undone = false
    const timer = window.setTimeout(async () => {
      if (undone) return
      try {
        await api(`/v1/tasks/${task.id}`, { method: 'DELETE' })
      } catch (error) {
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
        onError(error)
      }
      qc.invalidateQueries({ queryKey: taskKeys.all })
      qc.invalidateQueries({ queryKey: taskKeys.stats })
      // al borrar la tarea se borran sus adjuntos y comentarios: la bóveda y los contadores se ponen al día
      qc.invalidateQueries({ queryKey: ['attachments'] })
      qc.invalidateQueries({ queryKey: ['comments', task.id] })
    }, 5000)
    toast(t('deleted', { ref }), {
      duration: 5000,
      action: {
        label: t('undo'),
        onClick: () => {
          undone = true
          window.clearTimeout(timer)
          snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
        },
      },
    })
  }
}

/** Subtareas: vienen en el detalle de la tarea madre (también si se ve por el organigrama). */
export function useSubtasks(parentId: string | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: taskKeys.subtasks(parentId),
    enabled: Boolean(parentId),
    staleTime: 10_000,
    queryFn: async () => {
      const d = await api<ApiTaskDetail>(`/v1/tasks/${parentId}`)
      qc.setQueryData(taskKeys.one(d.id), toTaskRow(d))
      qc.setQueryData(taskKeys.origin(d.id), { doc: d.doc, meeting: d.meeting })
      return d.subtasks.map(toTaskRow)
    },
  })
}

/**
 * Cifras de un alcance (contadores de Pulso, salud y carga de Mesa, ritmo del Resumen), calculadas
 * por la API. "Hoy" y los días van en la zona del navegador, como las listas.
 */
export function useTaskStats(scopeId: string, opts: { ws?: string[]; from?: string; to?: string; enabled?: boolean } = {}) {
  const { account } = useApp()
  const ws = opts.ws?.length ? opts.ws.join(',') : undefined
  const tz = browserTimeZone()
  return useQuery({
    queryKey: [...taskKeys.stats, account.id, scopeId, ws ?? null, opts.from ?? null, opts.to ?? null, tz ?? null],
    enabled: opts.enabled ?? true,
    queryFn: () => api<ApiTaskStats>('/v1/tasks/stats', { query: { accountId: account.id, scope: scopeId, ws, from: opts.from, to: opts.to, tz } }),
  })
}

/** Etiquetas usadas en el espacio (las más usadas primero), para sugerirlas al editar. */
export function useWorkspaceLabels(workspaceId: string | null) {
  return useQuery({
    queryKey: ['task-labels', workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    queryFn: async () => (await api<{ items: { label: string; count: number }[] }>(`/v1/workspaces/${workspaceId}/labels`)).items.map((x) => x.label),
  })
}
