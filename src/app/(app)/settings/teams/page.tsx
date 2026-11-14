import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { isSuspended } from '@/lib/api/ajustes'
import { TeamsSettings } from '@/components/settings/teams-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.teams')} · ${t('title')}` }
}

/** Equipos de trabajo: los ve toda la cuenta; los arman los admins. Los datos vienen del contexto. */
export default async function TeamsPage() {
  const ctx = await requireAppContext()
  if (isSuspended(ctx)) return null
  return <TeamsSettings admin={isAccountAdmin(ctx.accountRole)} />
}
