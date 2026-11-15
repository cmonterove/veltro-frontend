import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireAppContext } from '@/lib/session'
import { isSuspended } from '@/lib/api/ajustes'
import { TemplatesSettings } from '@/components/settings/templates-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.templates')} · ${t('title')}` }
}

/** Plantillas de tareas y de agenda: las de la cuenta y las de mis espacios. */
export default async function TemplatesPage() {
  const ctx = await requireAppContext()
  if (isSuspended(ctx)) return null
  return <TemplatesSettings />
}
