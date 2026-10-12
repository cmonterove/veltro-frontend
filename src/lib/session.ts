import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AccountRole, WorkspaceRole } from '@/lib/database.types'
import type { AppContextValue, Member, WorkspaceWithRole } from '@/lib/types'
import { isGoogleConfigured } from '@/lib/google/config'

export const ACCOUNT_COOKIE = 'veltro-account'

export const getUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Contexto completo de la app para el usuario actual.
 * - null si no hay sesión
 * - account null si aún no completó el onboarding
 */
export const getAppContext = cache(async (): Promise<
  | { status: 'anonymous' }
  | { status: 'onboarding'; profile: AppContextValue['profile'] }
  | { status: 'ready'; ctx: AppContextValue }
> => {
  const user = await getUser()
  if (!user) return { status: 'anonymous' }

  const supabase = await createClient()

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('account_members').select('account_id, role').eq('user_id', user.id),
  ])

  if (!profile) return { status: 'anonymous' }
  if (!memberships || memberships.length === 0) return { status: 'onboarding', profile }

  const accountIds = memberships.map((m) => m.account_id)
  const { data: accounts } = await supabase.from('accounts').select('*').in('id', accountIds).order('created_at')

  const preferred = (await cookies()).get(ACCOUNT_COOKIE)?.value
  const account = accounts?.find((a) => a.id === preferred) ?? accounts?.[0]
  if (!account) return { status: 'onboarding', profile }

  const accountRole = memberships.find((m) => m.account_id === account.id)!.role as AccountRole
  const isAdmin = accountRole === 'owner' || accountRole === 'admin'

  const [{ data: workspaces }, { data: myWsRoles }, { data: accountMembers }, { data: google }, { data: departments }] = await Promise.all([
    supabase
      .from('workspaces')
      .select('*')
      .eq('account_id', account.id)
      .is('archived_at', null)
      .order('created_at'),
    supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id),
    supabase.from('account_members').select('user_id, role, title, department_id, reports_to').eq('account_id', account.id),
    supabase.rpc('get_my_google_connection'),
    supabase.from('departments').select('*').eq('account_id', account.id).order('name'),
  ])

  const memberIds = (accountMembers ?? []).map((m) => m.user_id)
  const { data: profiles } = memberIds.length
    ? await supabase.from('profiles').select('id, email, full_name, avatar_url').in('id', memberIds)
    : { data: [] }

  const members: Member[] = (profiles ?? [])
    .map((p) => {
      const m = accountMembers!.find((x) => x.user_id === p.id)!
      return { ...p, role: m.role as AccountRole, title: m.title ?? null, department_id: m.department_id ?? null, reports_to: m.reports_to ?? null }
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  // Los espacios que devuelve la base incluyen los visibles por jerarquía (donde trabaja mi gente):
  // esos no van a la barra lateral, solo sirven para mostrar sus tareas en solo lectura.
  const roleByWs = new Map((myWsRoles ?? []).map((r) => [r.workspace_id, r.role as WorkspaceRole]))
  const withRole: WorkspaceWithRole[] = []
  const observed: WorkspaceWithRole[] = []
  for (const w of workspaces ?? []) {
    if (isAdmin) withRole.push({ ...w, my_role: 'admin' })
    else if (roleByWs.has(w.id)) withRole.push({ ...w, my_role: roleByWs.get(w.id)! })
    else observed.push({ ...w, my_role: 'viewer' })
  }

  const g = google?.[0]

  return {
    status: 'ready',
    ctx: {
      user: { id: user.id, email: user.email ?? profile.email },
      profile,
      account,
      accounts: accounts ?? [],
      accountRole,
      workspaces: withRole,
      observedWorkspaces: observed,
      members,
      departments: departments ?? [],
      google: g ? { email: g.google_email, selectedCalendarIds: g.selected_calendar_ids } : null,
      googleConfigured: isGoogleConfigured(),
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
