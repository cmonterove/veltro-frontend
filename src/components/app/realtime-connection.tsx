'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp, useMemberMap } from './app-context'
import { api } from '@/lib/api/client'
import { toChatSummary, type ApiChat } from '@/lib/api/pasillo-boveda'
import { chatKeys, refreshChatMessages, type ChatSummary } from '@/lib/queries/chats'
import { fetchNotification, notificationKeys } from '@/lib/queries/notifications'
import { emitRealtime, REALTIME_TYPES, setRealtimeLive, useRealtimeEvent, type RealtimeEvent } from '@/lib/realtime'
import { showDesktop, trackFocus, veltroInFront } from '@/lib/desktop-notify'
import { useChatPreview } from '@/components/chat/chat-bits'
import { useNotificationCopy } from '@/components/notifications/notification-copy'
import { useOpenTask } from '@/lib/use-open-task'
import { DEMO } from '@/lib/demo/config'

/**
 * El canal en vivo con la API (SSE). La web pide un pase de un minuto por el puente (con la sesión
 * de la cookie) y abre el canal directo contra la API. Si se corta, vuelve a pedir pase con espera
 * creciente; la API lo cierra sola cada 10 minutos (`bye`). Cada evento vuelve a pedir lo suyo y,
 * con Veltro en segundo plano, los directos y los avisos salen como avisos del escritorio.
 */
export function RealtimeConnection() {
  useConnection()
  useRouting()
  useEffect(() => trackFocus(), [])
  return null
}

function useConnection() {
  const qc = useQueryClient()
  useEffect(() => {
    if (DEMO || typeof EventSource === 'undefined') return
    let es: EventSource | null = null
    let stopped = false
    let retry = 0
    let timer: number | undefined
    let wasLive = false

    const schedule = () => {
      if (stopped) return
      window.clearTimeout(timer)
      const wait = Math.min(30_000, 1000 * 2 ** retry++) + Math.random() * 700
      timer = window.setTimeout(connect, wait)
    }

    const connect = async () => {
      if (stopped) return
      es?.close()
      try {
        const { ticket, url } = await api<{ ticket: string; url: string }>('/v1/events/ticket', { method: 'POST' })
        if (stopped) return
        const source = new EventSource(`${url}?ticket=${encodeURIComponent(ticket)}`)
        es = source
        source.addEventListener('ready', (ev) => {
          retry = 0
          const live = Boolean(JSON.parse((ev as MessageEvent).data || '{}').live)
          setRealtimeLive(live)
          // volver de un corte: lo que pasó mientras tanto
          if (live && wasLive) {
            qc.invalidateQueries({ queryKey: chatKeys.all })
            qc.invalidateQueries({ queryKey: ['notifications'] })
          }
          wasLive = wasLive || live
        })
        for (const type of REALTIME_TYPES) {
          source.addEventListener(type, (ev) => {
            try {
              emitRealtime({ type, ...JSON.parse((ev as MessageEvent).data) } as RealtimeEvent)
            } catch {
              // evento mal formado: se ignora
            }
          })
        }
        source.addEventListener('bye', () => {
          source.close()
          connect()
        })
        // EventSource reintentaría con el mismo pase (ya vencido): se cierra y se pide otro
        source.onerror = () => {
          source.close()
          setRealtimeLive(false)
          schedule()
        }
      } catch {
        setRealtimeLive(false)
        schedule()
      }
    }

    const onOnline = () => {
      if (!es || es.readyState === EventSource.CLOSED) {
        retry = 0
        window.clearTimeout(timer)
        connect()
      }
    }
    connect()
    window.addEventListener('online', onOnline)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      es?.close()
      setRealtimeLive(false)
    }
  }, [qc])
}

/** Qué hace cada evento: volver a pedir lo suyo y, si toca, avisar. */
function useRouting() {
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const { account, user } = useApp()
  const memberMap = useMemberMap()
  const preview = useChatPreview()
  const copy = useNotificationCopy()
  const { open: openTask } = useOpenTask()
  const t = useTranslations('notifications')

  // lo último de cada cosa, sin volver a suscribirse en cada render
  const ctx = useRef({ account, user, memberMap, preview, copy, openTask, pathname, router, t })
  ctx.current = { account, user, memberMap, preview, copy, openTask, pathname, router, t }

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      const { account, user } = ctx.current
      switch (e.type) {
        case 'msg':
        case 'msg_upd': {
          refreshChatMessages(qc, e.chat, e.type === 'msg_upd')
          qc.invalidateQueries({ queryKey: chatKeys.list(account.id) })
          qc.invalidateQueries({ queryKey: chatKeys.unread(account.id) })
          if (e.type === 'msg' && e.by && e.by !== user.id && e.kind !== 'system') void desktopForMessage(e.chat, e.msg)
          break
        }
        case 'read':
        case 'chat':
          qc.invalidateQueries({ queryKey: chatKeys.list(account.id) })
          qc.invalidateQueries({ queryKey: chatKeys.unread(account.id) })
          break
        case 'ntf':
          // la de otra cuenta también: una invitación a otra cuenta sale en la campana de esta
          qc.invalidateQueries({ queryKey: notificationKeys.all(e.acct) })
          if (e.acct !== account.id) qc.invalidateQueries({ queryKey: notificationKeys.all(account.id) })
          if (e.acct === account.id) queueAnnounce(e.id)
          break
        case 'ntf_sync':
          qc.invalidateQueries({ queryKey: notificationKeys.all(e.acct) })
          break
        // una solicitud cambió (mensaje, estado, tareas): su detalle y las listas
        case 'req':
          qc.invalidateQueries({ queryKey: ['request', e.id] })
          qc.invalidateQueries({ queryKey: ['requests'] })
          break
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc],
  )
  useRealtimeEvent(onEvent)

  /** Un directo nuevo con Veltro en segundo plano: aviso del escritorio con quién y qué. */
  async function desktopForMessage(chatId: string, messageId: string) {
    if (veltroInFront()) return
    const { account, memberMap, preview, router } = ctx.current
    const cached = qc.getQueryData<ChatSummary[]>(chatKeys.list(account.id))?.find((c) => c.id === chatId)
    // los grupos avisan solo con una mención (llega como aviso aparte)
    if (cached && cached.kind !== 'direct') return
    let chat = cached
    try {
      const fresh = toChatSummary(await api<ApiChat>(`/v1/chats/${chatId}`))
      if (fresh.kind !== 'direct') return
      chat = fresh
    } catch {
      return
    }
    const last = chat?.last
    if (!chat || !last || last.id !== messageId) return
    const who = memberMap.get(last.user_id ?? '')?.full_name ?? ''
    await showDesktop({
      tag: `msg-${messageId}`,
      title: who,
      body: preview(last),
      onClick: () => router.push(`/chat/${chatId}`),
    })
  }

  // los que llegan juntos (los recordatorios de la mañana) salen como uno solo
  const batch = useRef<{ ids: string[]; timer: number | null }>({ ids: [], timer: null })
  function queueAnnounce(id: string) {
    const b = batch.current
    b.ids.push(id)
    if (b.timer) return
    b.timer = window.setTimeout(() => {
      const ids = b.ids
      b.ids = []
      b.timer = null
      if (ids.length === 1) void announce(ids[0]!)
      else void announceMany(ids.length)
    }, 1200)
  }

  async function announceMany(count: number) {
    const { t } = ctx.current
    const title = t('manyNew', { count })
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      toast(title)
      return
    }
    await showDesktop({ tag: `ntf-batch-${Date.now()}`, title })
  }

  /** Un aviso nuevo: al frente, un toast con «Ver»; en segundo plano, aviso del escritorio. */
  async function announce(id: string) {
    const { account, copy, t } = ctx.current
    const n = await fetchNotification(account.id, id).catch(() => null)
    if (!n) return
    const { title, body } = copy(n)
    const go = () => {
      const { openTask, router } = ctx.current
      qc.setQueryData<number>(notificationKeys.unread(account.id), (c) => Math.max(0, (c ?? 1) - 1))
      void api(`/v1/accounts/${account.id}/notifications/read`, { method: 'POST', body: { ids: [n.id] } }).catch(() => undefined)
      if (n.chat && n.kind === 'chat_thread' && typeof n.data?.root === 'string') router.push(`/chat/${n.chat.id}?m=${n.data.root}&t=${n.data.root}`)
      else if (n.chat && n.message) router.push(`/chat/${n.chat.id}?m=${n.message.id}`)
      else if (n.request) router.push(`/requests/${n.request.id}`)
      else if (n.task) openTask(n.task.id)
      else if (n.kind === 'member_joined') router.push('/settings/members')
    }
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      toast(title, { description: body || undefined, action: { label: t('toastView'), onClick: go } })
      return
    }
    await showDesktop({ tag: `ntf-${n.id}`, title, body, onClick: go })
  }
}
