import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DashboardsView } from '@/components/dashboards/dashboards-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('dashboards') }
}

export default function DashboardsPage() {
  return <DashboardsView />
}
