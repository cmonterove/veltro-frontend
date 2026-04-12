import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.home')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  return (
    <div style={{ padding: '32px 40px' }}>
      <h1
        style={{
          fontSize: '22px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        {t('welcome', { name: firstName })}
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t('subtitle')}</p>
    </div>
  )
}
