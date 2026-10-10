import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { buttonVariants } from '@/components/ui/button'

export default async function NotFound() {
  const t = await getTranslations('errors')
  return (
    <div className="flex min-h-[60vh] flex-col items-start justify-center gap-3 px-8 py-16 sm:px-16">
      <p className="font-mono text-sm text-fg-subtle">404</p>
      <h1 className="text-xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="max-w-md text-sm text-fg-muted">{t('notFoundBody')}</p>
      <Link href="/home" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        {t('backHome')}
      </Link>
    </div>
  )
}
