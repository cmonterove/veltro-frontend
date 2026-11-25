'use client'

import { useMemo } from 'react'
import { useApp } from './app-context'
import { useLocalStorage } from '@/lib/hooks'
import { navRoleOf, resolveNav, type NavPrefs, type NavRole } from '@/lib/nav'

/** El rol de la persona para el menú: quien lidera, quien hace o invitado. */
export function useNavRole(): NavRole {
  const { user, accountRole, members, departments } = useApp()
  return useMemo(() => navRoleOf(user.id, accountRole, members, departments), [user.id, accountRole, members, departments])
}

/**
 * El menú que armó la persona (orden y qué va en «Más»), guardado en este navegador; sin armar, el de
 * su rol. `setPrefs(null)` vuelve al de fábrica.
 */
export function useNav() {
  const { user } = useApp()
  const role = useNavRole()
  const [prefs, setPrefs] = useLocalStorage<NavPrefs | null>(`veltro:nav:${user.id}`, null)
  const resolved = useMemo(() => resolveNav(role, prefs), [role, prefs])
  return { role, prefs, setPrefs, ...resolved }
}
