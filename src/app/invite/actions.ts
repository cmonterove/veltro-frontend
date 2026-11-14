'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { api, apiAnon, clearSession, saveSession, sessionToken } from '@/lib/api/server'
import { ApiError } from '@/lib/api/shared'
import type { ApiSessionResponse } from '@/lib/api/types'
import { ACCOUNT_COOKIE } from '@/lib/session'
import { isLocale, LOCALE_COOKIE } from '@/i18n/config'
import { passwordProblem } from '@/lib/api/ajustes'

/** Lo que dice el enlace de una invitación (sin sesión). */
export type InvitePeek = {
  email: string
  fullName: string | null
  accountName: string
  role: 'admin' | 'member'
  inviter: { fullName: string; avatarUrl: string | null } | null
  workspaces: string[]
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  hasUser: boolean
  expiresAt: string
}

export type AcceptState = { error?: string; email?: string } | undefined

/** Códigos de la API → claves de invite.errors. */
function inviteError(e: unknown) {
  const code = e instanceof ApiError ? e.code : ''
  if (['invitation_expired', 'invitation_accepted', 'invitation_not_found', 'invitation_email_mismatch', 'invitation_login_required', 'plan_limit_members', 'too_many_attempts', 'rate_limited'].includes(code)) {
    return code === 'too_many_attempts' ? 'rate_limited' : code
  }
  if (code === 'validation_error' && e instanceof ApiError && Array.isArray(e.details) && e.details.some((d: { field?: string }) => d.field === 'password')) return 'weak_password'
  if (code === 'weak_password') return 'weak_password'
  return 'generic'
}

async function enter(accountId: string, session: ApiSessionResponse | null) {
  const jar = await cookies()
  if (session) {
    await saveSession(session)
    if (isLocale(session.user.locale)) jar.set(LOCALE_COOKIE, session.user.locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  }
  // la cuenta a la que se unió queda como la actual
  jar.set(ACCOUNT_COOKIE, accountId, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/', 'layout')
  redirect('/home?joined=1')
}

/** Aceptar sin sesión: crea el usuario con nombre y contraseña y entra. */
export async function acceptWithPassword(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = String(formData.get('token') ?? '')
  const fullName = String(formData.get('full_name') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (fullName.length < 2 || !password) return { error: 'missing_fields' }
  if (passwordProblem(password)) return { error: 'weak_password' }
  let res: { accountId: string; session: ApiSessionResponse | null }
  try {
    res = await apiAnon('/v1/invitations/accept', { method: 'POST', body: { token, fullName, password } })
  } catch (e) {
    return { error: inviteError(e) }
  }
  await enter(res.accountId, res.session)
}

/** Aceptar con la sesión abierta (el correo tiene que ser el de la invitación). */
export async function acceptWithSession(token: string): Promise<AcceptState> {
  if (!(await sessionToken())) return { error: 'invitation_login_required' }
  let res: { accountId: string; session: null }
  try {
    res = await api('/v1/invitations/accept', { method: 'POST', body: { token } })
  } catch (e) {
    return { error: inviteError(e) }
  }
  await enter(res.accountId, null)
}

/** Cerrar la sesión de otra persona y volver a la invitación: ahí se crea el usuario o se entra con el correo invitado. */
export async function switchAccount(token: string) {
  try {
    await api('/v1/auth/logout', { method: 'POST', body: { scope: 'local' } })
  } catch {
    // aunque la API no responda, la sesión de este navegador se va
  }
  await clearSession()
  redirect(`/invite/${token}`)
}
