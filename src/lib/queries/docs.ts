'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Database, DocRow } from '@/lib/database.types'
import type { DocSummary } from '@/lib/types'
import { toErrorCode } from '@/lib/errors'

import { DOC_SUMMARY_COLUMNS } from './doc-columns'

export { DOC_SUMMARY_COLUMNS }

export const docKeys = {
  all: ['docs'] as const,
  workspace: (workspaceId: string) => ['docs', 'workspace', workspaceId] as const,
  recent: (workspaceIds: string[]) => ['docs', 'recent', workspaceIds] as const,
  one: (id: string) => ['doc', id] as const,
}

export function useWorkspaceDocs(workspaceId: string | null, initialData?: DocSummary[]) {
  return useQuery({
    queryKey: workspaceId ? docKeys.workspace(workspaceId) : ['docs', 'none'],
    enabled: Boolean(workspaceId),
    initialData,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('docs')
        .select(DOC_SUMMARY_COLUMNS)
        .eq('workspace_id', workspaceId!)
        .is('archived_at', null)
        .order('position')
      if (error) throw error
      return data as DocSummary[]
    },
  })
}

export function useRecentDocs(workspaceIds: string[], limit = 8) {
  return useQuery({
    queryKey: [...docKeys.recent(workspaceIds), limit],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('docs')
        .select(DOC_SUMMARY_COLUMNS)
        .in('workspace_id', workspaceIds)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as DocSummary[]
    },
  })
}

export function useDoc(id: string, initialData?: DocRow) {
  return useQuery({
    queryKey: docKeys.one(id),
    initialData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await createClient().from('docs').select('*').eq('id', id).single()
      if (error) throw error
      return data as DocRow
    },
  })
}

type DocInsert = Database['public']['Tables']['docs']['Insert']
type DocUpdate = Database['public']['Tables']['docs']['Update']

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

export function useCreateDoc() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async (input: DocInsert) => {
      const { data, error } = await createClient().from('docs').insert(input).select('*').single()
      if (error) throw error
      return data as DocRow
    },
    onSuccess: (doc) => {
      qc.setQueryData(docKeys.one(doc.id), doc)
      qc.setQueryData<DocSummary[]>(docKeys.workspace(doc.workspace_id), (old) => (old ? [...old, doc] : old))
      qc.invalidateQueries({ queryKey: docKeys.all })
    },
    onError,
  })
}

/** Guardado del contenido: sin invalidar listas (se llama en autosave). */
export function useSaveDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DocUpdate }) => {
      const { data, error } = await createClient()
        .from('docs')
        .update(patch)
        .eq('id', id)
        .select(DOC_SUMMARY_COLUMNS)
        .single()
      if (error) throw error
      return data as DocSummary
    },
    onSuccess: (summary, { id, patch }) => {
      qc.setQueryData<DocRow>(docKeys.one(id), (old) => (old ? { ...old, ...patch, updated_at: summary.updated_at } as DocRow : old))
      qc.setQueryData<DocSummary[]>(docKeys.workspace(summary.workspace_id), (old) =>
        old?.map((d) => (d.id === id ? summary : d)),
      )
    },
  })
}

export function useUpdateDocMeta() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DocUpdate }) => {
      const { data, error } = await createClient().from('docs').update(patch).eq('id', id).select(DOC_SUMMARY_COLUMNS).single()
      if (error) throw error
      return data as DocSummary
    },
    onMutate: ({ id, patch }) => {
      qc.setQueryData<DocRow>(docKeys.one(id), (old) => (old ? ({ ...old, ...patch } as DocRow) : old))
      qc.setQueriesData<DocSummary[]>({ queryKey: docKeys.all }, (old) =>
        old?.map((d) => (d.id === id ? ({ ...d, ...patch } as DocSummary) : d)),
      )
    },
    onError,
    onSettled: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  })
}

export function useArchiveDoc() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient().from('docs').update({ archived_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      qc.setQueriesData<DocSummary[]>({ queryKey: docKeys.all }, (old) => old?.filter((d) => d.id !== id && d.parent_id !== id))
      qc.invalidateQueries({ queryKey: docKeys.all })
    },
    onError,
  })
}
