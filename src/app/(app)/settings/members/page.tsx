import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { MembersSettings } from '@/components/settings/members-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.members')} · ${t('title')}` }
}

export default async function MembersPage() {
  const ctx = await requireAppContext()
  if (!isAccountAdmin(ctx.accountRole)) redirect('/settings/profile')
  const supabase = await createClient()
  const [{ data: rows }, { data: usage }] = await Promise.all([
    supabase.from('workspace_members').select('workspace_id, user_id, role').in('workspace_id', ctx.workspaces.map((w) => w.id)),
    supabase.rpc('get_account_usage', { p_account: ctx.account.id }),
  ])
  return <MembersSettings assignments={rows ?? []} usage={usage?.[0] ?? null} />
}
