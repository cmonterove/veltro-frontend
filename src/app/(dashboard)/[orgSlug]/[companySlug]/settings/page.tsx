import { getTranslations } from 'next-intl/server'

export default async function CompanySettingsPage() {
  const t = await getTranslations('settings.tabs')

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{t('organization')}</h1>
    </main>
  )
}
