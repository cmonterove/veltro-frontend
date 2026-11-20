import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { VeltroView } from '@/components/veltro/veltro-view'
import { AI_ENABLED } from '@/lib/features'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('veltro') }
}

export default function VeltroPage() {
  // Veltro IA, oculta por ahora: los enlaces viejos llevan a Pulso
  if (!AI_ENABLED) redirect('/home')
  return <VeltroView />
}
