'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Database, TaskRow } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'

export type TaskScope =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'assignee'; userId: string; workspaceIds: string[] }
  | { kind: 'doc'; docId: string }
  | { kind: 'meeting'; meetingId: string }
  | { kind: 'workspaces'; workspaceIds: string[] }

export const taskKeys = {
  all: ['tasks'] as const,
  scope: (scope: TaskScope) => ['tasks', scope] as const,
  one: (id: string) => ['task', id] as const,
}

const TASK_COLUMNS = '*'

export function useTasks(scope: TaskScope | null, initialData?: TaskRow[]) {
  return useQuery({
    queryKey: scope ? taskKeys.scope(scope) : ['tasks', 'none'],
    enabled: Boolean(scope),
    initialData,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase.from('tasks').select(TASK_COLUMNS).is('parent_id', null)
      if (scope!.kind === 'workspace') q = q.eq('workspace_id', scope!.workspaceId)
      if (scope!.kind === 'assignee') q = q.eq('assignee_id', scope!.userId).in('workspace_id', scope!.workspaceIds)
      if (scope!.kind === 'doc') q = q.eq('doc_id', scope!.docId)
      if (scope!.kind === 'meeting') q = q.eq('meeting_id', scope!.meetingId)
      if (scope!.kind === 'workspaces') q = q.in('workspace_id', scope!.workspaceIds)
      const { data, error } = await q.order('position').limit(2000)
      if (error) throw error
      return data as TaskRow[]
    },
  })
}

export function useTask(id: string | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: id ? taskKeys.one(id) : ['task', 'none'],
    enabled: Boolean(id),
    initialData: () => (id ? findCachedTask(qc, id) : undefined),
    queryFn: async () => {
      const { data, error } = await createClient().from('tasks').select(TASK_COLUMNS).eq('id', id!).single()
      if (error) throw error
      return data as TaskRow
    },
  })
}

function matchesScope(scope: TaskScope | { kind: 'parent'; parentId: string }, t: TaskRow) {
  switch (scope.kind) {
    case 'workspace':
      return t.workspace_id === scope.workspaceId && !t.parent_id
    case 'assignee':
      return t.assignee_id === scope.userId && scope.workspaceIds.includes(t.workspace_id) && !t.parent_id
    case 'doc':
      return t.doc_id === scope.docId && !t.parent_id
    case 'meeting':
      return t.meeting_id === scope.meetingId && !t.parent_id
    case 'workspaces':
      return scope.workspaceIds.includes(t.workspace_id) && !t.parent_id
    case 'parent':
      return t.parent_id === scope.parentId
  }
}

function findCachedTask(qc: QueryClient, id: string) {
  for (const [, list] of qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })) {
    const hit = list?.find((t) => t.id === id)
    if (hit) return hit
  }
  return undefined
}

function patchCaches(qc: QueryClient, id: string, patch: Partial<TaskRow>) {
  qc.setQueriesData<TaskRow[]>({ queryKey: taskKeys.all }, (old) =>
    old?.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  )
  qc.setQueryData<TaskRow>(taskKeys.one(id), (old) => (old ? { ...old, ...patch } : old))
}

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

export function useUpdateTask() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database['public']['Tables']['tasks']['Update'] }) => {
      const { data, error } = await createClient().from('tasks').update(patch).eq('id', id).select(TASK_COLUMNS).single()
      if (error) throw error
      return data as TaskRow
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      const snapshot = qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })
      const single = qc.getQueryData<TaskRow>(taskKeys.one(id))
      const optimistic: Partial<TaskRow> = { ...(patch as Partial<TaskRow>) }
      if (patch.status === 'done') optimistic.completed_at = new Date().toISOString()
      else if (patch.status) optimistic.completed_at = null
      patchCaches(qc, id, optimistic)
      return { snapshot, single }
    },
    onError: (error, { id }, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      if (ctx?.single) qc.setQueryData(taskKeys.one(id), ctx.single)
      onError(error)
    },
    onSuccess: (task) => {
      patchCaches(qc, task.id, task)
    },
    onSettled: (_d, _e, { patch }) => {
      // Cambios que mueven la tarea entre listas: refrescar todas
      if ('assignee_id' in patch || 'workspace_id' in patch || 'doc_id' in patch || 'meeting_id' in patch) {
        qc.invalidateQueries({ queryKey: taskKeys.all })
      }
    },
  })
}

export type NewTask = Database['public']['Tables']['tasks']['Insert']

export function useCreateTask() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async (input: NewTask | NewTask[]) => {
      const rows = Array.isArray(input) ? input : [input]
      const { data, error } = await createClient().from('tasks').insert(rows).select(TASK_COLUMNS)
      if (error) throw error
      return data as TaskRow[]
    },
    onSuccess: (tasks) => {
      for (const [key, list] of qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })) {
        const scope = key[1] as TaskScope | { kind: 'parent'; parentId: string } | undefined
        if (!list || !scope || typeof scope !== 'object') continue
        const additions = tasks.filter((t) => matchesScope(scope, t) && !list.some((x) => x.id === t.id))
        if (additions.length) qc.setQueryData(key, [...list, ...additions])
      }
      tasks.forEach((t) => qc.setQueryData(taskKeys.one(t.id), t))
    },
    onError,
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from('tasks').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      const snapshot = qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.all })
      qc.setQueriesData<TaskRow[]>({ queryKey: taskKeys.all }, (old) => old?.filter((t) => t.id !== id))
      return { snapshot }
    },
    onError: (error, _id, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      onError(error)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
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
    qc.setQueriesData<TaskRow[]>({ queryKey: taskKeys.all }, (old) => old?.filter((x) => x.id !== task.id))
    let undone = false
    const timer = window.setTimeout(async () => {
      if (undone) return
      const { error } = await createClient().from('tasks').delete().eq('id', task.id)
      if (error) {
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
        onError(error)
      }
      qc.invalidateQueries({ queryKey: taskKeys.all })
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

export function useSubtasks(parentId: string | null) {
  return useQuery({
    queryKey: ['tasks', { kind: 'parent', parentId }],
    enabled: Boolean(parentId),
    queryFn: async () => {
      const { data, error } = await createClient().from('tasks').select(TASK_COLUMNS).eq('parent_id', parentId!).order('position')
      if (error) throw error
      return data as TaskRow[]
    },
  })
}
