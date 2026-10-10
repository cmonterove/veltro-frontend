'use server'

import { revalidatePath } from 'next/cache'
import { randomInt } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppContext } from '@/lib/session'
import { randomToken, sha256 } from '@/lib/crypto'
import { slugify, workspaceKeyFrom } from '@/lib/utils'
import { toErrorCode } from '@/lib/errors'
import type { AccountRole, WorkspaceRole } from '@/lib/database.types'

type Fail = { ok: false; error: string }

async function requireAdmin() {
  const res = await getAppContext()
  if (res.status !== 'ready') return null
  const { ctx } = res
  if (ctx.accountRole !== 'owner' && ctx.accountRole !== 'admin') return null
  return ctx
}

function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += alphabet[randomInt(alphabet.length)]
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`
}

export type AddMemberInput = {
  fullName: string
  email: string
  role: Exclude<AccountRole, 'owner'>
  workspaces: { id: string; role: WorkspaceRole }[]
}

/**
 * Crea un usuario dentro de la cuenta (o agrega uno existente) y lo asigna a espacios.
 * Devuelve la contraseña temporal una única vez para que el admin la comparta.
 */
export async function addMember(input: AddMemberInput): Promise<{ ok: true; tempPassword: string | null; existing: boolean } | Fail> {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false, error: 'forbidden' }

  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim().slice(0, 120)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'invalid_email' }
  if (!fullName) return { ok: false, error: 'generic' }
  if (input.role !== 'admin' && input.role !== 'member') return { ok: false, error: 'forbidden' }
  if (input.role === 'admin' && ctx.accountRole !== 'owner') return { ok: false, error: 'forbidden' }

  const allowedWs = new Set(ctx.workspaces.map((w) => w.id))
  const wsRows = input.workspaces.filter((w) => allowedWs.has(w.id) && ['admin', 'editor', 'viewer'].includes(w.role))

  const admin = createAdminClient()

  // El trigger de la DB hace cumplir el límite; este chequeo evita crear usuarios huérfanos.
  const { count } = await admin.from('account_members').select('*', { count: 'exact', head: true }).eq('account_id', ctx.account.id)
  const { data: plan } = await admin.from('plans').select('max_members').eq('id', ctx.account.plan_id).single()
  if (plan?.max_members != null && (count ?? 0) >= plan.max_members) return { ok: false, error: 'plan_limit_members' }

  let userId: string
  let password: string | null = null
  let existing = false

  const { data: found } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (found) {
    userId = found.id
    existing = true
    const { data: already } = await admin
      .from('account_members')
      .select('user_id')
      .eq('account_id', ctx.account.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (already) return { ok: false, error: 'already_member' }
  } else {
    password = tempPassword()
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, must_change_password: true, locale: ctx.profile.locale },
    })
    if (error || !created.user) return { ok: false, error: error?.code === 'email_exists' ? 'already_member' : 'generic' }
    userId = created.user.id
  }

  const { error: memberErr } = await admin.from('account_members').insert({ account_id: ctx.account.id, user_id: userId, role: input.role })
  if (memberErr) {
    if (!existing) await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: toErrorCode(memberErr) }
  }

  if (wsRows.length) {
    await admin.from('workspace_members').insert(wsRows.map((w) => ({ workspace_id: w.id, user_id: userId, role: w.role })))
  }

  revalidatePath('/', 'layout')
  return { ok: true, tempPassword: password, existing }
}

export async function updateMemberRole(userId: string, role: Exclude<AccountRole, 'owner'>) {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false as const, error: 'forbidden' }
  if (role === 'admin' && ctx.accountRole !== 'owner') return { ok: false as const, error: 'forbidden' }
  const supabase = await createClient()
  const { error } = await supabase.from('account_members').update({ role }).eq('account_id', ctx.account.id).eq('user_id', userId)
  if (error) return { ok: false as const, error: toErrorCode(error) }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function removeMember(userId: string) {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false as const, error: 'forbidden' }
  if (userId === ctx.user.id) return { ok: false as const, error: 'forbidden' }
  const supabase = await createClient()
  const { error } = await supabase.from('account_members').delete().eq('account_id', ctx.account.id).eq('user_id', userId)
  if (error) return { ok: false as const, error: toErrorCode(error) }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

/** Reemplaza las asignaciones de espacios de un miembro. */
export async function setMemberWorkspaces(userId: string, rows: { id: string; role: WorkspaceRole }[]) {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false as const, error: 'forbidden' }
  const supabase = await createClient()
  const wsIds = ctx.workspaces.map((w) => w.id)
  const wanted = rows.filter((r) => wsIds.includes(r.id))

  const { error: delErr } = await supabase
    .from('workspace_members')
    .delete()
    .eq('user_id', userId)
    .in('workspace_id', wsIds.filter((id) => !wanted.some((w) => w.id === id)))
  if (delErr) return { ok: false as const, error: toErrorCode(delErr) }

  if (wanted.length) {
    const { error } = await supabase
      .from('workspace_members')
      .upsert(wanted.map((w) => ({ workspace_id: w.id, user_id: userId, role: w.role })), { onConflict: 'workspace_id,user_id' })
    if (error) return { ok: false as const, error: toErrorCode(error) }
  }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function createWorkspace(input: { name: string; icon: string; color: string; description?: string }) {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false as const, error: 'forbidden' }
  const name = input.name.trim().slice(0, 80)
  if (!name) return { ok: false as const, error: 'generic' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_workspace', {
    p_account_id: ctx.account.id,
    p_name: name,
    p_slug: slugify(name),
    p_key: workspaceKeyFrom(name),
    p_icon: input.icon,
    p_color: input.color,
    p_description: input.description?.trim() || null,
  })
  if (error || !data) return { ok: false as const, error: toErrorCode(error) }
  revalidatePath('/', 'layout')
  return { ok: true as const, slug: data.slug, id: data.id }
}

export async function updateWorkspace(id: string, patch: { name?: string; icon?: string; color?: string; description?: string | null }) {
  const supabase = await createClient()
  const clean = {
    ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 80) } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
  }
  const { data, error } = await supabase.from('workspaces').update(clean).eq('id', id).select('id')
  if (error || !data?.length) return { ok: false as const, error: error ? toErrorCode(error) : 'forbidden' }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function archiveWorkspace(id: string) {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false as const, error: 'forbidden' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('workspaces').update({ archived_at: new Date().toISOString() }).eq('id', id).select('id')
  if (error || !data?.length) return { ok: false as const, error: error ? toErrorCode(error) : 'forbidden' }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function updateAccountName(name: string) {
  const ctx = await requireAdmin()
  if (!ctx) return { ok: false as const, error: 'forbidden' }
  const supabase = await createClient()
  const { error } = await supabase.from('accounts').update({ name: name.trim().slice(0, 80) }).eq('id', ctx.account.id)
  if (error) return { ok: false as const, error: toErrorCode(error) }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function updateProfile(patch: { full_name?: string; timezone?: string; must_change_password?: boolean }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'not_authenticated' }
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { ok: false as const, error: toErrorCode(error) }
  revalidatePath('/', 'layout')
  return { ok: true as const }
}

// ---------- API tokens (Claude / integraciones) ----------

export async function listApiTokens() {
  const res = await getAppContext()
  if (res.status !== 'ready') return []
  const { data } = await createAdminClient()
    .from('api_tokens')
    .select('id, name, token_prefix, last_used_at, created_at')
    .eq('user_id', res.ctx.user.id)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createApiToken(name: string) {
  const res = await getAppContext()
  if (res.status !== 'ready') return { ok: false as const, error: 'not_authenticated' }
  const token = `vlt_${randomToken(30)}`
  const { error } = await createAdminClient()
    .from('api_tokens')
    .insert({ user_id: res.ctx.user.id, name: name.trim().slice(0, 80) || 'Claude', token_hash: sha256(token), token_prefix: token.slice(0, 10) })
  if (error) return { ok: false as const, error: 'generic' }
  revalidatePath('/settings/api')
  return { ok: true as const, token }
}

export async function revokeApiToken(id: string) {
  const res = await getAppContext()
  if (res.status !== 'ready') return { ok: false as const, error: 'not_authenticated' }
  await createAdminClient().from('api_tokens').delete().eq('id', id).eq('user_id', res.ctx.user.id)
  revalidatePath('/settings/api')
  return { ok: true as const }
}
