import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { IntegrationsSettings } from '@/components/settings/integrations-settings'
import { googleRedirectUri } from '@/lib/google/config'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.integrations')} · ${t('title')}` }
}

export default function IntegrationsPage() {
  return <IntegrationsSettings redirectUri={googleRedirectUri()} />
}
