import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { api } from '@/lib/api/server'
import { toWorkspace } from '@/lib/api/adapters'
import { isSuspended, toUsage, type ApiWorkspaceWithCounts } from '@/lib/api/ajustes'
import type { ApiUsage } from '@/lib/api/types'
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
  if (isSuspended(ctx)) return null

  const [{ items }, usage] = await Promise.all([
    api<{ items: ApiWorkspaceWithCounts[] }>('/v1/workspaces', { query: { accountId: ctx.account.id, archived: 'all' } }),
    api<ApiUsage>(`/v1/accounts/${ctx.account.id}/usage`),
  ])
  const counts = Object.fromEntries(items.map((w) => [w.id, w.counts.members]))
  return (
    <WorkspacesOverview
      active={items.filter((w) => !w.archivedAt).map((w) => toWorkspace(w))}
      archived={items.filter((w) => w.archivedAt).map((w) => toWorkspace(w))}
      memberCounts={counts}
      usage={toUsage(usage)}
    />
  )
}
