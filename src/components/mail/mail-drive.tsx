'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { File as FileIcon, FileImage, FileSpreadsheet, FileText, FileVideo, Lock, Presentation, Search } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { shortDate, useDateLocale } from '@/lib/dates'
import { useDebounced } from '@/lib/hooks'
import type { ApiDriveFile } from '@/lib/api/correo'
import { useMailDrive } from '@/lib/queries/mail'
import { cn } from '@/lib/utils'
import { errorCode, useMailError } from './mail-errors'
import { MailReconnect } from './mail-connect'

/**
 * Insertar un archivo de Drive en un correo: sin buscar, los últimos que tocaste; si no, por nombre.
 * Al elegirlo entra su enlace al texto. Si solo tú puedes abrirlo, se avisa antes (quien lo reciba no
 * lo verá hasta que lo compartas en Drive).
 */
export function DriveInsertDialog({
  box,
  open,
  onOpenChange,
  onPick,
}: {
  box: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (file: ApiDriveFile) => void
}) {
  const t = useTranslations('mail.drive')
  const locale = useDateLocale()
  const mailError = useMailError()
  const [q, setQ] = useState('')
  const term = useDebounced(q, 300)
  const files = useMailDrive(box, term, open)
  const code = files.error ? errorCode(files.error) : null
  const items = files.data?.items ?? []

  useEffect(() => {
    if (open) setQ('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader title={t('title')} description={t('description')} />
        <DialogBody className="flex flex-col gap-3 pb-5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 size-4 text-fg-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              className="h-10 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-sm text-fg outline-none placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid"
            />
          </div>
          <p className="px-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{term.trim() ? t('results') : t('recent')}</p>
          <div className="-mx-2 max-h-[min(52vh,420px)] min-h-40 overflow-y-auto px-0.5 scrollbar-thin">
            {files.isLoading ? (
              <div className="flex flex-col gap-1.5 px-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : code ? (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <p className="max-w-sm text-sm text-fg-muted">{mailError(files.error)}</p>
                {code === 'drive_scope_missing' ? <MailReconnect label={t('grant')} /> : null}
              </div>
            ) : !items.length ? (
              <p className="px-6 py-10 text-center text-sm text-fg-muted">{term.trim() ? t('noResults', { q: term.trim() }) : t('empty')}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {items.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(f)
                        onOpenChange(false)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                    >
                      <DriveFileIcon mime={f.mimeType} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-fg">{f.name}</span>
                        <span className="block truncate text-2xs text-fg-subtle">
                          {[f.owner, f.modified ? shortDate(new Date(f.modified), locale) : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {f.shared ? null : (
                        <span title={t('privateHint')} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-medium text-fg">
                          <Lock className="size-3" />
                          {t('private')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** El ícono de un archivo de Drive por su tipo, con el color de su app (Documentos, Hojas, Presentaciones…). */
export function DriveFileIcon({ mime, className }: { mime: string; className?: string }) {
  const [Icon, color] = mime.includes('google-apps.document')
    ? [FileText, '#4285F4']
    : mime.includes('google-apps.spreadsheet') || mime.includes('sheet') || mime.includes('excel')
      ? [FileSpreadsheet, '#0F9D58']
      : mime.includes('google-apps.presentation') || mime.includes('presentation') || mime.includes('powerpoint')
        ? [Presentation, '#F4B400']
        : mime === 'application/pdf'
          ? [FileText, '#DB4437']
          : mime.startsWith('image/')
            ? [FileImage, '#A142F4']
            : mime.startsWith('video/')
              ? [FileVideo, '#DB4437']
              : [FileIcon, '#5F6368']
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', className)} style={{ background: `color-mix(in oklch, ${color} 14%, transparent)`, color }}>
      <Icon className="size-[18px]" />
    </span>
  )
}
