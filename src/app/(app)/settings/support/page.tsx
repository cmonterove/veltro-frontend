import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SupportRoutingSettings } from '@/components/support/support-routing'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.support')} · ${t('title')}` }
}

export default function SupportSettingsPage() {
  return <SupportRoutingSettings />
}
