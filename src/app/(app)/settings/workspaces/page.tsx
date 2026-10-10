import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { WorkspacesSettings } from '@/components/settings/workspaces-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.workspaces')} · ${t('title')}` }
}

export default async function WorkspacesSettingsPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string }> }) {
  const ctx = await requireAppContext()
  if (!isAccountAdmin(ctx.accountRole)) redirect('/settings/profile')
  const { new: isNew, edit } = await searchParams
  const supabase = await createClient()
  const [{ data: rows }, { data: usage }] = await Promise.all([
    supabase.from('workspace_members').select('workspace_id').in('workspace_id', ctx.workspaces.map((w) => w.id)),
    supabase.rpc('get_account_usage', { p_account: ctx.account.id }),
  ])
  const counts: Record<string, number> = {}
  ;(rows ?? []).forEach((r) => (counts[r.workspace_id] = (counts[r.workspace_id] ?? 0) + 1))
  return <WorkspacesSettings memberCounts={counts} usage={usage?.[0] ?? null} openNew={isNew === '1'} editId={edit ?? null} />
}
