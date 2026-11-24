import 'server-only'
import { cache } from 'react'
import { apiAnon } from '@/lib/api/server'
import type { InvitePeek } from '../actions'

/**
 * Lo que dice el enlace de una invitación, una sola vez por pedido: lo usan la página, sus metadatos
 * (el título y la descripción que muestran WhatsApp y el correo al pegar el enlace) y su imagen.
 */
export const peekInvite = cache(async (token: string): Promise<InvitePeek | null> => {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null
  return apiAnon<InvitePeek>('/v1/invitations/peek', { method: 'POST', body: { token } }).catch(() => null)
})
