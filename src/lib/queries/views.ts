'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp } from '@/components/app/app-context'
import { api } from '@/lib/api/client'
import { toErrorCode } from '@/lib/errors'

/** Una forma de mirar Tareas con nombre: la URL (alcance, filtros, pestaña) y la agrupación. */
export type SavedView = {
  id: string
  page: 'tasks'
  name: string
  query: string
  groupBy: string | null
  shared: boolean
  position: number
  owner: { id: string; fullName: string; avatarUrl: string | null }
  mine: boolean
  createdAt: string
  updatedAt: string
}

export const viewKeys = { list: (accountId: string) => ['saved-views', accountId] as const }

export function useSavedViews() {
  const { account } = useApp()
  return useQuery({
    queryKey: viewKeys.list(account.id),
    staleTime: 60_000,
    queryFn: async () => (await api<{ items: SavedView[] }>(`/v1/accounts/${account.id}/views`, { query: { page: 'tasks' } })).items,
  })
}

export type ViewInput = { name: string; query: string; groupBy: string | null; shared: boolean }

export function useSavedViewMutations() {
  const qc = useQueryClient()
  const { account } = useApp()
  const tErr = useTranslations('errors')
  const onError = (e: unknown) => toast.error(tErr(toErrorCode(e as { message?: string })))
  const refresh = () => qc.invalidateQueries({ queryKey: viewKeys.list(account.id) })
  return {
    create: useMutation({
      mutationFn: (b: ViewInput) => api<SavedView>(`/v1/accounts/${account.id}/views`, { method: 'POST', body: { ...b, page: 'tasks' } }),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<ViewInput> }) => api<SavedView>(`/v1/views/${id}`, { method: 'PATCH', body: patch }),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<{ ok: true }>(`/v1/views/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
      onError,
    }),
  }
}

/** La URL de una vista, ordenada (dos URLs con los mismos filtros en otro orden son la misma vista). */
export function normalizeViewQuery(q: string) {
  const p = new URLSearchParams(q.replace(/^\?/, ''))
  return [...p.entries()]
    .filter(([, v]) => v !== '')
    .sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}
