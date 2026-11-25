'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Tiempo real: la API avisa por SSE cada cambio que importa (mensaje nuevo, editado, leído, aviso
 * nuevo, alguien escribiendo; una tarea, un comentario, un doc o una solicitud que cambió). Los eventos traen ids, no contenido: quien los recibe vuelve a pedir
 * lo suyo por la API. La conexión la abre `RealtimeConnection` (en el shell); aquí viven el estado
 * («en vivo» o no), el reparto de eventos y quién está escribiendo en cada chat.
 */

export type RealtimeEvent =
  | { type: 'msg' | 'msg_upd'; chat: string; msg: string; by: string | null; kind: string }
  | { type: 'read' | 'chat'; chat: string }
  | { type: 'typing'; chat: string; by: string }
  | { type: 'ntf'; acct: string; id: string }
  | { type: 'ntf_sync'; acct: string }
  | { type: 'req'; id: string }
  | { type: 'task'; id: string; ws: string; by: string | null }
  | { type: 'cmt'; task: string; ws: string; by: string | null }
  | { type: 'doc'; id: string; ws: string; by: string | null }

export const REALTIME_TYPES = ['msg', 'msg_upd', 'read', 'chat', 'typing', 'ntf', 'ntf_sync', 'req', 'task', 'cmt', 'doc'] as const

// ---------- en vivo ----------

let live = false
const liveSubs = new Set<() => void>()

export function setRealtimeLive(v: boolean) {
  if (live === v) return
  live = v
  liveSubs.forEach((f) => f())
}

const subscribeLive = (f: () => void) => {
  liveSubs.add(f)
  return () => liveSubs.delete(f)
}

/** ¿Llegan los cambios en vivo? Sin conexión, las consultas vuelven a preguntar seguido. */
export function useRealtimeLive() {
  return useSyncExternalStore(subscribeLive, () => live, () => false)
}

// ---------- eventos ----------

const listeners = new Set<(e: RealtimeEvent) => void>()

export function emitRealtime(e: RealtimeEvent) {
  if (e.type === 'typing') markTyping(e.chat, e.by)
  // quien manda un mensaje ya no está escribiendo
  if (e.type === 'msg' && e.by) clearTyping(e.chat, e.by)
  listeners.forEach((f) => {
    try {
      f(e)
    } catch {
      // un oyente roto no frena a los demás
    }
  })
}

/** Escuchar los eventos en vivo (mientras el componente está montado). */
export function useRealtimeEvent(fn: (e: RealtimeEvent) => void) {
  useEffect(() => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [fn])
}

// ---------- escribiendo ----------

/** Cuánto dura «está escribiendo» sin otro aviso (quien escribe avisa cada 3 s). */
const TYPING_MS = 6000
const typing = new Map<string, Map<string, number>>()
const typingSubs = new Set<() => void>()
const typingSnap = new Map<string, string[]>()
const EMPTY: string[] = []

function changed(chat: string) {
  const now = Date.now()
  const m = typing.get(chat)
  const ids = m ? [...m].filter(([, until]) => until > now).map(([id]) => id) : []
  typingSnap.set(chat, ids.length ? ids : EMPTY)
  typingSubs.forEach((f) => f())
}

function markTyping(chat: string, user: string) {
  let m = typing.get(chat)
  if (!m) typing.set(chat, (m = new Map()))
  m.set(user, Date.now() + TYPING_MS)
  changed(chat)
  setTimeout(() => changed(chat), TYPING_MS + 50)
}

function clearTyping(chat: string, user: string) {
  if (typing.get(chat)?.delete(user)) changed(chat)
}

const subscribeTyping = (f: () => void) => {
  typingSubs.add(f)
  return () => typingSubs.delete(f)
}

/** Quiénes están escribiendo en ese chat ahora (ids). */
export function useTypingIn(chatId: string) {
  return useSyncExternalStore(
    subscribeTyping,
    () => typingSnap.get(chatId) ?? EMPTY,
    () => EMPTY,
  )
}
