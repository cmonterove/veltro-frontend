import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AccountSettingsPage } from '@/components/settings/settings-pages'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.account')} · ${t('title')}` }
}

export default function AccountPage() {
  return <AccountSettingsPage />
}
