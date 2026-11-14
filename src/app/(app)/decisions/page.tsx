import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DecisionsView } from '@/components/decisions/decisions-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('decisions') }
}

export default function DecisionsPage() {
  return <DecisionsView />
}
