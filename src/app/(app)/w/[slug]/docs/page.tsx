import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { api } from '@/lib/api/server'
import { allPages, toDocSummary, type ApiDocInList, type ApiPage } from '@/lib/api/docs-reuniones'
import { requireWorkspace } from '@/lib/workspace'
import { WorkspaceDocs } from '@/components/workspace/workspace-docs'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const t = await getTranslations('workspace')
  return { title: `${t('docs')} · ${ws.name}` }
}

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const docs = await allPages((cursor) =>
    api<ApiPage<ApiDocInList>>(`/v1/workspaces/${ws.id}/docs`, { query: { sort: 'position', limit: 200, cursor } }),
  )

  return <WorkspaceDocs workspaceId={ws.id} initialDocs={docs.map(toDocSummary)} />
}
