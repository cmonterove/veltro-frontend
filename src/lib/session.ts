import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { AccountRole } from '@/lib/database.types'
import type { AppContextValue } from '@/lib/types'
import { DEMO } from '@/lib/demo/config'
import { getDemoAppContext, getDemoUser } from '@/lib/demo/session-context'
import { api } from '@/lib/api/server'
import { ApiError } from '@/lib/api/shared'
import { toAccount, toDepartment, toMember, toProfile, toWorkspace } from '@/lib/api/adapters'
import type { ApiContext, ApiProfile } from '@/lib/api/types'

export const ACCOUNT_COOKIE = 'veltro-account'

/** null si no hay sesión válida (la API verifica el token). */
async function orAnonymous<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

export const getUser = cache(async (): Promise<{ id: string; email: string } | null> => {
  if (DEMO) {
    const u = await getDemoUser()
    return u ? { id: u.id, email: u.email ?? '' } : null
  }
  const me = await orAnonymous(api<{ user: ApiProfile }>('/v1/me'))
  return me ? { id: me.user.id, email: me.user.email } : null
})

/**
 * Contexto completo de la app para el usuario actual, en una sola llamada a la API
 * (GET /v1/me/context). La cuenta actual la elige la cookie veltro-account.
 * - anonymous si no hay sesión
 * - onboarding si aún no pertenece a ninguna cuenta
 */
export const getAppContext = cache(async (): Promise<
  | { status: 'anonymous' }
  | { status: 'onboarding'; profile: AppContextValue['profile'] }
  | { status: 'ready'; ctx: AppContextValue }
> => {
  if (DEMO) return getDemoAppContext()

  const preferred = (await cookies()).get(ACCOUNT_COOKIE)?.value
  const res = await orAnonymous(api<ApiContext>('/v1/me/context', { query: { accountId: preferred } }))
  if (!res) return { status: 'anonymous' }

  const profile = toProfile(res.user)
  if (res.status === 'onboarding' || !res.account) return { status: 'onboarding', profile }

  return {
    status: 'ready',
    ctx: {
      user: { id: res.user.id, email: res.user.email },
      profile,
      account: toAccount(res.account),
      accounts: res.accounts.map(toAccount),
      accountRole: res.account.role,
      workspaces: res.workspaces.map((w) => toWorkspace(w)),
      // los que veo solo por jerarquía: no van a la barra lateral, sirven para leer las tareas de mi gente
      observedWorkspaces: res.observedWorkspaces.map((w) => toWorkspace(w, 'viewer')),
      members: res.members.map(toMember).sort((a, b) => a.full_name.localeCompare(b.full_name)),
      departments: res.departments.map(toDepartment),
      google: res.google.connected ? { email: res.google.email ?? '', selectedCalendarIds: res.google.selectedCalendarIds } : null,
      // lo decide la API, que es la que tiene las credenciales de Google
      googleConfigured: res.google.configured,
    },
  }
})

export async function requireAppContext() {
  const res = await getAppContext()
  if (res.status === 'anonymous') redirect('/login')
  if (res.status === 'onboarding') redirect('/onboarding')
  return res.ctx
}

export function isAccountAdmin(role: AccountRole) {
  return role === 'owner' || role === 'admin'
}
