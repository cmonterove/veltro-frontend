import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { listApiTokens } from '@/app/actions/settings'
import { appUrl } from '@/lib/google/config'
import { ApiSettings } from '@/components/settings/api-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.api')} · ${t('title')}` }
}

export default async function ApiPage() {
  const tokens = await listApiTokens()
  return <ApiSettings tokens={tokens} baseUrl={appUrl()} />
}
