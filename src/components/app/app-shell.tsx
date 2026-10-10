'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Menu as MenuIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Sidebar } from './sidebar'
import { CommandPalette } from './command-palette'
import { ShortcutsDialog } from './shortcuts-dialog'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { TaskPanelHost } from '@/components/tasks/task-panel'
import { LogoMark } from './logo'
import { isTypingTarget } from '@/lib/hooks'
import { useApp } from './app-context'
import Link from 'next/link'
import { Ban, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { flushEvents, ping, setTelemetryAccount, track, viewEvent } from '@/lib/telemetry'

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const router = useRouter()
  const { profile, workspaces, account } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // `G` seguido de una tecla navega (estilo Linear); la espera dura poco para no secuestrar el teclado.
  const goPending = useRef<number | null>(null)

  useEffect(() => setMobileOpen(false), [pathname])

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
  useEffect(() => {
    if (quickTaskOpen) track('feature.quick_task')
  }, [quickTaskOpen])

  useEffect(() => {
    const routes: Record<string, string> = { h: '/home', m: '/mesa', c: '/calendar', t: '/my-tasks' }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
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
      if (key === 'c' && !e.shiftKey) {
        e.preventDefault()
        setQuickTaskOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, workspaces])

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/* sidebar desktop */}
      <div className="hidden w-[248px] shrink-0 md:block">
        <Sidebar onSearch={() => setPaletteOpen(true)} onNewTask={() => setQuickTaskOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
      </div>

      {/* sidebar móvil */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-[oklch(0.2_0.01_165/0.3)] transition-opacity duration-200 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
      />
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[272px] shadow-lift transition-transform duration-200 ease-[var(--ease-out-quart)] md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar onSearch={() => setPaletteOpen(true)} onNewTask={() => setQuickTaskOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
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
        </div>
        {profile.must_change_password && pathname !== '/settings/profile' ? (
          <Link
            href="/settings/profile"
            className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-warning-soft px-4 py-2 text-sm text-fg hover:underline"
          >
            <KeyRound className="size-4 text-warning" />
            {t('tempPasswordBanner')}
          </Link>
        ) : null}
        {account.status === 'suspended' ? (
          <div role="alert" className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-danger-soft px-4 py-2 text-sm text-fg">
            <Ban className="size-4 shrink-0 text-danger" />
            {t('suspendedBanner')}
          </div>
        ) : null}
        <main className="relative flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
          <Suspense>
            <TaskPanelHost />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNewTask={() => setQuickTaskOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
      <QuickTaskDialog open={quickTaskOpen} onOpenChange={setQuickTaskOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
