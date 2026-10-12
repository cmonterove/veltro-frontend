import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { VeltroView } from '@/components/veltro/veltro-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('veltro') }
}

export default function VeltroPage() {
  return <VeltroView />
}
