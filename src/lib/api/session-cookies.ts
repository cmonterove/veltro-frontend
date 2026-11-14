/**
 * La sesión de la API vive en dos cookies httpOnly (el navegador no las lee): el token de
 * acceso de Supabase Auth, que la API verifica en cada llamada, y el de refresco.
 * Sin next/headers: lo usan el middleware, el puente /api/veltro y las acciones del servidor.
 */

export const ACCESS_COOKIE = 'vt-at'
export const REFRESH_COOKIE = 'vt-rt'
// Datos de prueba: una segunda sesión (la de la persona del demo) al lado de la real, que no se toca.
export const DEMO_ACCESS_COOKIE = 'vt-demo-at'
export const DEMO_REFRESH_COOKIE = 'vt-demo-rt'

export const API_URL = (process.env.VELTRO_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export type ApiSession = { accessToken: string; refreshToken: string; expiresIn: number }

const base = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' }

const names = (demo: boolean) => (demo ? [DEMO_ACCESS_COOKIE, DEMO_REFRESH_COOKIE] : [ACCESS_COOKIE, REFRESH_COOKIE])

export function sessionCookies(s: ApiSession, demo = false) {
  const [access, refresh] = names(demo)
  return [
    { name: access, value: s.accessToken, ...base, maxAge: s.expiresIn },
    { name: refresh, value: s.refreshToken, ...base, maxAge: 60 * 60 * 24 * 30 },
  ]
}

export function clearedCookies(demo = false) {
  return names(demo).map((name) => ({ name, value: '', ...base, maxAge: 0 }))
}

type CookieJar = { get(name: string): { value: string } | undefined }

/** La sesión que manda en esta petición: la de los datos de prueba mientras estén abiertos, si no la real. */
export function activeSession(jar: CookieJar) {
  const demo = Boolean(jar.get(DEMO_REFRESH_COOKIE)?.value)
  const [access, refresh] = names(demo)
  return { demo, accessToken: jar.get(access)?.value, refreshToken: jar.get(refresh)?.value }
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
