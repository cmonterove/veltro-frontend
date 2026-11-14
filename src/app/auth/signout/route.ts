import { NextResponse, type NextRequest } from 'next/server'
import { api } from '@/lib/api/server'
import { ACCESS_COOKIE, clearedCookies } from '@/lib/api/session-cookies'

export async function POST(request: NextRequest) {
  // cierra la sesión real en Supabase Auth (vía la API; la de los datos de prueba es compartida y sigue)
  // y borra las cookies de las dos aunque la API no responda
  const token = request.cookies.get(ACCESS_COOKIE)?.value
  if (token) await api('/v1/auth/logout', { method: 'POST', body: { scope: 'local' }, token }).catch(() => undefined)
  const res = NextResponse.redirect(new URL('/login', request.nextUrl.origin), { status: 303 })
  for (const c of [...clearedCookies(), ...clearedCookies(true)]) res.cookies.set(c)
  return res
}
