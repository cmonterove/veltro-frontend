import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { ACCESS_COOKIE, API_URL, REFRESH_COOKIE, refreshSession, sessionCookies, tokenTtl, type ApiSession } from '@/lib/api/session-cookies'
import { ApiError, parseResponse } from '@/lib/api/shared'

/**
 * Lo común de conectar Google: el navegador entra por aquí (no por el puente) porque hace falta
 * una cookie del navegador. El middleware no corre en /api, así que la sesión se renueva aquí.
 */

/** Cookie con el secreto del navegador que empezó la conexión (la API guarda solo su hash en el estado). */
export const BINDING_COOKIE = 'veltro-google-binding'
export const BINDING_PATH = '/api/integrations/google'

/** Solo rutas internas de la web (nada de //otro.sitio). */
export function safeReturn(v: string | null | undefined) {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') && v.length <= 200 ? v : '/settings/preferences'
}

type Result<T> = { renewed: ApiSession | null } & ({ data: T; error: null } | { data: null; error: ApiError })

/** POST a la API con la sesión de las cookies; si el token venció, lo renueva antes. */
export async function apiWithSession<T>(request: NextRequest, path: string, body: unknown): Promise<Result<T>> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  let token = request.cookies.get(ACCESS_COOKIE)?.value
  let renewed: ApiSession | null = null
  if (tokenTtl(token) < 30 && refreshToken) {
    renewed = await refreshSession(refreshToken)
    if (renewed) token = renewed.accessToken
  }
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    return { renewed, data: await parseResponse<T>(res), error: null }
  } catch (e) {
    return { renewed, data: null, error: e instanceof ApiError ? e : new ApiError(502, 'api_unreachable', 'No se pudo hablar con la API.') }
  }
}

export function withSession(response: NextResponse, renewed: ApiSession | null) {
  if (renewed) for (const c of sessionCookies(renewed)) response.cookies.set(c)
  return response
}
