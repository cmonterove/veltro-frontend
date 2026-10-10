import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PulseView } from '@/components/pulse/pulse-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('today') }
}

export default function HomePage() {
  return <PulseView />
}
