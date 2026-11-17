import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TeamsSettingsPage } from '@/components/settings/settings-pages'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.teams')} · ${t('title')}` }
}

export default function TeamsPage() {
  return <TeamsSettingsPage />
}
