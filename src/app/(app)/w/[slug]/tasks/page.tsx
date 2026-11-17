import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireWorkspace } from '@/lib/workspace'
import { WorkspaceView } from '@/components/workspace/workspace-gate'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const t = await getTranslations('workspace')
  return { title: `${t('tasks')} · ${ws.name}` }
}

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <WorkspaceView slug={slug} view="tasks" />
}
