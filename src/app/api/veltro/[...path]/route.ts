import { NextResponse, type NextRequest } from 'next/server'
import { ACCESS_COOKIE, API_URL, REFRESH_COOKIE, refreshSession, sessionCookies, tokenTtl, type ApiSession } from '@/lib/api/session-cookies'

/**
 * Puente del navegador a la API de Veltro: /api/veltro/v1/... → API_URL/v1/...
 * Agrega la sesión de las cookies httpOnly y, si el token venció, lo renueva una vez y
 * reintenta. El navegador nunca ve los tokens.
 */

export const dynamic = 'force-dynamic'

// lo que se reenvía tal cual en cada sentido
const REQUEST_HEADERS = ['content-type', 'accept', 'accept-language', 'idempotency-key', 'if-match', 'user-agent']
const RESPONSE_HEADERS = ['content-type', 'etag', 'location', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining']

async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (path[0] !== 'v1') return NextResponse.json({ error: { code: 'not_found', message: 'Esa ruta no existe.' } }, { status: 404 })

  const target = `${API_URL}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  let token = request.cookies.get(ACCESS_COOKIE)?.value
  let renewed: ApiSession | null = null

  if (tokenTtl(token) < 30 && refreshToken) {
    renewed = await refreshSession(refreshToken)
    if (renewed) token = renewed.accessToken
  }

  const send = (t: string | undefined) => {
    const headers = new Headers()
    for (const h of REQUEST_HEADERS) {
      const v = request.headers.get(h)
      if (v) headers.set(h, v)
    }
    if (t) headers.set('authorization', `Bearer ${t}`)
    return fetch(target, { method: request.method, headers, body, cache: 'no-store' })
  }

  let res = await send(token)
  // el token pudo vencer entre la revisión y la llamada: una renovación y un reintento
  if (res.status === 401 && refreshToken && !renewed) {
    renewed = await refreshSession(refreshToken)
    if (renewed) res = await send(renewed.accessToken)
  }

  const headers = new Headers()
  for (const h of RESPONSE_HEADERS) {
    const v = res.headers.get(h)
    if (v) headers.set(h, v)
  }
  const out = new NextResponse(res.status === 204 ? null : res.body, { status: res.status, headers })
  if (renewed) for (const c of sessionCookies(renewed)) out.cookies.set(c)
  return out
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
