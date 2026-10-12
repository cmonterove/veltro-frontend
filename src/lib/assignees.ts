import type { TaskRow } from './database.types'

/** Responsables de una tarea. Tolera filas viejas o a medio crear que solo traen assignee_id. */
export function assigneesOf(task: Pick<TaskRow, 'assignee_id'> & { assignee_ids?: string[] | null }): string[] {
  if (Array.isArray(task.assignee_ids)) return task.assignee_ids
  return task.assignee_id ? [task.assignee_id] : []
}

/** ¿La tarea es (también) de alguna de estas personas? */
export function isAssignedTo(task: Parameters<typeof assigneesOf>[0], people: string | Set<string>) {
  const ids = assigneesOf(task)
  return typeof people === 'string' ? ids.includes(people) : ids.some((id) => people.has(id))
}

/** Patch para cambiar responsables: la lista y el primero, para que el caché quede igual que la base. */
export const assigneesPatch = (ids: string[]) => ({ assignee_ids: ids, assignee_id: ids[0] ?? null })
