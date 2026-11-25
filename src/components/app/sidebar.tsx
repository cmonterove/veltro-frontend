'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useId, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  CalendarDays,
  Columns3,
  ChartColumnBig,
  Keyboard,
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  FileText,
  LayoutDashboard,
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
  SlidersHorizontal,
  UserRound,
  ArrowLeft,
  Mail,
} from 'lucide-react'
import { useApp, useIsAccountAdmin } from './app-context'
import { DemoDataMenuItem } from './demo-data'
import { useChatUnread } from '@/lib/queries/chats'
import { useMailboxes } from '@/lib/queries/mail'
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
import { setLocale } from '@/app/actions/preferences'
import { isLocale, localeNames, locales } from '@/i18n/config'
import { useHydrated, useLocalStorage } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { DEMO } from '@/lib/demo/config'
import { DemoBadge } from './demo-badge'
import { isAccountSettings, isPersonalSettings } from '@/lib/routes'
import { useSettingsGroups, type Group as SettingsGroup } from '@/components/settings/settings-nav'
import { NewAccountDialog } from './new-account-dialog'
import { brandAttrs, brandOf } from '@/lib/brand'
import { useAccountSwitch } from './account-switch'
import { Logo, LogoMark } from './logo'
import type { WorkspaceWithRole } from '@/lib/types'
import { WorkspaceMark, AccountLogo } from '@/components/app/marks'
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

/** El menú de la app y el de Ajustes se reemplazan deslizándose (a Ajustes, hacia la izquierda; de vuelta, al revés). */
const SLIDE = {
  enter: (d: number) => ({ x: d * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -24, opacity: 0 }),
}

type NavLinkItem = { href: string; label: string; icon: typeof Activity; badge?: number }

/** Una opción del menú; la activa lleva la pastilla que se desliza. `tour`: false en la copia escondida de un grupo plegado. */
function NavLink({ item, current, onClick, pillId, tour = true }: { item: NavLinkItem; current: boolean; onClick?: (e: React.MouseEvent) => void; pillId: string; tour?: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      prefetch
      onClick={onClick}
      data-tour={tour ? `nav-${item.href.slice(1)}` : undefined}
      aria-current={current ? 'page' : undefined}
      className={cn(navItemClass, current && navCurrentClass)}
    >
      {current ? <NavPill id={`nav-${pillId}`} /> : null}
      <Icon />
      <span className="relative truncate">{item.label}</span>
      {item.badge ? (
        <span className="relative ml-auto mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-count px-1.5 text-[11px] font-semibold tabular-nums text-count-fg">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * El título de un grupo: su nombre y una línea fina hasta el borde. Un clic lo pliega o despliega; plegado,
 * en lugar de la línea van los atajos de lo que tiene adentro (sus íconos o las fichas de los espacios).
 */
function NavGroupHead({ label, open, onToggle, peek, action }: { label: string; open?: boolean; onToggle?: () => void; peek?: React.ReactNode; action?: React.ReactNode }) {
  const name = (
    <>
      <span className="truncate">{label}</span>
      {onToggle ? <ChevronRight className={cn('size-3 shrink-0 opacity-60 transition-transform duration-200 ease-out group-hover/section:opacity-100', open && 'rotate-90')} /> : null}
    </>
  )
  return (
    <div className="group/section flex h-7 items-center gap-2 pl-1.5 pr-1">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 shrink-0 items-center gap-1 rounded-sm text-[12px] font-medium text-fg-subtle outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35"
        >
          {name}
        </button>
      ) : (
        <span className="flex min-w-0 shrink-0 items-center gap-1 text-[12px] font-medium text-fg-subtle">{name}</span>
      )}
      {!open && peek ? <span className="ml-auto flex min-w-0 items-center gap-0.5 overflow-hidden">{peek}</span> : <span className="h-px min-w-4 flex-1 bg-line/70" aria-hidden />}
      {action}
    </div>
  )
}

/** Un atajo dentro de un grupo plegado: el ícono, su nombre al pasar el mouse y un punto si hay algo pendiente. */
function PeekLink({ href, label, children, dot }: { href: string; label: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <Tooltip content={label} side="right">
      <Link
        href={href}
        aria-label={label}
        className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted outline-none transition-colors hover:bg-hover hover:text-accent focus-visible:ring-2 focus-visible:ring-accent-mid/35 [&>svg]:size-3.5"
      >
        {children}
        {dot ? <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-count" aria-hidden /> : null}
      </Link>
    </Tooltip>
  )
}

/**
 * En los ajustes de la cuenta, la barra se vuelve el menú de Ajustes (en vez de un segundo menú al lado),
 * con el mismo lenguaje que el de la app: primero «Volver a …» como una opción más (dice adónde vuelves),
 * y los grupos con su título fino. La opción elegida lleva la misma pastilla que se desliza.
 */
function SettingsSideNav({ groups, pathname, backHref, backLabel, pillId }: { groups: SettingsGroup[]; pathname: string; backHref: string; backLabel: string | null; pillId: string }) {
  const t = useTranslations('nav')
  return (
    <div className="px-2.5">
      <Link href={backHref} className={cn(navItemClass, 'group/back')}>
        <ArrowLeft className="transition-transform duration-200 ease-out group-hover/back:-translate-x-0.5" />
        <span className="relative truncate">{backLabel ? t('backTo', { place: backLabel }) : t('backToApp')}</span>
      </Link>
      {groups.map((g) => (
        <div key={g.id} className="mt-3.5">
          <NavGroupHead label={g.id === 'account' ? t('groups.accountSettings') : g.label} />
          <div className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const current = i.active(pathname)
              return (
                <Link key={i.href} href={i.href} aria-current={current ? 'page' : undefined} className={cn(navItemClass, current && navCurrentClass)}>
                  {current ? <NavPill id={`set-${pillId}`} /> : null}
                  {i.icon}
                  <span className="relative truncate">{i.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
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
  // correo: los hilos sin leer en Recibidos de las cuentas que se pueden leer
  const mailUnread = (useMailboxes().data?.items ?? []).reduce((n, b) => n + (b.canRead ? (b.unread ?? 0) : 0), 0)
  // cada barra (escritorio y celular) con su propia pastilla: con el mismo id, Motion deja visible solo una
  const pillId = useId()

  type NavItem = { href: string; label: string; icon: typeof Activity; keys: string[]; badge?: number }
  const item = {
    home: { href: '/home', label: t('today'), icon: Activity, keys: ['G', 'H'] },
    veltro: { href: '/veltro', label: t('veltro'), icon: Sparkles, keys: ['G', 'V'] },
    mesa: { href: '/mesa', label: t('mesa'), icon: Columns3, keys: ['G', 'M'] },
    calendar: { href: '/calendar', label: t('calendar'), icon: CalendarDays, keys: ['G', 'C'] },
    tasks: { href: '/tasks', label: t('myTasks'), icon: CircleCheck, keys: ['G', 'T'] },
    mail: { href: '/mail', label: t('mail'), icon: Mail, keys: ['G', 'E'], badge: mailUnread },
    dashboards: { href: '/dashboards', label: t('dashboards'), icon: ChartColumnBig, keys: ['G', 'A'] },
    requests: { href: '/requests', label: t('requests'), icon: RequestsIcon, keys: ['G', 'S'], badge: requestsPending },
    decisions: { href: '/decisions', label: t('decisions'), icon: Diamond, keys: ['G', 'D'] },
    vault: { href: '/vault', label: t('vault'), icon: Vault, keys: ['G', 'B'] },
    chat: { href: '/chat', label: t('pasillo'), icon: MessagesSquare, keys: ['G', 'P'], badge: unread },
  } satisfies Record<string, NavItem>
  // Pulso arriba, solo; el resto en grupos que se pliegan (Veltro IA, oculta por ahora: lib/features)
  const homeItems: NavItem[] = [item.home, ...(AI_ENABLED ? [item.veltro] : [])]
  const groups: { id: string; label: string; items: NavItem[] }[] = [
    { id: 'work', label: t('groups.work'), items: [item.tasks, item.mail, item.dashboards, item.calendar, item.requests] },
    { id: 'team', label: t('groups.team'), items: [item.chat, item.mesa] },
    { id: 'memory', label: t('groups.memory'), items: [item.decisions, item.vault] },
  ]
  const top: NavItem[] = [...homeItems, ...groups.flatMap((g) => g.items)]
  const [folded, setFolded] = useLocalStorage<string[]>('veltro:nav-folded', [])
  const toggleGroup = (id: string) => setFolded((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
  // en los ajustes de la cuenta la barra se transforma en el menú de Ajustes (un solo menú)
  const settingsMode = isAccountSettings(pathname)
  const settingsGroups = useSettingsGroups(isAdmin)
  // «← Volver»: a la última pantalla de la app antes de entrar a Ajustes
  const [backHref, setBackHref] = useState('/home')
  const backPath = backHref.split('?')[0]
  const backLabel =
    top.find((it) => backPath === it.href || backPath.startsWith(`${it.href}/`))?.label ??
    workspaces.find((ws) => backPath === `/w/${ws.slug}` || backPath.startsWith(`/w/${ws.slug}/`))?.name ??
    null
  useEffect(() => {
    try {
      if (!pathname.startsWith('/settings')) sessionStorage.setItem('veltro:before-settings', pathname + window.location.search)
      else setBackHref(sessionStorage.getItem('veltro:before-settings') || '/home')
    } catch {
      /* sin almacenamiento: vuelve a Pulso */
    }
  }, [pathname])
  // al hacer clic, la opción se marca en el acto (sin esperar a que llegue la página); al cambiar la
  // ruta manda la URL de nuevo
  const [pendingNav, setPendingNav] = useState<{ href: string; from: string } | null>(null)
  const pendingHref = pendingNav && pendingNav.from === pathname ? pendingNav.href : null
  const isActive = (href: string) => (pendingHref ? pendingHref === href : pathname === href || pathname.startsWith(`${href}/`))
  const navClick = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    setPendingNav({ href, from: pathname })
  }
  const settingsActive = pathname.startsWith('/settings') && pathname !== '/settings/members' && !isPersonalSettings(pathname)

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
          {settingsMode ? (
            <>
              <Tooltip content={t('backToApp')} side="right">
                <Link href={backHref} aria-label={t('backToApp')} className={railItemClass}>
                  <ArrowLeft />
                </Link>
              </Tooltip>
              {settingsGroups
                .flatMap((g) => g.items)
                .map((i) => (
                  <Tooltip key={i.href} content={i.label} side="right">
                    <Link href={i.href} aria-label={i.label} aria-current={i.active(pathname) ? 'page' : undefined} className={cn(railItemClass, i.active(pathname) && navActiveClass)}>
                      {i.icon}
                    </Link>
                  </Tooltip>
                ))}
            </>
          ) : null}
          {settingsMode ? null : top.map(({ href, label, icon: Icon, keys, badge }) => (
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

        <AnimatePresence mode="wait" initial={false} custom={settingsMode ? 1 : -1}>
          {settingsMode ? (
            <motion.div key="settings" custom={1} variants={SLIDE} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              <SettingsSideNav groups={settingsGroups} pathname={pathname} backHref={backHref} backLabel={backLabel} pillId={pillId} />
            </motion.div>
          ) : (
            <motion.div key="app" custom={-1} variants={SLIDE} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              <nav className="flex flex-col gap-0.5 px-2.5">
                {homeItems.map((it) => (
                  <NavLink key={it.href} item={it} current={isActive(it.href)} onClick={navClick(it.href)} pillId={pillId} />
                ))}
              </nav>
              {/* los grupos: se pliegan desde su título y se recuerda; plegado, lo que estás viendo sigue a la vista */}
              {groups.map((g) => {
                const open = !folded.includes(g.id)
                const here = g.items.find((it) => isActive(it.href))
                return (
                  <div key={g.id} className="mt-3.5 px-2.5">
                    <NavGroupHead
                      label={g.label}
                      open={open}
                      onToggle={() => toggleGroup(g.id)}
                      peek={g.items.map((it) => (
                        <PeekLink key={it.href} href={it.href} label={it.label} dot={Boolean(it.badge)}>
                          <it.icon />
                        </PeekLink>
                      ))}
                    />
                    <div className="disclosure" data-open={open ? '' : undefined} inert={!open}>
                      <div>
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          {g.items.map((it) => (
                            <NavLink key={it.href} item={it} current={open && isActive(it.href)} onClick={navClick(it.href)} pillId={pillId} tour={open} />
                          ))}
                        </div>
                      </div>
                    </div>
                    {!open && here ? <NavLink item={here} current onClick={navClick(here.href)} pillId={pillId} /> : null}
                  </div>
                )
              })}

            <div className="mt-3.5 flex flex-col px-2.5" data-tour="spaces">
              <NavGroupHead
                label={t('workspaces')}
                open={!folded.includes('spaces')}
                onToggle={() => toggleGroup('spaces')}
                peek={
                  <>
                    {workspaces.slice(0, 5).map((ws) => (
                      <PeekLink key={ws.id} href={`/w/${ws.slug}`} label={ws.name}>
                        <WorkspaceMark ws={ws} size={16} />
                      </PeekLink>
                    ))}
                    {workspaces.length > 5 ? <span className="px-1 text-[11px] tabular-nums text-fg-subtle">+{workspaces.length - 5}</span> : null}
                  </>
                }
                action={
                  isAdmin ? (
                    <Tooltip content={t('newWorkspace')}>
                      <Link
                        href="/settings/workspaces/new"
                        className="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/section:opacity-100 focus-visible:opacity-100"
                        aria-label={t('newWorkspace')}
                      >
                        <Plus className="size-3.5" />
                      </Link>
                    </Tooltip>
                  ) : null
                }
              />
              <div className="disclosure" data-open={!folded.includes('spaces') ? '' : undefined} inert={folded.includes('spaces')}>
                <div>
                  <div className="pb-3 pt-1">
                    {workspaces.length === 0 ? (
                      <p className="px-2.5 py-1 text-xs text-fg-subtle">{t('noWorkspaces')}</p>
                    ) : (
                      workspaces.map((ws) => <WorkspaceNav key={ws.id} ws={ws} pathname={pathname} />)
                    )}
                  </div>
                </div>
              </div>
              {/* plegado: el espacio donde estás sigue a la vista */}
              {folded.includes('spaces')
                ? workspaces.filter((ws) => pathname === `/w/${ws.slug}` || pathname.startsWith(`/w/${ws.slug}/`)).map((ws) => <WorkspaceNav key={ws.id} ws={ws} pathname={pathname} />)
                : null}
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-line/60 px-2.5 pb-2.5 pt-1.5">
        {DEMO ? <DemoBadge /> : null}
        {settingsMode ? null : (
          <>
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
          </>
        )}
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
  const tWs = useTranslations('workspace')

  // la navegación completa del espacio: Resumen · Tareas · Docs · Reuniones (las páginas no llevan pestañas)
  const links = [
    { href: base, label: tWs('summary'), icon: LayoutDashboard },
    { href: `${base}/tasks`, label: t('tasks'), icon: ListTodo },
    { href: `${base}/docs`, label: t('docs'), icon: FileText },
    { href: `${base}/meetings`, label: t('meetings'), icon: Video },
  ]
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href))

  return (
    <div className="group/ws relative mb-px">
      {/* abierto, lo activo es la sección de abajo; plegado, el espacio mismo marca dónde estás */}
      <Link href={base} className={cn(navItemClass, 'pr-7', inWs && !open && navActiveClass, inWs && open && 'text-fg')}>
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
              <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined} className={cn(navItemClass, 'h-7 px-2 text-[13px] [&>svg]:p-0', isActive(href) && navActiveClass, '[&>svg]:bg-transparent')}>
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

/** Espacio en el riel: su marca; si estás dentro, debajo aparecen Resumen, Tareas, Docs y Reuniones. */
function RailWorkspace({ ws, pathname }: { ws: WorkspaceWithRole; pathname: string }) {
  const t = useTranslations('nav')
  const base = `/w/${ws.slug}`
  const inWs = pathname === base || pathname.startsWith(`${base}/`)
  const tWs = useTranslations('workspace')
  const links = [
    { href: base, label: tWs('summary'), icon: LayoutDashboard },
    { href: `${base}/tasks`, label: t('tasks'), icon: ListTodo },
    { href: `${base}/docs`, label: t('docs'), icon: FileText },
    { href: `${base}/meetings`, label: t('meetings'), icon: Video },
  ]
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href))
  return (
    <>
      <RailPeek
        trigger={
          <Link href={base} aria-label={ws.name} className={cn(railItemClass, inWs && 'bg-hover')}>
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
                <Link href={href} aria-label={label} aria-current={isActive(href) ? 'page' : undefined} className={cn(railItemClass, 'size-7 [&>svg]:size-3.5', isActive(href) && navActiveClass)}>
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
  const { account, accounts, workspaces } = useApp()
  const { switchTo } = useAccountSwitch()
  const [creating, setCreating] = useState(false)

  return (
    <>
    <Menu>
      {card ? (
        <MenuTrigger
          
          className="flex h-[52px] w-full items-center gap-2.5 rounded-[15px] bg-hover pl-2 pr-2.5 text-left shadow-card outline-none transition-colors hover:bg-active focus-visible:ring-2 focus-visible:ring-accent-mid/35 data-[popup-open]:bg-active"
        >
          <AccountLogo
            account={account}
            size={30}
            fallback={<span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-accent text-[13px] font-bold text-accent-fg">{account.name.trim().charAt(0).toUpperCase()}</span>}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-fg">{account.name}</span>
            <span className="block truncate text-[11.5px] text-fg-subtle">{t('workspacesCount', { count: workspaces.length })}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" />
        </MenuTrigger>
      ) : compact ? (
        <Tooltip content={account.name} side="right">
          <MenuTrigger className={cn(railItemClass, 'data-[popup-open]:bg-hover')} aria-label={t('accounts')}>
            <Building2 />
          </MenuTrigger>
        </Tooltip>
      ) : (
        <MenuTrigger className={cn(navItemClass, 'data-[popup-open]:bg-hover')}>
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
            onClick={(e) => {
              if (a.id === account.id) return
              // con su animación y quedándote en la misma vista (account-switch)
              switchTo({ id: a.id, name: a.name, color: a.color, logo_updated_at: a.logo_updated_at }, { origin: { x: e.clientX, y: e.clientY } })
            }}
          >
            {/* la ficha de cada cuenta, en su color */}
            <AccountLogo
              account={a}
              size={18}
              fallback={
                <span {...brandAttrs(brandOf(a.color))} className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-accent text-[10px] font-bold text-accent-fg">
                  {a.name.trim().charAt(0).toUpperCase()}
                </span>
              }
            />
            <span className="flex-1 truncate">{a.name}</span>
            {a.id === account.id ? <Check className="!text-fg" /> : null}
          </MenuItem>
        ))}
        <MenuItem onClick={() => setCreating(true)}>
          <Plus />
          {t('createAccount')}
        </MenuItem>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/settings/account" />}>
          <Settings />
          {t('accountSettings')}
        </MenuLinkItem>
      </MenuContent>
    </Menu>
    <NewAccountDialog open={creating} onOpenChange={setCreating} />
    </>
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
        {/* tus ajustes viven aquí, aparte de los de la cuenta (el botón «Ajustes» de la barra) */}
        <MenuLinkItem render={<Link href="/settings/profile" />}>
          <UserRound />
          {t('profile')}
        </MenuLinkItem>
        <MenuLinkItem render={<Link href="/settings/preferences" />}>
          <SlidersHorizontal />
          {t('preferences')}
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
