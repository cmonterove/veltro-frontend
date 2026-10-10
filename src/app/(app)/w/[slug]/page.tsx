import type { Metadata } from 'next'
import { requireWorkspace } from '@/lib/workspace'
import { WorkspaceOverview } from '@/components/workspace/workspace-overview'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  return { title: ws.name }
}

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  return <WorkspaceOverview workspaceId={ws.id} />
}
