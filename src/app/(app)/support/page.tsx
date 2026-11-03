import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SupportWelcome } from '@/components/support/support-shell'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('support') }
}

export default function SupportPage() {
  return <SupportWelcome />
}
