'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api/client'
import type { ApiDriveFile, ApiGoogleContact, ApiMailboxes, ApiMailLabels, ApiMailSend, ApiMailThread, ApiMailThreadPage } from '@/lib/api/correo'

// El buzón: lo que se ve se vuelve a pedir cada minuto mientras la pestaña está a la vista (Gmail no
// avisa sin facturación en Google Cloud); lo que se hace (leer, estrella, archivar) se ve al instante.

export const mailKeys = {
  all: ['mail'] as const,
  boxes: ['mail', 'boxes'] as const,
  labels: (box: string) => ['mail', 'labels', box] as const,
  lists: (box: string) => ['mail', 'threads', box] as const,
  threads: (box: string, folder: string | null, q: string) => ['mail', 'threads', box, folder, q] as const,
  thread: (box: string, id: string) => ['mail', 'thread', box, id] as const,
  contacts: (box: string, q: string) => ['mail', 'contacts', box, q] as const,
  drive: (box: string, q: string) => ['mail', 'drive', box, q] as const,
}

const MINUTE = 60_000

/** Mis buzones (las cuentas conectadas) con sus sin leer: también la pastilla de la barra lateral. */
export function useMailboxes(enabled = true) {
  return useQuery({
    queryKey: mailKeys.boxes,
    enabled,
    staleTime: MINUTE,
    refetchInterval: 2 * MINUTE,
    // una API sin el buzón (404) no es un error que reintentar
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
    queryFn: () => api<ApiMailboxes>('/v1/mail/mailboxes'),
  })
}

export function useMailLabels(box: string | null) {
  return useQuery({
    queryKey: mailKeys.labels(box ?? ''),
    enabled: Boolean(box),
    staleTime: 30_000,
    refetchInterval: MINUTE,
    queryFn: () => api<ApiMailLabels>(`/v1/mail/mailboxes/${box}/labels`),
  })
}

/** Los hilos de una carpeta o de una búsqueda, de a 20 («Cargar más» pide la página siguiente). */
export function useMailThreads(box: string | null, folder: string | null, q: string) {
  return useInfiniteQuery({
    queryKey: mailKeys.threads(box ?? '', folder, q),
    enabled: Boolean(box),
    initialPageParam: null as string | null,
    staleTime: 20_000,
    refetchInterval: MINUTE,
    placeholderData: (prev) => prev,
    queryFn: ({ pageParam }): Promise<ApiMailThreadPage> =>
      api<ApiMailThreadPage>(`/v1/mail/mailboxes/${box}/threads`, { query: { label: folder ?? undefined, q: q || undefined, pageToken: pageParam ?? undefined } }),
    getNextPageParam: (last: ApiMailThreadPage) => last.nextPageToken,
  })
}

export function useMailThread(box: string | null, id: string | null) {
  return useQuery({
    queryKey: mailKeys.thread(box ?? '', id ?? ''),
    enabled: Boolean(box && id),
    staleTime: 30_000,
    queryFn: () => api<ApiMailThread>(`/v1/mail/mailboxes/${box}/threads/${encodeURIComponent(id!)}`),
  })
}

/** Contactos de Google que coinciden con lo escrito (desde 2 letras), para sugerir destinatarios. */
export function useMailContacts(box: string | null, q: string, enabled: boolean) {
  const term = q.trim()
  return useQuery({
    queryKey: mailKeys.contacts(box ?? '', term.toLowerCase()),
    enabled: Boolean(box) && enabled && term.length >= 2,
    staleTime: 5 * MINUTE,
    placeholderData: (prev) => prev,
    retry: false,
    queryFn: () => api<{ items: ApiGoogleContact[] }>(`/v1/mail/mailboxes/${box}/contacts`, { query: { q: term } }),
  })
}

/** Archivos de Drive para insertar: los últimos o los que coinciden por nombre. */
export function useMailDrive(box: string | null, q: string, enabled: boolean) {
  const term = q.trim()
  return useQuery({
    queryKey: mailKeys.drive(box ?? '', term.toLowerCase()),
    enabled: Boolean(box) && enabled,
    staleTime: MINUTE,
    placeholderData: (prev) => prev,
    retry: false,
    queryFn: () => api<{ items: ApiDriveFile[] }>(`/v1/mail/mailboxes/${box}/drive`, { query: { q: term || undefined } }),
  })
}

type Pages = InfiniteData<ApiMailThreadPage, string | null>

/**
 * Lo que se hace con un hilo: marcar (leído, estrella, archivar, spam, una etiqueta), la papelera y
 * enviar. Marcar se ve al instante en la lista y en el hilo abierto; si Gmail falla, vuelve atrás.
 */
export function useMailActions(box: string | null) {
  const qc = useQueryClient()

  const patchLists = (id: string, f: (t: ApiMailThreadPage['items'][number]) => ApiMailThreadPage['items'][number] | null) => {
    qc.setQueriesData<Pages>({ queryKey: mailKeys.lists(box ?? '') }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({ ...p, items: p.items.flatMap((t) => (t.id === id ? (f(t) ?? []) : [t])) })),
          }
        : data,
    )
  }
  const settle = (id?: string) => {
    void qc.invalidateQueries({ queryKey: mailKeys.boxes })
    if (!box) return
    void qc.invalidateQueries({ queryKey: mailKeys.labels(box) })
    void qc.invalidateQueries({ queryKey: mailKeys.lists(box) })
    if (id) void qc.invalidateQueries({ queryKey: mailKeys.thread(box, id) })
  }

  const label = useMutation({
    mutationFn: (v: { id: string; add?: string[]; remove?: string[]; folder?: string | null }) =>
      api<{ labelIds: string[] }>(`/v1/mail/mailboxes/${box}/threads/${encodeURIComponent(v.id)}/labels`, {
        method: 'POST',
        body: { add: v.add ?? [], remove: v.remove ?? [] },
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: mailKeys.lists(box ?? '') })
      const before = qc.getQueriesData<Pages>({ queryKey: mailKeys.lists(box ?? '') })
      const add = new Set(v.add ?? [])
      const remove = new Set(v.remove ?? [])
      patchLists(v.id, (t) => {
        const labelIds = [...t.labelIds.filter((l) => !remove.has(l)), ...[...add].filter((l) => !t.labelIds.includes(l))]
        // sacarlo de la carpeta que se mira (archivar desde Recibidos, quitar la estrella en Destacados…) lo saca de la lista
        if (v.folder && remove.has(v.folder)) return null
        return { ...t, labelIds, unread: add.has('UNREAD') ? true : remove.has('UNREAD') ? false : t.unread, starred: add.has('STARRED') ? true : remove.has('STARRED') ? false : t.starred }
      })
      const thread = box ? qc.getQueryData<ApiMailThread>(mailKeys.thread(box, v.id)) : undefined
      if (thread && box) {
        const fix = (ls: string[]) => [...ls.filter((l) => !remove.has(l)), ...[...add].filter((l) => !ls.includes(l))]
        qc.setQueryData<ApiMailThread>(mailKeys.thread(box, v.id), {
          ...thread,
          labelIds: fix(thread.labelIds),
          messages: thread.messages.map((m) => ({ ...m, labelIds: fix(m.labelIds), unread: remove.has('UNREAD') ? false : add.has('UNREAD') ? true : m.unread })),
        })
      }
      return { before, thread }
    },
    onError: (_e, v, ctx) => {
      ctx?.before.forEach(([key, data]) => qc.setQueryData(key, data))
      if (ctx?.thread && box) qc.setQueryData(mailKeys.thread(box, v.id), ctx.thread)
    },
    onSettled: (_d, _e, v) => settle(v.id),
  })

  const trash = useMutation({
    mutationFn: (v: { id: string; undo?: boolean }) =>
      api<{ ok: true }>(`/v1/mail/mailboxes/${box}/threads/${encodeURIComponent(v.id)}/${v.undo ? 'untrash' : 'trash'}`, { method: 'POST' }),
    onMutate: async (v) => {
      if (v.undo) return { before: [] as [readonly unknown[], Pages | undefined][] }
      await qc.cancelQueries({ queryKey: mailKeys.lists(box ?? '') })
      const before = qc.getQueriesData<Pages>({ queryKey: mailKeys.lists(box ?? '') })
      patchLists(v.id, () => null)
      return { before }
    },
    onError: (_e, _v, ctx) => ctx?.before.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (_d, _e, v) => settle(v.id),
  })

  const send = useMutation({
    mutationFn: (body: ApiMailSend) => api<{ id: string; threadId: string }>(`/v1/mail/mailboxes/${box}/send`, { method: 'POST', body }),
    onSettled: (d) => settle(d?.threadId),
  })

  return { label, trash, send }
}
