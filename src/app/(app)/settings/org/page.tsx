import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireAppContext } from '@/lib/session'
import { api } from '@/lib/api/server'
import { toDepartment, toMember } from '@/lib/api/adapters'
import { isSuspended, type ApiOrg } from '@/lib/api/ajustes'
import { OrgSettings } from '@/components/settings/org-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.org')} · ${t('title')}` }
}

export default async function OrgPage() {
  const ctx = await requireAppContext()
  if (isSuspended(ctx)) return null
  const org = await api<ApiOrg>(`/v1/accounts/${ctx.account.id}/org`)
  return (
    <OrgSettings
      members={org.members.map(toMember).sort((a, b) => a.full_name.localeCompare(b.full_name))}
      departments={org.departments.map(toDepartment)}
    />
  )
}
