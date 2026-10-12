import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PasilloWelcome } from '@/components/chat/pasillo-shell'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('pasillo') }
}

export default function ChatPage() {
  return <PasilloWelcome />
}
