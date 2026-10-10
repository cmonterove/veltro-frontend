import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace'
import { DOC_SUMMARY_COLUMNS } from '@/lib/queries/doc-columns'
import { WorkspaceDocs } from '@/components/workspace/workspace-docs'
import type { DocSummary } from '@/lib/types'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const t = await getTranslations('workspace')
  return { title: `${t('docs')} · ${ws.name}` }
}

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const supabase = await createClient()
  const { data } = await supabase
    .from('docs')
    .select(DOC_SUMMARY_COLUMNS)
    .eq('workspace_id', ws.id)
    .is('archived_at', null)
    .order('position')

  return <WorkspaceDocs workspaceId={ws.id} initialDocs={(data ?? []) as DocSummary[]} />
}
