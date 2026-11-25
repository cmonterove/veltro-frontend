import type { AccountRole, DepartmentRow } from '@/lib/database.types'
import { subtreeOf } from '@/lib/org'

/**
 * El menú de la app: qué páginas ve cada rol y en qué grupo va cada una. Cada persona después lo arma a
 * su gusto (el orden dentro de cada grupo y qué pasa a «Más»); Pulso va siempre arriba, fijo, y no entra
 * en esta lista.
 */
export const NAV_KEYS = ['dashboards', 'tasks', 'mail', 'calendar', 'decisions', 'chat', 'mesa', 'requests', 'vault'] as const
export type NavKey = (typeof NAV_KEYS)[number]

export type NavGroupId = 'work' | 'team'
/**
 * Los grupos con su orden de fábrica: Trabajo (Dashboards arriba de Tareas; Decisiones, lo que salió de
 * las reuniones) y Equipo (lo que se comparte: Pasillo, Mesa, Solicitudes y la Bóveda).
 */
export const NAV_GROUPS: { id: NavGroupId; keys: readonly NavKey[] }[] = [
  { id: 'work', keys: ['dashboards', 'tasks', 'mail', 'calendar', 'decisions'] },
  { id: 'team', keys: ['chat', 'mesa', 'requests', 'vault'] },
]

/** Quien lidera (dueños, admins y quien tiene gente a cargo), quien hace (el resto) e invitados. */
export type NavRole = 'leader' | 'member' | 'guest'

export const NAV_HREF: Record<NavKey, string> = {
  dashboards: '/dashboards',
  tasks: '/tasks',
  calendar: '/calendar',
  mail: '/mail',
  chat: '/chat',
  mesa: '/mesa',
  requests: '/requests',
  vault: '/vault',
  decisions: '/decisions',
}

/** Qué páginas existen para cada rol: las demás no aparecen (ni en el menú, ni en ⌘K, ni con los atajos). */
const ALLOWED: Record<NavRole, readonly NavKey[]> = {
  // Dashboards y Mesa son para ver cómo va la gente: sin nadie a cargo, solo mostrarían lo propio
  leader: NAV_KEYS,
  member: ['tasks', 'mail', 'calendar', 'requests', 'chat', 'decisions', 'vault'],
  // un invitado trabaja dentro de los espacios que le compartieron: sin solicitudes entre departamentos
  guest: ['tasks', 'mail', 'calendar', 'chat', 'decisions', 'vault'],
}

/** El menú que armó la persona: el orden (dentro de cada grupo) y qué pasó a «Más». */
export type NavPrefs = { order: NavKey[]; more: NavKey[] }

export function navRoleOf(
  userId: string,
  accountRole: AccountRole,
  members: Parameters<typeof subtreeOf>[1],
  departments: Pick<DepartmentRow, 'id' | 'head_id'>[],
): NavRole {
  if (accountRole === 'guest') return 'guest'
  if (accountRole === 'owner' || accountRole === 'admin') return 'leader'
  return subtreeOf(userId, members, departments).size > 1 ? 'leader' : 'member'
}

export const navAllowed = (role: NavRole): readonly NavKey[] => ALLOWED[role]

/** ¿El rol ve la página de esa dirección? (Pulso, Ajustes y lo que no es del menú: siempre.) */
export function navHrefAllowed(role: NavRole, href: string) {
  const key = NAV_KEYS.find((k) => NAV_HREF[k] === href)
  return !key || ALLOWED[role].includes(key)
}

export type ResolvedNav = { groups: { id: NavGroupId; keys: NavKey[] }[]; more: NavKey[] }

/**
 * El menú de esa persona: cada grupo con lo que va a la vista (en su orden) y lo que pasó a «Más». De
 * fábrica todo lo que el rol ve va a la vista; lo que todavía no ordenó (una página nueva, o una que su
 * rol recién le abrió) entra donde va de fábrica. Un grupo sin nada a la vista no se muestra.
 */
export function resolveNav(role: NavRole, prefs: NavPrefs | null): ResolvedNav {
  const allowed = ALLOWED[role]
  const known = (prefs?.order ?? []).filter((k) => allowed.includes(k))
  const more = (prefs?.more ?? []).filter((k) => allowed.includes(k))
  const groups = NAV_GROUPS.map((g) => {
    const mine = g.keys.filter((k) => allowed.includes(k))
    const ordered = [...known.filter((k) => mine.includes(k)), ...mine.filter((k) => !known.includes(k))]
    return { id: g.id, keys: ordered.filter((k) => !more.includes(k)) }
  })
  // «Más» en el orden de los grupos
  const moreOrdered = NAV_GROUPS.flatMap((g) => g.keys).filter((k) => more.includes(k))
  return { groups, more: moreOrdered }
}

/**
 * El orden completo que se guarda: grupo por grupo y, al final, lo de «Más» que no esté ya en un grupo
 * (el editor muestra cada página en su grupo aunque esté en «Más»: así no queda repetida).
 */
export function navOrderOf(nav: ResolvedNav): NavKey[] {
  return [...new Set([...nav.groups.flatMap((g) => g.keys), ...nav.more])]
}
