'use client'

import { useSyncExternalStore } from 'react'

/**
 * Avisos del escritorio (Notification API): salen cuando Veltro no está al frente, para los
 * mensajes directos y los avisos (asignaciones, comentarios, menciones). Con varias pestañas
 * abiertas sale uno solo, y ninguno si alguna pestaña de Veltro está al frente.
 */

const PREF = 'veltro:desktop-notify'
const FOCUS = 'veltro:focus-at'
const SEEN = 'veltro:notified'

export type DesktopState = 'unsupported' | 'denied' | 'default' | 'on' | 'off'

const subs = new Set<() => void>()
const changed = () => subs.forEach((f) => f())

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // sin almacenamiento: se olvida al recargar
  }
}

export function desktopState(): DesktopState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  const p = Notification.permission
  if (p === 'denied') return 'denied'
  if (p === 'default') return 'default'
  return read(PREF) === 'off' ? 'off' : 'on'
}

export async function enableDesktop(): Promise<DesktopState> {
  if (!('Notification' in window)) return 'unsupported'
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (p === 'granted') write(PREF, 'on')
  changed()
  return desktopState()
}

export function disableDesktop() {
  write(PREF, 'off')
  changed()
}

function subscribe(f: () => void) {
  subs.add(f)
  const onStorage = (e: StorageEvent) => e.key === PREF && f()
  window.addEventListener('storage', onStorage)
  // si la persona cambia el permiso desde el candado del navegador
  let status: PermissionStatus | null = null
  navigator.permissions
    ?.query({ name: 'notifications' as PermissionName })
    .then((s) => {
      status = s
      s.onchange = f
    })
    .catch(() => undefined)
  return () => {
    subs.delete(f)
    window.removeEventListener('storage', onStorage)
    if (status) status.onchange = null
  }
}

export function useDesktopState() {
  return useSyncExternalStore(subscribe, desktopState, () => 'unsupported' as DesktopState)
}

// ---------- ¿alguna pestaña de Veltro al frente? ----------

const inFront = () => document.visibilityState === 'visible' && document.hasFocus()

/** La pestaña al frente lo deja anotado cada 2 s: las de atrás no avisan mientras tanto. */
export function trackFocus() {
  const beat = () => {
    if (inFront()) write(FOCUS, String(Date.now()))
  }
  const leave = () => {
    if (!inFront()) write(FOCUS, '0')
  }
  beat()
  const id = window.setInterval(beat, 2000)
  window.addEventListener('focus', beat)
  window.addEventListener('blur', leave)
  document.addEventListener('visibilitychange', beat)
  return () => {
    window.clearInterval(id)
    window.removeEventListener('focus', beat)
    window.removeEventListener('blur', leave)
    document.removeEventListener('visibilitychange', beat)
  }
}

export function veltroInFront() {
  return inFront() || Date.now() - Number(read(FOCUS) ?? 0) < 4000
}

// ---------- mostrar ----------

function seen(tag: string) {
  let list: string[] = []
  try {
    list = JSON.parse(read(SEEN) ?? '[]')
  } catch {
    list = []
  }
  if (list.includes(tag)) return true
  write(SEEN, JSON.stringify([...list.slice(-49), tag]))
  return false
}

export async function showDesktop({ tag, title, body, onClick }: { tag: string; title: string; body?: string; onClick?: () => void }) {
  if (desktopState() !== 'on' || veltroInFront()) return
  const run = () => {
    if (seen(tag)) return
    try {
      const n = new Notification(title, { body, tag, icon: '/android-chrome-192.png' })
      n.onclick = () => {
        window.focus()
        onClick?.()
        n.close()
      }
    } catch {
      // algunos navegadores solo permiten avisos desde un service worker
    }
  }
  // varias pestañas reciben el mismo evento: la primera que toma el candado avisa
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (locks?.request) {
    await locks.request(`veltro-notify-${tag}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return
      run()
      await new Promise((r) => setTimeout(r, 1500))
    })
  } else run()
}
