'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowRight, ChevronRight, Crown, Lock, ShieldCheck, UserRound } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { SaveBar, SettingsHeader, SideSection, SplitPanel } from '@/components/settings/ui'
import { Avatar } from '@/components/ui/avatar'
import { ErrorState } from '@/components/ui/error-state'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toErrorCode } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useMyDestination, useSetSupportRouting, useSupportRouting } from '@/lib/queries/support'
import { ROUTING_ROLES, destinationsFor, joinNames, firstName, type SupportRouting, type TicketDestination } from '@/lib/support'
import type { AccountRole } from '@/lib/database.types'
import type { Member } from '@/lib/types'
import { DESTINATION_ICON, VeltroTile } from './support-bits'

/** quién lo crea → destino → quiénes lo reciben; con poco ancho, uno debajo del otro */
const FLOW = '@2xl:grid-cols-[minmax(0,1fr)_1.25rem_13rem_1.25rem_minmax(0,1fr)]'

const ROLE_ICON: Partial<Record<AccountRole, typeof UserRound>> = { member: UserRound, admin: ShieldCheck, owner: Crown }

/**
 * Ajustes › Soporte: a quién le llegan los tickets según el rol de quien los crea, dibujado como un
 * recorrido por rol (quién lo crea → destino → quiénes lo reciben). Lo ve toda la cuenta; solo el
 * dueño lo cambia (la API lo exige). Al lado: adónde van los tuyos y qué es cada destino.
 */
export function SupportRoutingSettings() {
  const t = useTranslations('support')
  const tt = useTranslations('ticket')
  const te = useTranslations('errors')
  const { members, account, accountRole } = useApp()
  const routing = useSupportRouting()
  const mine = useMyDestination()
  const save = useSetSupportRouting()
  const [draft, setDraft] = useState<SupportRouting | null>(null)

  const current = routing.data?.routing
  const value = draft ?? current
  const canEdit = routing.data?.canEdit ?? false
  const dirty = Boolean(draft && current && ROUTING_ROLES.some((r) => draft[r] !== current[r]))

  // quiénes reciben cada destino, con nombres (de la cuenta, sin filtrar a nadie)
  const owner = members.find((m) => m.id === account.owner_id)
  const admins = members.filter((m) => m.role === 'owner' || m.role === 'admin')
  const recipients = (dest: TicketDestination): Member[] => (dest === 'veltro' ? [] : dest === 'account_owner' ? (owner ? [owner] : []) : admins)
  const arrives = (dest: TicketDestination) => {
    if (dest === 'veltro') return t('routing.arrivesVeltro')
    const people = recipients(dest)
    if (!people.length) return t('routing.arrivesTo', { to: t(`destination.${dest}`) })
    const names = joinNames(
      people.map((p) => firstName(p.full_name)),
      t('and'),
    )
    return t('routing.arrivesTo', { to: dest === 'account_owner' ? t('to.owner', { names }) : t('to.admins', { names, count: people.length }) })
  }

  const icon = (dest: TicketDestination, size = 16) => {
    if (dest === 'veltro') return <VeltroTile size={size + 2} />
    const Icon = DESTINATION_ICON[dest]
    return <Icon className="text-fg-muted" style={{ width: size, height: size }} />
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title={t('routing.pageTitle')}
        description={t('routing.pageBody')}
        actions={
          !canEdit && value ? (
            <span className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-xs text-fg-muted">
              <Lock className="size-3.5" aria-hidden />
              {t('routing.locked')}
            </span>
          ) : null
        }
      />
      {routing.isError ? (
        <ErrorState onRetry={() => routing.refetch()} />
      ) : !value ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <SplitPanel
          main={
          <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
            <div className={cn(FLOW, 'hidden border-b border-line-soft bg-sidebar/40 px-6 py-2.5 text-xs font-medium text-fg-subtle @2xl:grid')}>
              <span>{t('routing.from')}</span>
              <span />
              <span>{t('routing.via')}</span>
              <span />
              <span>{t('routing.reaches')}</span>
            </div>
            <ul className="flex flex-1 flex-col divide-y divide-line-soft">
              {ROUTING_ROLES.map((role) => {
                const Icon = ROLE_ICON[role] ?? UserRound
                const who = members.filter((m) => m.role === role)
                const dest = value[role]
                const people = recipients(dest)
                return (
                  <li key={role} className={cn(FLOW, 'grid flex-1 grid-cols-1 content-center items-center gap-4 px-6 py-5')}>
                    {/* quién lo crea */}
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-hover text-fg-muted">
                        <Icon className="size-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg">{t(`routing.roles.${role}`)}</p>
                        <Faces people={who} empty={t('routing.nobody')} />
                      </div>
                    </div>
                    <ArrowRight className="hidden size-4 text-fg-subtle @2xl:block" aria-hidden />
                    {/* el destino */}
                    <Select<TicketDestination>
                      id={`routing-${role}`}
                      value={dest}
                      disabled={!canEdit || save.isPending}
                      onChange={(d) => setDraft({ ...value, [role]: d })}
                      className="w-full"
                      options={destinationsFor(role).map((d) => ({ value: d, label: t(`destination.${d}`), icon: icon(d) }))}
                      aria-label={t(`routing.sheet.${role}`)}
                    />
                    <ArrowRight className="hidden size-4 text-fg-subtle @2xl:block" aria-hidden />
                    {/* quiénes lo reciben */}
                    <div className="flex min-w-0 items-center gap-3">
                      {dest === 'veltro' ? <VeltroTile size={28} /> : <AvatarStack people={people} />}
                      <p className="min-w-0 text-sm leading-snug text-fg-muted">{arrives(dest)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
            {canEdit ? <p className="border-t border-line-soft px-6 py-3 text-xs text-fg-muted">{t('routing.ownerHint')}</p> : null}
          </div>
          }
          side={
          <>
            {mine.data ? (
              <SideSection title={t('routing.yoursTitle')}>
                <div className="flex items-center gap-3 rounded-xl bg-panel px-3 py-3 shadow-card ring-1 ring-line-soft">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel ring-1 ring-line-soft">{icon(mine.data.destination, 18)}</span>
                  <p className="min-w-0 text-sm leading-snug text-fg">
                    {t('routing.yours', {
                      role: tt(`roleLower.${accountRole}`),
                      to: mine.data.destination === 'veltro' ? t('to.veltro') : t(`destination.${mine.data.destination}`),
                    })}
                  </p>
                </div>
                <Link href="/support" className="mt-3 inline-flex items-center gap-0.5 text-xs font-medium text-accent-ink hover:underline">
                  {t('routing.openSupport')}
                  <ChevronRight className="size-3.5" />
                </Link>
              </SideSection>
            ) : null}

            <SideSection title={t('routing.destinationsTitle')}>
              <ul className="flex flex-col gap-3.5">
                {(['account_admins', 'account_owner', 'veltro'] as const).map((d) => (
                  <li key={d} className="flex gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel ring-1 ring-line-soft">{icon(d)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{t(`destination.${d}`)}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t(`routing.destHint.${d}`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </SideSection>
          </>
          }
        />
      )}

      <SaveBar
        floating
        dirty={dirty}
        pending={save.isPending}
        onDiscard={() => setDraft(null)}
        onSave={() =>
          draft &&
          save.mutate(draft, {
            onSuccess: () => {
              setDraft(null)
              toast.success(t('routing.saved'))
            },
            onError: (e) => toast.error(t('routing.error'), { description: te(toErrorCode(e)) }),
          })
        }
      />
    </div>
  )
}

/** Quiénes tienen ese rol: sus caras y cuántos son. */
function Faces({ people, empty }: { people: Member[]; empty: string }) {
  const t = useTranslations('support.routing')
  if (!people.length) return <p className="text-xs text-fg-subtle">{empty}</p>
  return (
    <p className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
      <AvatarStack people={people} size={18} max={4} />
      {t('people', { count: people.length })}
    </p>
  )
}

function AvatarStack({ people, size = 26, max = 3 }: { people: Member[]; size?: number; max?: number }) {
  if (!people.length) return null
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {people.slice(0, max).map((p) => (
        <Avatar key={p.id} name={p.full_name} src={p.avatar_url} seed={p.id} size={size} className="ring-2 ring-panel" />
      ))}
      {people.length > max ? (
        <span className="flex items-center justify-center rounded-full bg-hover text-[10px] font-medium text-fg-muted ring-2 ring-panel" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      ) : null}
    </span>
  )
}
