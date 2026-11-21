import { NextResponse, type NextRequest } from 'next/server'
import { clearedCookies } from '@/lib/api/session-cookies'

/**
 * La API rechazó la sesión de las cookies (un token de otro proyecto de Supabase, revocado o con la
 * firma cambiada): se borran y se va al login. Sin esto había un bucle: el middleware solo mira el
 * vencimiento del token y mandaba de /login a /home, y la página, sin sesión válida, de vuelta a /login.
 */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', request.nextUrl.origin))
  for (const c of [...clearedCookies(), ...clearedCookies(true)]) res.cookies.set(c)
  return res
}
