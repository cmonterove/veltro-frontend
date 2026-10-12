'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/components/app/app-context'
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
      const { data, error } = await createClient()
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId!)
      if (error) throw error
      return data
    },
  })

  return useMemo(() => {
    const ids = new Set((data ?? []).map((r) => r.user_id))
    return { members: members.filter((m) => m.role === 'owner' || m.role === 'admin' || ids.has(m.id)), loaded: data !== undefined }
  }, [data, members])
}
