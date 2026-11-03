'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/google/config'
import { isLocale, LOCALE_COOKIE } from '@/i18n/config'
import { apiAnon, saveSession } from '@/lib/api/server'
import { ApiError } from '@/lib/api/shared'
import type { ApiSessionResponse } from '@/lib/api/types'

export type AuthState = { error?: string; email?: string; checkEmail?: boolean; sent?: boolean } | undefined

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === 'string' ? next : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/home'
}

async function syncLocaleCookie(locale: string | null | undefined) {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: 'missing_fields', email }

  // Entra por la API (que habla con Supabase Auth); la sesión queda en cookies httpOnly.
  let session: ApiSessionResponse
  try {
    session = await apiAnon<ApiSessionResponse>('/v1/auth/login', { method: 'POST', body: { email, password } })
  } catch (e) {
    return { error: authError(e), email }
  }
  await saveSession(session)
  await syncLocaleCookie(session.user.locale)

  redirect(safeNext(formData.get('next')))
}

/** Códigos de la API → claves de auth.errors. */
function authError(e: unknown) {
  const code = e instanceof ApiError ? e.code : ''
  if (code === 'email_taken') return 'user_exists'
  if (code === 'too_many_attempts' || code === 'rate_limited') return 'too_many_attempts'
  if (['invalid_credentials', 'email_not_confirmed', 'weak_password', 'user_banned'].includes(code)) return code
  return 'generic'
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!fullName || !email || !password) return { error: 'missing_fields', email }
  if (password.length < 8) return { error: 'weak_password', email }

  const locale = (await cookies()).get(LOCALE_COOKIE)?.value
  // el que eligió en la pantalla (cookie) o español, nunca el del navegador
  const resolvedLocale = isLocale(locale) ? locale : 'es'

  // La API crea el usuario; el enlace del correo de confirmación vuelve a /auth/callback.
  let res: { session: ApiSessionResponse | null; confirmationRequired: boolean }
  try {
    res = await apiAnon('/v1/auth/signup', { method: 'POST', body: { fullName, email, password, locale: resolvedLocale } })
  } catch (e) {
    return { error: authError(e), email }
  }

  // Si el proyecto exige confirmar el email, no hay sesión todavía.
  if (!res.session) return { checkEmail: true, email }

  await saveSession(res.session)
  await syncLocaleCookie(resolvedLocale)
  redirect('/onboarding')
}

/** Envía el enlace para elegir una contraseña nueva. Responde igual exista o no la cuenta. */
export async function requestReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { error: 'missing_fields', email }
  try {
    await apiAnon('/v1/auth/password/forgot', { method: 'POST', body: { email } })
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) return { error: 'too_many_attempts', email }
  }
  return { sent: true, email }
}

export type OAuthProvider = 'google' | 'apple'

/**
 * Inicio de sesión con Google o Apple (Supabase OAuth). Crea la cuenta si no existe. El
 * proveedor vuelve a /auth/confirm, que deja la sesión en las cookies de la API.
 */
export async function signInWithProvider(provider: OAuthProvider, next?: string): Promise<AuthState> {
  if (provider !== 'google' && provider !== 'apple') return { error: 'oauth_unavailable' }
  const supabase = await createClient()
  const target = safeNext(next ?? null)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(target)}` },
  })
  if (error || !data?.url) return { error: 'oauth_unavailable' }
  redirect(data.url)
}
