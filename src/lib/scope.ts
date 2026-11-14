'use client'

// Alcance de lo que se mira en Pulso, Tareas y Mesa: mías, las que delegué (pedí o asigné a otras
// personas), las que sigo, mi equipo (todo lo que tengo debajo en el organigrama), toda la empresa
// (admins), un equipo de trabajo, un departamento o una persona. Espejo de lib/org.ts de la API.

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { differenceInCalendarDays, parseISO, subDays } from 'date-fns'
import { useApp } from '@/components/app/app-context'
import { departmentMembers, subtreeOf, visibleUserIds } from './org'
import type { TaskRow } from './database.types'

export type ScopeOption = {
  id: string
  /** nombre corto, para el menú */
  label: string
  /** nombre con su tipo, para títulos y el botón ("Departamento Comercial") */
  display: string
  /** quiénes entran, en una línea ("Ana, Pepito y Lucía") */
  hint: string
  kind: 'me' | 'delegated' | 'following' | 'team' | 'all' | 'group' | 'dept' | 'person'
  /** por responsables; en Delegadas y Siguiendo va vacío (la API arma la población) */
  userIds: Set<string>
  /** color del equipo de trabajo */
  color?: string
}

export function useScopes() {
  const t = useTranslations('scope')
  const locale = useLocale()
  const { user, accountRole, members, departments, teams } = useApp()
  return useMemo(() => {
    const admin = accountRole === 'owner' || accountRole === 'admin'
    const visible = visibleUserIds(user.id, accountRole, members, departments)
    const team = subtreeOf(user.id, members, departments)
    const byId = new Map(members.map((m) => [m.id, m]))
    const list = new Intl.ListFormat(locale, { type: 'conjunction' })
    // "Ana, Pepito y Lucía": primeros nombres; uno mismo va primero como "Tú" si se pide
    const names = (ids: Set<string>, withMe = false) =>
      list.format([
        ...(withMe && ids.has(user.id) ? [t('you')] : []),
        ...[...ids].filter((id) => id !== user.id).map((id) => byId.get(id)?.full_name.split(' ')[0] ?? '').filter(Boolean),
      ])
    const deptName = new Map(departments.map((d) => [d.id, d.name]))

    const options: ScopeOption[] = [
      { id: 'me', label: t('me'), display: t('me'), hint: t('hintMe'), kind: 'me', userIds: new Set([user.id]) },
      { id: 'delegated', label: t('delegated'), display: t('delegated'), hint: t('hintDelegated'), kind: 'delegated', userIds: new Set() },
      { id: 'following', label: t('following'), display: t('following'), hint: t('hintFollowing'), kind: 'following', userIds: new Set() },
    ]
    if (team.size > 1) options.push({ id: 'team', label: t('team', { count: team.size - 1 }), display: t('teamShort'), hint: t('hintTeam', { names: names(team) }), kind: 'team', userIds: team })
    if (admin) options.push({ id: 'all', label: t('all'), display: t('all'), hint: t('hintAll', { count: members.length }), kind: 'all', userIds: new Set(members.map((m) => m.id)) })
    // equipos de trabajo: los ven los admins, quienes están en él y quien ve a toda su gente (igual que la API)
    for (const g of teams) {
      const ids = new Set(g.memberIds)
      if (ids.size && (admin || ids.has(user.id) || [...ids].every((id) => visible.has(id))))
        options.push({ id: `group:${g.id}`, label: g.name, display: g.name, hint: names(ids, true), kind: 'group', userIds: ids, color: g.color })
    }
    for (const d of departments) {
      const ids = departmentMembers(d, members)
      if (ids.size && [...ids].every((id) => visible.has(id)))
        options.push({ id: `dept:${d.id}`, label: d.name, display: t('deptDisplay', { name: d.name }), hint: names(ids, true), kind: 'dept', userIds: ids })
    }
    for (const m of members) {
      if (m.id !== user.id && visible.has(m.id)) {
        const where = [m.title, m.department_id ? deptName.get(m.department_id) : null].filter(Boolean).join(' · ')
        options.push({ id: `person:${m.id}`, label: m.full_name, display: m.full_name, hint: where, kind: 'person', userIds: new Set([m.id]) })
      }
    }
    const optionById = new Map(options.map((o) => [o.id, o]))
    return { options, resolve: (id: string | null | undefined) => optionById.get(id ?? 'me') ?? options[0] }
  }, [t, locale, user.id, accountRole, members, departments, teams])
}

/** Contadores de Hoy; cada uno es también un filtro de Mis tareas. */
export const COUNTERS = ['overdue', 'today', 'in_progress', 'blocked', 'todo', 'done'] as const
export type Counter = (typeof COUNTERS)[number]

export function matchesCounter(task: Pick<TaskRow, 'status' | 'due_date' | 'completed_at'>, counter: Counter, now = new Date()) {
  const open = task.status !== 'done'
  const diff = task.due_date ? differenceInCalendarDays(parseISO(task.due_date), now) : null
  switch (counter) {
    case 'overdue':
      return open && diff != null && diff < 0
    case 'today':
      return open && diff === 0
    case 'in_progress':
      return task.status === 'in_progress'
    case 'blocked':
      return task.status === 'blocked'
    case 'todo':
      return task.status === 'todo'
    case 'done':
      return task.status === 'done' && (task.completed_at ?? '') >= subDays(now, 7).toISOString()
  }
}

export const isCounter = (v: string | null | undefined): v is Counter => (COUNTERS as readonly string[]).includes(v ?? '')
