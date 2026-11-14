'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useApp } from '@/components/app/app-context'
import { api } from '@/lib/api/client'
import type { Page } from '@/lib/api/pasillo-boveda'

/** Una decisión del registro de la cuenta, con su reunión y su espacio. */
export type Decision = {
  id: string
  text: string
  createdAt: string
  author: { id: string; fullName: string; avatarUrl: string | null } | null
  meeting: { id: string; title: string; startsAt: string; phase: string }
  workspace: { id: string; slug: string; name: string; key: string; color: string }
}

export type DecisionQuery = { q?: string; workspaceIds?: string[]; since?: string; meetingId?: string }

export const decisionKeys = {
  all: ['decisions'] as const,
  list: (accountId: string, f: DecisionQuery) => ['decisions', accountId, f] as const,
}

const PAGE = 60

/** «¿Qué decidimos de…?»: las decisiones de todas las reuniones que puedo ver, de a páginas. */
export function useDecisions(filters: DecisionQuery) {
  const { account } = useApp()
  return useInfiniteQuery({
    queryKey: decisionKeys.list(account.id, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<Page<Decision>>(`/v1/accounts/${account.id}/decisions`, {
        query: {
          q: filters.q?.trim() || undefined,
          workspaceId: filters.workspaceIds?.length ? filters.workspaceIds.join(',') : undefined,
          since: filters.since,
          meetingId: filters.meetingId,
          limit: PAGE,
          cursor: pageParam,
        },
      }),
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (prev) => prev,
  })
}
