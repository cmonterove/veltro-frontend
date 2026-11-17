import { getTranslations } from 'next-intl/server'
import { SettingsContainer, SettingsNav, SettingsNavMobile } from '@/components/settings/settings-nav'

/** Ajustes: menú agrupado a la izquierda y la página a la derecha, cada uno con su propio scroll. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // el rol sale del contexto que ya tiene el navegador: entrar a Ajustes no espera a la API
  const t = await getTranslations('settings')
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-line bg-sidebar/40 px-3 pb-8 pt-6 scrollbar-thin md:block">
        <p className="mb-5 px-2 text-sm font-semibold text-fg">{t('title')}</p>
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
        <SettingsContainer>
          <div className="mb-6 md:hidden">
            <SettingsNavMobile />
          </div>
          {children}
        </SettingsContainer>
      </div>
    </div>
  )
}
