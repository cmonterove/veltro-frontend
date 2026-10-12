'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useWorkspaceMap } from '@/components/app/app-context'
import { findCachedTask, taskKeys } from '@/lib/queries/tasks'
import { taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'

/** Marca de "llegué a la tarea desde la app": con ella, Volver regresa a donde estabas. */
export const TASK_BACK_KEY = 'veltro:task-back'

/** Caché de "TV-3 → id": quien ya conoce la tarea lo deja escrito y la página no vuelve a preguntar. */
export const taskRefKey = (workspaceId: string, number: number) => ['task-ref', workspaceId, number] as const

/** Página de una tarea: /tasks/TV-3 (la misma referencia que se ve en las listas). */
export function taskPath(key: string, number: number) {
  return `/tasks/${taskRef(key, number)}`
}

/**
 * Abrir una tarea en su página. Si la tarea está en caché se va directo a /tasks/TV-3; si no,
 * a /tasks/<id> y la página corrige la URL al cargarla.
 */
export function useOpenTask() {
  const router = useRouter()
  const qc = useQueryClient()
  const wsMap = useWorkspaceMap()
  const open = useCallback(
    (id: string) => {
      const task = qc.getQueryData<TaskRow>(taskKeys.one(id)) ?? findCachedTask(qc, id)
      const ws = task ? wsMap.get(task.workspace_id) : undefined
      try {
        // se guarda qué tarea se abrió: un enlace directo a otra tarea no hereda el "Volver"
        sessionStorage.setItem(TASK_BACK_KEY, id)
      } catch {
        // sin sessionStorage, Volver lleva a las tareas del espacio
      }
      if (task && ws) {
        qc.setQueryData(taskRefKey(ws.id, task.number), task.id)
        qc.setQueryData(taskKeys.one(task.id), task)
        router.push(taskPath(ws.key, task.number))
      } else router.push(`/tasks/${id}`)
    },
    [qc, router, wsMap],
  )
  return { open }
}
