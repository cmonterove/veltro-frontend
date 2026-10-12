// Estados de tareas: cada espacio puede definir los suyos; cada uno cae en una categoría fija
// (backlog, todo, in_progress, blocked, done) que es la que usa la lógica de la app.

import { TASK_STATUSES } from './constants'
import type { TaskRow, TaskStatus, TaskStatusDef, WorkspaceRow } from './database.types'

/** Una opción de estado: propia del espacio (id) o estándar (id null, nombre traducido por categoría). */
export type StatusOption = { id: string | null; name: string | null; category: TaskStatus }

export function workspaceStatuses(ws?: Pick<WorkspaceRow, 'task_statuses'> | null): StatusOption[] {
  const list = ws?.task_statuses ?? []
  if (list.length) return list.map((s) => ({ id: s.id, name: s.name, category: s.category }))
  return TASK_STATUSES.map((c) => ({ id: null, name: null, category: c }))
}

/** Estado actual de una tarea dentro de su espacio (si el propio ya no existe, cae a la categoría). */
export function taskStatusOf(task: Pick<TaskRow, 'status' | 'status_id'>, ws?: Pick<WorkspaceRow, 'task_statuses'> | null): StatusOption {
  const own = task.status_id ? ws?.task_statuses?.find((s) => s.id === task.status_id) : undefined
  return own ? { id: own.id, name: own.name, category: own.category } : { id: null, name: null, category: task.status }
}

/** Clave estable para menús y columnas: el id propio o la categoría. */
export const statusKey = (o: StatusOption) => o.id ?? o.category

/** Patch para guardar una opción en una tarea. */
export const statusPatch = (o: StatusOption) => ({ status: o.category, status_id: o.id })

/** Estados estándar como definiciones editables (punto de partida al personalizar un espacio). */
export function defaultStatusDefs(names: Record<TaskStatus, string>): TaskStatusDef[] {
  return TASK_STATUSES.map((c) => ({ id: `s_${c}`, name: names[c], category: c }))
}
