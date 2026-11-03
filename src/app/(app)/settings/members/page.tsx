import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { api } from '@/lib/api/server'
import { isSuspended, toAccountMember, toUsage, type ApiAccountMember } from '@/lib/api/ajustes'
import type { ApiUsage } from '@/lib/api/types'
import { MembersSettings } from '@/components/settings/members-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.members')} · ${t('title')}` }
}

export default async function MembersPage() {
  const ctx = await requireAppContext()
  if (!isAccountAdmin(ctx.accountRole)) redirect('/settings/profile')
  if (isSuspended(ctx)) return null
  const [{ items }, usage] = await Promise.all([
    api<{ items: ApiAccountMember[] }>(`/v1/accounts/${ctx.account.id}/members`),
    api<ApiUsage>(`/v1/accounts/${ctx.account.id}/usage`),
  ])
  return <MembersSettings members={items.map(toAccountMember)} usage={toUsage(usage)} />
}
