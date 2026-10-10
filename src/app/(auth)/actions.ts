'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/google/config'
import { isLocale, LOCALE_COOKIE } from '@/i18n/config'

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

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return { error: error?.code === 'email_not_confirmed' ? 'email_not_confirmed' : 'invalid_credentials', email }
  }

  const { data: profile } = await supabase.from('profiles').select('locale').eq('id', data.user.id).single()
  await syncLocaleCookie(profile?.locale)

  redirect(safeNext(formData.get('next')))
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!fullName || !email || !password) return { error: 'missing_fields', email }
  if (password.length < 8) return { error: 'weak_password', email }

  const locale = (await cookies()).get(LOCALE_COOKIE)?.value
  const lang = (await headers()).get('accept-language')?.split(',')[0]?.split('-')[0]
  const resolvedLocale = isLocale(locale) ? locale : isLocale(lang) ? lang : 'es'

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, locale: resolvedLocale },
      emailRedirectTo: `${appUrl()}/auth/confirm?next=/onboarding`,
    },
  })

  if (error) {
    if (error.code === 'user_already_exists') return { error: 'user_exists', email }
    if (error.code === 'weak_password') return { error: 'weak_password', email }
    return { error: 'generic', email }
  }

  // Si el proyecto exige confirmar el email, no hay sesión todavía.
  if (!data.session) return { checkEmail: true, email }

  await syncLocaleCookie(resolvedLocale)
  redirect('/onboarding')
}

/** Envía el enlace para elegir una contraseña nueva. Responde igual exista o no la cuenta. */
export async function requestReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { error: 'missing_fields', email }
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/confirm?next=/settings/profile`,
  })
  return { sent: true, email }
}

export type OAuthProvider = 'google' | 'apple'

/** Inicio de sesión con Google o Apple (Supabase OAuth). Crea la cuenta si no existe. */
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
