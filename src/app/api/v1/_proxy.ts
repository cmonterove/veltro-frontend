import 'server-only'
import { NextResponse } from 'next/server'
import { API_URL } from '@/lib/api/session-cookies'

/**
 * La API pública vieja de la web (/api/v1/*) queda solo como pasamanos a la API de Veltro, por
 * compatibilidad con quien ya configuró a Claude con estas URLs. El token `vlt_…` lo valida la API
 * (alcance read/write, espacios, vencimiento y suspensiones); la web no toca la base.
 * Lo nuevo va directo a la API: GET /v1/workspaces, POST /v1/workspaces/{ws}/docs.
 */

const DEPRECATED = { deprecation: 'true' }

export function proxyError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: DEPRECATED })
}

export function proxyJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: DEPRECATED })
}

/** Llama a la API con el mismo token; si falla, devuelve la respuesta de error de la API tal cual. */
export async function callApi<T>(request: Request, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ data: T; response: null } | { data: null; response: NextResponse }> {
  const auth = request.headers.get('authorization') ?? ''
  if (!/^Bearer vlt_\S+$/.test(auth)) return { data: null, response: proxyError(401, 'invalid_token', 'Falta el token de API (Authorization: Bearer vlt_…).') }
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: auth, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { data: null, response: NextResponse.json(data ?? { error: { code: `http_${res.status}`, message: res.statusText } }, { status: res.status, headers: DEPRECATED }) }
    return { data: data as T, response: null }
  } catch {
    return { data: null, response: proxyError(502, 'api_unreachable', 'No se pudo hablar con la API de Veltro.') }
  }
}
