import { getTranslations } from 'next-intl/server'

export default async function SettingsPage() {
  const t = await getTranslations('dashboard.nav')

  return (
    <div style={{ padding: '32px 40px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings')}</h1>
    </div>
  )
}
