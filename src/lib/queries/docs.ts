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

/** Todos los documentos (no archivados) de varios espacios, el último editado primero. */
export function useDocsIn(workspaceIds: string[]) {
  return useQuery({
    queryKey: ['docs', 'in', workspaceIds],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from('docs')
        .select(DOC_SUMMARY_COLUMNS)
        .in('workspace_id', workspaceIds)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
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
      // todas las listas (espacio, Escritos de la bóveda, recientes de Pulso, tarjetas de chat)
      qc.setQueriesData<DocSummary[]>({ queryKey: docKeys.all }, (old) => (Array.isArray(old) ? old.map((d) => (d.id === id ? summary : d)) : old))
    },
  })
}

export function useArchiveDoc() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    // con sus subpáginas (y las de ellas): si no, quedaban vivas y sueltas
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data: doc } = await supabase.from('docs').select('workspace_id').eq('id', id).single()
      const { data: all } = doc ? await supabase.from('docs').select('id, parent_id').eq('workspace_id', doc.workspace_id).is('archived_at', null) : { data: [] }
      const ids = [id]
      for (let i = 0; i < ids.length; i++) for (const d of (all ?? []) as { id: string; parent_id: string | null }[]) if (d.parent_id === ids[i]) ids.push(d.id)
      const { error } = await supabase.from('docs').update({ archived_at: new Date().toISOString() }).in('id', ids)
      if (error) throw error
      return ids
    },
    onSuccess: (ids) => {
      qc.setQueriesData<DocSummary[]>({ queryKey: docKeys.all }, (old) => (Array.isArray(old) ? old.filter((d) => !ids.includes(d.id)) : old))
      qc.invalidateQueries({ queryKey: docKeys.all })
    },
    onError,
  })
}
