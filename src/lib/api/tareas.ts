/**
 * Tareas en la API (veltro-backend): formas de las respuestas (camelCase) y adaptadores a las
 * filas de `database.types.ts` que ya usan las pantallas. Sin hooks: sirve al navegador y al servidor.
 */

import type { DocSource, Json, TaskCommentRow, TaskFieldDef, TaskPriority, TaskRow, TaskStatus, TaskStatusDef } from '@/lib/database.types'

// ---------------- respuestas ----------------

type ApiTaskBase = {
  id: string
  workspaceId: string
  number: number
  ref: string
  title: string
  descriptionText: string
  status: TaskStatus
  statusId: string | null
  priority: TaskPriority
  assigneeId: string | null
  assigneeIds: string[]
  dueDate: string | null
  startDate: string | null
  estimateHours: number | null
  custom: Record<string, string | number | null>
  labels: string[]
  position: number
  parentId: string | null
  docId: string | null
  docBlockId: string | null
  meetingId: string | null
  createdBy: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

/** En listas: sin el contenido de la descripción. */
export type ApiTaskBrief = ApiTaskBase & { subtasks?: { total: number; done: number }; attachments?: number; comments?: number }

/** Una tarea con lo que cuelga de ella (GET /v1/tasks/{id}, al crear y al editar). */
export type ApiTaskDetail = ApiTaskBase & {
  description: Json | null
  workspace: { id: string; slug: string; key: string; name: string; role: 'admin' | 'editor' | 'viewer'; observed: boolean; taskStatuses: TaskStatusDef[]; taskFields: TaskFieldDef[] }
  subtasks: ApiTaskBrief[]
  parent: { id: string; ref: string; title: string } | null
  meeting: { id: string; title: string; startsAt: string } | null
  doc: { id: string; title: string; source: DocSource } | null
  commentsCount: number
}

export type ApiPage<T> = { items: T[]; nextCursor: string | null }

export type ApiScopeKind = 'me' | 'team' | 'all' | 'dept' | 'person' | 'visible'
export type ApiScope = { id: string; kind: ApiScopeKind; name: string | null; userIds: string[] }

/** GET /v1/tasks: tareas por alcance (o `visible`: todo lo que veo, sin filtrar por responsable). */
export type ApiScopedTasks = ApiPage<ApiTaskBrief> & { scope: ApiScope }

export type ApiLoad = { atRisk: number; inProgress: number; rest: number }

/** GET /v1/tasks/stats: cifras de Pulso, Mesa y el Resumen, calculadas en el servidor. */
export type ApiTaskStats = {
  today: string
  tz: string
  from: string
  to: string
  scope: ApiScope
  counters: { overdue: number; today: number; inProgress: number; blocked: number; todo: number; done7d: number; open: number; unassigned: number }
  load: ApiLoad
  daily: { day: string; closed: number; created: number }[]
  upcoming: { day: string; due: number }[]
  workspaces: (ApiLoad & {
    id: string
    slug: string
    key: string
    name: string
    color: string
    icon: string
    observed: boolean
    open: number
    overdue: number
    blocked: number
    oldestOverdueDays: number
    health: 'ok' | 'attention' | 'risk'
    closed: number
    created: number
    closedByDay: Record<string, number>
  })[]
  people: (ApiLoad & { userId: string; fullName: string; avatarUrl: string | null; title: string | null; open: number; overdue: number; blocked: number; closed: number })[]
}

export type ApiTaskComment = {
  id: string
  taskId: string
  workspaceId: string
  userId: string
  body: string
  createdAt: string
  updatedAt: string
  author: { id: string; fullName: string; avatarUrl: string | null }
}

export type ApiWorkspaceMember = { id: string; email: string; fullName: string; avatarUrl: string | null; role: 'admin' | 'editor' | 'viewer'; viaAccount: boolean }

export type ApiTaskStatuses = { custom: boolean; items: { id: string | null; name: string; category: TaskStatus; tasks: number }[] }

export type ApiTaskFieldChange = { field: TaskFieldDef | null; fields: TaskFieldDef[]; updatedTasks: number }

// ---------------- a filas ----------------

/** Tarea de la API → fila de la web. Las de listas no traen la descripción (queda en null). */
export function toTaskRow(t: ApiTaskBase & { description?: Json | null }): TaskRow {
  return {
    id: t.id,
    workspace_id: t.workspaceId,
    number: t.number,
    title: t.title,
    description: t.description ?? null,
    description_text: t.descriptionText,
    status: t.status,
    status_id: t.statusId,
    priority: t.priority,
    assignee_ids: t.assigneeIds,
    assignee_id: t.assigneeId,
    due_date: t.dueDate,
    start_date: t.startDate,
    estimate_hours: t.estimateHours,
    custom: t.custom ?? {},
    labels: t.labels,
    position: t.position,
    parent_id: t.parentId,
    doc_id: t.docId,
    doc_block_id: t.docBlockId,
    meeting_id: t.meetingId,
    created_by: t.createdBy,
    completed_at: t.completedAt,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }
}

export function toTaskComment(c: ApiTaskComment): TaskCommentRow {
  return { id: c.id, task_id: c.taskId, workspace_id: c.workspaceId, user_id: c.userId, body: c.body, created_at: c.createdAt, updated_at: c.updatedAt }
}

// ---------------- a cuerpos ----------------

/** Lo que la web cambia o crea de una tarea, con los nombres de la fila. */
export type TaskPatch = Partial<Omit<TaskRow, 'id' | 'number' | 'created_by' | 'completed_at' | 'created_at' | 'updated_at'>>

const FIELDS: [keyof TaskPatch, string][] = [
  ['title', 'title'],
  ['status', 'status'],
  ['status_id', 'statusId'],
  ['priority', 'priority'],
  ['due_date', 'dueDate'],
  ['start_date', 'startDate'],
  ['labels', 'labels'],
  ['custom', 'custom'],
  ['parent_id', 'parentId'],
  ['doc_id', 'docId'],
  ['doc_block_id', 'docBlockId'],
  ['meeting_id', 'meetingId'],
  ['position', 'position'],
]

/**
 * Cuerpo para crear (POST) o editar (PATCH) una tarea. La categoría sale del estado propio si
 * viene; con varios responsables manda la lista (el primero es assigneeId). El espacio va en la ruta.
 */
export function toTaskBody(patch: TaskPatch, mode: 'create' | 'update' = 'update'): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [from, to] of FIELDS) if (patch[from] !== undefined) body[to] = patch[from]
  if (typeof body.title === 'string') body.title = body.title.trim().slice(0, 500)
  // al crear, sin estado propio elige la API (el primero de la categoría, como al soltar en el tablero)
  if (mode === 'create' && body.statusId === null) delete body.statusId
  if (patch.assignee_ids !== undefined) body.assigneeIds = patch.assignee_ids
  else if (patch.assignee_id !== undefined) body.assigneeIds = patch.assignee_id ? [patch.assignee_id] : []
  // la API pide múltiplos de 15 minutos
  if (patch.estimate_hours !== undefined) body.estimateHours = patch.estimate_hours == null ? null : Math.round(patch.estimate_hours * 4) / 4
  // los bloques mandan; el texto plano lo calcula la API
  if (patch.description !== undefined) body.description = patch.description
  else if (patch.description_text !== undefined) body.descriptionText = patch.description_text
  return body
}

// ---------------- páginas ----------------

/** Lo más que se trae de una lista (el mismo tope de antes). */
export const TASKS_MAX = 2000

/** Recorre las páginas de una lista (cursor opaco) hasta el final o hasta `max`. */
export async function allPages<T>(page: (cursor: string | undefined) => Promise<ApiPage<T>>, max = TASKS_MAX): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  do {
    const res = await page(cursor)
    out.push(...res.items)
    cursor = res.nextCursor ?? undefined
  } while (cursor && out.length < max)
  return out.slice(0, max)
}

/** Zona horaria del navegador: "hoy" y los días de las cifras son los mismos que muestran las listas. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}
