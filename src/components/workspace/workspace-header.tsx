'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Settings } from 'lucide-react'
import { useWorkspaceBySlug } from '@/components/app/app-context'
import { cn } from '@/lib/utils'
import { WorkspaceMark } from '@/components/app/marks'

export function WorkspaceHeader({ slug }: { slug: string }) {
  const t = useTranslations('workspace')
  const pathname = usePathname()
  const ws = useWorkspaceBySlug(slug)
  if (!ws) return null

  const base = `/w/${slug}`
  // El doc ocupa toda la página: sin encabezado de espacio
  if (pathname.startsWith(`${base}/docs/`)) return null

  const tabs = [
    { href: base, label: t('summary'), exact: true },
    { href: `${base}/tasks`, label: t('tasks') },
    { href: `${base}/docs`, label: t('docs') },
    { href: `${base}/meetings`, label: t('meetings') },
  ]

  return (
    <div className={cn('ws-' + ws.color, 'shrink-0 border-b border-line px-4 pt-4 sm:px-6')}>
      <div className="flex items-center gap-3">
        <WorkspaceMark ws={ws} size={28} />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{ws.name}</h1>
        </div>
        {ws.my_role === 'admin' ? (
          <Link
            href={`/settings/workspaces?edit=${ws.id}`}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:bg-hover hover:text-fg"
          >
            <Settings className="size-4" />
            <span className="hidden sm:inline">{t('settings')}</span>
          </Link>
        ) : null}
      </div>
      <nav className="-mb-px mt-3 flex gap-4 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors',
                active ? 'border-fg font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
