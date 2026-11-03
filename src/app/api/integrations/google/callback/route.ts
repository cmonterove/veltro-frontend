import { NextResponse, type NextRequest } from 'next/server'
import { googleReason } from '@/lib/api/integraciones'
import { apiWithSession, BINDING_COOKIE, BINDING_PATH, safeReturn, withSession } from '../_shared'

/**
 * Vuelta de Google. La web pone la sesión y el secreto del navegador; la API verifica el estado
 * (firma, vencimiento, persona, navegador y un solo uso), canjea el código y guarda la conexión.
 * La web nunca ve los tokens de Google.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const binding = request.cookies.get(BINDING_COOKIE)?.value
  const state = params.get('state')

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
    code: params.get('code') ?? undefined,
    error: params.get('error') ?? undefined,
    scope: params.get('scope') ?? undefined,
  })

  if (error?.status === 401) return NextResponse.redirect(new URL('/login?next=%2Fsettings%2Fpreferences', request.url))
  if (error) {
    const returnTo = (error.details as { returnTo?: string } | undefined)?.returnTo
    return finish(safeReturn(returnTo), googleReason(error.code), renewed)
  }
  return finish(safeReturn(data.returnTo), 'connected', renewed)
}
