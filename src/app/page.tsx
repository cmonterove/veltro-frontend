import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function HomePage() {
  const t = await getTranslations('common')
  const tAuth = await getTranslations('auth.login')

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('appName')}</h1>
        <p className="text-muted-foreground mt-2">{t('tagline')}</p>
      </div>
      <Link
        href="/login"
        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
      >
        {tAuth('submitButton')}
      </Link>
    </main>
  )
}
