'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { SearchX } from 'lucide-react'
import { useApp, useWorkspaceBySlug } from '@/components/app/app-context'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api/client'
import type { ApiWorkspace } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { goToAccount } from '@/lib/switch-account'
import { WorkspaceOverview } from './workspace-overview'
import { WorkspaceTasks } from './workspace-tasks'
import { WorkspaceDocs } from './workspace-docs'
import { WorkspaceMeetings } from './workspace-meetings'

/**
 * El espacio de la URL sale del contexto que ya tiene el navegador (lo cargó el layout de la app
 * una vez): cambiar de espacio o de pestaña no le vuelve a preguntar nada al servidor antes de
 * mostrarse. Si no está (de otra de mis cuentas, recién creado o sin acceso), se le pregunta a la API.
 */
export function WorkspaceGate({ slug, children }: { slug: string; children: React.ReactNode }) {
  const ws = useWorkspaceBySlug(slug)
  const pathname = usePathname()
  if (!ws) return <WorkspaceMissing slug={slug} />
  // cada pestaña cabe en la pantalla y sus tarjetas se desplazan por dentro: la página no se desplaza.
  // El Resumen apila sus paneles en pantallas chicas (ahí sí crece); el doc abierto es una página aparte.
  const overview = pathname === `/w/${slug}`
  const doc = pathname.startsWith(`/w/${slug}/docs/`)
  return (
    <div className={cn('flex flex-col', doc ? 'min-h-full' : overview ? 'min-h-full xl:h-full xl:min-h-0' : 'h-full min-h-0')}>
      {/* cada sección arma su cabecera (logo, título y lo suyo): sin franja ni pestañas */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/** Cada pestaña del espacio, resuelta en el cliente. El layout ya garantizó que el espacio existe. */
export function WorkspaceView({ slug, view }: { slug: string; view: 'overview' | 'tasks' | 'docs' | 'meetings' }) {
  const ws = useWorkspaceBySlug(slug)
  if (!ws) return null
  if (view === 'tasks') return <WorkspaceTasks workspaceId={ws.id} />
  if (view === 'docs') return <WorkspaceDocs workspaceId={ws.id} />
  if (view === 'meetings') return <WorkspaceMeetings workspaceId={ws.id} />
  return <WorkspaceOverview workspaceId={ws.id} />
}

function WorkspaceMissing({ slug }: { slug: string }) {
  const t = useTranslations('errors')
  const { account } = useApp()
  const router = useRouter()
  const refreshed = useRef(false)
  // la API solo lo devuelve si lo puedo ver
  const { data: found, isLoading } = useQuery({
    queryKey: ['workspace-by-slug', slug],
    queryFn: () => api<ApiWorkspace>(`/v1/workspaces/${encodeURIComponent(slug)}`).catch(() => null),
    staleTime: 30_000,
  })
  const otherAccount = Boolean(found && found.accountId !== account.id)
  // de esta cuenta pero todavía no en el contexto (lo acaban de crear): se recarga el contexto una vez
  const stale = Boolean(found && !otherAccount && !refreshed.current)

  useEffect(() => {
    if (!found) return
    if (found.accountId !== account.id) {
      // de otra de mis cuentas: se cambia con una carga completa (y se vuelve a esta misma dirección)
      goToAccount(found.accountId)
    } else if (!refreshed.current) {
      refreshed.current = true
      router.refresh()
    }
  }, [found, account.id, router, slug])

  if (isLoading || otherAccount || stale) {
    return (
      <div className="flex flex-col gap-3 px-6 pt-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    )
  }
  return (
    <div className="px-6">
      <EmptyState
        icon={<SearchX />}
        tone="quiet"
        title={t('notFoundTitle')}
        description={t('notFoundBody')}
        action={
          <Link href="/home" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            {t('backHome')}
          </Link>
        }
      />
    </div>
  )
}
