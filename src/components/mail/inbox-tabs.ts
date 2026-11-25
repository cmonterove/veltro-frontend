'use client'

import { useSyncExternalStore } from 'react'

/**
 * Recibidos con pestañas (Principal, Promociones, Social…) como en Gmail, o todo junto. Gmail no deja
 * saber cómo lo tiene cada persona, así que de entrada van con pestañas las cuentas de Gmail (vienen
 * así) y todo junto las de empresa (Google Workspace, que vienen sin pestañas). Lo que se elija queda
 * en este navegador, por cuenta.
 */
type Box = { id: string; email: string }

const key = (id: string) => `veltro:mail-tabs:${id}`
const EVENT = 'veltro:mail-tabs'
// lo elegido en esta página, por si el navegador no deja guardar
const chosen = new Map<string, boolean>()

export const tabsByDefault = (email: string) => /@(gmail|googlemail)\.com$/i.test(email.trim())

function read(b: Box) {
  const here = chosen.get(b.id)
  if (here !== undefined) return here
  try {
    const v = localStorage.getItem(key(b.id))
    if (v === '1' || v === '0') return v === '1'
  } catch {
    // sin almacenamiento: lo de entrada
  }
  return tabsByDefault(b.email)
}

export function setInboxTabs(b: Box, on: boolean) {
  chosen.set(b.id, on)
  try {
    localStorage.setItem(key(b.id), on ? '1' : '0')
  } catch {
    // no queda guardado, pero cambia igual en esta página
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

/** ¿Esta cuenta ve Recibidos con pestañas? */
export function useInboxTabs(b: Box | null) {
  return useSyncExternalStore(
    subscribe,
    () => (b ? read(b) : false),
    () => (b ? tabsByDefault(b.email) : false),
  )
}

/** Lo mismo para varias cuentas a la vez (la barra, el menú de cuentas): `tabsOf(i)`. */
export function useInboxTabsOf(boxes: Box[]) {
  const flags = useSyncExternalStore(
    subscribe,
    () => boxes.map((b) => (read(b) ? '1' : '0')).join(''),
    () => boxes.map((b) => (tabsByDefault(b.email) ? '1' : '0')).join(''),
  )
  return (i: number) => flags[i] === '1'
}

/** Lo sin leer de una cuenta según cómo ve Recibidos: con pestañas, solo lo de Principal (como Gmail). */
export const unreadOf = (b: { unread: number | null; unreadPrimary: number | null }, tabs: boolean) => (tabs ? (b.unreadPrimary ?? b.unread) : b.unread) ?? 0
