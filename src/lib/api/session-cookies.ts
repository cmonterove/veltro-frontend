/**
 * La sesión de la API vive en dos cookies httpOnly (el navegador no las lee): el token de
 * acceso de Supabase Auth, que la API verifica en cada llamada, y el de refresco.
 * Sin next/headers: lo usan el middleware, el puente /api/veltro y las acciones del servidor.
 */

export const ACCESS_COOKIE = 'vt-at'
export const REFRESH_COOKIE = 'vt-rt'

export const API_URL = (process.env.VELTRO_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export type ApiSession = { accessToken: string; refreshToken: string; expiresIn: number }

const base = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' }

export function sessionCookies(s: ApiSession) {
  return [
    { name: ACCESS_COOKIE, value: s.accessToken, ...base, maxAge: s.expiresIn },
    { name: REFRESH_COOKIE, value: s.refreshToken, ...base, maxAge: 60 * 60 * 24 * 30 },
  ]
}

export function clearedCookies() {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({ name, value: '', ...base, maxAge: 0 }))
}

/** Segundos que le quedan al token (sin verificar la firma: eso lo hace la API). */
export function tokenTtl(token: string | undefined | null) {
  const exp = claims(token)?.exp
  return typeof exp === 'number' ? exp - Date.now() / 1000 : -1
}

function claims(token: string | undefined | null): { exp?: number; sub?: string } | null {
  const part = token?.split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

/** Renueva la sesión con el token de refresco (la API lo rota). null si ya no sirve. */
export async function refreshSession(refreshToken: string): Promise<ApiSession | null> {
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const s = (await res.json()) as ApiSession
    return s.accessToken ? s : null
  } catch {
    return null
  }
}
