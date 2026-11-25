import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { MailView } from '@/components/mail/mail-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('mail') }
}

export default function MailPage() {
  return (
    <Suspense fallback={null}>
      <MailView />
    </Suspense>
  )
}
