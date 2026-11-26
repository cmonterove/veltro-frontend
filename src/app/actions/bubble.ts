'use server'

import { api } from '@/lib/api/server'
import { toErrorCode } from '@/lib/errors'

/**
 * La ventanita «Conectar» de la burbuja (con la sesión de la web): la API crea el token «Burbuja · OP (sitio)»
 * y lo guarda unos minutos bajo `challenge`; la burbuja lo retira con su verifier. Se ve y se borra en
 * Ajustes › Tokens de API.
 */
export async function connectBubble(input: { platform: string; host: string | null; challenge: string }): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await api('/v1/bubble/connect', {
      method: 'POST',
      body: {
        platform: input.platform.trim().slice(0, 40) || 'Plataforma',
        ...(input.host ? { host: input.host.slice(0, 120) } : {}),
        challenge: input.challenge,
      },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: toErrorCode(e as { message?: string }) }
  }
}
