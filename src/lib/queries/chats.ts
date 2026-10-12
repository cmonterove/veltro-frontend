'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/components/app/app-context'
import { toErrorCode } from '@/lib/errors'
import type { ChatMemberRow, ChatMessageKind, ChatMessageRow, ChatRow, RsvpAnswer } from '@/lib/database.types'

/**
 * Pasillo: conversaciones directas y grupos de la cuenta. Sin tiempo real todavía: las listas se
 * refrescan solas cada pocos segundos (en la base irá con suscripciones).
 */
export const chatKeys = {
  all: ['chats'] as const,
  list: (accountId: string) => ['chats', 'list', accountId] as const,
  messages: (chatId: string) => ['chats', 'messages', chatId] as const,
}

export type ChatSummary = ChatRow & {
  members: ChatMemberRow[]
  last: ChatMessageRow | null
  /** mensajes de otras personas después de la última lectura */
  unread: number
}

/** `fast`: dentro de Pasillo se refresca seguido; en el resto de la app (contador del menú), más espaciado. */
export function useChats({ fast = false }: { fast?: boolean } = {}) {
  const { account, user } = useApp()
  return useQuery({
    queryKey: chatKeys.list(account.id),
    refetchInterval: fast ? 5000 : 20000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: mine, error } = await supabase.from('chat_members').select('*').eq('user_id', user.id)
      if (error) throw error
      const ids = (mine as ChatMemberRow[]).map((m) => m.chat_id)
      if (!ids.length) return [] as ChatSummary[]
      const [chats, members, messages] = await Promise.all([
        supabase.from('chats').select('*').in('id', ids).eq('account_id', account.id),
        supabase.from('chat_members').select('*').in('chat_id', ids),
        supabase.from('chat_messages').select('*').in('chat_id', ids).order('created_at', { ascending: false }).limit(2000),
      ])
      if (chats.error) throw chats.error
      const allMembers = (members.data ?? []) as ChatMemberRow[]
      const allMessages = (messages.data ?? []) as ChatMessageRow[]
      return (chats.data as ChatRow[])
        .map((c) => {
          const myRead = (mine as ChatMemberRow[]).find((m) => m.chat_id === c.id)?.last_read_at ?? ''
          const own = allMessages.filter((m) => m.chat_id === c.id)
          return {
            ...c,
            members: allMembers.filter((m) => m.chat_id === c.id),
            last: own.find((m) => m.kind !== 'system') ?? own[0] ?? null,
            unread: own.filter((m) => m.user_id && m.user_id !== user.id && m.created_at > myRead).length,
          }
        })
        .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at))
    },
  })
}

export function useChatMessages(chatId: string | null) {
  return useQuery({
    queryKey: chatId ? chatKeys.messages(chatId) : ['chats', 'messages', 'none'],
    enabled: Boolean(chatId),
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await createClient().from('chat_messages').select('*').eq('chat_id', chatId!).order('created_at').limit(1000)
      if (error) throw error
      return data as ChatMessageRow[]
    },
  })
}

export type NewMessage = { chatId: string; kind?: ChatMessageKind; body?: string; refId?: string | null; meta?: ChatMessageRow['meta'] }

export function useChatMutations() {
  const qc = useQueryClient()
  const { account, user } = useApp()
  const tErr = useTranslations('errors')
  const onError = (e: unknown) => toast.error(tErr(toErrorCode(e as { message?: string })))
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.all })
  const supabase = () => createClient()

  const insertMessage = async (m: NewMessage) => {
    const { data, error } = await supabase()
      .from('chat_messages')
      .insert({ chat_id: m.chatId, user_id: user.id, kind: m.kind ?? 'text', body: (m.body ?? '').slice(0, 4000), ref_id: m.refId ?? null, meta: m.meta ?? {} })
      .select('*')
      .single()
    if (error) throw error
    return data as ChatMessageRow
  }

  const send = useMutation({
    mutationFn: insertMessage,
    // el mensaje aparece al instante; si falla, se quita
    onMutate: async (m) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(m.chatId) })
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
      qc.setQueryData<ChatMessageRow[]>(chatKeys.messages(m.chatId), (old) => [...(old ?? []), temp])
    },
    onError: (e) => {
      onError(e)
      refresh()
    },
    onSettled: refresh,
  })

  const markRead = useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase().from('chat_members').update({ last_read_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', user.id)
      if (error) throw error
    },
    onMutate: (chatId) => qc.setQueryData<ChatSummary[]>(chatKeys.list(account.id), (old) => old?.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c))),
  })

  /** Directo con una persona: si ya existe se reutiliza. Devuelve el id del chat. */
  const openDirect = useMutation({
    mutationFn: async (otherId: string) => {
      const list = qc.getQueryData<ChatSummary[]>(chatKeys.list(account.id)) ?? []
      const existing = list.find((c) => c.kind === 'direct' && c.members.length === 2 && c.members.some((m) => m.user_id === otherId))
      if (existing) return existing.id
      const { data, error } = await supabase().from('chats').insert({ account_id: account.id, kind: 'direct', created_by: user.id }).select('*').single()
      if (error) throw error
      const chat = data as ChatRow
      const { error: mErr } = await supabase()
        .from('chat_members')
        .insert([
          { chat_id: chat.id, user_id: user.id, role: 'owner' },
          { chat_id: chat.id, user_id: otherId, role: 'member' },
        ])
      if (mErr) throw mErr
      return chat.id
    },
    onSuccess: refresh,
    onError,
  })

  const createGroup = useMutation({
    mutationFn: async ({ name, userIds }: { name: string; userIds: string[] }) => {
      const { data, error } = await supabase()
        .from('chats')
        .insert({ account_id: account.id, kind: 'group', name: name.trim().slice(0, 80), created_by: user.id })
        .select('*')
        .single()
      if (error) throw error
      const chat = data as ChatRow
      const ids = [user.id, ...userIds.filter((id) => id !== user.id)]
      const { error: mErr } = await supabase()
        .from('chat_members')
        .insert(ids.map((id) => ({ chat_id: chat.id, user_id: id, role: id === user.id ? ('owner' as const) : ('member' as const) })))
      if (mErr) throw mErr
      await insertMessage({ chatId: chat.id, kind: 'system', meta: { system: 'created' } })
      return chat.id
    },
    onSuccess: refresh,
    onError,
  })

  const rename = useMutation({
    mutationFn: async ({ chatId, name }: { chatId: string; name: string }) => {
      const { error } = await supabase()
        .from('chats')
        .update({ name: name.trim().slice(0, 80) })
        .eq('id', chatId)
      if (error) throw error
      await insertMessage({ chatId, kind: 'system', meta: { system: 'renamed', name: name.trim().slice(0, 80) } })
    },
    onSuccess: refresh,
    onError,
  })

  const addMembers = useMutation({
    mutationFn: async ({ chatId, userIds }: { chatId: string; userIds: string[] }) => {
      if (!userIds.length) return
      const { error } = await supabase()
        .from('chat_members')
        .upsert(userIds.map((id) => ({ chat_id: chatId, user_id: id, role: 'member' as const })))
      if (error) throw error
      await insertMessage({ chatId, kind: 'system', meta: { system: 'joined', users: userIds } })
    },
    onSuccess: refresh,
    onError,
  })

  const leave = useMutation({
    mutationFn: async (chatId: string) => {
      await insertMessage({ chatId, kind: 'system', meta: { system: 'left', users: [user.id] } })
      const { error } = await supabase().from('chat_members').delete().eq('chat_id', chatId).eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError,
  })

  /** Respuesta a una invitación: se guarda en el mensaje (en la base irá en su propia tabla). */
  const rsvp = useMutation({
    mutationFn: async ({ message, answer }: { message: ChatMessageRow; answer: RsvpAnswer }) => {
      const invite = message.meta.invite
      if (!invite) return
      const meta = { ...message.meta, invite: { ...invite, rsvp: { ...invite.rsvp, [user.id]: answer } } }
      const { error } = await supabase().from('chat_messages').update({ meta }).eq('id', message.id)
      if (error) throw error
    },
    onMutate: ({ message, answer }) =>
      qc.setQueryData<ChatMessageRow[]>(chatKeys.messages(message.chat_id), (old) =>
        old?.map((m) =>
          m.id === message.id && m.meta.invite ? { ...m, meta: { ...m.meta, invite: { ...m.meta.invite, rsvp: { ...m.meta.invite.rsvp, [user.id]: answer } } } } : m,
        ),
      ),
    onSuccess: refresh,
    onError,
  })

  /** Compartir lo mismo en varios chats a la vez (tarea, archivo, doc o invitación). */
  const share = useMutation({
    mutationFn: async ({ chatIds, ...m }: Omit<NewMessage, 'chatId'> & { chatIds: string[] }) => {
      for (const chatId of chatIds) await insertMessage({ ...m, chatId })
      return chatIds.length
    },
    onSuccess: refresh,
    onError,
  })

  return { send, markRead, openDirect, createGroup, rename, addMembers, leave, rsvp, share }
}
