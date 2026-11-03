'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isLocale, LOCALE_COOKIE } from '@/i18n/config'
import { ACCOUNT_COOKIE } from '@/lib/session'
import { api, sessionToken } from '@/lib/api/server'

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  // con sesión también queda en el perfil (los correos y la app móvil lo usan); la cookie ya alcanza para la web
  if (await sessionToken()) await api('/v1/me', { method: 'PATCH', body: { locale } }).catch(() => undefined)

  revalidatePath('/', 'layout')
}

export async function setCurrentAccount(accountId: string) {
  ;(await cookies()).set(ACCOUNT_COOKIE, accountId, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/', 'layout')
}
