import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { NewWorkspace } from '@/components/settings/workspaces-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('workspaces.newTitle')} · ${t('title')}` }
}

export default async function NewWorkspacePage() {
  const ctx = await requireAppContext()
  if (!isAccountAdmin(ctx.accountRole)) redirect('/settings/profile')
  const supabase = await createClient()
  const { data: usage } = await supabase.rpc('get_account_usage', { p_account: ctx.account.id })
  return <NewWorkspace usage={usage?.[0] ?? null} />
}
