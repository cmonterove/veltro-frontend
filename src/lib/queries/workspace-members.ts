'use client'

import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useApp } from '@/components/app/app-context'
import { api, ApiError } from '@/lib/api/client'
import type { ApiWorkspaceMember } from '@/lib/api/tareas'
import type { Member } from '@/lib/types'

/** Personas asignables en un espacio: miembros del espacio + admins de la cuenta. */
export function useWorkspaceMembers(workspaceId: string | null | undefined): Member[] {
  return useWorkspaceMembersState(workspaceId).members
}

/** Los ids de la gente de un espacio (la misma consulta para uno o para varios espacios). */
const membersQuery = (workspaceId: string | null | undefined) => ({
  queryKey: ['workspace-members', workspaceId],
  enabled: Boolean(workspaceId),
  staleTime: 60_000,
  queryFn: async () => {
    try {
      return (await api<{ items: ApiWorkspaceMember[] }>(`/v1/workspaces/${workspaceId}/members`)).items.map((m) => m.id)
    } catch (e) {
      // un espacio que veo solo por el organigrama no me deja ver su gente: quedan los admins
      if (e instanceof ApiError && e.status === 404) return [] as string[]
      throw e
    }
  },
})

/** Igual, pero dice si la lista ya cargó (mientras carga solo están los admins). */
export function useWorkspaceMembersState(workspaceId: string | null | undefined): { members: Member[]; loaded: boolean } {
  const { members } = useApp()
  const { data } = useQuery(membersQuery(workspaceId))

  return useMemo(() => {
    const ids = new Set(data ?? [])
    return { members: members.filter((m) => m.role === 'owner' || m.role === 'admin' || ids.has(m.id)), loaded: data !== undefined }
  }, [data, members])
}

/**
 * Personas asignables en todos estos espacios a la vez (para cambiar el responsable de varias tareas
 * juntas): la gente que está en cada uno, más los admins de la cuenta.
 */
export function useCommonWorkspaceMembers(workspaceIds: string[]): Member[] {
  const { members } = useApp()
  const results = useQueries({ queries: workspaceIds.map((id) => membersQuery(id)) })
  const lists = results.map((r) => r.data)
  const key = JSON.stringify(lists)
  return useMemo(() => {
    const sets = (JSON.parse(key) as (string[] | undefined)[]).map((ids) => new Set(ids ?? []))
    return members.filter((m) => m.role === 'owner' || m.role === 'admin' || sets.every((ids) => ids.has(m.id)))
  }, [key, members])
}
