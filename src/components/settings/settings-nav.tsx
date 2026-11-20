'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Building2, ChevronDown, Network, Plus, Users, UsersRound, LayoutTemplate } from 'lucide-react'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Menu, MenuContent, MenuGroup, MenuLabel, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { SupportIcon } from '@/components/support/support-bits'
import { isPersonalSettings } from '@/lib/routes'

type Item = { href: string; label: string; icon: React.ReactNode; active: (p: string) => boolean }
type Group = { id: string; label: string; items: Item[] }

/** Ajustes de la cuenta: lo de la empresa y cada espacio con su propia página (los tuyos van aparte). */
function useSettingsGroups(admin: boolean): Group[] {
  const t = useTranslations('settings.nav')
  const { workspaces, account } = useApp()
  const exact = (href: string) => (p: string) => p === href
  const groups: Group[] = [
    {
      id: 'account',
      label: account.name,
      items: [
        { href: '/settings/account', label: t('account'), icon: <Building2 />, active: exact('/settings/account') },
        ...(admin ? [{ href: '/settings/members', label: t('members'), icon: <Users />, active: exact('/settings/members') }] : []),
        { href: '/settings/org', label: t('org'), icon: <Network />, active: exact('/settings/org') },
        { href: '/settings/teams', label: t('teams'), icon: <UsersRound />, active: exact('/settings/teams') },
        { href: '/settings/templates', label: t('templates'), icon: <LayoutTemplate />, active: exact('/settings/templates') },
        { href: '/settings/support', label: t('support'), icon: <SupportIcon />, active: exact('/settings/support') },
      ],
    },
  ]
  if (admin) {
    groups.push({
      id: 'workspaces',
      label: t('workspaces'),
      items: [
        ...workspaces.map((w) => ({
          href: `/settings/workspaces/${w.slug}`,
          label: w.name,
          icon: <WorkspaceMark ws={w} size={16} />,
          active: (p: string) => p === `/settings/workspaces/${w.slug}`,
        })),
        { href: '/settings/workspaces/new', label: t('newWorkspace'), icon: <Plus />, active: exact('/settings/workspaces/new') },
      ],
    })
  }
  return groups
}

/**
 * El menú de Ajustes sobre el marco ciruela (como la lista del Pasillo): «Ajustes» en grande, y cada grupo
 * con su cabecera — la cuenta (su inicial, plan y tu rol) y los espacios. La
 * opción elegida es crema y llega hasta el borde: se une a la página como la pestaña de una carpeta.
 */
export function SettingsNav() {
  const admin = useIsAccountAdmin()
  const t = useTranslations('settings')
  const tRole = useTranslations('roles')
  const pathname = usePathname()
  const groups = useSettingsGroups(admin)
  const { account, accountRole } = useApp()

  const head = (g: Group) =>
    g.id === 'account' ? (
      <div className="mb-1.5 flex items-center gap-2.5 px-3">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-accent text-[13px] font-bold text-accent-fg">{account.name.trim().charAt(0).toUpperCase()}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-fg">{account.name}</span>
          <span className="block truncate text-[11.5px] text-fg-subtle">{t('nav.planRole', { plan: account.plan_id.charAt(0).toUpperCase() + account.plan_id.slice(1), role: tRole(accountRole) })}</span>
        </span>
      </div>
    ) : (
      <Link
        href="/settings/workspaces"
        className={cn('mb-1 block truncate px-3 text-2xs font-semibold uppercase tracking-wide hover:text-fg', pathname === '/settings/workspaces' ? 'text-fg' : 'text-fg-subtle')}
      >
        {g.label}
      </Link>
    )

  return (
    <nav className="flex min-h-0 w-full flex-col overflow-y-auto pb-6 pl-2 pt-1 scrollbar-none" aria-label={t('title')}>
      <h1 className="px-3 pb-5 text-[28px] font-bold leading-none tracking-[-0.035em] text-fg">{t('title')}</h1>
      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <div key={g.id}>
            {head(g)}
            <div className="flex flex-col gap-0.5">
              {g.items.map((i) => {
                const active = i.active(pathname)
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex h-10 items-center rounded-[14px] px-3 text-[14px] transition-colors duration-200 [&_svg]:size-4 [&_svg]:shrink-0',
                      active ? 'on-sheet mr-0 font-medium text-fg [&_svg]:text-accent' : 'mr-3 text-fg-muted hover:bg-hover hover:text-fg [&_svg]:text-fg-subtle',
                    )}
                  >
                    {/* la pestaña crema es una sola: se desliza de una opción a otra al cambiar */}
                    {active ? (
                      <motion.span
                        layoutId="settings-tab"
                        transition={{ type: 'spring', stiffness: 520, damping: 44, mass: 0.9 }}
                        className={cn(
                          'on-sheet absolute inset-0 rounded-l-[14px] bg-canvas',
                          // las esquinas de la unión, curvas hacia afuera, en el color de la hoja (como en el Pasillo)
                          'before:pointer-events-none before:absolute before:bottom-full before:right-0 before:size-4 before:bg-[radial-gradient(circle_at_0_0,transparent_15.5px,var(--canvas)_16px)]',
                          'after:pointer-events-none after:absolute after:right-0 after:top-full after:size-4 after:bg-[radial-gradient(circle_at_0_100%,transparent_15.5px,var(--canvas)_16px)]',
                        )}
                        aria-hidden
                      />
                    ) : null}
                    <span className="relative flex min-w-0 items-center gap-3">
                      {i.icon}
                      <span className="truncate">{i.label}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}

/** El panel del menú sobre el marco (solo escritorio): lo usan Ajustes y su carga, para que se vean iguales. */
export function SettingsAside() {
  return (
    <aside className="hidden w-[272px] shrink-0 md:on-frame md:relative md:z-[1] md:flex">
      <SettingsNav />
    </aside>
  )
}

/** En pantallas angostas el menú lateral se vuelve un selector arriba de la página. */
export function SettingsNavMobile() {
  const admin = useIsAccountAdmin()
  const t = useTranslations('settings')
  const pathname = usePathname()
  const groups = useSettingsGroups(admin)
  const current = groups.flatMap((g) => g.items).find((i) => i.active(pathname))
  return (
    <Menu>
      <MenuTrigger className="inline-flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm [&_svg]:size-4 [&_svg]:text-fg-muted">
        {current?.icon}
        <span className="min-w-0 flex-1 truncate text-left font-medium">{current?.label ?? t('title')}</span>
        <ChevronDown className="!size-3.5" />
      </MenuTrigger>
      <MenuContent align="start" className="max-h-[70vh] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto">
        {groups.map((g, gi) => (
          <MenuGroup key={g.id}>
            {gi > 0 ? <MenuSeparator /> : null}
            <MenuLabel>{g.label}</MenuLabel>
            {g.items.map((i) => (
              <MenuLinkItem key={i.href} render={<Link href={i.href} />}>
                {i.icon}
                {i.label}
              </MenuLinkItem>
            ))}
          </MenuGroup>
        ))}
      </MenuContent>
    </Menu>
  )
}

/** Las páginas de formularios van angostas; el organigrama necesita ancho para el árbol y su panel. */
const WIDE = ['/settings/org']

export function SettingsContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const wide = WIDE.some((p) => pathname === p)
  // las anchas ocupan todo el alto: sus tarjetas llegan hasta abajo
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 pt-6 sm:px-10 sm:pt-10',
        wide ? 'flex min-h-full max-w-6xl flex-col pb-6 lg:h-full' : 'max-w-3xl pb-24',
      )}
    >
      {children}
    </div>
  )
}

/** Tus ajustes (Perfil y Preferencias): en la hoja común, angostos y tranquilos. La cabecera y las pestañas las arma la página. */
function PersonalFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-8">{children}</div>
    </div>
  )
}

/** El armazón según la página: tus ajustes (página tranquila) o los de la cuenta (menú sobre el marco y su hoja). */
export function SettingsFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (isPersonalSettings(pathname)) return <PersonalFrame>{children}</PersonalFrame>
  return (
    <div className="flex h-full min-h-0">
      <SettingsAside />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin md:rounded-[20px] md:bg-canvas md:shadow-sheet">
        <SettingsContainer>
          <div className="mb-6 md:hidden">
            <SettingsNavMobile />
          </div>
          {/* cada página entra con un fundido corto desde abajo */}
          <div key={pathname} className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out">
            {children}
          </div>
        </SettingsContainer>
      </main>
    </div>
  )
}
