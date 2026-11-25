'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, ChevronRight, Clock, Folder, HardDrive, Lock, Search, Users, X } from 'lucide-react'
import { formatBytes } from '@/components/attachments/attachments'
import { DriveFileIcon } from '@/components/mail/mail-drive'
import { ConnectMailButton } from '@/components/mail/mail-connect'
import { errorCode, useMailError } from '@/components/mail/mail-errors'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { DRIVE_EXPORT, isGoogleNative, type ApiDriveFile, type ApiMailbox } from '@/lib/api/correo'
import { uploadMimeOf } from '@/lib/api/pasillo-boveda'
import { shortDate, useDateLocale } from '@/lib/dates'
import { useDebounced } from '@/lib/hooks'
import { MAX_FILE_BYTES } from '@/lib/queries/attachments'
import { useDriveBrowse, useMailboxes, type DriveView } from '@/lib/queries/mail'
import { cn } from '@/lib/utils'

/** Lo elegido en Drive: de qué cuenta y qué archivos. */
export type DriveSelection = { box: string | null; files: ApiDriveFile[] }

/** Por qué un archivo de Drive no se puede copiar a la Bóveda (o null si se puede). */
export function driveProblem(f: ApiDriveFile): 'notExportable' | 'badType' | 'tooBig' | null {
  if (isGoogleNative(f.mimeType)) return DRIVE_EXPORT[f.mimeType] ? null : 'notExportable'
  if (!uploadMimeOf({ name: f.name, type: f.mimeType })) return 'badType'
  if ((f.size ?? 0) > MAX_FILE_BYTES) return 'tooBig'
  return null
}

type Tab = 'recent' | 'mine' | 'shared'
const TABS: { id: Tab; icon: typeof Clock }[] = [
  { id: 'recent', icon: Clock },
  { id: 'mine', icon: HardDrive },
  { id: 'shared', icon: Users },
]

/**
 * Traer archivos de Google Drive a la Bóveda: lo último que se abrió, Mi unidad (con sus carpetas) y
 * lo compartido conmigo, o una búsqueda por nombre. Se marcan los archivos y, al confirmar, la Bóveda
 * los copia (los de Google, convertidos: Documentos y Presentaciones a PDF, Hojas a Excel). Ver Drive
 * viene con el correo; bajar archivos es un permiso aparte que se pide aquí, solo si hace falta.
 * OneDrive, próximamente.
 */
export function DriveImport({ value, onChange, disabled }: { value: DriveSelection; onChange: (v: DriveSelection) => void; disabled?: boolean }) {
  const t = useTranslations('vault.drive')
  const locale = useDateLocale()
  const mailError = useMailError()
  const boxes = useMailboxes()
  const google = (boxes.data?.items ?? []).filter((b) => b.provider === 'google')
  const usable = google.filter((b) => b.canDrive)
  const box = usable.find((b) => b.id === value.box) ?? usable[0] ?? null

  const [tab, setTab] = useState<Tab>('recent')
  // Mi unidad: la carpeta abierta y el camino hasta ella
  const [path, setPath] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState('')
  const term = useDebounced(search.trim(), 300)

  // la cuenta de entrada (y si cambia, se empieza de cero)
  useEffect(() => {
    if (box && value.box !== box.id) onChange({ box: box.id, files: [] })
  }, [box, value.box, onChange])

  const view: DriveView = term
    ? { kind: 'search', q: term }
    : tab === 'shared'
      ? { kind: 'shared' }
      : tab === 'mine'
        ? { kind: 'folder', id: path.at(-1)?.id ?? 'root' }
        : { kind: 'recent' }
  const list = useDriveBrowse(box?.id ?? null, view, Boolean(box))
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const code = list.error ? errorCode(list.error) : null
  const chosen = new Set(value.files.map((f) => f.id))

  const toggle = (f: ApiDriveFile) =>
    onChange({ box: box?.id ?? null, files: chosen.has(f.id) ? value.files.filter((x) => x.id !== f.id) : [...value.files, f] })
  const openFolder = (f: ApiDriveFile) => {
    setSearch('')
    setTab('mine')
    setPath((p) => (tab === 'mine' && !term ? [...p, { id: f.id, name: f.name }] : [{ id: f.id, name: f.name }]))
  }

  // sin cuenta de Google con Drive: conectarla (vuelve aquí con la Bóveda abierta en Drive)
  if (boxes.isLoading) return <Skeleton className="h-64" />
  if (!box) {
    const sendOnly = google.length > 0
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-hover text-fg-muted">
          <HardDrive className="size-5" />
        </span>
        <p className="text-sm font-semibold text-fg">{sendOnly ? t('needDriveTitle') : t('connectTitle')}</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-fg-muted">{sendOnly ? t('needDriveBody') : t('connectBody')}</p>
        <ConnectMailButton label={sendOnly ? t('grantDrive') : t('connect')} size="sm" returnTo="/vault?drive=1" />
        <Sources />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sources />
        {usable.length > 1 ? <AccountPicker boxes={usable} box={box} onPick={(id) => onChange({ box: id, files: [] })} /> : null}
      </div>

      {/* sin el permiso de bajar archivos se puede mirar, pero no copiar: se pide aquí */}
      {!box.canDriveFiles ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warning-soft/70 px-3.5 py-2.5">
          <Lock className="size-4 shrink-0 text-fg-muted" />
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg">
            <span className="font-semibold">{t('permissionTitle')}</span> {t('permissionBody')}
          </p>
          <ConnectMailButton label={t('grant')} size="sm" purpose="driveFiles" returnTo="/vault?drive=1" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg bg-hover p-0.5" role="tablist" aria-label={t('views')}>
          {TABS.map(({ id, icon: Icon }) => {
            const on = !term && tab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setSearch('')
                  setTab(id)
                  if (id === 'mine') setPath([])
                }}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                  on ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-3.5" />
                {t(`tabs.${id}`)}
              </button>
            )
          })}
        </div>
        <div className="relative ml-auto flex min-w-48 flex-1 items-center sm:max-w-64">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="h-8 w-full rounded-lg border border-line bg-canvas pl-8 pr-7 text-sm outline-none placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} aria-label={t('clearSearch')} className="absolute right-1.5 rounded p-0.5 text-fg-subtle hover:text-fg">
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* dónde se está: la carpeta abierta (Mi unidad › …) o la búsqueda */}
      {!term && tab === 'mine' ? (
        <nav aria-label={t('path')} className="-mt-1 flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
          <button type="button" onClick={() => setPath([])} className={cn('rounded px-1 py-0.5 hover:bg-hover', path.length ? 'text-fg-muted' : 'font-medium text-fg')}>
            {t('myDrive')}
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" />
              <button
                type="button"
                onClick={() => setPath((x) => x.slice(0, i + 1))}
                className={cn('max-w-48 truncate rounded px-1 py-0.5 hover:bg-hover', i === path.length - 1 ? 'font-medium text-fg' : 'text-fg-muted')}
              >
                {p.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      <div className="-mx-1 max-h-[min(42vh,360px)] min-h-56 overflow-y-auto px-1 scrollbar-thin">
        {list.isLoading ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : code ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="max-w-sm text-sm text-fg-muted">{mailError(list.error)}</p>
            {code === 'drive_scope_missing' || code === 'mail_auth_revoked' ? <ConnectMailButton label={t('grantDrive')} size="sm" returnTo="/vault?drive=1" /> : null}
          </div>
        ) : !items.length ? (
          <p className="px-6 py-12 text-center text-sm text-fg-muted">
            {term ? t('noResults', { q: term }) : tab === 'mine' ? t('emptyFolder') : tab === 'shared' ? t('emptyShared') : t('emptyRecent')}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((f) =>
              f.folder ? (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => openFolder(f)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                  >
                    <span className="flex size-5 shrink-0" />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklch,#5F6368_14%,transparent)] text-[#5F6368] dark:text-fg-muted">
                      <Folder className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-fg">{f.name}</span>
                      <span className="block truncate text-2xs text-fg-subtle">{[t('folder'), f.owner].filter(Boolean).join(' · ')}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                  </button>
                </li>
              ) : (
                <DriveRow key={f.id} file={f} checked={chosen.has(f.id)} disabled={disabled} onToggle={() => toggle(f)} locale={locale} />
              ),
            )}
            {list.hasNextPage ? (
              <li className="pt-1">
                <button
                  type="button"
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className="w-full rounded-xl py-2 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-60"
                >
                  {list.isFetchingNextPage ? t('loading') : t('more')}
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  )
}

function DriveRow({
  file: f,
  checked,
  disabled,
  onToggle,
  locale,
}: {
  file: ApiDriveFile
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  locale: ReturnType<typeof useDateLocale>
}) {
  const t = useTranslations('vault.drive')
  const problem = driveProblem(f)
  const converted = DRIVE_EXPORT[f.mimeType]
  const meta = [f.owner, f.modified ? shortDate(new Date(f.modified), locale) : null, f.size ? formatBytes(f.size) : null].filter(Boolean).join(' · ')
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={Boolean(problem) || disabled}
        onClick={() => !problem && !disabled && onToggle()}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
          problem ? 'cursor-not-allowed opacity-60' : checked ? 'bg-accent-soft/70' : 'hover:bg-hover',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
            checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-panel',
            problem && 'border-dashed',
          )}
        >
          {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
        <DriveFileIcon mime={f.mimeType} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-fg">{f.name}</span>
          <span className={cn('block truncate text-2xs', problem ? 'text-danger' : 'text-fg-subtle')}>
            {problem ? t(`problem.${problem}`) : converted ? `${meta}${meta ? ' · ' : ''}${t('convertsTo', { ext: converted.ext.toUpperCase() })}` : meta}
          </span>
        </span>
      </button>
    </li>
  )
}

/** De dónde se trae: Google Drive (ya) y OneDrive (próximamente). */
function Sources() {
  const t = useTranslations('vault.drive')
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-fg px-2.5 font-medium text-canvas">
        <HardDrive className="size-3.5" />
        Google Drive
      </span>
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 text-fg-muted" title={t('soon')}>
        OneDrive
        <span className="rounded-full bg-hover px-1.5 py-px text-[10.5px] font-medium text-fg-subtle">{t('soon')}</span>
      </span>
    </div>
  )
}

function AccountPicker({ boxes, box, onPick }: { boxes: ApiMailbox[]; box: ApiMailbox; onPick: (id: string) => void }) {
  return (
    <Menu>
      <MenuTrigger className="ml-auto inline-flex h-7 max-w-56 items-center gap-1 rounded-lg px-2 text-xs text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid">
        <span className="truncate">{box.email}</span>
        <ChevronDown className="size-3 shrink-0" />
      </MenuTrigger>
      <MenuContent align="end" className="w-64">
        {boxes.map((b) => (
          <MenuItem key={b.id} onClick={() => onPick(b.id)}>
            <span className="min-w-0 flex-1 truncate">{b.email}</span>
            {b.id === box.id ? <Check className="!text-accent" /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
