'use client'

// Telemetría para la consola de administración (veltro-console):
// - presencia: un latido cada 2 minutos mientras la pestaña está visible (tabla user_sessions)
// - eventos: pantallas (view.*) y funciones (feature.*), en lotes (tabla usage_events)
// Las escrituras (tareas, docs, reuniones...) ya se registran solas con triggers en la base.
// Nunca rompe la app: todo error se ignora.

import { createClient } from '@/lib/supabase/client'

type TrackedEvent = { event: string; workspace_id?: string | null; account_id?: string | null; props?: Record<string, string | number | boolean> }

let queue: TrackedEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let accountId: string | null = null

export function setTelemetryAccount(id: string | null) {
  accountId = id
}

export function track(event: `view.${string}` | `feature.${string}`, opts: { workspaceId?: string | null; props?: TrackedEvent['props'] } = {}) {
  if (typeof window === 'undefined') return
  queue.push({ event, workspace_id: opts.workspaceId ?? null, account_id: accountId, props: opts.props })
  if (queue.length >= 20) flushEvents()
  else timer ??= setTimeout(flushEvents, 8000)
}

export function flushEvents() {
  if (timer) clearTimeout(timer)
  timer = null
  if (!queue.length) return
  const batch = queue.slice(0, 25)
  queue = queue.slice(25)
  createClient()
    .rpc('track_events', { p_events: batch })
    .then(
      () => {},
      () => {},
    )
}

export function clientInfo() {
  const ua = navigator.userAgent
  const device = /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Otro'
  const os = /iPhone|iPad|iPod/.test(ua) ? (device === 'tablet' ? 'iPadOS' : 'iOS') : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Otro'
  return { device, browser, os }
}

export function ping() {
  createClient()
    .rpc('touch_presence', { p_client: clientInfo() })
    .then(
      () => {},
      () => {},
    )
}

/** Pantalla actual a partir de la ruta (los ids no se registran). */
export function viewEvent(pathname: string): `view.${string}` | null {
  if (pathname === '/home') return 'view.pulse'
  if (pathname === '/mesa') return 'view.mesa'
  if (pathname === '/calendar') return 'view.calendar'
  if (pathname === '/tasks') return 'view.my_tasks'
  if (pathname.startsWith('/m/')) return 'view.meeting_room'
  if (pathname.startsWith('/settings')) return 'view.settings'
  const w = pathname.match(/^\/w\/[^/]+(\/[^/]+)?(\/[^/]+)?/)
  if (w) {
    if (!w[1]) return 'view.workspace_overview'
    if (w[1] === '/tasks') return 'view.workspace_tasks'
    if (w[1] === '/meetings') return 'view.workspace_meetings'
    if (w[1] === '/docs') return w[2] ? 'view.doc' : 'view.workspace_docs'
  }
  return null
}
