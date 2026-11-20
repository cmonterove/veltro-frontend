import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { googleRedirectUri } from '@/lib/google/config'
import { PersonalSettings } from '@/components/settings/profile-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.preferences')} · ${t('title')}` }
}

export default function PreferencesPage() {
  return <PersonalSettings tab="preferences" redirectUri={googleRedirectUri()} />
}
