import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { api } from '@/lib/api/server'
import { isSuspended, toUsage } from '@/lib/api/ajustes'
import type { ApiUsage } from '@/lib/api/types'
import { NewWorkspace } from '@/components/settings/workspaces-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('workspaces.newTitle')} · ${t('title')}` }
}

export default async function NewWorkspacePage() {
  const ctx = await requireAppContext()
  if (!isAccountAdmin(ctx.accountRole)) redirect('/settings/profile')
  if (isSuspended(ctx)) return null
  const usage = await api<ApiUsage>(`/v1/accounts/${ctx.account.id}/usage`)
  return <NewWorkspace usage={toUsage(usage)} />
}
