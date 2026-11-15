'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp } from '@/components/app/app-context'
import { api } from '@/lib/api/client'
import { toErrorCode } from '@/lib/errors'
import type { TaskPriority } from '@/lib/database.types'

/** Plantilla de tarea: lo que se copia al crear (las subtareas también). */
export type TaskTemplateData = { title: string; description: string; priority: TaskPriority; labels: string[]; subtasks: string[]; dueInDays: number | null }
/** Plantilla de agenda: los puntos de una reunión. */
export type AgendaTemplateData = { items: { text: string }[] }

export type Template<K extends 'task' | 'agenda' = 'task' | 'agenda'> = {
  id: string
  kind: K
  name: string
  workspaceId: string | null
  data: K extends 'task' ? TaskTemplateData : AgendaTemplateData
  createdBy: string | null
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

export const templateKeys = { list: (accountId: string, kind: string) => ['templates', accountId, kind] as const }

export function useTemplates<K extends 'task' | 'agenda'>(kind: K) {
  const { account } = useApp()
  return useQuery({
    queryKey: templateKeys.list(account.id, kind),
    staleTime: 60_000,
    queryFn: async () => (await api<{ items: Template<K>[] }>(`/v1/accounts/${account.id}/templates`, { query: { kind } })).items,
  })
}

export function useTemplateMutations() {
  const qc = useQueryClient()
  const { account } = useApp()
  const tErr = useTranslations('errors')
  const onError = (e: unknown) => toast.error(tErr(toErrorCode(e as { message?: string })))
  const refresh = () => qc.invalidateQueries({ queryKey: ['templates', account.id] })
  return {
    create: useMutation({
      mutationFn: (b: { kind: 'task' | 'agenda'; name: string; workspaceId: string | null; data: TaskTemplateData | AgendaTemplateData }) =>
        api<Template>(`/v1/accounts/${account.id}/templates`, { method: 'POST', body: b }),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: { name?: string; data?: TaskTemplateData | AgendaTemplateData } }) =>
        api<Template>(`/v1/templates/${id}`, { method: 'PATCH', body: patch }),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<{ ok: true }>(`/v1/templates/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
      onError,
    }),
  }
}
