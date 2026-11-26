/**
 * La burbuja de Veltro vive en un iframe dentro de otras plataformas (OP, CUBE…). Su llave es un token de API
 * («Burbuja · OP») guardado en una cookie httpOnly propia, particionada por el sitio que la contiene (CHIPS):
 * la de OP no la ve CUBE ni la web de Veltro, y el navegador la acepta aunque bloquee las cookies de terceros.
 */

export const BUBBLE_COOKIE = 'vt-bb'

export const bubbleCookie = (value: string, maxAge = 60 * 60 * 24 * 365) => ({
  name: BUBBLE_COOKIE,
  value,
  httpOnly: true,
  // dentro de un iframe de otro sitio: None + Secure + Partitioned (en localhost el navegador acepta Secure)
  sameSite: 'none' as const,
  secure: true,
  partitioned: true,
  path: '/',
  maxAge,
})

export const isBubbleToken = (t: unknown): t is string => typeof t === 'string' && /^vlt_[A-Za-z0-9_-]{40,60}$/.test(t)
