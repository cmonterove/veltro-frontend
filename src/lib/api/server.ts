import 'server-only'
import { cookies } from 'next/headers'
import { parseResponse, queryString, type Query } from './shared'
import { ACCESS_COOKIE, API_URL, clearedCookies, sessionCookies, type ApiSession } from './session-cookies'

/**
 * La API desde el servidor (Server Components, acciones y route handlers), con la sesión de
 * las cookies. El middleware ya renovó el token si estaba por vencer.
 */

type Init = { method?: string; body?: unknown; query?: Query; token?: string | null; headers?: Record<string, string> }

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const token = init.token === undefined ? (await cookies()).get(ACCESS_COOKIE)?.value : init.token
  const headers: Record<string, string> = { ...init.headers }
  if (token) headers.authorization = `Bearer ${token}`
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${API_URL}${path}${queryString(init.query)}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  })
  return parseResponse<T>(res)
}

/** Sin sesión (entrar, registrarse, recuperar la contraseña). */
export function apiAnon<T>(path: string, init: Omit<Init, 'token'> = {}) {
  return api<T>(path, { ...init, token: null })
}

/** Solo en acciones del servidor y route handlers (en Server Components las cookies son de lectura). */
export async function saveSession(s: ApiSession) {
  const jar = await cookies()
  for (const c of sessionCookies(s)) jar.set(c)
}

export async function clearSession() {
  const jar = await cookies()
  for (const c of clearedCookies()) jar.set(c)
}

export async function sessionToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null
}
