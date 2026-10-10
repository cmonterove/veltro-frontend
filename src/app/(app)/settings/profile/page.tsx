import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ProfileSettings } from '@/components/settings/profile-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.profile')} · ${t('title')}` }
}

export default function ProfilePage() {
  return <ProfileSettings />
}
