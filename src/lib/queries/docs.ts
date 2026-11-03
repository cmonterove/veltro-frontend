'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api/client'
import {
  allPages,
  docCreateBody,
  docPatchBody,
  toDocRow,
  toDocSummary,
  type ApiDoc,
  type ApiDocInList,
  type ApiPage,
  type DocCreate,
  type DocPatch,
} from '@/lib/api/docs-reuniones'
import type { DocRow } from '@/lib/database.types'
import type { DocSummary } from '@/lib/types'
import { toErrorCode } from '@/lib/errors'

export const docKeys = {
  all: ['docs'] as const,
  workspace: (workspaceId: string) => ['docs', 'workspace', workspaceId] as const,
  recent: (workspaceIds: string[]) => ['docs', 'recent', workspaceIds] as const,
  one: (id: string) => ['doc', id] as const,
}

type ListQuery = { sort: 'updated' | 'position'; limit?: number }

/** Docs vivos de un espacio (sin contenido): todas las páginas, o solo los primeros `limit`. */
async function listDocs(workspaceId: string, q: ListQuery) {
  const page = (cursor?: string) =>
    api<ApiPage<ApiDocInList>>(`/v1/workspaces/${workspaceId}/docs`, { query: { sort: q.sort, limit: Math.min(q.limit ?? 200, 200), cursor } })
  const rows = q.limit ? (await page()).items : await allPages(page)
  return rows.map(toDocSummary)
}

const byUpdated = (a: DocSummary, b: DocSummary) => b.updated_at.localeCompare(a.updated_at)

export function useWorkspaceDocs(workspaceId: string | null, initialData?: DocSummary[]) {
  return useQuery({
    queryKey: workspaceId ? docKeys.workspace(workspaceId) : ['docs', 'none'],
    enabled: Boolean(workspaceId),
    initialData,
    queryFn: () => listDocs(workspaceId!, { sort: 'position' }),
  })
}

export function useRecentDocs(workspaceIds: string[], limit = 8) {
  return useQuery({
    queryKey: [...docKeys.recent(workspaceIds), limit],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      // los últimos de cada espacio y, juntos, los más recientes
      const lists = await Promise.all(workspaceIds.map((id) => listDocs(id, { sort: 'updated', limit })))
      return lists.flat().sort(byUpdated).slice(0, limit)
    },
  })
}

/** Todos los documentos (no archivados) de varios espacios, el último editado primero. */
export function useDocsIn(workspaceIds: string[]) {
  return useQuery({
    queryKey: ['docs', 'in', workspaceIds],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(workspaceIds.map((id) => listDocs(id, { sort: 'updated' })))
      return lists.flat().sort(byUpdated)
    },
  })
}

export function useDoc(id: string, initialData?: DocRow) {
  return useQuery({
    queryKey: docKeys.one(id),
    initialData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => toDocRow(await api<ApiDoc>(`/v1/docs/${id}`)),
  })
}

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

export function useCreateDoc() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn: async (input: DocCreate) =>
      toDocRow(await api<ApiDoc>(`/v1/workspaces/${input.workspace_id}/docs`, { method: 'POST', body: docCreateBody(input) })),
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
    mutationFn: async ({ id, patch }: { id: string; patch: DocPatch }) =>
      toDocSummary(await api<ApiDoc>(`/v1/docs/${id}`, { method: 'PATCH', body: docPatchBody(patch) })),
    onSuccess: (summary, { id, patch }) => {
      qc.setQueryData<DocRow>(docKeys.one(id), (old) => (old ? ({ ...old, ...patch, updated_at: summary.updated_at } as DocRow) : old))
      // todas las listas (espacio, Escritos de la bóveda, recientes de Pulso, tarjetas de chat)
      qc.setQueriesData<DocSummary[]>({ queryKey: docKeys.all }, (old) => (Array.isArray(old) ? old.map((d) => (d.id === id ? summary : d)) : old))
    },
  })
}

/** El doc y sus descendientes según las listas en caché (para sacarlos al instante). */
function withDescendants(qc: QueryClient, id: string) {
  const parentOf = new Map<string, string | null>()
  for (const [, list] of qc.getQueriesData<DocSummary[]>({ queryKey: docKeys.all })) {
    if (Array.isArray(list)) for (const d of list) parentOf.set(d.id, d.parent_id)
  }
  const ids = [id]
  for (let i = 0; i < ids.length; i++) for (const [docId, parent] of parentOf) if (parent === ids[i] && !ids.includes(docId)) ids.push(docId)
  return ids
}

export function useArchiveDoc() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    // la API archiva también sus subpáginas (y las de ellas)
    mutationFn: async (id: string) => {
      await api<{ affected: number }>(`/v1/docs/${id}/archive`, { method: 'POST' })
      return withDescendants(qc, id)
    },
    onSuccess: (ids) => {
      qc.setQueriesData<DocSummary[]>({ queryKey: docKeys.all }, (old) => (Array.isArray(old) ? old.filter((d) => !ids.includes(d.id)) : old))
      qc.invalidateQueries({ queryKey: docKeys.all })
    },
    onError,
  })
}
