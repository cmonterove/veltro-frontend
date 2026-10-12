import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MyTasksView } from '@/components/home/my-tasks-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('myTasks') }
}

export default function TasksPage() {
  return <MyTasksView />
}
