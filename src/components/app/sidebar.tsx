'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useTransition } from 'react'
import {
  CalendarDays,
  Columns3,
  Keyboard,
  Building2,
  Check,
  ChevronsUpDown,
  CircleCheck,
  FileText,
  ListTodo,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  SquarePen,
  Sun,
  UserPlus,
  Video,
} from 'lucide-react'
import { useApp, useIsAccountAdmin } from './app-context'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuLinkItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Avatar } from '@/components/ui/avatar'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { setCurrentAccount } from '@/app/actions/preferences'
import { cn } from '@/lib/utils'
import { DEMO } from '@/lib/demo/config'
import { DemoBadge } from './demo-badge'
import { Logo } from './logo'
import type { WorkspaceWithRole } from '@/lib/types'
import { WorkspaceMark } from '@/components/app/marks'

export const navItemClass =
  'group/nav flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg [&>svg]:size-4 [&>svg]:shrink-0'
export const navActiveClass = 'bg-accent-soft text-accent-ink font-medium hover:bg-accent-soft hover:text-accent-ink'

export function Sidebar({ onSearch, onNewTask, onShortcuts }: { onSearch: () => void; onNewTask: () => void; onShortcuts: () => void }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const { workspaces } = useApp()
  const isAdmin = useIsAccountAdmin()

  const top = [
    { href: '/home', label: t('today'), icon: Sun },
    { href: '/mesa', label: t('mesa'), icon: Columns3 },
    { href: '/calendar', label: t('calendar'), icon: CalendarDays },
    { href: '/my-tasks', label: t('myTasks'), icon: CircleCheck },
  ]

  return (
    <aside className="flex h-full flex-col border-r border-line bg-sidebar">
      <div className="flex h-12 items-center gap-1 pl-3.5 pr-2 pt-1">
        <Link href="/home" className="mr-auto rounded-md outline-none" aria-label="Veltro">
          <Logo cut="var(--sidebar)" />
        </Link>
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
        <button type="button" onClick={onSearch} className={cn(navItemClass, 'text-fg-subtle')}>
          <Search />
          <span className="flex-1 text-left">{t('search')}</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav className="flex flex-col gap-px px-2">
        {top.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn(navItemClass, pathname === href && navActiveClass)}>
            <Icon />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="group/section flex h-7 items-center justify-between px-4">
          <span className="text-xs font-medium text-fg-subtle">{t('workspaces')}</span>
          {isAdmin ? (
            <Tooltip content={t('newWorkspace')}>
              <Link
                href="/settings/workspaces?new=1"
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
        <Link href="/settings" className={cn(navItemClass, pathname.startsWith('/settings') && pathname !== '/settings/members' && navActiveClass)}>
          <Settings />
          <span>{t('settings')}</span>
        </Link>
        <AccountSwitcher />
        <UserMenu onShortcuts={onShortcuts} />
      </div>
    </aside>
  )
}

function WorkspaceNav({ ws, pathname }: { ws: WorkspaceWithRole; pathname: string }) {
  const t = useTranslations('nav')
  const base = `/w/${ws.slug}`
  const inWs = pathname === base || pathname.startsWith(`${base}/`)

  const links = [
    { href: `${base}/tasks`, label: t('tasks'), icon: ListTodo },
    { href: `${base}/docs`, label: t('docs'), icon: FileText },
    { href: `${base}/meetings`, label: t('meetings'), icon: Video },
  ]

  return (
    <div className="mb-px">
      <Link href={base} className={cn(navItemClass, 'h-8', pathname === base && navActiveClass, inWs && pathname !== base && 'text-fg')}>
        <WorkspaceMark ws={ws} size={18} />
        <span className="truncate">{ws.name}</span>
      </Link>
      {inWs ? (
        <div className="ml-[17px] mt-px flex flex-col gap-px border-l border-line pl-2">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn(navItemClass, 'h-[26px]', pathname.startsWith(href) && navActiveClass)}>
              <Icon className="!size-3.5" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AccountSwitcher() {
  const t = useTranslations('nav')
  const router = useRouter()
  const { account, accounts } = useApp()
  const [pending, start] = useTransition()

  return (
    <Menu>
      <MenuTrigger className={cn(navItemClass, 'data-[popup-open]:bg-hover')} disabled={pending}>
        <Building2 />
        <span className="min-w-0 flex-1 truncate text-left">{account.name}</span>
        <ChevronsUpDown className="!size-3.5 text-fg-subtle" />
      </MenuTrigger>
      <MenuContent side="top" className="w-64">
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

function UserMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const t = useTranslations('nav')
  const { profile } = useApp()
  const { theme, setTheme } = useTheme()

  return (
    <Menu>
      <MenuTrigger className={cn(navItemClass, 'h-8 data-[popup-open]:bg-hover')}>
        <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={20} />
        <span className="min-w-0 flex-1 truncate text-left text-fg">{profile.full_name}</span>
      </MenuTrigger>
      <MenuContent side="top" className="w-60">
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
