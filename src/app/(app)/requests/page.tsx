import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RequestsWelcome } from '@/components/requests/requests-shell'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('requests') }
}

export default function RequestsPage() {
  return <RequestsWelcome />
}
