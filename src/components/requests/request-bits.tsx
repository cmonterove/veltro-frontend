'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Bug, CircleHelp, Database, Inbox, KeyRound, Package, type LucideIcon } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import type { RequestKind, RequestStatus } from '@/lib/queries/requests'
import { cn } from '@/lib/utils'

/** Ícono de Solicitudes en toda la web. */
export const RequestsIcon = Inbox

export const KIND_ICON: Record<RequestKind, LucideIcon> = {
  request: Package,
  problem: Bug,
  question: CircleHelp,
  access: KeyRound,
  data: Database,
}

/** Lo que espera en mandarina, lo que avanza en violeta, lo entregado en verde, lo cerrado apagado. */
export const REQUEST_TONE: Record<RequestStatus, string> = {
  new: 'bg-warning-soft text-mandarina-ink',
  in_review: 'bg-accent-soft text-accent-ink',
  in_progress: 'bg-info-soft text-info',
  delivered: 'bg-success-soft text-success',
  resolved: 'bg-hover text-fg-muted',
  declined: 'bg-hover text-fg-subtle',
}

/** El estado como un círculo que se llena (el mismo lenguaje que las tareas y los tickets). */
export function RequestStatusIcon({ status, className }: { status: RequestStatus; className?: string }) {
  const base = cn('size-3.5 shrink-0', className)
  if (status === 'resolved' || status === 'declined') {
    return (
      <svg viewBox="0 0 14 14" className={cn(base, 'text-fg-subtle')} aria-hidden>
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        {status === 'resolved' ? (
          <path d="M4.4 7.2 6.2 9 9.7 5.3" fill="none" stroke="var(--panel)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M4.8 4.8 9.2 9.2M9.2 4.8 4.8 9.2" fill="none" stroke="var(--panel)" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
    )
  }
  const fill = { new: 0, in_review: 0.35, in_progress: 0.6, delivered: 0.85 }[status]
  const tone = { new: 'text-mandarina', in_review: 'text-accent-mid', in_progress: 'text-info', delivered: 'text-success' }[status]
  const a = fill * 2 * Math.PI
  const x = 7 + 3.5 * Math.sin(a)
  const y = 7 - 3.5 * Math.cos(a)
  return (
    <svg viewBox="0 0 14 14" className={cn(base, tone)} aria-hidden>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {fill > 0 ? <path d={`M7 7 L7 3.5 A3.5 3.5 0 ${fill > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="currentColor" /> : null}
    </svg>
  )
}

/** Las iniciales de un departamento en su baldosa (Tecnología → TE, Recursos Humanos → RH). */
export function DeptMark({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const text = (words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2)).toUpperCase()
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center bg-fg/[0.07] font-semibold leading-none text-fg-muted', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.max(8, Math.round(size * 0.42)) }}
    >
      {text}
    </span>
  )
}

/** Personas de un departamento: su jefe primero y quienes lo tienen como departamento. */
export function useDepartmentPeople() {
  const { departments, members } = useApp()
  return useMemo(() => {
    const map = new Map<string, typeof members>()
    for (const d of departments) {
      const list = members.filter((m) => m.department_id === d.id || m.id === d.head_id)
      list.sort((a, b) => Number(b.id === d.head_id) - Number(a.id === d.head_id) || a.full_name.localeCompare(b.full_name))
      map.set(d.id, list)
    }
    return map
  }, [departments, members])
}

/** La pastilla con el estado (texto traducido y su color). */
export function RequestStatusPill({ status, className }: { status: RequestStatus; className?: string }) {
  const t = useTranslations('requests.status')
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-2xs font-medium', REQUEST_TONE[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(status)}
    </span>
  )
}
