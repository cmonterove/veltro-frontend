import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { WorkspacesOverview } from '@/components/settings/workspaces-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.workspaces')} · ${t('title')}` }
}

export default async function WorkspacesSettingsPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string }> }) {
  const ctx = await requireAppContext()
  if (!isAccountAdmin(ctx.accountRole)) redirect('/settings/profile')
  // enlaces de antes: ?new=1 y ?edit=<id>
  const { new: isNew, edit } = await searchParams
  if (isNew === '1') redirect('/settings/workspaces/new')
  const editing = edit ? ctx.workspaces.find((w) => w.id === edit) : undefined
  if (editing) redirect(`/settings/workspaces/${editing.slug}`)

  const supabase = await createClient()
  const [{ data: rows }, { data: usage }] = await Promise.all([
    supabase.from('workspace_members').select('workspace_id').in('workspace_id', ctx.workspaces.map((w) => w.id)),
    supabase.rpc('get_account_usage', { p_account: ctx.account.id }),
  ])
  const counts: Record<string, number> = {}
  ;(rows ?? []).forEach((r) => (counts[r.workspace_id] = (counts[r.workspace_id] ?? 0) + 1))
  return <WorkspacesOverview memberCounts={counts} usage={usage?.[0] ?? null} />
}
