import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TaskPage } from '@/components/tasks/task-page'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params
  if (!UUID.test(ref)) return { title: decodeURIComponent(ref).toUpperCase() }
  const t = await getTranslations('tasks')
  return { title: t('task') }
}

export default async function TaskRoute({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  return <TaskPage param={ref} />
}
