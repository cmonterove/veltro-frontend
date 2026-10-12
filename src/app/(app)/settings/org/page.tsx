import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { OrgSettings } from '@/components/settings/org-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.org')} · ${t('title')}` }
}

export default function OrgPage() {
  return <OrgSettings />
}
