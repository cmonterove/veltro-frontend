import { NextResponse, type NextRequest } from 'next/server'
import { googleReason } from '@/lib/api/integraciones'
import { API_URL } from '@/lib/api/session-cookies'
import { apiWithSession, BINDING_COOKIE, BINDING_PATH, MAIL_BINDING_COOKIE, safeMailReturn, safeReturn, withSession } from '../_shared'

/**
 * Vuelta de Google. La web pone la sesión y el secreto del navegador; la API verifica el estado
 * (firma, vencimiento, persona, navegador y un solo uso), canjea el código y guarda la conexión.
 * La web nunca ve los tokens de Google.
 *
 * Las conexiones que empiezan en la app móvil (cuentas de correo) traen un estado «app.»: Google
 * vuelve aquí igual (es la única vuelta registrada), y se reenvían tal cual a la API, que las
 * manda a la app; la app termina la conexión con su sesión y su secreto.
 *
 * Las del buzón (conectar el correo desde la web) traen «mail.» y su propia cookie: terminan en
 * /v1/me/mail-accounts/google/web/finish y vuelven al buzón con ?mail=connected (o el motivo).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const state = params.get('state')

  if (state?.startsWith('app.')) {
    const target = new URL(`${API_URL}/v1/integrations/mail/google/return`)
    for (const k of ['code', 'state', 'error', 'scope']) {
      const v = params.get(k)
      if (v) target.searchParams.set(k, v)
    }
    return NextResponse.redirect(target)
  }

  const fromGoogle = {
    code: params.get('code') ?? undefined,
    error: params.get('error') ?? undefined,
    scope: params.get('scope') ?? undefined,
  }

  if (state?.startsWith('mail.')) {
    const mailBinding = request.cookies.get(MAIL_BINDING_COOKIE)?.value
    const finishMail = (path: string, status: string, renewed: Parameters<typeof withSession>[1] = null) => {
      const target = new URL(path, request.url)
      target.searchParams.set('mail', status)
      const res = NextResponse.redirect(target)
      res.cookies.set(MAIL_BINDING_COOKIE, '', { path: BINDING_PATH, maxAge: 0 })
      return withSession(res, renewed)
    }
    if (!mailBinding) return finishMail('/mail', 'invalid_state')
    const { renewed, data, error } = await apiWithSession<{ connected: true; email: string; returnTo: string }>(request, '/v1/me/mail-accounts/google/web/finish', {
      state,
      binding: mailBinding,
      ...fromGoogle,
    })
    if (error?.status === 401) return NextResponse.redirect(new URL('/login?next=%2Fmail', request.url))
    if (error) return finishMail(safeMailReturn((error.details as { returnTo?: string } | undefined)?.returnTo), googleReason(error.code), renewed)
    return finishMail(safeMailReturn(data.returnTo), 'connected', renewed)
  }

  const binding = request.cookies.get(BINDING_COOKIE)?.value

  const finish = (path: string, status: string, renewed: Parameters<typeof withSession>[1] = null) => {
    const target = new URL(path, request.url)
    target.searchParams.set('google', status)
    const res = NextResponse.redirect(target)
    res.cookies.set(BINDING_COOKIE, '', { path: BINDING_PATH, maxAge: 0 })
    return withSession(res, renewed)
  }

  // sin la cookie no es el navegador que empezó (o venció): ni se le pregunta a la API
  if (!state || !binding) return finish('/settings/preferences', 'invalid_state')

  const { renewed, data, error } = await apiWithSession<{ connected: true; email: string; returnTo: string }>(request, '/v1/integrations/google/callback', {
    state,
    binding,
    ...fromGoogle,
  })

  if (error?.status === 401) return NextResponse.redirect(new URL('/login?next=%2Fsettings%2Fpreferences', request.url))
  if (error) {
    const returnTo = (error.details as { returnTo?: string } | undefined)?.returnTo
    return finish(safeReturn(returnTo), googleReason(error.code), renewed)
  }
  return finish(safeReturn(data.returnTo), 'connected', renewed)
}
