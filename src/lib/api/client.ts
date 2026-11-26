import { ApiError, parseResponse, queryString, type Query } from './shared'
import { SUSPENDED_EVENT, SUSPENSION_CODES } from './ajustes'

/**
 * La API desde el navegador: pasa por el puente /api/veltro de esta misma web, que agrega la
 * sesión (cookies httpOnly) y la renueva si venció. Nunca habla directo con Supabase.
 */

type Init = { method?: string; body?: unknown; query?: Query; headers?: Record<string, string> }

/**
 * Por dónde sale. La web: /api/veltro (la sesión de las cookies). La burbuja de Veltro dentro de otra plataforma
 * cambia a /api/burbuja (su propio token) con `setApiBridge`, y sin sesión no se va al login: avisa a la burbuja.
 */
const bridge: { base: string; headers: Record<string, string>; onUnauthorized: (() => void) | null } = {
  base: '/api/veltro',
  headers: {},
  onUnauthorized: null,
}
export function setApiBridge(b: Partial<typeof bridge>) {
  Object.assign(bridge, b)
}

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = { ...bridge.headers, ...init.headers }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${bridge.base}${path}${queryString(init.query)}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  })
  try {
    return await parseResponse<T>(res)
  } catch (e) {
    // la sesión ya no sirve: de vuelta al login, conservando dónde estaba
    if (e instanceof ApiError && e.status === 401 && bridge.onUnauthorized) bridge.onUnauthorized()
    else if (e instanceof ApiError && e.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`
    }
    // suspendida (la persona o la cuenta): el shell recarga el contexto y muestra el aviso
    if (e instanceof ApiError && e.status === 403 && typeof window !== 'undefined' && (SUSPENSION_CODES as readonly string[]).includes(e.code)) {
      window.dispatchEvent(new Event(SUSPENDED_EVENT))
    }
    throw e
  }
}

/** Lo que devuelven las rutas `upload-url` de la API: dónde y cómo subir. */
export type SignedUpload = { path: string; uploadUrl: string; method: 'PUT'; headers: Record<string, string>; expiresIn: number }

/** Sube el archivo a la URL firmada (va directo a Storage, no pasa por el puente); después se registra en la API. */
export async function uploadSigned(signed: SignedUpload, file: Blob) {
  const res = await fetch(signed.uploadUrl, { method: signed.method, headers: signed.headers, body: file })
  if (!res.ok) throw new ApiError(res.status, 'upload_failed', 'No se pudo subir el archivo.')
}

export { ApiError }
