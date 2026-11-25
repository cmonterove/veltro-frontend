'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

/**
 * Las invitaciones abiertas a mi correo (/v1/me/invitations): aceptarlas o rechazarlas desde la campana,
 * sin el enlace del correo. El aviso «te invitaron» trae el id en data.invitationId; al aceptar se entra
 * a esa cuenta (goToAccount).
 */
export function useInvitationActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] })
  return {
    accept: useMutation({
      mutationFn: (id: string) => api<{ accountId: string }>(`/v1/me/invitations/${id}/accept`, { method: 'POST' }),
      onSettled: refresh,
    }),
    decline: useMutation({
      mutationFn: (id: string) => api<{ ok: true }>(`/v1/me/invitations/${id}/decline`, { method: 'POST' }),
      onSettled: refresh,
    }),
  }
}
