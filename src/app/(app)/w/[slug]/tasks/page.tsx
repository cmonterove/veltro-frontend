import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { api } from '@/lib/api/server'
import { allPages, toTaskRow, type ApiPage, type ApiTaskBrief } from '@/lib/api/tareas'
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
  // tareas de primer nivel del espacio, en orden del tablero (estado, posición)
  const tasks = await allPages((cursor) => api<ApiPage<ApiTaskBrief>>(`/v1/workspaces/${ws.id}/tasks`, { query: { limit: 200, cursor } }))

  return <WorkspaceTasks workspaceId={ws.id} initialTasks={tasks.map(toTaskRow)} />
}
