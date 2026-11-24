'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isLocale, LOCALE_COOKIE } from '@/i18n/config'
import { ACCOUNT_COOKIE, DEMO_DATA_AVAILABLE } from '@/lib/session'
import { api, apiAnon, realSessionToken, saveSession } from '@/lib/api/server'
import { clearedCookies } from '@/lib/api/session-cookies'
import type { ApiSessionResponse } from '@/lib/api/types'

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  // con sesión también queda en el perfil (los correos y la app móvil lo usan); la cookie ya alcanza para la web.
  // Siempre en el de la persona real, aunque estén abiertos los datos de prueba.
  const token = await realSessionToken()
  if (token) await api('/v1/me', { method: 'PATCH', body: { locale }, token }).catch(() => undefined)

  revalidatePath('/', 'layout')
}

/**
 * El recorrido de bienvenida quedó cerrado (terminado o «Ahora no»): se guarda en el perfil, así no
 * vuelve a salir en otro navegador ni en otra dirección. Siempre en la persona real, aunque estén
 * abiertos los datos de prueba. Si falla, queda lo del navegador.
 */
export async function markTourSeen() {
  const token = await realSessionToken()
  if (token) await api('/v1/me', { method: 'PATCH', body: { tourSeen: true }, token }).catch(() => undefined)
}

/**
 * Datos de prueba: abre una segunda sesión con la persona del demo (cuenta aparte en la misma base)
 * o la cierra y vuelve a los datos reales. La sesión de la persona real no se toca.
 */
export async function setDemoData(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const jar = await cookies()
  if (!on) {
    for (const c of clearedCookies(true)) jar.set(c)
    revalidatePath('/', 'layout')
    return { ok: true }
  }
  if (!DEMO_DATA_AVAILABLE) return { ok: false, error: 'demo_unavailable' }
  // solo quien ya entró con su cuenta
  if (!(await realSessionToken())) return { ok: false, error: 'not_authenticated' }
  try {
    const s = await apiAnon<ApiSessionResponse>('/v1/auth/login', {
      method: 'POST',
      body: { email: process.env.DEMO_LOGIN_EMAIL, password: process.env.DEMO_LOGIN_PASSWORD },
    })
    await saveSession(s, true)
  } catch {
    return { ok: false, error: 'demo_unavailable' }
  }
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function setCurrentAccount(accountId: string) {
  ;(await cookies()).set(ACCOUNT_COOKIE, accountId, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/', 'layout')
}
