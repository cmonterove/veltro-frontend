import { NextResponse, type NextRequest } from 'next/server'
import { api } from '@/lib/api/server'
import { sessionCookies } from '@/lib/api/session-cookies'

/**
 * Recibe la sesión que trajo un enlace de correo (/auth/callback), la verifica con la API y la
 * deja en las cookies httpOnly. Solo acepta tokens que la API reconoce como válidos.
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as { accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown } | null
  const accessToken = typeof b?.accessToken === 'string' ? b.accessToken : ''
  const refreshToken = typeof b?.refreshToken === 'string' ? b.refreshToken : ''
  const expiresIn = typeof b?.expiresIn === 'number' && b.expiresIn > 0 ? Math.min(b.expiresIn, 86400) : 3600
  if (!accessToken || !refreshToken || accessToken.length > 4000 || refreshToken.length > 500) {
    return NextResponse.json({ error: { code: 'invalid_session', message: 'Sesión inválida.' } }, { status: 400 })
  }
  try {
    await api('/v1/me', { token: accessToken })
  } catch {
    return NextResponse.json({ error: { code: 'invalid_session', message: 'Sesión inválida.' } }, { status: 401 })
  }
  const res = new NextResponse(null, { status: 204 })
  for (const c of sessionCookies({ accessToken, refreshToken, expiresIn })) res.cookies.set(c)
  return res
}
