'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TaskCommentRow } from '@/lib/database.types'

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ['comments', taskId],
    enabled: Boolean(taskId),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId!)
        .order('created_at')
      if (error) throw error
      return data as TaskCommentRow[]
    },
  })
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await createClient()
        .from('task_comments')
        .insert({ task_id: taskId, body })
        .select('*')
        .single()
      if (error) throw error
      return data as TaskCommentRow
    },
    onSuccess: (c) => qc.setQueryData<TaskCommentRow[]>(['comments', taskId], (old) => [...(old ?? []), c]),
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from('task_comments').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => qc.setQueryData<TaskCommentRow[]>(['comments', taskId], (old) => old?.filter((c) => c.id !== id)),
  })
}
