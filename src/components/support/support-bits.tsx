'use client'

import { useTranslations } from 'next-intl'
import { formatDistanceStrict } from 'date-fns'
import { Ban, Bug, CalendarClock, CircleHelp, Clock, Crown, Database, KeyRound, LifeBuoy, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { LogoMark } from '@/components/app/logo'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { useDateLocale } from '@/lib/dates'
import { useNow } from '@/lib/hooks'
import { firstName, joinNames, type RequestImpact, type RequestStatus, type TicketCategory, type TicketDestination, type TicketStatus } from '@/lib/support'
import type { SupportPerson, SupportPersonWithRole } from '@/lib/queries/support'
import { cn } from '@/lib/utils'

/** Ícono de Soporte en toda la web (barra lateral, Ajustes, Pulso). */
export const SupportIcon = LifeBuoy

export const CATEGORY_ICON: Record<TicketCategory, LucideIcon> = {
  error: Bug,
  access: KeyRound,
  data: Database,
  calendar: CalendarClock,
  other: CircleHelp,
}

export const IMPACT_ICON: Record<RequestImpact, LucideIcon> = { blocks: Ban, saves_time: Clock, nice: Sparkles }

export const DESTINATION_ICON: Record<Exclude<TicketDestination, 'veltro'>, LucideIcon> = { account_admins: Users, account_owner: Crown }

/** Fondo suave y tinta de cada estado: lo que espera en mandarina, lo que avanza en violeta, lo resuelto apagado. */
export const TICKET_TONE: Record<TicketStatus, string> = {
  open: 'bg-warning-soft text-mandarina-ink',
  in_review: 'bg-accent-soft text-accent-ink',
  answered: 'bg-success-soft text-success',
  resolved: 'bg-hover text-fg-muted',
}

export const REQUEST_TONE: Record<RequestStatus, string> = {
  received: 'bg-info-soft text-info',
  evaluating: 'bg-k-decision-soft text-k-decision',
  planned: 'bg-accent-soft text-accent-ink',
  done: 'bg-success-soft text-success',
  declined: 'bg-hover text-fg-muted',
}

/** Pastilla de estado: el texto traducido y el color del estado. */
export function StatusPill({ label, tone, className }: { label: string; tone: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-2xs font-medium', tone, className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  )
}

export function UrgentTag({ className }: { className?: string }) {
  const t = useTranslations('support')
  return <span className={cn('inline-flex h-5 shrink-0 items-center rounded-full bg-danger-soft px-2 text-2xs font-semibold text-danger', className)}>{t('urgent')}</span>
}

/**
 * Estado del ticket como un círculo que se llena (el mismo lenguaje que el estado de las tareas):
 * abierto vacío, en revisión a la mitad, respondido casi lleno y resuelto con su check.
 */
export function TicketStatusIcon({ status, className }: { status: TicketStatus; className?: string }) {
  const base = cn('size-3.5 shrink-0', className)
  if (status === 'resolved') {
    return (
      <svg viewBox="0 0 14 14" className={cn(base, 'text-fg-subtle')} aria-hidden>
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <path d="M4.4 7.2 6.2 9 9.7 5.3" fill="none" stroke="var(--panel)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  const fill = status === 'open' ? 0 : status === 'in_review' ? 0.5 : 0.75
  const tone = status === 'open' ? 'text-mandarina' : status === 'in_review' ? 'text-accent-mid' : 'text-success'
  // porción de torta desde las 12 en sentido horario
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

/** Baldosa con el ícono de la categoría, teñida como el estado; con un punto si hay algo sin leer. */
export function ToneTile({ icon: Icon, tone, size = 36, unread }: { icon: LucideIcon; tone: string; size?: number; unread?: boolean }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span className={cn('flex size-full items-center justify-center rounded-[10px]', tone)}>
        <Icon style={{ width: size * 0.46, height: size * 0.46 }} aria-hidden />
      </span>
      {unread ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-panel" aria-hidden /> : null}
    </span>
  )
}

/** El isotipo de Veltro en su baldosa: lo que viene del equipo de Veltro. */
export function VeltroTile({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-[30%] bg-highlight', className)} style={{ width: size, height: size }} aria-hidden>
      <LogoMark className="size-[62%]" />
    </span>
  )
}

/** Cara de quien escribe: la persona o, si es el equipo de Veltro, su isotipo. */
export function AuthorAvatar({ person, veltro, size = 32 }: { person: SupportPerson | null; veltro?: boolean; size?: number }) {
  if (veltro || !person) return <VeltroTile size={size} />
  return <Avatar name={person.fullName} src={person.avatarUrl} seed={person.id} size={size} />
}

/** Varias personas (a quién le llega), o el isotipo si va a Veltro. */
export function PeopleOrVeltro({ people, size = 20, ring = 'panel' }: { people: SupportPerson[] | null; size?: number; ring?: 'panel' | 'canvas' }) {
  if (!people || !people.length) return <VeltroTile size={size + 4} />
  return <AvatarStack people={people.map((p) => ({ id: p.id, full_name: p.fullName, avatar_url: p.avatarUrl }))} size={size} max={3} ring={ring} />
}

/** «hace 5 minutos», en el idioma de la app (se refresca cada minuto). */
export function useAgo() {
  const dl = useDateLocale()
  const t = useTranslations('support')
  const now = useNow(60_000)
  return (iso: string) => (now.getTime() - new Date(iso).getTime() < 60_000 ? t('justNow') : formatDistanceStrict(new Date(iso), now, { addSuffix: true, locale: dl }))
}

/**
 * A quién llega un destino, dicho con nombres: «Olivia y Andrés (admins de la cuenta)».
 * `people` son las personas que lo reciben sin contarme (la API ya me deja fuera).
 */
export function useDestinationText() {
  const t = useTranslations('support')
  return (dest: TicketDestination, people: SupportPersonWithRole[] | null | undefined) => {
    if (dest === 'veltro') return t('to.veltro')
    if (!people?.length) return t(`destination.${dest}`)
    const names = joinNames(
      people.map((p) => firstName(p.fullName)),
      t('and'),
    )
    return dest === 'account_owner' ? t('to.owner', { names }) : t('to.admins', { names, count: people.length })
  }
}

/** Insignia con la cuenta de pendientes (la misma de Pasillo en la barra). */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null
  return (
    <span className={cn('inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold tabular-nums text-accent-fg', className)}>
      {count > 99 ? '99+' : count}
    </span>
  )
}
