import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TemplatesSettingsPage } from '@/components/settings/settings-pages'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.templates')} · ${t('title')}` }
}

export default function TemplatesPage() {
  return <TemplatesSettingsPage />
}
