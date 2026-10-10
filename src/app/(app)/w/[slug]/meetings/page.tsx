import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireWorkspace } from '@/lib/workspace'
import { WorkspaceMeetings } from '@/components/workspace/workspace-meetings'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const t = await getTranslations('workspace')
  return { title: `${t('meetings')} · ${ws.name}` }
}

export default async function MeetingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  return <WorkspaceMeetings workspaceId={ws.id} />
}
