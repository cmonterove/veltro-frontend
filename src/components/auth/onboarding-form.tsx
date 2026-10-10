'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { completeOnboarding } from '@/app/onboarding/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { WORKSPACE_COLORS } from '@/lib/constants'
import { WorkspaceMark, monogramOf } from '@/components/app/marks'
import { cn } from '@/lib/utils'

export function OnboardingForm({ firstName }: { firstName: string }) {
  const t = useTranslations('onboarding')
  const te = useTranslations('errors')
  const [state, action, pending] = useActionState(completeOnboarding, undefined)
  const [color, setColor] = useState<string>('violet')
  const [wsName, setWsName] = useState('')
  const mark = { name: wsName || 'V', color }
  const [timezone, setTimezone] = useState('')

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  return (
    <form action={action} className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-brand text-2xl font-semibold tracking-[-0.03em]">{t('title', { name: firstName })}</h1>
        <p className="text-sm text-fg-muted">{t('subtitle')}</p>
      </div>

      <input type="hidden" name="icon" value={monogramOf(mark)} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="timezone" value={timezone} />

      <div className="flex flex-col gap-5">
        <Field label={t('accountLabel')} hint={t('accountHint')} htmlFor="account_name">
          <Input id="account_name" name="account_name" required maxLength={80} placeholder={t('accountPlaceholder')} autoFocus />
        </Field>

        <Field label={t('workspaceLabel')} hint={t('workspaceHint')} htmlFor="workspace_name">
          <div className="flex gap-2">
            <WorkspaceMark ws={mark} size={36} />
            <Input
              id="workspace_name"
              name="workspace_name"
              required
              maxLength={80}
              placeholder={t('workspacePlaceholder')}
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
            />
          </div>
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {WORKSPACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={c}
              className={cn('rounded-[9px] p-0.5 ring-offset-2 ring-offset-canvas transition-shadow', color === c && 'ring-2 ring-accent')}
            >
              <WorkspaceMark ws={{ ...mark, color: c }} size={26} />
            </button>
          ))}
        </div>
      </div>

      {state?.error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {te(state.error)}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {t('submit')}
      </Button>
    </form>
  )
}
