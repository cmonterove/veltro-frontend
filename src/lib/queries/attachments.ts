'use client'

import { useMemo } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import type { AttachmentRow } from '@/lib/database.types'
import { api, ApiError, uploadSigned } from '@/lib/api/client'
import {
  fetchAll,
  isInlineType,
  toAttachment,
  toAttachmentPatch,
  uploadMimeOf,
  type ApiAttachment,
  type ApiSignedUpload,
  type ApiVaultSummary,
  type AttachmentPatch,
  type Page,
} from '@/lib/api/pasillo-boveda'
import { toErrorCode } from '@/lib/errors'
import { track } from '@/lib/telemetry'
import { useApp } from '@/components/app/app-context'

/**
 * Adjuntos y Bóveda por la API. Lo de la cuenta (bóveda, sueltos, chats) va por
 * /v1/accounts/{id}/attachments; lo de un espacio, por /v1/workspaces/{id}/attachments. Subir es en
 * dos pasos: URL firmada, el archivo directo al almacenamiento y registrarlo en la API.
 */

export type AttachmentScope =
  | { kind: 'task'; taskId: string }
  | { kind: 'meeting'; meetingId: string }
  | { kind: 'doc'; docId: string }
  | { kind: 'workspace'; workspaceId: string }

/** Dónde cuelga lo que se sube. Sin nada, queda suelto en la bóveda de la cuenta. */
export type AttachmentParent = {
  workspaceId?: string | null
  taskId?: string | null
  meetingId?: string | null
  docId?: string | null
  /** subido en un chat: queda privado para sus miembros (y suelto, sin vínculos) */
  chatId?: string | null
  title?: string | null
  labels?: string[]
}

/** Filtros de la bóveda (los mismos de la pantalla; los resuelve el servidor). */
export type VaultQuery = { q?: string; category?: string[]; workspaceId?: string[]; linkedTo?: string[]; label?: string[]; uploadedBy?: string[] }

export const attachmentKeys = {
  all: ['attachments'] as const,
  scope: (scope: AttachmentScope) => ['attachments', 'scope', scope] as const,
  vault: (accountId: string) => ['attachments', 'vault', accountId] as const,
  vaultPage: (accountId: string, f: VaultQuery) => ['attachments', 'vault-page', accountId, f] as const,
  summary: (accountId: string, f: VaultQuery) => ['attachments', 'summary', accountId, f] as const,
  one: (id: string) => ['attachments', 'one', id] as const,
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024

const vaultParams = (f: VaultQuery) => ({
  q: f.q?.trim() || undefined,
  category: f.category?.length ? f.category.join(',') : undefined,
  workspaceId: f.workspaceId?.length ? f.workspaceId.join(',') : undefined,
  linkedTo: f.linkedTo?.length ? f.linkedTo.join(',') : undefined,
  // las etiquetas pueden tener comas: un parámetro por etiqueta
  label: f.label?.length ? f.label : undefined,
  uploadedBy: f.uploadedBy?.length ? f.uploadedBy.join(',') : undefined,
})

/**
 * Los archivos y links de la cuenta, del más nuevo al más viejo (hasta 1000): para buscadores y
 * tarjetas (paleta, asistente, compartir en un chat). La pantalla de la bóveda pagina con `useVaultPage`.
 */
export function useVaultFiles(enabled = true) {
  const { account } = useApp()
  return useQuery({
    queryKey: attachmentKeys.vault(account.id),
    enabled,
    queryFn: async () => (await fetchAll<ApiAttachment>(`/v1/accounts/${account.id}/attachments`)).map(toAttachment),
  })
}

const VAULT_PAGE = 60

/** La bóveda con filtros del servidor, de a 60 (`fetchNextPage` trae más). */
export function useVaultPage(filters: VaultQuery) {
  const { account } = useApp()
  return useInfiniteQuery({
    queryKey: attachmentKeys.vaultPage(account.id, filters),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const page = await api<Page<ApiAttachment>>(`/v1/accounts/${account.id}/attachments`, { query: { ...vaultParams(filters), limit: VAULT_PAGE, cursor: pageParam } })
      return { items: page.items.map(toAttachment), nextCursor: page.nextCursor }
    },
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (prev) => prev,
  })
}

/** Totales de la bóveda y, por cada filtro, sus opciones con cuántos quedarían (aplicando los demás). */
export function useVaultSummary(filters: VaultQuery = {}, enabled = true) {
  const { account } = useApp()
  return useQuery({
    queryKey: attachmentKeys.summary(account.id, filters),
    enabled,
    queryFn: () => api<ApiVaultSummary>(`/v1/accounts/${account.id}/attachments/summary`, { query: vaultParams(filters) }),
    placeholderData: (prev) => prev,
  })
}

/** Busca un adjunto en lo que ya está en caché (listas de la bóveda o de un vínculo). */
function cachedAttachment(qc: QueryClient, id: string) {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: attachmentKeys.all })) {
    const hit = rowsOf(data).find((a) => a.id === id)
    if (hit) return hit
  }
  return undefined
}

/** Un adjunto (para la tarjeta de un chat o el que se abre en la bóveda). null si no existe o no se ve. */
export function useAttachment(id: string | null | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: attachmentKeys.one(id ?? 'none'),
    enabled: Boolean(id),
    placeholderData: () => (id ? cachedAttachment(qc, id) : undefined),
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 403)) && n < 1,
    queryFn: async () => {
      try {
        return toAttachment(await api<ApiAttachment>(`/v1/attachments/${id}`))
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null
        throw e
      }
    },
  })
}

/** Lo de un espacio, una tarea, una reunión o un doc. */
export function useAttachments(scope: AttachmentScope | null) {
  const { account } = useApp()
  return useQuery({
    queryKey: scope ? attachmentKeys.scope(scope) : ['attachments', 'none'],
    enabled: Boolean(scope),
    queryFn: async () => {
      const s = scope!
      const rows =
        s.kind === 'workspace'
          ? await fetchAll<ApiAttachment>(`/v1/workspaces/${s.workspaceId}/attachments`)
          : await fetchAll<ApiAttachment>(`/v1/accounts/${account.id}/attachments`, s.kind === 'task' ? { taskId: s.taskId } : s.kind === 'meeting' ? { meetingId: s.meetingId } : { docId: s.docId })
      return rows.map(toAttachment)
    },
  })
}

/** Cantidad de adjuntos por tarea en un espacio (para mostrar el clip en listas). */
export function useAttachmentCounts(workspaceId: string | null) {
  const { data } = useAttachments(workspaceId ? { kind: 'workspace', workspaceId } : null)
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const a of data ?? []) if (a.task_id) m.set(a.task_id, (m.get(a.task_id) ?? 0) + 1)
    return m
  }, [data])
}

// ---------- caché ----------

type Cached = AttachmentRow[] | InfiniteData<{ items: AttachmentRow[]; nextCursor: string | null }> | AttachmentRow | null | undefined

function rowsOf(data: unknown): AttachmentRow[] {
  if (!data) return []
  if (Array.isArray(data)) return data as AttachmentRow[]
  if (typeof data === 'object' && 'pages' in data) return (data as InfiniteData<{ items: AttachmentRow[] }>).pages.flatMap((p) => p.items)
  if (typeof data === 'object' && 'id' in data && 'kind' in data) return [data as AttachmentRow]
  return []
}

/** Aplica un cambio a un adjunto en todas las listas en caché (null = quitarlo). Los resúmenes se dejan. */
function patchCached(qc: QueryClient, id: string, fn: (a: AttachmentRow) => AttachmentRow | null) {
  qc.setQueriesData<Cached>({ queryKey: attachmentKeys.all }, (old) => {
    if (!old) return old
    if (Array.isArray(old)) return old.flatMap((a) => (a.id === id ? (fn(a) ?? []) : [a]))
    if ('pages' in old) return { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.flatMap((a) => (a.id === id ? (fn(a) ?? []) : [a])) })) }
    if ('kind' in old && old.id === id) return fn(old)
    return old
  })
}

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

/** Lo que va en el paso 2 (registrar), según la ruta: la del espacio no lleva espacio ni chat. */
function destination(parent: AttachmentParent, inWorkspace: boolean) {
  return {
    ...(inWorkspace ? {} : { workspaceId: parent.workspaceId ?? null, chatId: parent.chatId ?? null }),
    taskId: parent.taskId ?? null,
    meetingId: parent.meetingId ?? null,
    docId: parent.docId ?? null,
    labels: parent.labels ?? [],
  }
}

export function useAttachmentMutations() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  const t = useTranslations('attachments')
  const { account } = useApp()
  const refresh = () => qc.invalidateQueries({ queryKey: attachmentKeys.all })
  // con espacio (y sin chat) se sube a la carpeta del espacio; si no, a la de la cuenta
  const baseOf = (parent: AttachmentParent) => (parent.workspaceId && !parent.chatId ? `/v1/workspaces/${parent.workspaceId}` : `/v1/accounts/${account.id}`)

  const upload = useMutation({
    /** `titles`: un título por archivo, en el mismo orden (si no, el de `parent`) */
    mutationFn: async ({ parent, files, titles }: { parent: AttachmentParent; files: File[]; titles?: (string | null)[] }) => {
      const base = baseOf(parent)
      const rows: AttachmentRow[] = []
      for (const [i, file] of files.entries()) {
        if (file.size > MAX_FILE_BYTES) {
          toast.error(t('tooBig', { name: file.name }))
          continue
        }
        const mimeType = uploadMimeOf(file)
        if (!mimeType) {
          toast.error(t('badType', { name: file.name }))
          continue
        }
        if (!file.size) {
          toast.error(t('empty', { name: file.name }))
          continue
        }
        const signed = await api<ApiSignedUpload>(`${base}/attachments/upload-url`, { method: 'POST', body: { name: file.name.slice(0, 300), mimeType, sizeBytes: file.size } })
        await uploadSigned(signed, file)
        const row = await api<ApiAttachment>(`${base}/attachments`, {
          method: 'POST',
          body: {
            kind: 'file',
            uploadToken: signed.uploadToken,
            name: file.name.slice(0, 300),
            title: titles?.[i]?.trim() || parent.title || null,
            ...destination(parent, base.startsWith('/v1/workspaces')),
          },
        })
        rows.push(toAttachment(row))
      }
      return rows
    },
    onSuccess: (rows) => {
      if (rows.length) toast.success(t('uploaded', { count: rows.length }))
    },
    onError,
    // aunque falle a la mitad, lo que sí se subió aparece
    onSettled: refresh,
  })

  const addLink = useMutation({
    mutationFn: async ({ parent, url, name }: { parent: AttachmentParent; url: string; name?: string }) => {
      const base = baseOf(parent)
      const row = await api<ApiAttachment>(`${base}/attachments`, {
        method: 'POST',
        // sin nombre, el servidor usa el dominio del link
        body: { kind: 'link', url: url.trim(), name: name?.trim().slice(0, 300) || undefined, title: parent.title || null, ...destination(parent, base.startsWith('/v1/workspaces')) },
      })
      return toAttachment(row)
    },
    onSuccess: refresh,
    onError,
  })

  const remove = useMutation({
    mutationFn: async (a: AttachmentRow) => {
      await api<{ ok: true }>(`/v1/attachments/${a.id}`, { method: 'DELETE' })
      return a.id
    },
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: attachmentKeys.all })
      patchCached(qc, a.id, () => null)
    },
    onError,
    onSettled: refresh,
  })

  /** Título, etiquetas y vínculos (espacio, tarea, reunión, doc). Se ve al instante y se confirma después. */
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: AttachmentPatch }) =>
      toAttachment(await api<ApiAttachment>(`/v1/attachments/${id}`, { method: 'PATCH', body: toAttachmentPatch(patch) })),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: attachmentKeys.all })
      patchCached(qc, id, (x) => ({ ...x, ...patch }))
    },
    onSuccess: (row) => patchCached(qc, row.id, () => row),
    onError,
    onSettled: refresh,
  })

  return { upload, addLink, remove, update }
}

/**
 * Abre un link, o un archivo con una URL temporal de la API (5 min): en otra pestaña si el navegador
 * lo muestra (imagen, PDF, audio, video); si no, o con `download`, se descarga.
 */
export async function openAttachment(a: AttachmentRow, mode: 'open' | 'download' = 'open') {
  track('feature.attachment_preview', { workspaceId: a.workspace_id })
  if (a.kind === 'link' && a.url) {
    window.open(a.url, '_blank', 'noopener,noreferrer')
    return
  }
  const inline = mode === 'open' && isInlineType(a.mime_type)
  // la pestaña se abre dentro del clic para que el navegador no la bloquee; la URL llega después
  const tab = inline ? window.open('', '_blank') : null
  try {
    const res = await api<{ url: string; name: string }>(`/v1/attachments/${a.id}/download`, { query: { inline: inline ? 'true' : 'false' } })
    if (tab) {
      tab.opener = null
      tab.location.href = res.url
      return
    }
    if (inline) {
      window.open(res.url, '_blank', 'noopener,noreferrer')
      return
    }
    const link = document.createElement('a')
    link.href = res.url
    link.download = res.name
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } catch {
    tab?.close()
  }
}

// ---------- vistas previas ----------

// URLs en línea por adjunto (duran 10 min: se renuevan un minuto antes)
const previews = new Map<string, { url: string | null; until: number }>()
let queue: { id: string; resolve: (url: string | null) => void }[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function flushPreviews() {
  const batch = queue
  queue = []
  timer = null
  const ids = [...new Set(batch.map((b) => b.id))]
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    try {
      const { items } = await api<{ items: { id: string; url: string; expiresIn: number }[] }>('/v1/attachments/previews', { query: { ids: chunk.join(',') } })
      const now = Date.now()
      for (const id of chunk) previews.set(id, { url: null, until: now + 60_000 })
      for (const it of items) previews.set(it.id, { url: it.url, until: now + Math.max(it.expiresIn - 60, 30) * 1000 })
    } catch {
      // sin vista previa: se muestra el ícono del tipo
    }
  }
  for (const b of batch) b.resolve(previews.get(b.id)?.url ?? null)
}

/** URL para ver un archivo en la página (miniaturas). Junta los pedidos de un mismo momento en una sola llamada. */
export function attachmentPreviewUrl(id: string): Promise<string | null> {
  const hit = previews.get(id)
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url)
  return new Promise((resolve) => {
    queue.push({ id, resolve })
    timer ??= setTimeout(flushPreviews, 30)
  })
}
