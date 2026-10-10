'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Building2, KeyRound, LayoutGrid, Plug, User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navItemClass, navActiveClass } from '@/components/app/sidebar'

export function SettingsNav({ admin }: { admin: boolean }) {
  const t = useTranslations('settings.nav')
  const pathname = usePathname()
  const items = [
    { href: '/settings/profile', label: t('profile'), icon: User, show: true },
    { href: '/settings/account', label: t('account'), icon: Building2, show: true },
    { href: '/settings/members', label: t('members'), icon: Users, show: admin },
    { href: '/settings/workspaces', label: t('workspaces'), icon: LayoutGrid, show: admin },
    { href: '/settings/integrations', label: t('integrations'), icon: Plug, show: true },
    { href: '/settings/api', label: t('api'), icon: KeyRound, show: true },
  ]
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-px">
      {items
        .filter((i) => i.show)
        .map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn(navItemClass, 'w-auto shrink-0 md:w-full', pathname === href && navActiveClass)}>
            <Icon />
            {label}
          </Link>
        ))}
    </nav>
  )
}
