import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PreferencesSettings } from '@/components/settings/profile-settings'
import { IntegrationsSection } from '@/components/settings/integrations-settings'
import { googleRedirectUri } from '@/lib/google/config'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.preferences')} · ${t('title')}` }
}

export default function PreferencesPage() {
  return (
    <>
      <PreferencesSettings />
      <IntegrationsSection redirectUri={googleRedirectUri()} />
    </>
  )
}
