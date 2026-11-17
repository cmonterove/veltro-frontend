'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Menu as MenuIcon, Minimize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Sidebar } from './sidebar'
import { CommandPalette } from './command-palette'
import { ShortcutsDialog } from './shortcuts-dialog'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { LegacyTaskParam } from '@/components/tasks/legacy-task-param'
import { LogoMark } from './logo'
import { TopBar } from './top-bar'
import { isTypingTarget } from '@/lib/hooks'
import { useApp } from './app-context'
import { ConfirmProvider } from '@/components/ui/confirm'
import { TourProvider } from '@/components/tour/tour'
import { useChatUnread } from '@/lib/queries/chats'
import { Ban } from 'lucide-react'
import { AccountSuspendedNotice, SUSPENDED_ALLOWED, TempPasswordGate, useSuspensionWatcher } from './suspended-notice'
import { DemoDataBanner } from './demo-data'
import { RealtimeConnection } from './realtime-connection'
import { FileViewerHost } from '@/components/vault/file-viewer'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { useNotificationsUnread } from '@/lib/queries/notifications'
import { cn } from '@/lib/utils'
import { SIDEBAR_COOKIE } from '@/lib/constants'
import { flushEvents, ping, setTelemetryAccount, track, viewEvent } from '@/lib/telemetry'

export function AppShell({ children, sidebarCollapsed = false }: { children: React.ReactNode; sidebarCollapsed?: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const router = useRouter()
  const { profile, workspaces, account } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(sidebarCollapsed)
  // pantalla completa: la hoja ocupa toda la ventana (sin menú ni barra de arriba); se sigue navegando con ⌘K
  const [full, setFull] = useState(false)
  const toggleFull = useCallback(() => {
    setFull((f) => !f)
    track('feature.fullscreen')
  }, [])
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      document.cookie = `${SIDEBAR_COOKIE}=${c ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`
      return !c
    })
    track('feature.sidebar_toggle')
  }, [])
  // `G` seguido de una tecla navega (estilo Linear); la espera dura poco para no secuestrar el teclado.
  const goPending = useRef<number | null>(null)
  // contraseña temporal o cuenta suspendida: la API no deja hacer casi nada, en lugar de la página va el aviso
  // Pasillo arma sus propias hojas (la lista y el contexto viven sobre el marco); el resto va en una sola hoja
  const bare = pathname === '/chat' || pathname.startsWith('/chat/')
  const gate = profile.must_change_password && pathname !== '/settings/profile' ? 'password' : account.status === 'suspended' && !SUSPENDED_ALLOWED.includes(pathname) ? 'suspended' : null
  useSuspensionWatcher()

  useEffect(() => setMobileOpen(false), [pathname])
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-view-fullscreen]')) return
      setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  // Esc cierra el menú del celular
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // telemetría para la consola: presencia (latido cada 2 min con la pestaña visible) y pantallas
  useEffect(() => setTelemetryAccount(account.id), [account.id])
  useEffect(() => {
    ping()
    const id = window.setInterval(() => document.visibilityState === 'visible' && ping(), 120_000)
    const onVisibility = () => (document.visibilityState === 'visible' ? ping() : flushEvents())
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushEvents)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushEvents)
    }
  }, [])
  useEffect(() => {
    const event = viewEvent(pathname)
    if (!event) return
    const slug = pathname.match(/^\/w\/([^/]+)/)?.[1]
    track(event, { workspaceId: slug ? workspaces.find((w) => w.slug === slug)?.id : null })
  }, [pathname, workspaces])
  useEffect(() => {
    if (paletteOpen) track('feature.command_palette')
  }, [paletteOpen])

  // lo que falta leer (Pasillo y avisos) también se ve en la pestaña del navegador: "(3) Pulso · Veltro"
  const unread = (useChatUnread().data?.total ?? 0) + (useNotificationsUnread().data ?? 0)
  useEffect(() => {
    const prefix = unread ? `(${unread > 99 ? '99+' : unread}) ` : ''
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, '')
      if (document.title !== prefix + base) document.title = prefix + base
    }
    apply()
    // Next cambia el título al navegar: se vuelve a poner el número
    const title = document.querySelector('title')
    const observer = title ? new MutationObserver(apply) : null
    if (title) observer!.observe(title, { childList: true })
    return () => observer?.disconnect()
  }, [unread, pathname])
  useEffect(() => {
    if (quickTaskOpen) track('feature.quick_task')
  }, [quickTaskOpen])

  useEffect(() => {
    const routes: Record<string, string> = { h: '/home', v: '/veltro', m: '/mesa', c: '/calendar', t: '/tasks', s: '/requests', d: '/decisions', b: '/vault', p: '/chat' }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.defaultPrevented) return
      // con un menú, un buscador o un diálogo abierto, las teclas son de ellos
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('[role="menu"], [role="listbox"], [role="dialog"]') || document.querySelector('[data-popup-open]')) return
      // `[` colapsa la barra; en teclados en español sale con Option/Alt, por eso va antes del filtro de Alt
      if (e.key === '[') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      if (e.altKey) return
      const key = e.key.toLowerCase()
      if (goPending.current) {
        window.clearTimeout(goPending.current)
        goPending.current = null
        const ws = /^[1-9]$/.test(key) ? workspaces[Number(key) - 1] : undefined
        const href = routes[key] ?? (ws ? `/w/${ws.slug}` : null)
        if (href) {
          e.preventDefault()
          router.push(href)
        }
        return
      }
      if (key === 'g' && !e.shiftKey) {
        goPending.current = window.setTimeout(() => (goPending.current = null), 1200)
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (key === 'f' && !e.shiftKey) {
        e.preventDefault()
        toggleFull()
        return
      }
      if (key === 'c' && !e.shiftKey) {
        e.preventDefault()
        setQuickTaskOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, workspaces, toggleSidebar, toggleFull])

  return (
    <ConfirmProvider>
      <TourProvider>
      {/* el marco (ciruela empolvado) lleva el menú y la barra de arriba; el contenido es una hoja encima, con sus esquinas */}
      <div className="relative isolate flex h-dvh overflow-hidden bg-canvas md:frame-bg">
        {/* el isotipo como marca de agua, apenas visible sobre el marco (en su propia capa: lo que sobresale no da scroll) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden overflow-clip md:block">
          <svg viewBox="150 23.3 724.3 851" className="absolute -bottom-[330px] -left-[250px] w-[840px] opacity-[0.05] dark:opacity-[0.03]">
            <path fill="oklch(0.773 0.115 303)" d="M670.8 188.9A360 360 0 1 0 770.4 261.3L483.6 758L305.6 530.1L371.6 415.8L468.4 539.6Z" />
            <path fill="oklch(0.773 0.115 303)" d="M686.2 162.4L765.4 25.2L871.4 86.4L786.2 233.9A390.6 390.6 0 0 0 686.2 162.4Z" />
          </svg>
        </div>
        {/* sidebar desktop */}
        <div className={cn('on-frame hidden shrink-0', !full && 'md:block', collapsed ? 'w-[56px]' : 'w-[236px]')}>
          <Sidebar
            onSearch={() => setPaletteOpen(true)}
            onNewTask={() => setQuickTaskOpen(true)}
            onShortcuts={() => setShortcutsOpen(true)}
            collapsed={collapsed}
            onToggleCollapsed={toggleSidebar}
          />
        </div>

        {/* sidebar móvil */}
        <div
          className={cn('fixed inset-0 z-40 bg-[oklch(0.2_0.04_311/0.3)] transition-opacity duration-200 md:hidden', mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
          onClick={() => setMobileOpen(false)}
        />
        {/* cerrado no se puede enfocar ni leer con lector de pantalla */}
        <div
          inert={!mobileOpen}
          role={mobileOpen ? 'dialog' : undefined}
          aria-modal={mobileOpen ? true : undefined}
          aria-label={t('openMenu')}
          className={cn(
            'frame-bg on-frame fixed inset-y-0 left-0 z-50 w-[272px] shadow-lift transition-transform duration-200 ease-[var(--ease-out-quart)] md:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Sidebar onSearch={() => setPaletteOpen(true)} onNewTask={() => setQuickTaskOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
        {full ? <FullscreenExit onExit={toggleFull} /> : <TopBar onSearch={() => setPaletteOpen(true)} onFullscreen={toggleFull} />}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            !full && 'md:mb-2 md:mr-2',
            !bare && 'md:overflow-hidden md:bg-canvas',
            !bare && !full && 'md:rounded-[18px] md:shadow-sheet',
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover"
              aria-label={t('openMenu')}
            >
              <MenuIcon className="size-4" />
            </button>
            <LogoMark className="size-5" />
            <div className="ml-auto">
              <NotificationBell variant="topbar" />
            </div>
          </div>
          {account.status === 'suspended' && gate !== 'suspended' ? (
            <div role="alert" className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-danger-soft px-4 py-2 text-sm text-fg">
              <Ban className="size-4 shrink-0 text-danger" />
              {t('suspendedBanner')}
            </div>
          ) : null}
          <DemoDataBanner />
          <main className="relative flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
              {gate === 'password' ? <TempPasswordGate /> : gate === 'suspended' ? <AccountSuspendedNotice /> : children}
            </div>
            <Suspense>
              <LegacyTaskParam />
            </Suspense>
          </main>
        </div>
        </div>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onNewTask={() => setQuickTaskOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
        />
        <QuickTaskDialog open={quickTaskOpen} onOpenChange={setQuickTaskOpen} />
        <RealtimeConnection />
        {/* el visor de archivos compartido (imágenes, PDF, audio, video) */}
        <FileViewerHost />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
      </TourProvider>
    </ConfirmProvider>
  )
}

/**
 * Para salir de la pantalla completa: un botón que se asoma arriba al entrar y cuando el mouse
 * toca el borde superior (como la pantalla completa del navegador). Esc también sale.
 */
function FullscreenExit({ onExit }: { onExit: () => void }) {
  const t = useTranslations('nav')
  const [shown, setShown] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setShown(false), 2500)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <div
      className={cn('fixed inset-x-0 top-0 z-30 hidden justify-center md:flex', shown ? 'h-14' : 'h-2')}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
    >
      <button
        type="button"
        onClick={onExit}
        onFocus={() => setShown(true)}
        className={cn(
          'mt-2 inline-flex h-8 items-center gap-2 rounded-full bg-fg pl-3 pr-1.5 text-xs font-medium text-canvas shadow-lift transition-[transform,opacity] duration-200 ease-[var(--ease-out-quart)]',
          shown ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0',
        )}
      >
        <Minimize2 className="size-3.5" />
        {t('exitFullscreen')}
        <kbd className="rounded-full bg-canvas/15 px-1.5 py-0.5 font-sans text-2xs">Esc</kbd>
      </button>
    </div>
  )
}
