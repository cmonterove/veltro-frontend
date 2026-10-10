import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace'
import { WorkspaceTasks } from '@/components/workspace/workspace-tasks'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const t = await getTranslations('workspace')
  return { title: `${t('tasks')} · ${ws.name}` }
}

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { ws } = await requireWorkspace(slug)
  const supabase = await createClient()
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('workspace_id', ws.id)
    .is('parent_id', null)
    .order('position')
    .limit(2000)

  return <WorkspaceTasks workspaceId={ws.id} initialTasks={tasks ?? []} />
}
