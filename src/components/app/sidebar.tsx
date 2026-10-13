'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useState, useTransition } from 'react'
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
} from 'lucide-react'
import { useApp, useIsAccountAdmin } from './app-context'
import { useChats } from '@/lib/queries/chats'
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

export const navItemClass =
  'group/nav flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg [&>svg]:size-4 [&>svg]:shrink-0'
export const navActiveClass = 'bg-accent-soft text-accent-ink font-medium hover:bg-accent-soft hover:text-accent-ink'
/** ítem del riel colapsado: solo el ícono, centrado */
const railItemClass =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg [&>svg]:size-[18px] [&>svg]:shrink-0'

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
  const { data: chats } = useChats()
  const unread = (chats ?? []).reduce((n, c) => n + c.unread, 0)

  const top: { href: string; label: string; icon: typeof Activity; keys: string[]; badge?: number }[] = [
    { href: '/home', label: t('today'), icon: Activity, keys: ['G', 'H'] },
    { href: '/veltro', label: t('veltro'), icon: Sparkles, keys: ['G', 'V'] },
    { href: '/mesa', label: t('mesa'), icon: Columns3, keys: ['G', 'M'] },
    { href: '/calendar', label: t('calendar'), icon: CalendarDays, keys: ['G', 'C'] },
    { href: '/tasks', label: t('myTasks'), icon: CircleCheck, keys: ['G', 'T'] },
    { href: '/vault', label: t('vault'), icon: Vault, keys: ['G', 'B'] },
    { href: '/chat', label: t('pasillo'), icon: MessagesSquare, keys: ['G', 'P'], badge: unread },
  ]
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const settingsActive = pathname.startsWith('/settings') && pathname !== '/settings/members'

  if (collapsed) {
    return (
      <aside className="flex h-full flex-col items-center border-r border-line bg-sidebar">
        <div className="flex h-11 shrink-0 items-center">
          <Link href="/home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40" aria-label="Veltro">
            <LogoMark className="size-[22px]" cut="var(--sidebar)" />
          </Link>
        </div>

        <div className="flex flex-col items-center gap-px pb-1.5">
          <Tooltip content={t('sidebarExpand')} shortcut={['[']} side="right">
            <button type="button" onClick={onToggleCollapsed} className={railItemClass} aria-label={t('sidebarExpand')}>
              <PanelLeftOpen />
            </button>
          </Tooltip>
          <Tooltip content={t('search')} shortcut={['⌘', 'K']} side="right">
            <button type="button" onClick={onSearch} data-tour="search" className={railItemClass} aria-label={t('search')}>
              <Search />
            </button>
          </Tooltip>
          <Tooltip content={t('newTask')} shortcut={['C']} side="right">
            <button type="button" onClick={onNewTask} className={railItemClass} aria-label={t('newTask')}>
              <SquarePen />
            </button>
          </Tooltip>
        </div>

        <nav className="flex flex-col items-center gap-px border-t border-line pt-1.5">
          {top.map(({ href, label, icon: Icon, keys, badge }) => (
            <RailPeek
              key={href}
              trigger={
                <Link href={href} data-tour={`nav-${href.slice(1)}`} aria-label={badge ? `${label} · ${badge}` : label} className={cn(railItemClass, 'relative', isActive(href) && navActiveClass)}>
                  <Icon />
                  {badge ? <span className="absolute right-1 top-1 size-2 rounded-full bg-accent ring-2 ring-sidebar" aria-hidden /> : null}
                </Link>
              }
            >
              <PeekHead icon={Icon} label={label} keys={keys} description={t(`peek.desc.${href.slice(1)}`)} />
              <NavPeekBody href={href} />
            </RailPeek>
          ))}
        </nav>

        <div className="mt-1.5 flex min-h-0 w-full flex-1 flex-col items-center gap-px overflow-y-auto border-t border-line pt-1.5 scrollbar-none" data-tour="spaces">
          {workspaces.map((ws) => (
            <RailWorkspace key={ws.id} ws={ws} pathname={pathname} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-px border-t border-line py-1.5">
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
    <aside className="flex h-full flex-col border-r border-line bg-sidebar">
      <div className="flex h-12 items-center gap-0.5 pl-3.5 pr-2 pt-1">
        <Link href="/home" className="mr-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40" aria-label="Veltro">
          <Logo cut="var(--sidebar)" />
        </Link>
        {onToggleCollapsed ? (
          <Tooltip content={t('sidebarCollapse')} shortcut={['[']}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
              aria-label={t('sidebarCollapse')}
            >
              <PanelLeftClose className="size-4" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content={t('newTask')} shortcut={['C']}>
          <button
            type="button"
            onClick={onNewTask}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
            aria-label={t('newTask')}
          >
            <SquarePen className="size-4" />
          </button>
        </Tooltip>
      </div>

      <div className="px-2 pb-2 pt-1">
        <button type="button" onClick={onSearch} data-tour="search" className={cn(navItemClass, 'text-fg-subtle')}>
          <Search />
          <span className="flex-1 text-left">{t('search')}</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav className="flex flex-col gap-px px-2">
        {top.map(({ href, label, icon: Icon, badge }) => (
          <Link key={href} href={href} data-tour={`nav-${href.slice(1)}`} className={cn(navItemClass, isActive(href) && navActiveClass)}>
            <Icon />
            <span className="truncate">{label}</span>
            {badge ? (
              <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold tabular-nums text-accent-fg">{badge > 99 ? '99+' : badge}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col" data-tour="spaces">
        <div className="group/section flex h-7 items-center justify-between px-4">
          <span className="text-xs font-medium text-fg-subtle">{t('workspaces')}</span>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {workspaces.length === 0 ? (
            <p className="px-2 py-1 text-xs text-fg-subtle">{t('noWorkspaces')}</p>
          ) : (
            workspaces.map((ws) => <WorkspaceNav key={ws.id} ws={ws} pathname={pathname} />)
          )}
        </div>
      </div>

      <div className="flex flex-col gap-px border-t border-line px-2 py-2">
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
        <AccountSwitcher />
        <div className="flex items-center gap-0.5">
          <UserMenu onShortcuts={onShortcuts} />
          <ThemeToggle className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg [&>svg]:size-4" />
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
      <Link href={base} className={cn(navItemClass, 'h-8 pr-7', pathname === base && navActiveClass, inWs && pathname !== base && 'text-fg')}>
        <WorkspaceMark ws={ws} size={18} />
        <span className="truncate">{ws.name}</span>
      </Link>
      <button
        type="button"
        onClick={() => setManual({ inWs, open: !open })}
        aria-expanded={open}
        aria-label={`${open ? t('collapse') : t('expand')} ${ws.name}`}
        className={cn(
          'absolute right-1 top-1.5 inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle transition-opacity hover:bg-hover hover:text-fg focus-visible:opacity-100',
          open ? 'opacity-100' : 'opacity-0 group-hover/ws:opacity-100',
        )}
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-200 ease-out-quart', open && 'rotate-90')} />
      </button>
      <div className="disclosure" data-open={open ? '' : undefined} inert={!open}>
        <div>
          <div className="ml-[17px] mt-px flex flex-col gap-px border-l border-line pl-2">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cn(navItemClass, 'h-[26px]', pathname.startsWith(href) && navActiveClass)}>
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
            <WorkspaceMark ws={ws} size={20} />
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

function AccountSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('nav')
  const router = useRouter()
  const { account, accounts } = useApp()
  const [pending, start] = useTransition()

  return (
    <Menu>
      {compact ? (
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
      <MenuContent side={compact ? 'right' : 'top'} align={compact ? 'end' : 'start'} className="w-64">
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
            <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={20} />
          </MenuTrigger>
        </Tooltip>
      ) : (
        <MenuTrigger className={cn(navItemClass, 'h-8 data-[popup-open]:bg-hover')}>
          <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={20} />
          <span className="min-w-0 flex-1 truncate text-left text-fg">{profile.full_name}</span>
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
