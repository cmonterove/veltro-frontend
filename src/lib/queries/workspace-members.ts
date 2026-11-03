'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '@/components/app/app-context'
import { api, ApiError } from '@/lib/api/client'
import type { ApiWorkspaceMember } from '@/lib/api/tareas'
import type { Member } from '@/lib/types'

/** Personas asignables en un espacio: miembros del espacio + admins de la cuenta. */
export function useWorkspaceMembers(workspaceId: string | null | undefined): Member[] {
  return useWorkspaceMembersState(workspaceId).members
}

/** Igual, pero dice si la lista ya cargó (mientras carga solo están los admins). */
export function useWorkspaceMembersState(workspaceId: string | null | undefined): { members: Member[]; loaded: boolean } {
  const { members } = useApp()
  const { data } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return (await api<{ items: ApiWorkspaceMember[] }>(`/v1/workspaces/${workspaceId}/members`)).items.map((m) => m.id)
      } catch (e) {
        // un espacio que veo solo por el organigrama no me deja ver su gente: quedan los admins
        if (e instanceof ApiError && e.status === 404) return []
        throw e
      }
    },
  })

  return useMemo(() => {
    const ids = new Set(data ?? [])
    return { members: members.filter((m) => m.role === 'owner' || m.role === 'admin' || ids.has(m.id)), loaded: data !== undefined }
  }, [data, members])
}
