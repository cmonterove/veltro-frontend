'use client'

import { useRouter } from 'next/navigation'
import { useCreateDoc } from '@/lib/queries/docs'
import { positionBetween } from '@/lib/utils'
import type { DocSummary, WorkspaceWithRole } from '@/lib/types'


export function buildDocTree(docs: DocSummary[]) {
  const children = new Map<string | null, DocSummary[]>()
  for (const d of docs) {
    const key = d.parent_id
    if (!children.has(key)) children.set(key, [])
    children.get(key)!.push(d)
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position)
  return children
}

export function useNewDoc(workspace: Pick<WorkspaceWithRole, 'id' | 'slug'>) {
  const router = useRouter()
  const create = useCreateDoc()
  return {
    pending: create.isPending,
    create: (opts?: { parentId?: string | null; after?: number | null; title?: string; icon?: string; import_markdown?: string; source?: 'manual' | 'claude' | 'import' }) =>
      create.mutate(
        {
          workspace_id: workspace.id,
          parent_id: opts?.parentId ?? null,
          position: positionBetween(opts?.after ?? Date.now() / 1000, null),
          title: opts?.title ?? '',
          icon: opts?.icon ?? null,
          import_markdown: opts?.import_markdown ?? null,
          source: opts?.source ?? 'manual',
        },
        { onSuccess: (doc) => router.push(`/w/${workspace.slug}/docs/${doc.id}`) },
      ),
  }
}
