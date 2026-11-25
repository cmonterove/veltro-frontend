'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useApp } from './app-context'
import { useLocalStorage } from '@/lib/hooks'
import { api } from '@/lib/api/client'
import { NAV_KEYS, navRoleOf, resolveNav, type NavKey, type NavPrefs, type NavRole } from '@/lib/nav'

/** El rol de la persona para el menú: quien lidera, quien hace o invitado. */
export function useNavRole(): NavRole {
  const { user, accountRole, members, departments } = useApp()
  return useMemo(() => navRoleOf(user.id, accountRole, members, departments), [user.id, accountRole, members, departments])
}

/** Lo guardado (en el perfil o en el navegador), solo con páginas que existen; sin forma de menú, nada. */
function cleanPrefs(raw: unknown): NavPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const { order, more } = raw as { order?: unknown; more?: unknown }
  if (!Array.isArray(order) || !Array.isArray(more)) return null
  const known = (xs: unknown[]) => [...new Set(xs.filter((k): k is NavKey => typeof k === 'string' && (NAV_KEYS as readonly string[]).includes(k)))]
  return { order: known(order), more: known(more) }
}
const same = (a: NavPrefs | null, b: NavPrefs | null) => JSON.stringify(a) === JSON.stringify(b)

const localKey = (userId: string) => `veltro:nav:${userId}`
/** Un cambio de aquí que todavía no llegó al perfil (sin conexión, la API no respondió): al abrir, se sube. */
const dirtyKey = (userId: string) => `veltro:nav-dirty:${userId}`

function readLocal(userId: string): { raw: string | null; dirty: boolean } {
  try {
    return { raw: localStorage.getItem(localKey(userId)), dirty: localStorage.getItem(dirtyKey(userId)) === '1' }
  } catch {
    return { raw: null, dirty: false }
  }
}

// Una sola subida para toda la pestaña (el menú se usa en la barra, en ⌘K y en los atajos): los cambios
// seguidos (arrastrar, ocultar varias) se juntan.
let saveTimer: number | undefined
let syncedFor: string | null = null

function saveToProfile(userId: string, prefs: NavPrefs | null) {
  try {
    localStorage.setItem(dirtyKey(userId), '1')
  } catch {
    // sin almacenamiento: se intenta igual
  }
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    api('/v1/me', { method: 'PATCH', body: { navPrefs: prefs } })
      .then(() => {
        try {
          localStorage.removeItem(dirtyKey(userId))
        } catch {
          // nada que limpiar
        }
      })
      // queda marcado: se vuelve a subir la próxima vez que se abra Veltro
      .catch(() => undefined)
  }, 600)
}

/**
 * El menú que armó la persona (orden y qué va en «Más»); sin armar, el de su rol. Vive en su perfil, así
 * la sigue a cualquier computadora; este navegador guarda una copia para pintarlo al instante.
 * `setPrefs(null)` vuelve al de fábrica.
 */
export function useNav() {
  const { user, profile } = useApp()
  const role = useNavRole()
  const server = useMemo(() => cleanPrefs(profile.nav_prefs), [profile.nav_prefs])
  // lo del perfil es el punto de partida (también al pintar en el servidor, sin saltos)
  const [local, setLocal] = useLocalStorage<NavPrefs | null>(localKey(user.id), server)
  const prefs = useMemo(() => cleanPrefs(local), [local])

  // Al abrir: lo del perfil manda (lo pudo cambiar en otra computadora), salvo que aquí haya quedado un
  // cambio sin subir; y el menú que alguien armó antes solo en este navegador pasa a su perfil.
  useEffect(() => {
    if (syncedFor === user.id) return
    syncedFor = user.id
    const { raw, dirty } = readLocal(user.id)
    let here: NavPrefs | null = null
    try {
      here = raw ? cleanPrefs(JSON.parse(raw)) : null
    } catch {
      here = null
    }
    if (raw !== null && (dirty || !server)) {
      if (!same(here, server)) saveToProfile(user.id, here)
      return
    }
    if (server && !same(server, here)) setLocal(server)
  }, [user.id, server, setLocal])

  const setPrefs = useCallback(
    (next: NavPrefs | null) => {
      // el de fábrica se guarda como un menú vacío (no null): así otra computadora sabe que se eligió
      // volver al de fábrica y no lo confunde con «nunca lo armó»
      const value = next ?? { order: [], more: [] }
      setLocal(value)
      saveToProfile(user.id, value)
    },
    [setLocal, user.id],
  )

  const resolved = useMemo(() => resolveNav(role, prefs), [role, prefs])
  return { role, prefs, setPrefs, ...resolved }
}
