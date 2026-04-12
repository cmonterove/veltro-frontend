import Link from 'next/link'
import type { Route } from 'next'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('errors.notFound')

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground max-w-md">{t('subtitle')}</p>
      <Link href={'/' as Route} className="text-primary text-sm font-medium underline-offset-4 hover:underline">
        {t('goHome')}
      </Link>
    </main>
  )
}
