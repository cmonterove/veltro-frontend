import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppContext } from '@/lib/session'
import { AccountSettings } from '@/components/settings/account-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.account')} · ${t('title')}` }
}

export default async function AccountPage() {
  const ctx = await requireAppContext()
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_account_usage', { p_account: ctx.account.id })
  return <AccountSettings usage={data?.[0] ?? null} />
}
