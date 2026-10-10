'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { updateAccountName } from '@/app/actions/settings'
import { cn } from '@/lib/utils'
import { SettingsSection } from './section'

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

  return (
    <div>
      <SettingsSection title={t('title')} description={t('description')}>
        <div className="flex max-w-md items-end gap-2">
          <Field label={t('name')} htmlFor="a-name" className="flex-1">
            <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} maxLength={80} />
          </Field>
          {isAdmin ? (
            <Button
              variant="primary"
              loading={pending}
              disabled={!name.trim() || name === account.name}
              onClick={() =>
                start(async () => {
                  const res = await updateAccountName(name)
                  if (res.ok) {
                    toast.success(t('saved'))
                    router.refresh()
                  } else toast.error(t('error'))
                })
              }
            >
              {t('save')}
            </Button>
          ) : null}
        </div>
      </SettingsSection>

      {usage ? (
        <SettingsSection
          title={t('plan')}
          description={t('planDescription')}
          action={<span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">{usage.plan_name}</span>}
        >
          <div className="flex max-w-md flex-col gap-5">
            <Meter label={t('workspaces')} used={usage.workspaces_count} max={usage.max_workspaces} />
            <Meter label={t('members')} used={usage.members_count} max={usage.max_members} />
          </div>
        </SettingsSection>
      ) : null}
    </div>
  )
}
