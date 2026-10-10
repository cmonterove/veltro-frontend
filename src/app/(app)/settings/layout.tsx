import { getTranslations } from 'next-intl/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { SettingsNav } from '@/components/settings/settings-nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext()
  const t = await getTranslations('settings')
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-24 pt-8 sm:px-8 md:flex-row">
      <aside className="md:w-48 md:shrink-0">
        <h1 className="mb-4 text-lg font-semibold tracking-tight">{t('title')}</h1>
        <SettingsNav admin={isAccountAdmin(ctx.accountRole)} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
