'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { Input } from '@/components/ui/input'
import { updateAccountColor, updateAccountName } from '@/app/actions/settings'
import { Check, Plus } from 'lucide-react'
import { useBrand } from '@/components/app/brand'
import { BRANDS, brandAttrs, isHex, type Brand } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Usage } from '@/lib/api/ajustes'
import { cn } from '@/lib/utils'
import { SaveBar, SettingsCard, SettingsHeader, SettingsRow } from './ui'

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

export function AccountSettings({ usage }: { usage: Usage | null }) {
  const t = useTranslations('settings.account')
  const te = useTranslations('errors')
  const router = useRouter()
  const { account } = useApp()
  const isAdmin = useIsAccountAdmin()
  const [name, setName] = useState(account.name)
  const [pending, start] = useTransition()
  const dirty = isAdmin && name.trim() !== account.name

  const save = () =>
    start(async () => {
      const res = await updateAccountName(account.id, name.trim())
      if (res.ok) {
        toast.success(t('saved'))
        router.refresh()
      } else toast.error(te(res.error))
    })

  return (
    <div>
      <SettingsHeader title={t('pageTitle')} description={t('description')} />

      <SettingsCard>
        <SettingsRow label={t('name')} description={t('nameHint')} htmlFor="a-name">
          <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} maxLength={80} className="sm:w-72" />
        </SettingsRow>
      </SettingsCard>

      <AccountColor />

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

/**
 * El color de la cuenta: cada muestra es el marco en miniatura en ese color, con la inicial de la cuenta,
 * y al final «Tu color» (uno propio: el selector del sistema o el hexadecimal). Al elegir, la app pasa a
 * ese color al instante (se anima el tono) y se guarda; si falla, vuelve.
 */
function AccountColor() {
  const t = useTranslations('settings.account')
  const te = useTranslations('errors')
  const router = useRouter()
  const { account } = useApp()
  const isAdmin = useIsAccountAdmin()
  const { brand, preview } = useBrand()
  const [, start] = useTransition()
  const initial = account.name.trim().charAt(0).toUpperCase()

  const save = (b: Brand) => {
    preview(b)
    start(async () => {
      const res = await updateAccountColor(account.id, b)
      if (res.ok) {
        toast.success(t('colorSaved'))
        router.refresh()
      } else {
        preview(null)
        toast.error(te(res.error))
      }
    })
  }
  const swatch = (active: boolean) =>
    cn(
      'frame-bg relative flex size-12 items-center justify-center rounded-2xl text-[15px] font-bold text-[oklch(0.969_0.011_54.5)] shadow-[0_8px_18px_-10px_oklch(0.2_0.05_312/0.6)] ring-2 ring-offset-2 ring-offset-panel transition-[transform,box-shadow] duration-200 ease-out group-focus-visible/sw:ring-accent-mid',
      active ? 'ring-accent' : 'ring-transparent group-enabled/sw:group-hover/sw:-translate-y-0.5',
    )
  const check = (
    <span className="absolute -bottom-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-panel text-accent shadow-card ring-1 ring-line-soft">
      <Check className="size-3" strokeWidth={3} />
    </span>
  )

  return (
    <SettingsCard title={t('colorTitle')} description={isAdmin ? t('colorHint') : t('colorHintMember')}>
      <div className="grid grid-cols-5 gap-x-3 gap-y-5 px-5 py-5 sm:grid-cols-9">
        {BRANDS.map((b) => {
          const active = b === brand
          return (
            <button
              key={b}
              type="button"
              {...brandAttrs(b)}
              disabled={!isAdmin}
              aria-pressed={active}
              onClick={() => b !== brand && save(b)}
              className="group/sw flex flex-col items-center gap-2 outline-none disabled:cursor-default"
            >
              <span className={swatch(active)}>
                {initial}
                {active ? check : null}
              </span>
              <span className={cn('text-xs', active ? 'font-medium text-fg' : 'text-fg-muted')}>{t(`colors.${b}`)}</span>
            </button>
          )
        })}
        <CustomColor current={isHex(brand) ? brand : null} disabled={!isAdmin} initial={initial} swatch={swatch} check={check} onSave={save} onPreview={preview} />
      </div>
    </SettingsCard>
  )
}

/**
 * «Tu color»: la muestra (el tuyo, o un arcoíris con + si todavía no tienes) abre el selector del sistema
 * y el campo del hexadecimal. Mientras eliges, la app ya se ve con ese color; «Usar este color» lo guarda
 * y cerrar sin guardar vuelve al que estaba.
 */
function CustomColor({
  current,
  disabled,
  initial,
  swatch,
  check,
  onSave,
  onPreview,
}: {
  current: `#${string}` | null
  disabled: boolean
  initial: string
  swatch: (active: boolean) => string
  check: React.ReactNode
  onSave: (b: Brand) => void
  onPreview: (b: Brand | null) => void
}) {
  const t = useTranslations('settings.account')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string>(current ?? '#1e6f5c')
  const [text, setText] = useState(draft.toUpperCase())
  const pick = (hex: string) => {
    setDraft(hex)
    setText(hex.toUpperCase())
    onPreview(hex as Brand)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // se cerró sin «Usar»: vuelve al de la cuenta
        if (!o) onPreview(null)
        else {
          setDraft(current ?? draft)
          setText((current ?? draft).toUpperCase())
        }
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        render={<button type="button" {...(current ? brandAttrs(current) : {})} className="group/sw flex flex-col items-center gap-2 outline-none disabled:cursor-default" />}
      >
        {current ? (
          <span className={swatch(true)}>
            {initial}
            {check}
          </span>
        ) : (
          // el arcoíris (sin el fondo del marco: si no, lo pisa)
          <span className={cn(swatch(false).replace('frame-bg ', ''), '[background:conic-gradient(from_200deg,#7c3aed,#2563eb,#0d9488,#16a34a,#ca8a04,#ea580c,#be123c,#7c3aed)]')}>
            <Plus className="size-5" strokeWidth={2.5} />
          </span>
        )}
        <span className={cn('text-xs', current ? 'font-medium text-fg' : 'text-fg-muted')}>{t('customColor')}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <p className="text-sm font-semibold text-fg">{t('customTitle')}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t('customHint')}</p>
        <div className="mt-3 flex items-center gap-3">
          {/* el selector del sistema, escondido detrás de su muestra */}
          <label className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-xl shadow-card ring-1 ring-line-strong" style={{ background: draft }}>
            <input type="color" value={draft} onChange={(e) => pick(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label={t('customPick')} />
          </label>
          <Input
            value={text}
            onChange={(e) => {
              const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
              setText(v.toUpperCase())
              if (isHex(v)) pick(v.toLowerCase())
            }}
            maxLength={7}
            spellCheck={false}
            aria-label={t('customHex')}
            className={cn('font-mono uppercase', !isHex(text) && 'border-danger/60')}
          />
        </div>
        {/* así se verá: el marco en ese color, con la inicial de la cuenta */}
        <div {...brandAttrs(draft as Brand)} className="frame-bg mt-3 flex h-14 items-center gap-2.5 rounded-xl px-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-fg">{initial}</span>
          <span className="h-1.5 w-16 rounded-full bg-[oklch(0.969_0.011_54.5/0.5)]" />
          <span className="ml-auto h-6 w-14 rounded-md bg-canvas" />
        </div>
        <Button
          variant="primary"
          className="mt-3 w-full"
          disabled={!isHex(draft)}
          onClick={() => {
            onSave(draft.toLowerCase() as Brand)
            setOpen(false)
          }}
        >
          {t('customUse')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
