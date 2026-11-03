'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Tooltip } from '@/components/ui/tooltip'
import { navActiveClass, navItemClass } from '@/components/app/sidebar'
import { useSupportPending } from '@/lib/queries/support'
import { cn } from '@/lib/utils'
import { CountBadge, SupportIcon } from './support-bits'

// igual que los ítems del riel colapsado de la barra lateral
const railItemClass =
  'relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg [&>svg]:size-[18px] [&>svg]:shrink-0'

/** «Soporte» en la barra lateral, con lo que espera por mí (respuestas, tickets que me llegan, novedades). */
export function SupportNavLink({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const { data } = useSupportPending()
  const count = data?.count ?? 0
  const active = pathname === '/support' || pathname.startsWith('/support/')
  const label = count ? `${t('support')} · ${count}` : t('support')
  if (compact) {
    return (
      <Tooltip content={label} side="right">
        <Link href="/support" aria-label={label} className={cn(railItemClass, active && navActiveClass)}>
          <SupportIcon />
          {count ? <span className="absolute right-1 top-1 size-2 rounded-full bg-accent ring-2 ring-sidebar" aria-hidden /> : null}
        </Link>
      </Tooltip>
    )
  }
  return (
    <Link href="/support" data-tour="nav-support" className={cn(navItemClass, active && navActiveClass)}>
      <SupportIcon />
      <span className="truncate">{t('support')}</span>
      <CountBadge count={count} className="ml-auto" />
    </Link>
  )
}
