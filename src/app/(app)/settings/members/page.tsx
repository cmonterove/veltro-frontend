import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MembersSettingsPage } from '@/components/settings/settings-pages'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.members')} · ${t('title')}` }
}

export default function MembersPage() {
  return <MembersSettingsPage />
}
