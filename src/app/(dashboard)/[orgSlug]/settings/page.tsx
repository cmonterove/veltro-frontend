import { getTranslations } from 'next-intl/server'

export default async function OrgSettingsPage() {
  const t = await getTranslations('settings.organization')

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
    </main>
  )
}
