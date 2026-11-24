'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Building2, ChevronDown, Network, Plus, Users, UsersRound, LayoutTemplate } from 'lucide-react'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Menu, MenuContent, MenuGroup, MenuLabel, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { SupportIcon } from '@/components/support/support-bits'
import { isPersonalSettings } from '@/lib/routes'

export type SettingsItem = { href: string; label: string; icon: React.ReactNode; active: (p: string) => boolean }
type Item = SettingsItem
export type Group = { id: string; label: string; items: Item[] }

/** Ajustes de la cuenta: lo de la empresa y cada espacio con su propia página (los tuyos van aparte). */
export function useSettingsGroups(admin: boolean): Group[] {
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

/**
 * Las páginas de la cuenta usan todo el ancho y cada una arma su composición (tabla, banda, columnas);
 * los ajustes de un espacio siguen angostos (son formularios). El organigrama además ocupa todo el alto.
 */
const WIDE = ['/settings/account', '/settings/members', '/settings/org', '/settings/teams', '/settings/templates', '/settings/support']
const FULL_HEIGHT = ['/settings/org', '/settings/members', '/settings/support']

export function SettingsContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // los ajustes de un espacio también (su banda, su identidad y su vista previa), y crear uno (su
  // identidad arriba y, abajo, las plantillas con el tablero que va a quedar)
  const isWorkspacePage = pathname.startsWith('/settings/workspaces/')
  const wide = WIDE.some((p) => pathname === p) || isWorkspacePage
  // los de un espacio también: su panel llena la pantalla y nada se desplaza afuera
  const fullHeight = FULL_HEIGHT.some((p) => pathname === p) || isWorkspacePage
  return (
    <div
      className={cn(
        'w-full px-4 pt-6 sm:px-10 sm:pt-9',
        wide ? 'flex min-h-full flex-col pb-8' : 'mx-auto max-w-3xl pb-24',
        fullHeight && 'pb-6 lg:h-full',
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

/**
 * El armazón según la página. Los de la cuenta ya no traen su menú: la barra principal se transforma en
 * el de Ajustes (un solo menú). Las dos clases de página van en la hoja común; cada una entra con un fundido.
 */
export function SettingsFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (isPersonalSettings(pathname)) return <PersonalFrame>{children}</PersonalFrame>
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <SettingsContainer>
        <div className="mb-6 md:hidden">
          <SettingsNavMobile />
        </div>
        <div key={pathname} className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out">
          {children}
        </div>
      </SettingsContainer>
    </div>
  )
}
