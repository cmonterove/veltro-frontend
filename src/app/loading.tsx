import { getTranslations } from 'next-intl/server'

export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div className="text-muted-foreground flex min-h-dvh items-center justify-center text-sm">
      {t('loading')}
    </div>
  )
}
