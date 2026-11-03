'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { SaveBar, SettingsCard, SettingsHeader, SettingsRow } from '@/components/settings/ui'
import { ErrorState } from '@/components/ui/error-state'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toErrorCode } from '@/lib/errors'
import { useMyDestination, useSetSupportRouting, useSupportRouting } from '@/lib/queries/support'
import { ROUTING_ROLES, destinationsFor, joinNames, firstName, type SupportRouting, type TicketDestination } from '@/lib/support'
import { DESTINATION_ICON, VeltroTile } from './support-bits'

/**
 * Ajustes › Soporte: a quién le llegan los tickets según el rol de quien los crea. Lo ve toda la
 * cuenta; solo el dueño lo cambia (la API lo exige).
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
  const arrives = (dest: TicketDestination) => {
    if (dest === 'veltro') return t('routing.arrivesVeltro')
    const people = dest === 'account_owner' ? (owner ? [owner] : []) : admins
    if (!people.length) return t('routing.arrivesTo', { to: t(`destination.${dest}`) })
    const names = joinNames(
      people.map((p) => firstName(p.full_name)),
      t('and'),
    )
    return t('routing.arrivesTo', { to: dest === 'account_owner' ? t('to.owner', { names }) : t('to.admins', { names, count: people.length }) })
  }

  const icon = (dest: TicketDestination) => {
    if (dest === 'veltro') return <VeltroTile size={18} />
    const Icon = DESTINATION_ICON[dest]
    return <Icon className="size-4 text-fg-muted" />
  }

  return (
    <>
      <SettingsHeader title={t('routing.pageTitle')} description={t('routing.pageBody')} />
      {routing.isError ? (
        <ErrorState onRetry={() => routing.refetch()} />
      ) : !value ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : (
        <>
          <SettingsCard
            title={t('routing.title')}
            description={canEdit ? t('routing.ownerHint') : undefined}
            action={
              canEdit ? null : (
                <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <Lock className="size-3.5" aria-hidden />
                  {t('routing.locked')}
                </span>
              )
            }
          >
            {ROUTING_ROLES.map((role) => (
              <SettingsRow key={role} label={t(`routing.roles.${role}`)} description={arrives(value[role])} htmlFor={`routing-${role}`}>
                <Select<TicketDestination>
                  id={`routing-${role}`}
                  value={value[role]}
                  disabled={!canEdit || save.isPending}
                  onChange={(d) => setDraft({ ...value, [role]: d })}
                  className="sm:w-60"
                  options={destinationsFor(role).map((d) => ({ value: d, label: t(`destination.${d}`), icon: icon(d) }))}
                  aria-label={t(`routing.sheet.${role}`)}
                />
              </SettingsRow>
            ))}
          </SettingsCard>

          {mine.data ? (
            <p className="-mt-4 mb-8 text-xs text-fg-muted">
              {t('routing.yours', {
                role: tt(`roleLower.${accountRole}`),
                to: mine.data.destination === 'veltro' ? t('to.veltro') : t(`destination.${mine.data.destination}`),
              })}
            </p>
          ) : null}

          <SaveBar
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
        </>
      )}
    </>
  )
}
