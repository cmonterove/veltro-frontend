'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Building2, ChevronDown, Network, Plus, SlidersHorizontal, User, Users } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Menu, MenuContent, MenuGroup, MenuLabel, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { navItemClass, navActiveClass } from '@/components/app/sidebar'

type Item = { href: string; label: string; icon: React.ReactNode; active: (p: string) => boolean }
type Group = { id: string; label: string; items: Item[] }

/** Ajustes agrupados: lo tuyo, lo de la empresa y cada espacio con su propia página. */
function useSettingsGroups(admin: boolean): Group[] {
  const t = useTranslations('settings.nav')
  const { workspaces, account } = useApp()
  const exact = (href: string) => (p: string) => p === href
  const groups: Group[] = [
    {
      id: 'you',
      label: t('groupYou'),
      items: [
        { href: '/settings/profile', label: t('profile'), icon: <User />, active: exact('/settings/profile') },
        { href: '/settings/preferences', label: t('preferences'), icon: <SlidersHorizontal />, active: exact('/settings/preferences') },
      ],
    },
    {
      id: 'account',
      label: account.name,
      items: [
        { href: '/settings/account', label: t('account'), icon: <Building2 />, active: exact('/settings/account') },
        ...(admin ? [{ href: '/settings/members', label: t('members'), icon: <Users />, active: exact('/settings/members') }] : []),
        { href: '/settings/org', label: t('org'), icon: <Network />, active: exact('/settings/org') },
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

export function SettingsNav({ admin }: { admin: boolean }) {
  const t = useTranslations('settings')
  const pathname = usePathname()
  const groups = useSettingsGroups(admin)
  return (
    <nav className="flex flex-col gap-5" aria-label={t('title')}>
      {groups.map((g) => (
        <div key={g.id}>
          {g.id === 'workspaces' ? (
            <Link
              href="/settings/workspaces"
              className={cn(
                'mb-1 block truncate rounded-sm px-2 text-2xs font-semibold uppercase tracking-wide hover:text-fg',
                pathname === '/settings/workspaces' ? 'text-accent-ink' : 'text-fg-subtle',
              )}
            >
              {g.label}
            </Link>
          ) : (
            <p className="mb-1 truncate px-2 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{g.label}</p>
          )}
          <div className="flex flex-col gap-px">
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className={cn(navItemClass, i.active(pathname) && navActiveClass)}>
                {i.icon}
                <span className="truncate">{i.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

/** En pantallas angostas el menú lateral se vuelve un selector arriba de la página. */
export function SettingsNavMobile({ admin }: { admin: boolean }) {
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
