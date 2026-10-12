// Organigrama: quién reporta a quién y qué personas "ve" cada uno.
// Espejo en el cliente de public.my_visible_members() (la base es la que hace cumplir los permisos).

import type { AccountRole, DepartmentRow } from './database.types'

type OrgMember = { id: string; role: AccountRole; reports_to: string | null; department_id: string | null }

/** Reportes directos e indirectos de `userId` (él incluido), solo por "reporta a". */
function reportsOf(userId: string, members: OrgMember[]): Set<string> {
  const byBoss = new Map<string, string[]>()
  for (const m of members) if (m.reports_to) byBoss.set(m.reports_to, [...(byBoss.get(m.reports_to) ?? []), m.id])
  const out = new Set<string>()
  const stack = [userId]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    stack.push(...(byBoss.get(id) ?? []))
  }
  return out
}

/** Departamento de cada persona: el suyo o, si no tiene, el del primer jefe hacia arriba que tenga uno. */
export function effectiveDepartments(members: OrgMember[]): Map<string, string | null> {
  const byId = new Map(members.map((m) => [m.id, m]))
  const out = new Map<string, string | null>()
  for (const m of members) {
    let cur: OrgMember | undefined = m
    const seen = new Set<string>()
    while (cur && !cur.department_id && cur.reports_to && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = byId.get(cur.reports_to)
    }
    out.set(m.id, cur?.department_id ?? null)
  }
  return out
}

/**
 * Integrantes de un departamento: quienes pertenecen a él (directo o heredado del jefe) y su jefe.
 * No arrastra a la gente que alguien del departamento tiene debajo si esa gente es de otra área:
 * poner al gerente general en "Tecnología" no mete a toda la empresa en Tecnología.
 */
export function departmentMembers(dept: Pick<DepartmentRow, 'id' | 'head_id'>, members: OrgMember[]): Set<string> {
  const eff = effectiveDepartments(members)
  const out = new Set(members.filter((m) => eff.get(m.id) === dept.id).map((m) => m.id))
  if (dept.head_id) out.add(dept.head_id)
  return out
}

/** Personas que `userId` tiene a cargo: él mismo, sus reportes directos e indirectos y los integrantes de los departamentos que encabeza. */
export function subtreeOf(userId: string, members: OrgMember[], departments: Pick<DepartmentRow, 'id' | 'head_id'>[]): Set<string> {
  const out = reportsOf(userId, members)
  for (const d of departments) if (d.head_id === userId) departmentMembers(d, members).forEach((id) => out.add(id))
  return out
}

/** Lo que ve el usuario actual: toda la cuenta si es owner/admin; si no, su rama del organigrama. */
export function visibleUserIds(me: string, myRole: AccountRole, members: OrgMember[], departments: Pick<DepartmentRow, 'id' | 'head_id'>[]) {
  if (myRole === 'owner' || myRole === 'admin') return new Set(members.map((m) => m.id))
  return subtreeOf(me, members, departments)
}

export type OrgNode<M> = { member: M; children: OrgNode<M>[] }

/** Árbol por "reporta a"; quien no reporta a nadie (o a alguien fuera de la cuenta) es raíz. */
export function buildOrgTree<M extends OrgMember>(members: M[]): OrgNode<M>[] {
  const ids = new Set(members.map((m) => m.id))
  const nodes = new Map(members.map((m) => [m.id, { member: m, children: [] as OrgNode<M>[] }]))
  const roots: OrgNode<M>[] = []
  for (const m of members) {
    const node = nodes.get(m.id)!
    if (m.reports_to && ids.has(m.reports_to) && m.reports_to !== m.id) nodes.get(m.reports_to)!.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** Ids que no pueden ser jefe de `userId` sin crear un ciclo (él y todos los que tiene debajo). */
export function invalidBossesFor(userId: string, members: OrgMember[]) {
  return reportsOf(userId, members)
}
