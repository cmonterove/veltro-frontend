import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RequestDetail } from '@/components/support/request-detail'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('support') }
}

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RequestDetail key={id} id={id} />
}
