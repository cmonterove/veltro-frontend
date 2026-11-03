import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireAppContext } from '@/lib/session'
import { api } from '@/lib/api/server'
import { isSuspended, toUsage } from '@/lib/api/ajustes'
import type { ApiUsage } from '@/lib/api/types'
import { AccountSettings } from '@/components/settings/account-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.account')} · ${t('title')}` }
}

export default async function AccountPage() {
  const ctx = await requireAppContext()
  // suspendida: el shell muestra el aviso en lugar de la página
  if (isSuspended(ctx)) return null
  const usage = await api<ApiUsage>(`/v1/accounts/${ctx.account.id}/usage`)
  return <AccountSettings usage={toUsage(usage)} />
}
