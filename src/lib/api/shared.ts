/**
 * Lo común entre servidor y navegador para hablar con la API de Veltro (veltro-backend).
 * Todos los datos pasan por la API: valida, aplica permisos y responde con
 * { error: { code, message, details } } cuando algo no se puede.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly text: string,
    readonly details?: unknown,
  ) {
    // el código va en message: toErrorCode() busca ahí los códigos conocidos
    super(`${code}: ${text}`)
    this.name = 'ApiError'
  }
}

export type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>

export function queryString(query?: Query) {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) for (const v of value) params.append(key, String(v))
    else params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

export async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  return data as T
}
