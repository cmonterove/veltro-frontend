import { getTranslations } from 'next-intl/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { SettingsNav, SettingsNavMobile } from '@/components/settings/settings-nav'

/** Ajustes: menú agrupado a la izquierda y la página a la derecha, cada uno con su propio scroll. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext()
  const t = await getTranslations('settings')
  const admin = isAccountAdmin(ctx.accountRole)
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-line bg-sidebar/40 px-3 pb-8 pt-6 scrollbar-thin md:block">
        <p className="mb-5 px-2 text-sm font-semibold text-fg">{t('title')}</p>
        <SettingsNav admin={admin} />
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-10 sm:pt-10">
          <div className="mb-6 md:hidden">
            <SettingsNavMobile admin={admin} />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
