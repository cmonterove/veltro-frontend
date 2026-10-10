'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { AttachmentRow } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'
import { track } from '@/lib/telemetry'

export type AttachmentScope =
  | { kind: 'task'; taskId: string }
  | { kind: 'meeting'; meetingId: string }
  | { kind: 'doc'; docId: string }
  | { kind: 'workspace'; workspaceId: string }

export type AttachmentParent = { workspaceId: string; taskId?: string | null; meetingId?: string | null; docId?: string | null }

export const attachmentKeys = {
  all: ['attachments'] as const,
  scope: (scope: AttachmentScope) => ['attachments', scope] as const,
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
  const refresh = () => qc.invalidateQueries({ queryKey: attachmentKeys.all })

  const upload = useMutation({
    mutationFn: async ({ parent, files }: { parent: AttachmentParent; files: File[] }) => {
      const supabase = createClient()
      const rows: AttachmentRow[] = []
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          toast.error(t('tooBig', { name: file.name }))
          continue
        }
        const path = `${parent.workspaceId}/${crypto.randomUUID()}-${safeName(file.name)}`
        const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined })
        if (upErr) throw upErr
        const { data, error } = await supabase
          .from('attachments')
          .insert({
            workspace_id: parent.workspaceId,
            task_id: parent.taskId ?? null,
            meeting_id: parent.meetingId ?? null,
            doc_id: parent.docId ?? null,
            kind: 'file',
            name: file.name.slice(0, 300),
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
          workspace_id: parent.workspaceId,
          task_id: parent.taskId ?? null,
          meeting_id: parent.meetingId ?? null,
          doc_id: parent.docId ?? null,
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

  return { upload, addLink, remove }
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
