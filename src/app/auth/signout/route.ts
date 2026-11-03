import { NextResponse, type NextRequest } from 'next/server'
import { api } from '@/lib/api/server'
import { ACCESS_COOKIE, clearedCookies } from '@/lib/api/session-cookies'

export async function POST(request: NextRequest) {
  // cierra la sesión en Supabase Auth (vía la API) y borra las cookies aunque la API no responda
  if (request.cookies.get(ACCESS_COOKIE)?.value) {
    await api('/v1/auth/logout', { method: 'POST', body: { scope: 'local' } }).catch(() => undefined)
  }
  const res = NextResponse.redirect(new URL('/login', request.nextUrl.origin), { status: 303 })
  for (const c of clearedCookies()) res.cookies.set(c)
  return res
}
