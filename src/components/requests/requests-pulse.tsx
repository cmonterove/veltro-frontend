'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight, Plus } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { CountBadge, useAgo } from '@/components/support/support-bits'
import { DEMO } from '@/lib/demo/config'
import { useHydrated } from '@/lib/hooks'
import { isClosed, useRequestSummary, useRequests, type DeptRequest } from '@/lib/queries/requests'
import { cn } from '@/lib/utils'
import { NewRequestDialog } from './new-request-dialog'
import { DeptMark, RequestStatusPill, RequestsIcon } from './request-bits'

/**
 * Solicitudes en Pulso: lo que otros departamentos le pidieron al mío y las novedades de lo que
 * yo pedí, y pedirle algo a cualquier departamento (Tecnología, Ventas, Compras…) sin salir de aquí.
 */
export function RequestsPulse({ bare = false, rail = false }: { bare?: boolean; rail?: boolean } = {}) {
  const t = useTranslations('requests.pulse')
  const tr = useTranslations('requests')
  const { departments, members, user } = useApp()
  // la barra lateral ya pidió el resumen: si llega antes de que esta parte se hidrate, el texto
  // no coincidiría con el del servidor. Hasta hidratar se muestra como en el servidor (sin datos).
  const hydrated = useHydrated()
  const { data } = useRequestSummary()
  const summary = hydrated ? data : undefined
  const [creating, setCreating] = useState<string | null>(null)

  const counts = summary?.counts
  const pending = (counts?.inboxNew ?? 0) + (counts?.mineUnread ?? 0)
  // las listas solo se piden si hay algo que mostrar
  const inbox = useRequests('inbox', { state: 'open' }, { enabled: Boolean(counts?.inboxNew) })
  const mine = useRequests('mine', { state: 'open' }, { enabled: Boolean(counts?.mineUnread) })
  const items = useMemo(() => {
    const incoming = (inbox.data?.pages.flatMap((p) => p.items) ?? []).filter((x) => x.status === 'new' || x.unread)
    const updates = (mine.data?.pages.flatMap((p) => p.items) ?? []).filter((x) => x.unread && !isClosed(x.status))
    return [...incoming, ...updates]
  }, [inbox.data, mine.data])

  // a quién se le puede pedir: los otros departamentos primero
  const myDept = members.find((m) => m.id === user.id)?.department_id ?? null
  const targets = useMemo(() => departments.filter((d) => d.id !== myDept).sort((a, b) => a.name.localeCompare(b.name)), [departments, myDept])

  if (DEMO) return null

  // `rail`: en la columna derecha de Pulso, apilado (sin caja, sobre el fondo)
  if (rail) {
    return (
      <section aria-label={tr('title')} className="flex flex-col gap-1.5">
        <header className="flex min-h-7 items-center gap-2">
          <RequestsIcon className="size-4 shrink-0 text-accent-mid" aria-hidden />
          <Link href="/requests" className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold tracking-[-0.015em] hover:text-accent-ink">
            <span className="truncate">{tr('title')}</span>
            <CountBadge count={pending} />
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setCreating('')} className="h-7 text-fg">
            <Plus className="text-accent-mid" />
            {t('new')}
          </Button>
        </header>
        {items.length ? (
          <ul className="flex flex-col">
            {items.slice(0, 3).map((x) => (
              <li key={x.id}>
                <RailRow r={x} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{summary && !pending ? t('allClear') : ' '}</p>
        )}
        {items.length > 3 ? (
          <Link href="/requests" className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
            {t('more', { count: items.length - 3 })}
            <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
        {targets.length && !items.length ? (
          <div className="-mx-1.5 flex flex-wrap items-center gap-1">
            <span className="px-1.5 text-xs text-fg-subtle">{t('askTo')}</span>
            {targets.slice(0, 4).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setCreating(d.id)}
                className="inline-flex h-7 max-w-40 items-center gap-1.5 rounded-lg px-1.5 text-xs font-medium text-fg transition-colors hover:bg-fg/[0.05]"
              >
                <DeptMark name={d.name} size={18} />
                <span className="truncate">{d.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        <NewRequestDialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)} defaultDepartment={creating || undefined} />
      </section>
    )
  }

  return (
    // `bare`: dentro de otro bloque (la cabecera de Pulso), sin caja propia
    <section aria-label={tr('title')} className={cn('@container/req flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2', !bare && 'rounded-xl border border-line bg-panel px-3 py-2')}>
      <Link href="/requests" className="flex shrink-0 items-center gap-2 rounded-md text-sm font-medium text-fg hover:text-accent-ink">
        <RequestsIcon className="size-4 text-accent-mid" aria-hidden />
        {tr('title')}
        <CountBadge count={pending} />
      </Link>
      <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden />

      <div className="flex min-w-0 flex-1 basis-64 items-center gap-1 overflow-x-auto scrollbar-none">
        {items.length ? (
          items.slice(0, 2).map((x) => <PendingRow key={x.id} r={x} />)
        ) : (
          <span className="truncate px-1 text-sm text-fg-muted">{summary && !pending ? t('allClear') : ' '}</span>
        )}
        {items.length > 2 ? (
          <Link href="/requests" className="inline-flex shrink-0 items-center gap-1 px-2 text-xs font-medium text-fg-muted hover:text-fg">
            {t('more', { count: items.length - 2 })}
            <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {targets.length && !items.length ? (
          // los departamentos a la vista (solo si no hay pendientes: si los hay, el lugar es para ellos)
          <div className="hidden items-center gap-1 @min-[56rem]/req:flex">
            <span className="px-1 text-xs text-fg-subtle">{t('askTo')}</span>
            {targets.slice(0, 3).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setCreating(d.id)}
                className="inline-flex h-7 max-w-40 items-center gap-1.5 rounded-lg px-1.5 text-xs font-medium text-fg transition-colors hover:bg-hover"
              >
                <DeptMark name={d.name} size={18} />
                <span className="truncate">{d.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setCreating('')} className={cn('text-fg', targets.length && !items.length && '@min-[56rem]/req:ml-1')}>
          <Plus className="text-accent-mid" />
          {t('new')}
        </Button>
      </div>

      <NewRequestDialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)} defaultDepartment={creating || undefined} />
    </section>
  )
}

/** Lo mismo que `PendingRow`, en dos líneas para la columna angosta. */
function RailRow({ r }: { r: DeptRequest }) {
  const t = useTranslations('requests.pulse')
  const ago = useAgo()
  const incoming = r.myRole === 'department'
  const firstName = r.requester.fullName.split(' ')[0]
  const markName = incoming ? (r.requester.department?.name ?? r.requester.fullName) : (r.department?.name ?? '')
  const sub = incoming
    ? r.requester.department
      ? t('incomingFrom', { name: firstName, department: r.requester.department.name, when: ago(r.createdAt) })
      : t('incoming', { name: firstName, when: ago(r.createdAt) })
    : t('updated', { department: r.department?.name ?? '', when: ago(r.lastActivityAt) })
  return (
    <Link
      href={`/requests/${r.id}`}
      className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-hover/60"
    >
      <DeptMark name={markName} size={22} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm text-fg', r.unread ? 'font-semibold' : 'font-medium')}>{r.title}</span>
        <span className="block truncate text-xs text-fg-subtle">{sub}</span>
      </span>
      <RequestStatusPill status={r.status} />
    </Link>
  )
}

function PendingRow({ r }: { r: DeptRequest }) {
  const t = useTranslations('requests.pulse')
  const ago = useAgo()
  const incoming = r.myRole === 'department'
  const firstName = r.requester.fullName.split(' ')[0]
  // lo que me llegó: quién lo pide (y de qué departamento); lo mío: qué departamento se movió
  const markName = incoming ? (r.requester.department?.name ?? r.requester.fullName) : (r.department?.name ?? '')
  const sub = incoming
    ? r.requester.department
      ? t('incomingFrom', { name: firstName, department: r.requester.department.name, when: ago(r.createdAt) })
      : t('incoming', { name: firstName, when: ago(r.createdAt) })
    : t('updated', { department: r.department?.name ?? '', when: ago(r.lastActivityAt) })
  return (
    <Link href={`/requests/${r.id}`} className="flex min-w-0 max-w-[34rem] shrink items-center gap-2 rounded-lg px-2 py-1 hover:bg-hover">
      <DeptMark name={markName} size={22} />
      {/* el título manda: lo que se corta primero es quién y cuándo */}
      <span className={cn('min-w-28 truncate text-sm text-fg', r.unread ? 'font-semibold' : 'font-medium')}>{r.title}</span>
      <span className="min-w-0 shrink-[4] truncate text-sm text-fg-muted">· {sub}</span>
      <RequestStatusPill status={r.status} />
    </Link>
  )
}
