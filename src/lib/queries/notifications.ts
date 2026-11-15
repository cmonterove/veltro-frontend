'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp } from '@/components/app/app-context'
import { api } from '@/lib/api/client'
import { toErrorCode } from '@/lib/errors'
import { useRealtimeLive } from '@/lib/realtime'

/**
 * Avisos de la cuenta actual (GET /v1/accounts/{id}/notifications): te asignaron una tarea,
 * comentaron o terminaron una tarea tuya, te mencionaron. Los crea la base; llegan en vivo
 * (evento `ntf`) y, sin conexión en vivo, la campana pregunta cada minuto.
 */

export type NotificationKind =
  | 'task_assigned'
  | 'task_comment'
  | 'task_mention'
  | 'task_done'
  | 'chat_mention'
  | 'task_due_today'
  | 'task_overdue'
  | 'member_joined'
  | 'task_status'
  | 'task_due_changed'
  | 'task_unblocked'
  | 'request_new'
  | 'request_message'
  | 'request_status'
  | 'chat_thread'

export type AppNotification = {
  id: string
  kind: NotificationKind
  createdAt: string
  readAt: string | null
  count: number
  /** según el tipo: { to, toId } (estado), { from, to } (fecha), { date } (recordatorios) */
  data?: Record<string, unknown>
  actor: { id: string; fullName: string; avatarUrl: string | null } | null
  workspace: { id: string; slug: string; name: string; key: string } | null
  task: { id: string; ref: string; title: string; status: string } | null
  comment: { id: string; excerpt: string } | null
  chat: { id: string; kind: 'direct' | 'group'; name: string | null } | null
  message: { id: string; excerpt: string } | null
  /** solicitud entre departamentos */
  request?: { id: string; code: string; title: string; status: string; department: string | null } | null
}

type Page = { items: AppNotification[]; nextCursor: string | null; unread: number }
export type NotificationFilter = 'unread' | 'all'

export const notificationKeys = {
  all: (accountId: string) => ['notifications', accountId] as const,
  list: (accountId: string, filter: NotificationFilter) => ['notifications', accountId, 'list', filter] as const,
  unread: (accountId: string) => ['notifications', accountId, 'unread'] as const,
}

export function useNotifications(filter: NotificationFilter, enabled = true) {
  const { account } = useApp()
  const qc = useQueryClient()
  return useInfiniteQuery({
    queryKey: notificationKeys.list(account.id, filter),
    enabled,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam }) => {
      const page = await api<Page>(`/v1/accounts/${account.id}/notifications`, {
        query: { limit: 30, cursor: pageParam, unread: filter === 'unread' ? 'true' : undefined },
      })
      // de paso, la campana queda al día
      qc.setQueryData(notificationKeys.unread(account.id), page.unread)
      return page
    },
  })
}

/** Cuántos avisos sin leer (la campana). */
export function useNotificationsUnread() {
  const { account } = useApp()
  const live = useRealtimeLive()
  return useQuery({
    queryKey: notificationKeys.unread(account.id),
    refetchInterval: live ? 5 * 60_000 : 60_000,
    staleTime: 15_000,
    queryFn: async () => (await api<{ count: number }>(`/v1/accounts/${account.id}/notifications/unread`)).count,
  })
}

/** El primer aviso de la cuenta con ese id (para el aviso del escritorio). */
export async function fetchNotification(accountId: string, id: string) {
  const page = await api<Page>(`/v1/accounts/${accountId}/notifications`, { query: { limit: 10 } })
  return page.items.find((n) => n.id === id) ?? null
}

/** Cambia los avisos en todas las listas cargadas (y la cuenta de no leídos), sin esperar al servidor. */
function patchCached(qc: QueryClient, accountId: string, fn: (n: AppNotification) => AppNotification | null) {
  // cuánto cambia la cuenta de no leídos, una vez por aviso aunque esté en las dos listas
  const change = new Map<string, number>()
  for (const filter of ['unread', 'all'] as const) {
    qc.setQueryData<InfiniteData<Page>>(notificationKeys.list(accountId, filter), (old) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map((p) => ({
          ...p,
          items: p.items.flatMap((n) => {
            const next = fn(n)
            if (!change.has(n.id)) change.set(n.id, Number(next !== null && !next.readAt) - Number(!n.readAt))
            return next ? [next] : []
          }),
        })),
      }
    })
  }
  const delta = [...change.values()].reduce((a, b) => a + b, 0)
  if (delta) qc.setQueryData<number>(notificationKeys.unread(accountId), (n) => Math.max(0, (n ?? 0) + delta))
}

export function useNotificationMutations() {
  const { account } = useApp()
  const qc = useQueryClient()
  const tErr = useTranslations('errors')
  const onError = (e: unknown) => {
    toast.error(tErr(toErrorCode(e as { message?: string })))
    qc.invalidateQueries({ queryKey: notificationKeys.all(account.id) })
  }
  const now = () => new Date().toISOString()

  /** Sin ids: todos los de la cuenta. */
  const markRead = useMutation({
    mutationFn: (ids?: string[]) =>
      api<{ ok: true; unread: number }>(`/v1/accounts/${account.id}/notifications/read`, { method: 'POST', body: ids ? { ids } : {} }),
    onMutate: (ids) => patchCached(qc, account.id, (n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now() } : n)),
    onSuccess: ({ unread }) => qc.setQueryData(notificationKeys.unread(account.id), unread),
    onError,
  })

  const markUnread = useMutation({
    mutationFn: (id: string) => api(`/v1/notifications/${id}/unread`, { method: 'POST' }),
    onMutate: (id) => patchCached(qc, account.id, (n) => (n.id === id ? { ...n, readAt: null } : n)),
    onError,
  })

  const dismiss = useMutation({
    mutationFn: (id: string) => api(`/v1/notifications/${id}`, { method: 'DELETE' }),
    onMutate: (id) => patchCached(qc, account.id, (n) => (n.id === id ? null : n)),
    onError,
  })

  return { markRead, markUnread, dismiss }
}
