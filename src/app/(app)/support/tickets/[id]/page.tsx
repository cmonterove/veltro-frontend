import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TicketDetail } from '@/components/support/ticket-detail'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('support') }
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TicketDetail key={id} id={id} />
}
