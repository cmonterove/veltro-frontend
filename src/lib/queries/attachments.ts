'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { AttachmentRow } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'
import { track } from '@/lib/telemetry'
import { useApp } from '@/components/app/app-context'

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
  /** subido en un chat: queda privado para sus miembros */
  chatId?: string | null
  title?: string | null
  labels?: string[]
}

export const attachmentKeys = {
  all: ['attachments'] as const,
  scope: (scope: AttachmentScope) => ['attachments', scope] as const,
  vault: (accountId: string, workspaceIds: string[]) => ['attachments', 'vault', accountId, workspaceIds] as const,
}

/** La bóveda: todos los archivos y links de la cuenta, cuelguen o no de un espacio. */
export function useVaultFiles(enabled = true) {
  const { account, user, workspaces, observedWorkspaces } = useApp()
  const ids = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id).sort(), [workspaces, observedWorkspaces])
  return useQuery({
    queryKey: attachmentKeys.vault(account.id, ids),
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const [files, mine] = await Promise.all([
        supabase.from('attachments').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('chat_members').select('chat_id').eq('user_id', user.id),
      ])
      if (files.error) throw files.error
      const wsIds = new Set(ids)
      const chats = new Set(((mine.data ?? []) as { chat_id: string }[]).map((m) => m.chat_id))
      // de un espacio: si lo ves; suelto: si es de la cuenta y, si vino de un chat, si estás en ese chat
      return (files.data as AttachmentRow[]).filter((a) => (a.workspace_id ? wsIds.has(a.workspace_id) : a.account_id === account.id && (!a.chat_id || chats.has(a.chat_id))))
    },
  })
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function useAttachments(scope: AttachmentScope | null) {
  return useQuery({
    queryKey: scope ? attachmentKeys.scope(scope) : ['attachments', 'none'],
    enabled: Boolean(scope),
    queryFn: async () => {
      let q = createClient().from('attachments').select('*')
      if (scope!.kind === 'task') q = q.eq('task_id', scope!.taskId)
      if (scope!.kind === 'meeting') q = q.eq('meeting_id', scope!.meetingId)
      if (scope!.kind === 'doc') q = q.eq('doc_id', scope!.docId)
      if (scope!.kind === 'workspace') q = q.eq('workspace_id', scope!.workspaceId)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      return data as AttachmentRow[]
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

function safeName(name: string) {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
  return clean.slice(-90) || 'archivo'
}

function useErrorToast() {
  const t = useTranslations('errors')
  return (error: unknown) => toast.error(t(toErrorCode(error as { message?: string })))
}

export function useAttachmentMutations() {
  const qc = useQueryClient()
  const onError = useErrorToast()
  const t = useTranslations('attachments')
  const { account } = useApp()
  const refresh = () => qc.invalidateQueries({ queryKey: attachmentKeys.all })

  const upload = useMutation({
    /** `titles`: un título por archivo, en el mismo orden (si no, el de `parent`) */
    mutationFn: async ({ parent, files, titles }: { parent: AttachmentParent; files: File[]; titles?: (string | null)[] }) => {
      const supabase = createClient()
      const rows: AttachmentRow[] = []
      for (const [i, file] of files.entries()) {
        if (file.size > MAX_FILE_BYTES) {
          toast.error(t('tooBig', { name: file.name }))
          continue
        }
        const path = `${parent.workspaceId ?? account.id}/${crypto.randomUUID()}-${safeName(file.name)}`
        const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined })
        if (upErr) throw upErr
        const { data, error } = await supabase
          .from('attachments')
          .insert({
            account_id: account.id,
            workspace_id: parent.workspaceId ?? null,
            chat_id: parent.chatId ?? null,
            task_id: parent.taskId ?? null,
            meeting_id: parent.meetingId ?? null,
            doc_id: parent.docId ?? null,
            kind: 'file',
            name: file.name.slice(0, 300),
            title: titles?.[i]?.trim() || parent.title || null,
            labels: parent.labels ?? [],
            storage_path: path,
            mime_type: file.type || null,
            size_bytes: file.size,
          })
          .select('*')
          .single()
        if (error) throw error
        rows.push(data as AttachmentRow)
      }
      return rows
    },
    onSuccess: (rows) => {
      if (rows.length) toast.success(t('uploaded', { count: rows.length }))
      refresh()
    },
    onError,
  })

  const addLink = useMutation({
    mutationFn: async ({ parent, url, name }: { parent: AttachmentParent; url: string; name?: string }) => {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
      const { data, error } = await createClient()
        .from('attachments')
        .insert({
          account_id: account.id,
          workspace_id: parent.workspaceId ?? null,
          task_id: parent.taskId ?? null,
          meeting_id: parent.meetingId ?? null,
          doc_id: parent.docId ?? null,
          title: parent.title ?? null,
          labels: parent.labels ?? [],
          kind: 'link',
          name: (name?.trim() || new URL(href).hostname).slice(0, 300),
          url: href,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as AttachmentRow
    },
    onSuccess: refresh,
    onError,
  })

  const remove = useMutation({
    mutationFn: async (a: AttachmentRow) => {
      const supabase = createClient()
      const { error } = await supabase.from('attachments').delete().eq('id', a.id)
      if (error) throw error
      if (a.storage_path) await supabase.storage.from('attachments').remove([a.storage_path])
      return a.id
    },
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: attachmentKeys.all })
      qc.setQueriesData<AttachmentRow[]>({ queryKey: attachmentKeys.all }, (old) => old?.filter((x) => x.id !== a.id))
    },
    onError: (e) => {
      onError(e)
      refresh()
    },
  })

  /** Título, etiquetas y vínculos (espacio, tarea, reunión, doc). Se ve al instante y se confirma después. */
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<AttachmentRow, 'title' | 'labels' | 'workspace_id' | 'task_id' | 'meeting_id' | 'doc_id' | 'name'>> }) => {
      const { data, error } = await createClient().from('attachments').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      return data as AttachmentRow
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: attachmentKeys.all })
      qc.setQueriesData<AttachmentRow[]>({ queryKey: attachmentKeys.all }, (old) => old?.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    },
    onError: (e) => {
      onError(e)
      refresh()
    },
    onSuccess: refresh,
  })

  return { upload, addLink, remove, update }
}

/** Abre un link o descarga un archivo (URL firmada de 5 minutos). */
export async function openAttachment(a: AttachmentRow, mode: 'open' | 'download' = 'open') {
  track('feature.attachment_preview', { workspaceId: a.workspace_id })
  if (a.kind === 'link' && a.url) {
    window.open(a.url, '_blank', 'noopener,noreferrer')
    return
  }
  if (!a.storage_path) return
  const { data } = await createClient().storage.from('attachments').createSignedUrl(a.storage_path, 300)
  const url = data?.signedUrl
  if (!url) return
  // las data URLs (modo demo) no se pueden abrir en una pestaña nueva: se descargan
  if (mode === 'download' || url.startsWith('data:')) {
    const link = document.createElement('a')
    link.href = url
    link.download = a.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function attachmentPreviewUrl(a: AttachmentRow) {
  if (!a.storage_path) return null
  const { data } = await createClient().storage.from('attachments').createSignedUrl(a.storage_path, 600)
  return data?.signedUrl ?? null
}
