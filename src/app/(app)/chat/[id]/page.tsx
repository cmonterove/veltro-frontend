import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ChatThread } from '@/components/chat/chat-thread'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('pasillo') }
}

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ChatThread key={id} chatId={id} />
}
