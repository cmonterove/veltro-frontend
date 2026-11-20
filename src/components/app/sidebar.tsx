'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useId, useState, useTransition } from 'react'
import { motion } from 'motion/react'
import {
  CalendarDays,
  Columns3,
  Keyboard,
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  FileText,
  ListTodo,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  SquarePen,
  Sun,
  Activity,
  Sparkles,
  UserPlus,
  Video,
  Languages,
  Vault,
  MessagesSquare,
  Compass,
  Diamond,
} from 'lucide-react'
import { useApp, useIsAccountAdmin } from './app-context'
import { DemoDataMenuItem } from './demo-data'
import { useChatUnread } from '@/lib/queries/chats'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
} from '@/components/ui/menu'
import { Avatar } from '@/components/ui/avatar'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { setCurrentAccount, setLocale } from '@/app/actions/preferences'
import { isLocale, localeNames, locales } from '@/i18n/config'
import { useHydrated } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { DEMO } from '@/lib/demo/config'
import { DemoBadge } from './demo-badge'
import { Logo, LogoMark } from './logo'
import type { WorkspaceWithRole } from '@/lib/types'
import { WorkspaceMark } from '@/components/app/marks'
import { NavPeekBody, PeekHead, RailPeek, WorkspacePeek } from './rail-peek'
import { useTour } from '@/components/tour/tour'
import { RequestsIcon } from '@/components/requests/request-bits'
import { useRequestSummary } from '@/lib/queries/requests'
import { SupportIcon } from '@/components/support/support-bits'
import { AI_ENABLED } from '@/lib/features'

// El menú vive sobre el marco (ciruela empolvado, con los colores de on-frame) y el contenido es una hoja encima.
// Lo activo es una pastilla en relieve: en el menú principal se desliza de un ítem al otro.
// Cada ícono va en su baldosa (lila sobre el marco); en lo activo la baldosa se llena.
export const navItemClass =
  'group/nav relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[11px] px-1 text-sm [@media(max-height:760px)]:h-8 [@media(max-height:760px)]:[&>svg]:size-6 [@media(max-height:760px)]:[&>svg]:p-[5px] text-fg-muted outline-none transition-colors duration-150 hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35 [&>svg]:relative [&>svg]:size-7 [&>svg]:shrink-0 [&>svg]:rounded-[9px] [&>svg]:p-[6px] [&>svg]:text-accent [&>svg]:transition-colors'
export const navActiveClass = 'bg-panel font-semibold text-fg shadow-card hover:bg-panel hover:text-fg [&>svg]:bg-accent [&>svg]:text-accent-fg'
/** el fondo lo pone la pastilla que se desliza (NavPill) */
const navCurrentClass = 'font-semibold text-fg hover:bg-transparent hover:text-fg [&>svg]:bg-accent [&>svg]:text-accent-fg'
/** ítem del riel colapsado: solo el ícono, centrado */
const railItemClass =
  'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted outline-none transition-colors duration-150 hover:bg-hover/80 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35 [&>svg]:relative [&>svg]:size-4 [&>svg]:shrink-0'

/** La pastilla del ítem activo: al navegar viaja de un ítem al otro (solo transform, frena suave). */
function NavPill({ id }: { id: string }) {
  return (
    <motion.span
      layoutId={id}
      aria-hidden
      className="absolute inset-0 rounded-[11px] bg-panel shadow-card"
      transition={{ type: 'tween', duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
    />
  )
}

type SidebarProps = {
  onSearch: () => void
  onNewTask: () => void
  onShortcuts: () => void
  /** solo en escritorio: riel de íconos en vez de la barra completa */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({ onSearch, onNewTask, onShortcuts, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const { workspaces, accounts } = useApp()
  const isAdmin = useIsAccountAdmin()
  // mensajes sin leer en Pasillo, sumando todos los chats
  const unread = useChatUnread().data?.total ?? 0
  // solicitudes: las nuevas de mis departamentos y las respuestas a lo que pedí
  const requestCounts = useRequestSummary().data?.counts
  const requestsPending = (requestCounts?.inboxNew ?? 0) + (requestCounts?.mineUnread ?? 0)
  // cada barra (escritorio y celular) con su propia pastilla: con el mismo id, Motion deja visible solo una
  const pillId = useId()

  const top: { href: string; label: string; icon: typeof Activity; keys: string[]; badge?: number }[] = [
    { href: '/home', label: t('today'), icon: Activity, keys: ['G', 'H'] },
    // Veltro IA, oculta por ahora (lib/features)
    ...(AI_ENABLED ? [{ href: '/veltro', label: t('veltro'), icon: Sparkles, keys: ['G', 'V'] }] : []),
    { href: '/mesa', label: t('mesa'), icon: Columns3, keys: ['G', 'M'] },
    { href: '/calendar', label: t('calendar'), icon: CalendarDays, keys: ['G', 'C'] },
    { href: '/tasks', label: t('myTasks'), icon: CircleCheck, keys: ['G', 'T'] },
    { href: '/requests', label: t('requests'), icon: RequestsIcon, keys: ['G', 'S'], badge: requestsPending },
    { href: '/decisions', label: t('decisions'), icon: Diamond, keys: ['G', 'D'] },
    { href: '/vault', label: t('vault'), icon: Vault, keys: ['G', 'B'] },
    { href: '/chat', label: t('pasillo'), icon: MessagesSquare, keys: ['G', 'P'], badge: unread },
  ]
  // al hacer clic, la opción se marca en el acto (sin esperar a que llegue la página); al cambiar la
  // ruta manda la URL de nuevo
  const [pendingNav, setPendingNav] = useState<{ href: string; from: string } | null>(null)
  const pendingHref = pendingNav && pendingNav.from === pathname ? pendingNav.href : null
  const isActive = (href: string) => (pendingHref ? pendingHref === href : pathname === href || pathname.startsWith(`${href}/`))
  const navClick = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    setPendingNav({ href, from: pathname })
  }
  const settingsActive = pathname.startsWith('/settings') && pathname !== '/settings/members'

  if (collapsed) {
    return (
      <aside className="flex h-full flex-col items-center">
        <div className="flex h-[60px] shrink-0 items-center">
          <Link href="/home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40" aria-label="Veltro">
            <LogoMark className="size-5" />
          </Link>
        </div>

        <div className="flex flex-col items-center gap-0.5 pb-2">
          <Tooltip content={t('sidebarExpand')} shortcut={['[']} side="right">
            <button type="button" onClick={onToggleCollapsed} className={railItemClass} aria-label={t('sidebarExpand')}>
              <PanelLeftOpen />
            </button>
          </Tooltip>
          <Tooltip content={t('newTask')} shortcut={['C']} side="right">
            <button type="button" onClick={onNewTask} className={railItemClass} aria-label={t('newTask')}>
              <SquarePen />
            </button>
          </Tooltip>
        </div>

        <nav className="flex flex-col items-center gap-0.5 border-t border-line/70 pt-2">
          {top.map(({ href, label, icon: Icon, keys, badge }) => (
            <RailPeek
              key={href}
              trigger={
                <Link
                  href={href}
                  prefetch
                  onClick={navClick(href)}
                  data-tour={`nav-${href.slice(1)}`}
                  aria-label={badge ? `${label} · ${badge}` : label}
                  aria-current={isActive(href) ? 'page' : undefined}
                  className={cn(railItemClass, isActive(href) && navCurrentClass)}
                >
                  {isActive(href) ? <NavPill id={`rail-${pillId}`} /> : null}
                  <Icon />
                  {badge ? <span className="absolute right-1 top-1 size-2 rounded-full bg-count ring-2 ring-sidebar" aria-hidden /> : null}
                </Link>
              }
            >
              <PeekHead icon={Icon} label={label} keys={keys} description={t(`peek.desc.${href.slice(1)}`)} />
              <NavPeekBody href={href} />
            </RailPeek>
          ))}
        </nav>

        <div className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto border-t border-line/70 pt-2 scrollbar-none" data-tour="spaces">
          {workspaces.map((ws) => (
            <RailWorkspace key={ws.id} ws={ws} pathname={pathname} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-0.5 pb-3 pt-2">
          {/* invitar vive en Ajustes y la cuenta solo aparece si hay más de una: el alto es para los espacios */}
          {DEMO ? <DemoBadge compact /> : null}
          <Tooltip content={t('settings')} side="right">
            <Link href="/settings" aria-label={t('settings')} className={cn(railItemClass, pathname.startsWith('/settings') && navActiveClass)}>
              <Settings />
            </Link>
          </Tooltip>
          <ThemeToggle className={railItemClass} side="right" />
          {accounts.length > 1 ? <AccountSwitcher compact /> : null}
          <UserMenu onShortcuts={onShortcuts} compact />
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full flex-col">
      <div className="flex h-[60px] items-center gap-0.5 pl-4 pr-2">
        <Link href="/home" className="mr-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40" aria-label="Veltro">
          <Logo />
        </Link>
        {onToggleCollapsed ? (
          <Tooltip content={t('sidebarCollapse')} shortcut={['[']}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
              aria-label={t('sidebarCollapse')}
            >
              <PanelLeftClose className="size-[15px]" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content={t('newTask')} shortcut={['C']}>
          <button
            type="button"
            onClick={onNewTask}
            className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
            aria-label={t('newTask')}
          >
            <SquarePen className="size-[15px]" />
          </button>
        </Tooltip>
      </div>

      {/* el medio se desplaza entero si no cabe (pantallas bajas): nada se monta sobre el pie */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-none">
        <div className="hidden px-2.5 pb-3 pt-1 md:block">
          <AccountSwitcher card />
        </div>

        {/* en el celular el buscador va aquí; en escritorio está en la barra de arriba */}
        <div className="px-2 pb-2.5 pt-0.5 md:hidden">
          <button
            type="button"
            onClick={onSearch}
            data-tour="search"
            className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-panel/70 px-2 text-[13px] text-fg-subtle shadow-[0_1px_0_oklch(0.243_0.088_312.7/0.03)] outline-none transition-[background-color,border-color,color] duration-150 hover:border-line-strong hover:bg-panel hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent-mid/35"
          >
            <Search className="size-[15px] shrink-0" />
            <span className="flex-1 text-left">{t('search')}</span>
            <Kbd>⌘K</Kbd>
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-2.5">
          {top.map(({ href, label, icon: Icon, badge }) => {
            const current = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                prefetch
                onClick={navClick(href)}
                data-tour={`nav-${href.slice(1)}`}
                aria-current={current ? 'page' : undefined}
                className={cn(navItemClass, current && navCurrentClass)}
              >
                {current ? <NavPill id={`nav-${pillId}`} /> : null}
                <Icon />
                <span className="relative truncate">{label}</span>
                {badge ? (
                  <span className="relative ml-auto mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-count px-1.5 text-[11px] font-semibold tabular-nums text-count-fg">{badge > 99 ? '99+' : badge}</span>
                ) : null}
              </Link>
            )
          })}
        </nav>

        <div className="mt-5 flex flex-col" data-tour="spaces">
          <div className="group/section flex h-6 items-center justify-between pl-4 pr-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t('workspaces')}</span>
            {isAdmin ? (
              <Tooltip content={t('newWorkspace')}>
                <Link
                  href="/settings/workspaces/new"
                  className="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/section:opacity-100 focus-visible:opacity-100"
                  aria-label={t('newWorkspace')}
                >
                  <Plus className="size-3.5" />
                </Link>
              </Tooltip>
            ) : null}
          </div>
          <div className="px-2.5 pb-3 pt-1">
            {workspaces.length === 0 ? (
              <p className="px-2.5 py-1 text-xs text-fg-subtle">{t('noWorkspaces')}</p>
            ) : (
              workspaces.map((ws) => <WorkspaceNav key={ws.id} ws={ws} pathname={pathname} />)
            )}
          </div>
        </div>

      </div>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-line/60 px-2.5 pb-2.5 pt-1.5">
        {DEMO ? <DemoBadge /> : null}
        {isAdmin ? (
          <Link href="/settings/members" className={cn(navItemClass, pathname === '/settings/members' && navActiveClass)}>
            <UserPlus />
            <span>{t('invite')}</span>
          </Link>
        ) : null}
        <Link href="/settings" className={cn(navItemClass, settingsActive && navActiveClass)}>
          <Settings />
          <span>{t('settings')}</span>
        </Link>
        <div className="md:hidden">
          <AccountSwitcher />
        </div>
        <div className="flex items-center gap-0.5">
          <UserMenu onShortcuts={onShortcuts} />
          <ThemeToggle className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg [&>svg]:size-[15px]" />
        </div>
      </div>
    </aside>
  )
}

/** Sol o luna a mano: pasa al tema contrario del que se está viendo. */
function ThemeToggle({ className, side = 'top' }: { className: string; side?: 'top' | 'right' }) {
  const t = useTranslations('nav')
  const { resolvedTheme, setTheme } = useTheme()
  // el tema real solo se conoce en el navegador; antes de hidratar se dibuja la luna sin texto distinto
  const hydrated = useHydrated()
  const dark = hydrated && resolvedTheme === 'dark'
  const label = dark ? t('themeToLight') : t('themeToDark')
  return (
    <Tooltip content={label} side={side}>
      <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className={className} aria-label={label}>
        {dark ? <Sun /> : <Moon />}
      </button>
    </Tooltip>
  )
}

function WorkspaceNav({ ws, pathname }: { ws: WorkspaceWithRole; pathname: string }) {
  const t = useTranslations('nav')
  const base = `/w/${ws.slug}`
  const inWs = pathname === base || pathname.startsWith(`${base}/`)
  // abierto si estás dentro; la flecha deja asomarse a otro espacio (o plegar el tuyo) sin navegar.
  // Lo elegido a mano vale hasta que entras o sales del espacio.
  const [manual, setManual] = useState<{ inWs: boolean; open: boolean } | null>(null)
  const open = manual && manual.inWs === inWs ? manual.open : inWs

  const links = [
    { href: `${base}/tasks`, label: t('tasks'), icon: ListTodo },
    { href: `${base}/docs`, label: t('docs'), icon: FileText },
    { href: `${base}/meetings`, label: t('meetings'), icon: Video },
  ]

  return (
    <div className="group/ws relative mb-px">
      <Link href={base} className={cn(navItemClass, 'pr-7', pathname === base && navActiveClass, inWs && pathname !== base && 'text-fg')}>
        <WorkspaceMark ws={ws} size={22} />
        <span className="truncate">{ws.name}</span>
      </Link>
      <button
        type="button"
        onClick={() => setManual({ inWs, open: !open })}
        aria-expanded={open}
        aria-label={`${open ? t('collapse') : t('expand')} ${ws.name}`}
        className={cn(
          'absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle transition-opacity hover:bg-hover hover:text-fg focus-visible:opacity-100',
          open ? 'opacity-100' : 'opacity-0 group-hover/ws:opacity-100',
        )}
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-200 ease-out-quart', open && 'rotate-90')} />
      </button>
      <div className="disclosure" data-open={open ? '' : undefined} inert={!open}>
        <div>
          <div className="ml-[15px] mt-0.5 flex flex-col gap-px border-l border-line pl-2">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cn(navItemClass, 'h-7 px-2 text-[13px] [&>svg]:p-0', pathname.startsWith(href) && navActiveClass, '[&>svg]:bg-transparent')}>
                <Icon className="!size-3.5" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Espacio en el riel: su marca; si estás dentro, debajo aparecen Tareas, Docs y Reuniones. */
function RailWorkspace({ ws, pathname }: { ws: WorkspaceWithRole; pathname: string }) {
  const t = useTranslations('nav')
  const base = `/w/${ws.slug}`
  const inWs = pathname === base || pathname.startsWith(`${base}/`)
  const links = [
    { href: `${base}/tasks`, label: t('tasks'), icon: ListTodo },
    { href: `${base}/docs`, label: t('docs'), icon: FileText },
    { href: `${base}/meetings`, label: t('meetings'), icon: Video },
  ]
  return (
    <>
      <RailPeek
        trigger={
          <Link href={base} aria-label={ws.name} className={cn(railItemClass, inWs && 'bg-hover', pathname === base && navActiveClass)}>
            <WorkspaceMark ws={ws} size={18} />
          </Link>
        }
      >
        <WorkspacePeek ws={ws} />
      </RailPeek>
      <div className="disclosure" data-open={inWs ? '' : undefined} inert={!inWs}>
        <div>
          <div className="mb-1 flex flex-col items-center gap-0.5 rounded-lg bg-hover/50 py-0.5">
            {links.map(({ href, label, icon: Icon }) => (
              <Tooltip key={href} content={`${ws.name} · ${label}`} side="right">
                <Link href={href} aria-label={label} className={cn(railItemClass, 'size-7 [&>svg]:size-3.5', pathname.startsWith(href) && navActiveClass)}>
                  <Icon />
                </Link>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function AccountSwitcher({ compact = false, card = false }: { compact?: boolean; card?: boolean }) {
  const t = useTranslations('nav')
  const router = useRouter()
  const { account, accounts, workspaces } = useApp()
  const [pending, start] = useTransition()

  return (
    <Menu>
      {card ? (
        <MenuTrigger
          disabled={pending}
          className="flex h-[52px] w-full items-center gap-2.5 rounded-[15px] bg-hover pl-2 pr-2.5 text-left shadow-card outline-none transition-colors hover:bg-active focus-visible:ring-2 focus-visible:ring-accent-mid/35 data-[popup-open]:bg-active"
        >
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-accent text-[13px] font-bold text-accent-fg">{account.name.trim().charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-fg">{account.name}</span>
            <span className="block truncate text-[11.5px] text-fg-subtle">{t('workspacesCount', { count: workspaces.length })}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" />
        </MenuTrigger>
      ) : compact ? (
        <Tooltip content={account.name} side="right">
          <MenuTrigger className={cn(railItemClass, 'data-[popup-open]:bg-hover')} disabled={pending} aria-label={t('accounts')}>
            <Building2 />
          </MenuTrigger>
        </Tooltip>
      ) : (
        <MenuTrigger className={cn(navItemClass, 'data-[popup-open]:bg-hover')} disabled={pending}>
          <Building2 />
          <span className="min-w-0 flex-1 truncate text-left">{account.name}</span>
          <ChevronsUpDown className="!size-3.5 text-fg-subtle" />
        </MenuTrigger>
      )}
      <MenuContent side={compact ? 'right' : card ? 'bottom' : 'top'} align={compact ? 'end' : 'start'} className="w-64">
        <MenuLabel>{t('accounts')}</MenuLabel>
        {accounts.map((a) => (
          <MenuItem
            key={a.id}
            onClick={() => {
              if (a.id === account.id) return
              start(async () => {
                await setCurrentAccount(a.id)
                router.push('/home')
                router.refresh()
              })
            }}
          >
            <Building2 />
            <span className="flex-1 truncate">{a.name}</span>
            {a.id === account.id ? <Check className="!text-fg" /> : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/settings/account" />}>
          <Settings />
          {t('accountSettings')}
        </MenuLinkItem>
      </MenuContent>
    </Menu>
  )
}

function UserMenu({ onShortcuts, compact = false }: { onShortcuts: () => void; compact?: boolean }) {
  const t = useTranslations('nav')
  const tour = useTour()
  const { profile } = useApp()
  const { theme, setTheme } = useTheme()

  return (
    <Menu>
      {compact ? (
        <Tooltip content={profile.full_name} side="right">
          <MenuTrigger className={cn(railItemClass, 'data-[popup-open]:bg-hover')} aria-label={profile.full_name}>
            <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={18} />
          </MenuTrigger>
        </Tooltip>
      ) : (
        <MenuTrigger className={cn(navItemClass, 'h-10 data-[popup-open]:bg-hover')}>
          <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={28} />
          <span className="min-w-0 flex-1 truncate text-left font-medium text-fg">{profile.full_name}</span>
        </MenuTrigger>
      )}
      <MenuContent side={compact ? 'right' : 'top'} align={compact ? 'end' : 'start'} className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-fg">{profile.full_name}</p>
          <p className="truncate text-xs text-fg-muted">{profile.email}</p>
        </div>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/settings/profile" />}>
          <Settings />
          {t('profile')}
        </MenuLinkItem>
        <MenuItem onClick={onShortcuts}>
          <Keyboard />
          {t('shortcuts')}
          <Kbd className="ml-auto">?</Kbd>
        </MenuItem>
        <MenuItem onClick={tour.start}>
          <Compass />
          {t('tour')}
        </MenuItem>
        {/* el soporte de Veltro (la plataforma): problemas y pedidos de funciones */}
        <MenuLinkItem render={<Link href="/support" />}>
          <SupportIcon />
          {t('veltroHelp')}
        </MenuLinkItem>
        <DemoDataMenuItem />
        <MenuSeparator />
        <LanguageSubmenu />
        <MenuSeparator />
        <MenuLabel>{t('theme')}</MenuLabel>
        <MenuRadioGroup value={theme ?? 'system'} onValueChange={(v) => setTheme(String(v))}>
          <MenuRadioItem value="light" closeOnClick={false}>
            <Sun />
            {t('themeLight')}
          </MenuRadioItem>
          <MenuRadioItem value="dark" closeOnClick={false}>
            <Moon />
            {t('themeDark')}
          </MenuRadioItem>
          <MenuRadioItem value="system" closeOnClick={false}>
            <Monitor />
            {t('themeSystem')}
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          onClick={async () => {
            await fetch('/auth/signout', { method: 'POST' })
            window.location.href = '/login'
          }}
        >
          <LogOut />
          {t('signOut')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** El idioma a mano, en el menú de la persona (antes solo estaba en Ajustes y en el login). */
function LanguageSubmenu() {
  const t = useTranslations('nav')
  const locale = useLocale()
  const [pending, start] = useTransition()
  return (
    <MenuSubmenu>
      <MenuSubmenuTrigger disabled={pending}>
        <Languages />
        <span className="flex-1">{t('language')}</span>
        <span className="text-xs text-fg-subtle">{isLocale(locale) ? localeNames[locale] : locale}</span>
      </MenuSubmenuTrigger>
      <MenuContent side="right" align="start" sideOffset={4} className="w-44">
        <MenuRadioGroup value={locale} onValueChange={(v) => start(() => setLocale(String(v)))}>
          {locales.map((l) => (
            <MenuRadioItem key={l} value={l} closeOnClick>
              {localeNames[l]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </MenuSubmenu>
  )
}
