import { getTranslations } from 'next-intl/server'

export default async function OrgMembersPage() {
  const t = await getTranslations('settings.members')

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
    </main>
  )
}
