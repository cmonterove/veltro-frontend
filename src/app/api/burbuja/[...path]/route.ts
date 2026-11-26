import { NextResponse, type NextRequest } from 'next/server'
import { API_URL } from '@/lib/api/session-cookies'
import { BUBBLE_COOKIE, bubbleCookie, isBubbleToken } from '@/lib/api/bubble-cookie'

/**
 * Puente de la burbuja: /api/burbuja/v1/... → API_URL/v1/... con el token de su cookie (nunca la sesión de la web).
 * Lo que el token puede tocar lo decide la API (contexto de la burbuja, tareas, solicitudes y adjuntos).
 * /api/burbuja/claim: retira el token que dejó la ventanita de conectar; /api/burbuja/session (DELETE) lo olvida.
 */

export const dynamic = 'force-dynamic'

const REQUEST_HEADERS = ['content-type', 'accept', 'accept-language', 'idempotency-key']
const RESPONSE_HEADERS = ['content-type', 'cache-control', 'retry-after']

const error = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status })

async function session(request: NextRequest) {
  if (request.method !== 'DELETE') return error(405, 'method_not_allowed', 'Usa DELETE.')
  const out = new NextResponse(null, { status: 204 })
  out.cookies.set(bubbleCookie('', 0))
  return out
}

/** Retira el token que dejó la ventanita de conectar (con el verifier que solo conoce esta burbuja) y lo guarda. */
async function claim(request: NextRequest) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'Usa POST.')
  const body = (await request.json().catch(() => null)) as { verifier?: unknown } | null
  if (typeof body?.verifier !== 'string') return error(422, 'invalid_verifier', 'Falta el verifier.')
  const res = await fetch(`${API_URL}/v1/bubble/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verifier: body.verifier }),
    cache: 'no-store',
  })
  if (!res.ok) return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
  const { token } = (await res.json()) as { token?: unknown }
  if (!isBubbleToken(token)) return error(502, 'invalid_token', 'La API devolvió un token raro.')
  const out = new NextResponse(null, { status: 204 })
  out.cookies.set(bubbleCookie(token))
  return out
}

async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (path.length === 1 && path[0] === 'session') return session(request)
  if (path.length === 1 && path[0] === 'claim') return claim(request)
  if (path[0] !== 'v1') return error(404, 'not_found', 'Esa ruta no existe.')

  const token = request.cookies.get(BUBBLE_COOKIE)?.value
  if (!isBubbleToken(token)) return error(401, 'not_connected', 'Conecta la burbuja con tu cuenta de Veltro.')

  const headers = new Headers({ authorization: `Bearer ${token}` })
  for (const h of REQUEST_HEADERS) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }
  const res = await fetch(`${API_URL}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
    cache: 'no-store',
  })
  const out = new NextResponse(res.status === 204 ? null : res.body, { status: res.status })
  for (const h of RESPONSE_HEADERS) {
    const v = res.headers.get(h)
    if (v) out.headers.set(h, v)
  }
  // el token venció o lo borraron en Ajustes: se olvida y la burbuja vuelve a pedir conectar
  if (res.status === 401) out.cookies.set(bubbleCookie('', 0))
  return out
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE }
