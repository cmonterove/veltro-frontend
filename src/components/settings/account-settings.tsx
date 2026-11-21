'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { AccountLogo, WorkspaceMark } from '@/components/app/marks'
import { LogoPicker } from '@/components/app/logo-picker'
import { Input } from '@/components/ui/input'
import { updateAccountColor, updateAccountName } from '@/app/actions/settings'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { useBrand } from '@/components/app/brand'
import { BRANDS, brandAttrs, isHex, type Brand } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Usage } from '@/lib/api/ajustes'
import { cn } from '@/lib/utils'
import { SaveBar, SettingsCard } from './ui'

/**
 * General: la cuenta en una banda con su color (al elegir otro cambia al instante y hace de vista previa),
 * el color en ventanas de la app en miniatura y sus espacios, cada uno con lo suyo.
 */
export function AccountSettings({ usage }: { usage: Usage | null }) {
  const t = useTranslations('settings.account')
  const tg = useTranslations('nav.groups')
  const te = useTranslations('errors')
  const router = useRouter()
  const { account, members, workspaces } = useApp()
  const isAdmin = useIsAccountAdmin()
  const [name, setName] = useState(account.name)
  const [pending, start] = useTransition()
  const dirty = isAdmin && name.trim() !== account.name
  const owner = members.find((m) => m.id === account.owner_id)
  const initial = (name.trim() || account.name).charAt(0).toUpperCase()

  const save = () =>
    start(async () => {
      const res = await updateAccountName(account.id, name.trim())
      if (res.ok) {
        toast.success(t('saved'))
        router.refresh()
      } else toast.error(te(res.error))
    })

  return (
    <div className="flex flex-1 flex-col">
      {/* la banda es la cabecera de la página: la cuenta misma, en su color (un título «General» encima solo repetía el menú) */}
      <section className="frame-bg on-frame relative overflow-hidden rounded-[20px] px-5 py-5 sm:px-6">
        <h1 className="sr-only">{t('pageTitle')}</h1>
        {/* un brillo suave del acento: la banda no es un rectángulo plano */}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-20 size-56 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative flex items-center gap-4">
          {/* la marca de la cuenta: su logo o la inicial; los admins la tocan para subir o cambiar el logo */}
          <LogoPicker kind="account" id={account.id} hasLogo={!!account.logo_updated_at} canEdit={isAdmin} size={48} radius={15} className="shadow-[0_12px_26px_-12px_oklch(0_0_0/0.6)] rounded-[15px]">
            <AccountLogo
              account={account}
              size={48}
              fallback={
                <span className="flex size-12 shrink-0 items-center justify-center rounded-[15px] bg-accent text-[22px] font-bold text-accent-fg shadow-[0_12px_26px_-12px_oklch(0_0_0/0.6)]">
                  {initial}
                </span>
              }
            />
          </LogoPicker>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{tg('accountSettings')}</p>
            <label htmlFor="a-name" className="sr-only">
              {t('name')}
            </label>
            {isAdmin ? (
              <input
                id="a-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                spellCheck={false}
                title={t('name')}
                className="-ml-1.5 block h-9 w-full max-w-xl rounded-lg border border-transparent bg-transparent px-1.5 text-[22px] font-semibold tracking-[-0.02em] text-fg outline-none transition-colors hover:border-fg/15 focus:border-fg/30 focus:bg-fg/[0.06]"
              />
            ) : (
              <p className="truncate text-[22px] font-semibold tracking-[-0.02em] text-fg">{account.name}</p>
            )}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-fg-muted">
              <span>{t('spacesCount', { count: workspaces.length })}</span>
              <span aria-hidden>·</span>
              <span>{t('peopleCount', { count: usage?.members_count ?? members.length })}</span>
              {owner ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{t('ownedBy', { name: owner.full_name })}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-8">
        <AccountColor />
      </div>

      <AccountSpaces admin={isAdmin} full={usage?.max_workspaces != null && usage.workspaces_count >= usage.max_workspaces} />

      <SaveBar dirty={dirty} pending={pending} onSave={save} onDiscard={() => setName(account.name)} disabled={!name.trim()} />
    </div>
  )
}

/**
 * Los espacios de la cuenta, uno por tarjeta con su color: abrirlo y (admins) sus ajustes; al final,
 * crear otro si queda lugar en el plan.
 */
function AccountSpaces({ admin, full }: { admin: boolean; full: boolean }) {
  const t = useTranslations('settings.account')
  const { workspaces } = useApp()
  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold text-fg">
          {t('spacesTitle')}
          <span className="text-xs font-normal tabular-nums text-fg-subtle">{workspaces.length}</span>
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t('spacesHint')}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
        {workspaces.map((w) => (
          <li key={w.id} className={cn(`ws-${w.color}`, 'group flex min-h-40 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-[box-shadow,border-color] duration-200 ease-out hover:border-line-strong hover:shadow-card')}>
            <div className="flex items-center gap-3 px-4 pb-3 pt-4" style={{ background: 'color-mix(in oklch, var(--ws-color) 9%, var(--panel))' }}>
              <WorkspaceMark ws={w} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg">{w.name}</p>
                <p className="truncate text-xs tabular-nums text-fg-subtle">{w.key}</p>
              </div>
            </div>
            <p className={cn('line-clamp-2 px-4 pt-3 text-xs leading-relaxed', w.description ? 'text-fg-muted' : 'text-fg-subtle')}>{w.description || t('noDescription')}</p>
            <div className="mt-auto flex items-center gap-4 px-4 pb-4 pt-3 text-xs font-medium">
              <Link href={`/w/${w.slug}`} className="inline-flex items-center gap-0.5 text-accent-ink hover:underline">
                {t('openSpace')}
                <ChevronRight className="size-3.5" />
              </Link>
              {admin ? (
                <Link href={`/settings/workspaces/${w.slug}`} className="text-fg-muted hover:text-fg">
                  {t('spaceSettings')}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
        {admin && !full ? (
          <li>
            <Link
              href="/settings/workspaces/new"
              className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm text-fg-muted outline-none transition-colors hover:border-accent-mid hover:bg-accent-soft/40 hover:text-accent-ink focus-visible:border-accent-mid"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-hover">
                <Plus className="size-5" />
              </span>
              <span className="font-medium">{t('newSpace')}</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
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
  return (
    <SettingsCard title={t('colorTitle')} description={isAdmin ? t('colorHint') : t('colorHintMember')} className="mb-0">
      <div className="@container">
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 px-4 py-4 @xl:grid-cols-5 @5xl:grid-cols-10">
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
              className="group/sw flex min-w-0 flex-col gap-2 text-left outline-none disabled:cursor-default"
            >
              <MiniWindow active={active} initial={initial} />
              <TileLabel active={active}>{t(`colors.${b}`)}</TileLabel>
            </button>
          )
        })}
        <CustomColor current={isHex(brand) ? brand : null} disabled={!isAdmin} initial={initial} onSave={save} onPreview={preview} />
      </div>
      </div>
    </SettingsCard>
  )
}

/**
 * Un color como la app en miniatura: el marco en ese color, la barra con la inicial de la cuenta y la
 * hoja con un par de filas. Así se ve cómo va a quedar antes de elegirlo. `rainbow`: «Tu color» sin elegir.
 */
function MiniWindow({ active, initial, rainbow }: { active: boolean; initial: string; rainbow?: boolean }) {
  return (
    <span className="relative block w-full">
      <span
        className={cn(
          'relative block aspect-[16/10] w-full overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-panel transition-[transform,box-shadow] duration-200 ease-out group-focus-visible/sw:ring-accent-mid',
          rainbow ? '[background:conic-gradient(from_200deg,#7c3aed,#2563eb,#0d9488,#16a34a,#ca8a04,#ea580c,#be123c,#7c3aed)]' : 'frame-bg',
          active
            ? 'shadow-[0_14px_28px_-16px_oklch(0.2_0.05_312/0.7)] ring-accent'
            : 'ring-transparent group-enabled/sw:group-hover/sw:-translate-y-0.5 group-enabled/sw:group-hover/sw:shadow-[0_14px_26px_-18px_oklch(0.2_0.05_312/0.7)]',
        )}
      >
        {rainbow ? (
          <span className="absolute inset-0 flex items-center justify-center text-[oklch(0.985_0.006_54.5)]">
            <Plus className="size-6" strokeWidth={2.5} />
          </span>
        ) : (
          <>
            <span className="absolute left-[6%] top-[9%] flex aspect-square w-[15%] items-center justify-center rounded-[24%] bg-accent text-[clamp(8px,0.75vw,13px)] font-bold text-accent-fg">
              {initial}
            </span>
            {[40, 53, 66].map((top) => (
              <span key={top} className="absolute left-[6%] h-[5%] w-[17%] rounded-full bg-[oklch(0.969_0.011_54.5/0.32)]" style={{ top: `${top}%` }} />
            ))}
            <span className="absolute bottom-0 left-[29%] right-0 top-[9%] rounded-tl-[10px] bg-canvas">
              <span className="absolute left-[9%] top-[13%] h-[7%] w-[42%] rounded-full bg-fg/15" />
              {[34, 52, 70].map((top, i) => (
                <span key={top} className="absolute left-[9%] right-[12%] flex h-[7%] items-center gap-[6%]" style={{ top: `${top}%` }}>
                  <span className={cn('aspect-square h-full rounded-full', i === 0 ? 'bg-accent' : 'bg-accent-mid/60')} />
                  <span className="h-full flex-1 rounded-full bg-fg/10" style={{ maxWidth: `${70 - i * 14}%` }} />
                </span>
              ))}
            </span>
          </>
        )}
      </span>
      {active ? (
        <span className="absolute -bottom-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-panel text-accent shadow-card ring-1 ring-line-soft">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
    </span>
  )
}

function TileLabel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <span className={cn('truncate text-xs', active ? 'font-medium text-fg' : 'text-fg-muted')}>{children}</span>
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
  onSave,
  onPreview,
}: {
  current: `#${string}` | null
  disabled: boolean
  initial: string
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
        render={<button type="button" {...(current ? brandAttrs(current) : {})} className="group/sw flex min-w-0 flex-col gap-2 text-left outline-none disabled:cursor-default" />}
      >
        {/* el tuyo como ventana en miniatura, o el arcoíris con + si todavía no tienes */}
        <MiniWindow active={Boolean(current)} initial={initial} rainbow={!current} />
        <TileLabel active={Boolean(current)}>{current ? `${t('customColor')} · ${current.toUpperCase()}` : t('customColor')}</TileLabel>
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
