import { NextResponse, type NextRequest } from 'next/server'
import { googleReason, type ApiGoogleConnect } from '@/lib/api/integraciones'
import { apiWithSession, BINDING_PATH, MAIL_BINDING_COOKIE, safeMailReturn, withSession } from '../_shared'

/**
 * Conectar el correo de Gmail para el buzón (leer y enviar): como el calendario, la API arma la URL
 * de Google con un estado firmado («mail.») y entrega un secreto que se queda en ESTE navegador
 * (cookie httpOnly propia, para no pisar una conexión del calendario a medio camino). Al volver
 * (callback), la API exige la misma sesión, el mismo secreto y un estado sin usar.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeMailReturn(request.nextUrl.searchParams.get('returnTo'))
  const { renewed, data, error } = await apiWithSession<ApiGoogleConnect>(request, '/v1/me/mail-accounts/google/web/start', { returnTo })

  if (error?.status === 401) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, request.url))
  if (error) {
    const target = new URL(returnTo, request.url)
    target.searchParams.set('mail', googleReason(error.code))
    return withSession(NextResponse.redirect(target), renewed)
  }

  const res = NextResponse.redirect(data.url)
  res.cookies.set(MAIL_BINDING_COOKIE, data.binding, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // lax: viaja en la vuelta de Google (navegación GET de primer nivel)
    sameSite: 'lax',
    path: BINDING_PATH,
    maxAge: data.expiresIn,
  })
  return withSession(res, renewed)
}
