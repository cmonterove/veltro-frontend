import { getTranslations } from 'next-intl/server'

export default async function MyWorkPage() {
  const t = await getTranslations('dashboard.myWork')

  return (
    <div style={{ padding: '32px 40px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text-primary)' }}>{t('title')}</h1>
    </div>
  )
}
