import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MesaView } from '@/components/mesa/mesa-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('mesa') }
}

export default function MesaPage() {
  return <MesaView />
}
