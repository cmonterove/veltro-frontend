'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useApp } from '@/components/app/app-context'
import { api } from '@/lib/api/client'
import { toChatMessage, toChatSummary, toMessageBody, type ApiChat, type ApiChatMessage, type ChatSummary, type OutgoingMessage, type Page } from '@/lib/api/pasillo-boveda'
import { toErrorCode } from '@/lib/errors'
import type { ChatMessageRow, RsvpAnswer } from '@/lib/database.types'

/**
 * Pasillo: conversaciones directas y grupos de la cuenta, por la API (/v1/accounts/{id}/chats y
 * /v1/chats/{id}). Sin tiempo real todavía: se pregunta cada pocos segundos. El resumen (miembros,
 * último mensaje y no leídos) y los avisos de sistema los arma el servidor.
 */
export const chatKeys = {
  all: ['chats'] as const,
  list: (accountId: string) => ['chats', 'list', accountId] as const,
  unread: (accountId: string) => ['chats', 'unread', accountId] as const,
  messages: (chatId: string) => ['chats', 'messages', chatId] as const,
}

export type { ChatSummary }

type Unread = { total: number; chats: number }

/** Mete (o reemplaza) un chat en la lista, sin esperar al próximo refresco. */
function upsertChat(qc: QueryClient, accountId: string, chat: ChatSummary) {
  qc.setQueryData<ChatSummary[]>(chatKeys.list(accountId), (old) => {
    if (!old) return old
    const rest = old.filter((c) => c.id !== chat.id)
    return [chat, ...rest].sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at))
  })
}

/**
 * La lista de chats con su resumen. `fast`: dentro de Pasillo se refresca cada 5 s; afuera no se
 * pregunta solo (el contador del menú usa `useChatUnread`, que avisa cuando hay algo nuevo).
 */
export function useChats({ fast = false }: { fast?: boolean } = {}) {
  const { account } = useApp()
  const qc = useQueryClient()
  return useQuery({
    queryKey: chatKeys.list(account.id),
    refetchInterval: fast ? 5000 : false,
    staleTime: fast ? 0 : 15_000,
    queryFn: async () => {
      const { items } = await api<{ items: ApiChat[] }>(`/v1/accounts/${account.id}/chats`)
      const list = items.map(toChatSummary)
      // de paso, el contador del menú queda al día
      qc.setQueryData<Unread>(chatKeys.unread(account.id), { total: list.reduce((n, c) => n + c.unread, 0), chats: list.filter((c) => c.unread > 0).length })
      return list
    },
  })
}

// último total visto por cuenta: si cambia, la lista (si alguien la mira) se refresca
const lastTotals = new Map<string, number>()

/** No leídos de Pasillo para el menú y la pestaña del navegador (GET …/chats/unread, cada 20 s). */
export function useChatUnread() {
  const { account } = useApp()
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: chatKeys.unread(account.id),
    refetchInterval: 20_000,
    staleTime: 10_000,
    queryFn: () => api<Unread>(`/v1/accounts/${account.id}/chats/unread`),
  })
  const total = query.data?.total
  useEffect(() => {
    if (total === undefined) return
    const prev = lastTotals.get(account.id)
    lastTotals.set(account.id, total)
    if (prev !== undefined && prev !== total) qc.invalidateQueries({ queryKey: chatKeys.list(account.id) })
  }, [total, account.id, qc])
  return query
}

// ---------- mensajes ----------

/** Cada cuánto se vuelve a traer la última página entera (trae las respuestas a invitaciones de otros). */
const FULL_EVERY = 30_000
const PAGE = 100
const lastFull = new Map<string, number>()
/** Cursor hacia los mensajes anteriores a los cargados (null: no hay más). */
const olderCursor = new Map<string, string | null>()
/** Mensajes enviados que todavía esperan respuesta: se conservan entre refrescos. */
const pending = new Set<string>()

const byTime = (a: ChatMessageRow, b: ChatMessageRow) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/** Junta lo que llegó con lo que había (lo nuevo reemplaza por id) y quita los temporales ya resueltos. */
function merge(base: ChatMessageRow[] | undefined, incoming: ChatMessageRow[]) {
  const map = new Map<string, ChatMessageRow>()
  for (const m of base ?? []) if (!m.id.startsWith('temp-') || pending.has(m.id)) map.set(m.id, m)
  for (const m of incoming) map.set(m.id, m)
  return [...map.values()].sort(byTime)
}

const realLast = (list: ChatMessageRow[] | undefined) => [...(list ?? [])].reverse().find((m) => !m.id.startsWith('temp-'))

/**
 * Los mensajes de un chat, del más viejo al más nuevo. Al abrir trae la última página; después, cada
 * 3 s, solo lo posterior al último (`after`), y cada 30 s vuelve a traer la última página entera.
 * `loadOlder` trae la página anterior.
 */
export function useChatMessages(chatId: string | null) {
  const qc = useQueryClient()
  const key = chatKeys.messages(chatId ?? 'none')
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(chatId),
    refetchInterval: 3000,
    queryFn: async () => {
      const id = chatId!
      const path = `/v1/chats/${id}/messages`
      const last = realLast(qc.getQueryData<ChatMessageRow[]>(key))
      const incoming: ApiChatMessage[] = []
      if (!last || Date.now() - (lastFull.get(id) ?? 0) > FULL_EVERY) {
        const page = await api<Page<ApiChatMessage>>(path, { query: { limit: PAGE } })
        incoming.push(...page.items)
        lastFull.set(id, Date.now())
        if (!last) olderCursor.set(id, page.nextCursor)
      } else {
        // ponerse al día: todo lo posterior al último que tengo (en orden)
        let cursor: string | null = null
        for (let i = 0; i < 5; i++) {
          const page: Page<ApiChatMessage> = await api<Page<ApiChatMessage>>(path, { query: cursor ? { cursor, limit: 200 } : { after: last.id, limit: 200 } })
          incoming.push(...page.items)
          cursor = page.nextCursor
          if (!cursor) break
        }
      }
      // se junta con la caché de este momento (pudo cambiar mientras llegaba la respuesta)
      return merge(qc.getQueryData<ChatMessageRow[]>(key), incoming.map(toChatMessage))
    },
  })

  const [loadingOlder, setLoadingOlder] = useState(false)
  const cursor = chatId ? olderCursor.get(chatId) : null
  const loadOlder = async () => {
    if (!chatId || !cursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await api<Page<ApiChatMessage>>(`/v1/chats/${chatId}/messages`, { query: { cursor, limit: PAGE } })
      olderCursor.set(chatId, page.nextCursor)
      qc.setQueryData<ChatMessageRow[]>(key, (old) => merge(old, page.items.map(toChatMessage)))
    } finally {
      setLoadingOlder(false)
    }
  }

  return { ...query, hasOlder: Boolean(cursor), loadOlder, loadingOlder }
}

export type NewMessage = OutgoingMessage & { chatId: string }

export function useChatMutations() {
  const qc = useQueryClient()
  const { account, user } = useApp()
  const tErr = useTranslations('errors')
  const onError = (e: unknown) => toast.error(tErr(toErrorCode(e as { message?: string })))
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.list(account.id) })
  const refreshUnread = () => qc.invalidateQueries({ queryKey: chatKeys.unread(account.id) })

  const send = useMutation({
    mutationFn: async (m: NewMessage) => {
      const res = await api<ApiChatMessage>(`/v1/chats/${m.chatId}/messages`, {
        method: 'POST',
        body: toMessageBody(m),
        // si la red reintenta, el servidor no lo duplica
        headers: { 'idempotency-key': crypto.randomUUID() },
      })
      return toChatMessage(res)
    },
    // el mensaje aparece al instante (con la cita armada aquí); al llegar la respuesta se cambia por el real
    onMutate: async (m) => {
      const key = chatKeys.messages(m.chatId)
      await qc.cancelQueries({ queryKey: key })
      const temp: ChatMessageRow = {
        id: `temp-${crypto.randomUUID()}`,
        chat_id: m.chatId,
        user_id: user.id,
        kind: m.kind ?? 'text',
        body: m.body ?? '',
        ref_id: m.refId ?? null,
        meta: m.meta ?? {},
        created_at: new Date().toISOString(),
        edited_at: null,
      }
      pending.add(temp.id)
      qc.setQueryData<ChatMessageRow[]>(key, (old) => [...(old ?? []), temp])
      return { tempId: temp.id }
    },
    onSuccess: (row, m, ctx) => {
      if (ctx) pending.delete(ctx.tempId)
      qc.setQueryData<ChatMessageRow[]>(chatKeys.messages(m.chatId), (old) => merge(old?.filter((x) => x.id !== ctx?.tempId), [row]))
    },
    onError: (e, m, ctx) => {
      if (ctx) pending.delete(ctx.tempId)
      qc.setQueryData<ChatMessageRow[]>(chatKeys.messages(m.chatId), (old) => old?.filter((x) => x.id !== ctx?.tempId))
      onError(e)
    },
    onSettled: refresh,
  })

  const markRead = useMutation({
    mutationFn: (chatId: string) => api<{ ok: true; lastReadAt: string }>(`/v1/chats/${chatId}/read`, { method: 'POST' }),
    onMutate: (chatId) => qc.setQueryData<ChatSummary[]>(chatKeys.list(account.id), (old) => old?.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c))),
    onSuccess: ({ lastReadAt }, chatId) =>
      qc.setQueryData<ChatSummary[]>(chatKeys.list(account.id), (old) =>
        old?.map((c) => (c.id === chatId ? { ...c, members: c.members.map((m) => (m.user_id === user.id ? { ...m, last_read_at: lastReadAt } : m)) } : c)),
      ),
    onSettled: refreshUnread,
  })

  /** Directo con una persona: el servidor reutiliza el que ya existe. Devuelve el id del chat. */
  const openDirect = useMutation({
    mutationFn: async (otherId: string) => {
      const chat = toChatSummary(await api<ApiChat>(`/v1/accounts/${account.id}/chats/direct`, { method: 'POST', body: { userId: otherId } }))
      upsertChat(qc, account.id, chat)
      return chat.id
    },
    onSuccess: refresh,
    onError,
  })

  /** Sin nombre, el servidor lo arma con los nombres de pila de las primeras personas. */
  const createGroup = useMutation({
    mutationFn: async ({ name, userIds }: { name?: string; userIds: string[] }) => {
      const body = { name: name?.trim() ? name.trim().slice(0, 80) : undefined, userIds: userIds.filter((id) => id !== user.id) }
      const chat = toChatSummary(await api<ApiChat>(`/v1/accounts/${account.id}/chats`, { method: 'POST', body }))
      upsertChat(qc, account.id, chat)
      return chat.id
    },
    onSuccess: refresh,
    onError,
  })

  const afterChange = (chat: ChatSummary) => {
    upsertChat(qc, account.id, chat)
    // el aviso de sistema que dejó el servidor
    qc.invalidateQueries({ queryKey: chatKeys.messages(chat.id) })
  }

  const rename = useMutation({
    mutationFn: async ({ chatId, name }: { chatId: string; name: string }) =>
      toChatSummary(await api<ApiChat>(`/v1/chats/${chatId}`, { method: 'PATCH', body: { name: name.trim().slice(0, 80) } })),
    onSuccess: afterChange,
    onError,
  })

  const addMembers = useMutation({
    mutationFn: async ({ chatId, userIds }: { chatId: string; userIds: string[] }) =>
      toChatSummary(await api<ApiChat>(`/v1/chats/${chatId}/members`, { method: 'POST', body: { userIds } })),
    onSuccess: afterChange,
    onError,
  })

  const leave = useMutation({
    mutationFn: (chatId: string) => api<{ ok: true }>(`/v1/chats/${chatId}/leave`, { method: 'POST' }),
    onSuccess: (_r, chatId) => {
      qc.setQueryData<ChatSummary[]>(chatKeys.list(account.id), (old) => old?.filter((c) => c.id !== chatId))
      qc.removeQueries({ queryKey: chatKeys.messages(chatId) })
      refresh()
      refreshUnread()
    },
    onError,
  })

  /** Respuesta a una invitación: el servidor la guarda en el mensaje (que es de otra persona). */
  const rsvp = useMutation({
    mutationFn: async ({ message, answer }: { message: ChatMessageRow; answer: RsvpAnswer }) =>
      toChatMessage(await api<ApiChatMessage>(`/v1/chats/${message.chat_id}/messages/${message.id}/rsvp`, { method: 'PUT', body: { answer } })),
    onMutate: ({ message, answer }) =>
      qc.setQueryData<ChatMessageRow[]>(chatKeys.messages(message.chat_id), (old) =>
        old?.map((m) =>
          m.id === message.id && m.meta.invite ? { ...m, meta: { ...m.meta, invite: { ...m.meta.invite, rsvp: { ...m.meta.invite.rsvp, [user.id]: answer } } } } : m,
        ),
      ),
    onSuccess: (row) => qc.setQueryData<ChatMessageRow[]>(chatKeys.messages(row.chat_id), (old) => merge(old, [row])),
    onError: (e, { message }) => {
      onError(e)
      qc.invalidateQueries({ queryKey: chatKeys.messages(message.chat_id) })
    },
  })

  /**
   * Compartir lo mismo en varios chats a la vez (tarea, archivo, doc, invitación o texto). A las
   * personas (`userIds`) les llega por el directo, que el servidor abre si no existe. Todo o nada.
   * Devuelve los chats donde quedó.
   */
  const share = useMutation({
    mutationFn: async ({ chatIds = [], userIds = [], ...m }: OutgoingMessage & { chatIds?: string[]; userIds?: string[] }) => {
      const { items } = await api<{ items: ApiChatMessage[] }>(`/v1/accounts/${account.id}/chats/share`, {
        method: 'POST',
        body: { chatIds, userIds, message: toMessageBody(m, false) },
      })
      return [...new Set(items.map((x) => x.chatId))]
    },
    onSuccess: (chatIds) => {
      refresh()
      for (const id of chatIds) qc.invalidateQueries({ queryKey: chatKeys.messages(id) })
    },
    onError,
  })

  return { send, markRead, openDirect, createGroup, rename, addMembers, leave, rsvp, share }
}
