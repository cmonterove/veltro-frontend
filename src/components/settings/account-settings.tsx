'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { Input } from '@/components/ui/input'
import { updateAccountName } from '@/app/actions/settings'
import { cn } from '@/lib/utils'
import { SaveBar, SettingsCard, SettingsHeader, SettingsRow } from './ui'

type Usage = {
  plan_id: string
  plan_name: string
  max_workspaces: number | null
  max_members: number | null
  workspaces_count: number
  members_count: number
} | null

function Meter({ label, used, max }: { label: string; used: number; max: number | null }) {
  const t = useTranslations('settings.account')
  const pct = max ? Math.min(100, (used / max) * 100) : 0
  const full = max != null && used >= max
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-fg">{label}</span>
        <span className={cn('tabular-nums', full ? 'font-medium text-warning' : 'text-fg-muted')}>
          {max == null ? t('unlimitedCount', { used }) : t('usage', { used, max })}
        </span>
      </div>
      {max != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-hover">
          <div className={cn('h-full rounded-full', full ? 'bg-warning' : 'bg-accent-mid')} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function AccountSettings({ usage }: { usage: Usage }) {
  const t = useTranslations('settings.account')
  const router = useRouter()
  const { account } = useApp()
  const isAdmin = useIsAccountAdmin()
  const [name, setName] = useState(account.name)
  const [pending, start] = useTransition()
  const dirty = isAdmin && name.trim() !== account.name

  const save = () =>
    start(async () => {
      const res = await updateAccountName(name.trim())
      if (res.ok) {
        toast.success(t('saved'))
        router.refresh()
      } else toast.error(t('error'))
    })

  return (
    <div>
      <SettingsHeader title={t('pageTitle')} description={t('description')} />

      <SettingsCard>
        <SettingsRow label={t('name')} description={t('nameHint')} htmlFor="a-name">
          <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} maxLength={80} className="sm:w-72" />
        </SettingsRow>
      </SettingsCard>

      {usage ? (
        <SettingsCard
          title={t('plan')}
          description={t('planDescription')}
          action={<span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">{usage.plan_name}</span>}
        >
          <div className="flex flex-col gap-5 px-5 py-5">
            <Meter label={t('workspaces')} used={usage.workspaces_count} max={usage.max_workspaces} />
            <Meter label={t('members')} used={usage.members_count} max={usage.max_members} />
          </div>
        </SettingsCard>
      ) : null}

      <SaveBar dirty={dirty} pending={pending} onSave={save} onDiscard={() => setName(account.name)} disabled={!name.trim()} />
    </div>
  )
}
