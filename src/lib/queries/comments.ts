'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { api } from '@/lib/api/client'
import { allPages, toTaskComment, type ApiPage, type ApiTaskComment } from '@/lib/api/tareas'
import type { TaskCommentRow } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ['comments', taskId],
    enabled: Boolean(taskId),
    queryFn: async () => {
      // del más antiguo al más nuevo, como antes
      const items = await allPages((cursor) => api<ApiPage<ApiTaskComment>>(`/v1/tasks/${taskId}/comments`, { query: { limit: 200, cursor } }))
      return items.map(toTaskComment)
    },
  })
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async (body: string) => toTaskComment(await api<ApiTaskComment>(`/v1/tasks/${taskId}/comments`, { method: 'POST', body: { body } })),
    onSuccess: (c) => qc.setQueryData<TaskCommentRow[]>(['comments', taskId], (old) => [...(old ?? []), c]),
    onError,
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async (id: string) => {
      await api(`/v1/comments/${id}`, { method: 'DELETE' })
      return id
    },
    onSuccess: (id) => qc.setQueryData<TaskCommentRow[]>(['comments', taskId], (old) => old?.filter((c) => c.id !== id)),
    onError,
  })
}
