import { NextResponse, type NextRequest } from 'next/server'
import { googleReason, type ApiGoogleConnect } from '@/lib/api/integraciones'
import { apiWithSession, BINDING_COOKIE, BINDING_PATH, safeReturn, withSession } from '../_shared'

/**
 * Conectar Google Calendar: la API arma la URL de Google con un estado firmado y entrega un secreto
 * que se queda en ESTE navegador (cookie httpOnly). Al volver, la API exige la misma sesión y el
 * mismo secreto, y el estado sirve una sola vez.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeReturn(request.nextUrl.searchParams.get('returnTo'))
  const { renewed, data, error } = await apiWithSession<ApiGoogleConnect>(request, '/v1/integrations/google/connect', { returnTo })

  if (error?.status === 401) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, request.url))
  if (error) {
    const target = new URL(returnTo, request.url)
    target.searchParams.set('google', googleReason(error.code))
    return withSession(NextResponse.redirect(target), renewed)
  }

  const res = NextResponse.redirect(data.url)
  res.cookies.set(BINDING_COOKIE, data.binding, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // lax: viaja en la vuelta de Google (navegación GET de primer nivel)
    sameSite: 'lax',
    path: BINDING_PATH,
    maxAge: data.expiresIn,
  })
  return withSession(res, renewed)
}
