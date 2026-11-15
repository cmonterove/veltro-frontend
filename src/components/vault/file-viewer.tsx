'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { Check, ChevronDown, Download, ExternalLink, FileQuestion, History, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip } from '@/components/ui/tooltip'
import { formatBytes } from '@/components/attachments/attachments'
import { isInlineType } from '@/lib/api/pasillo-boveda'
import { openAttachment, useAttachmentVersions, versionUrl } from '@/lib/queries/attachments'
import { track } from '@/lib/telemetry'
import type { AttachmentRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { FileKindIcon, fileTitle } from './file-visual'

/** ¿Se puede ver dentro de Veltro? (imágenes, PDF, audio y video; lo demás se baja). */
export const canPreview = (a: Pick<AttachmentRow, 'kind' | 'mime_type'>) => a.kind === 'file' && isInlineType(a.mime_type)

// Un solo visor para toda la app: cualquier lista de archivos (Pasillo, tareas, espacios) lo abre.
let shown: AttachmentRow | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}

/** Ver el archivo en Veltro si se puede (imagen, PDF, audio, video); si no, abrirlo o bajarlo como siempre. */
export function previewOrOpen(a: AttachmentRow) {
  if (canPreview(a)) {
    shown = a
    emit()
  } else void openAttachment(a)
}

/** Monta el visor compartido (va una vez, en el armazón de la app). */
export function FileViewerHost() {
  const file = useSyncExternalStore(subscribe, () => shown, () => null)
  if (!file) return null
  return (
    <FileViewer
      file={file}
      open
      onOpenChange={(o) => {
        if (!o) {
          shown = null
          emit()
        }
      }}
    />
  )
}

/**
 * Ver un archivo sin bajarlo: imagen, PDF, audio o video, a pantalla casi completa. Si tiene
 * versiones, arriba se elige cuál ver. Bajar y abrir en otra pestaña quedan a mano.
 */
export function FileViewer({ file, open, onOpenChange, initialVersion = 'current' }: { file: AttachmentRow; open: boolean; onOpenChange: (o: boolean) => void; initialVersion?: string }) {
  const t = useTranslations('vault.viewer')
  const locale = useLocale()
  const [versionId, setVersionId] = useState(initialVersion)
  useEffect(() => {
    if (open) setVersionId(initialVersion)
  }, [open, initialVersion])
  const hasVersions = (file.version ?? 1) > 1
  const { data: versions } = useAttachmentVersions(file.id, open && hasVersions)
  const current = versions?.find((v) => v.id === versionId)
  const mime = current?.mimeType ?? file.mime_type
  const previewable = isInlineType(mime)

  // la URL en línea (5 min) de lo que se ve; se renueva al volver a abrir
  const { data, isLoading, isError } = useQuery({
    queryKey: ['attachments', 'inline', file.id, versionId, file.version],
    enabled: open && file.kind === 'file' && previewable,
    staleTime: 4 * 60_000,
    queryFn: () => versionUrl(file.id, versionId, true),
  })

  useEffect(() => {
    if (open) track('feature.file_viewer', { workspaceId: file.workspace_id })
  }, [open, file.workspace_id])

  // El PDF se muestra desde una copia en el navegador (blob:): el almacenamiento no deja que otra
  // página lo enmarque (frame-ancestors), pero sí bajarlo.
  const isPdf = Boolean(mime?.includes('pdf'))
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState(false)
  useEffect(() => {
    if (!isPdf || !data?.url) return
    let alive = true
    let made: string | null = null
    setPdfUrl(null)
    setPdfError(false)
    fetch(data.url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!alive) return
        made = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }))
        setPdfUrl(made)
      })
      .catch(() => alive && setPdfError(true))
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [isPdf, data?.url])

  const download = async () => {
    const res = await versionUrl(file.id, versionId, false)
    const link = document.createElement('a')
    link.href = res.url
    link.download = res.name
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
  const name = current?.name ?? file.name
  const isOld = versionId !== 'current'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex h-[88vh] w-[min(96vw,1200px)] max-w-none flex-col overflow-hidden p-0 sm:-mt-[6vh]">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <FileKindIcon a={file} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{fileTitle(file)}</p>
            <p className="truncate text-xs text-fg-subtle">
              {name}
              {(current?.sizeBytes ?? file.size_bytes) ? ` · ${formatBytes(current?.sizeBytes ?? file.size_bytes ?? 0)}` : ''}
            </p>
          </div>
          {hasVersions ? (
            <Menu>
              <MenuTrigger
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none transition-colors',
                  isOld ? 'border-mandarina/40 bg-warning-soft text-mandarina-ink' : 'border-line text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                <History className="size-3.5" />
                {t('version', { version: current?.version ?? file.version ?? 1 })}
                {isOld ? ` · ${t('old')}` : ''}
                <ChevronDown className="size-3.5" />
              </MenuTrigger>
              <MenuContent align="end" className="w-72">
                <MenuLabel>{t('versions')}</MenuLabel>
                {(versions ?? []).map((v) => (
                  <MenuItem key={v.id} onClick={() => setVersionId(v.id)}>
                    <span className="w-8 shrink-0 font-mono text-xs text-fg-subtle">v{v.version}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{v.current ? t('current') : v.name}</span>
                      <span className="block truncate text-2xs text-fg-subtle">
                        {v.uploader?.fullName ?? ''} · {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v.uploadedAt))}
                      </span>
                    </span>
                    {v.id === versionId ? <Check className="!text-fg" /> : null}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
          <Tooltip content={t('download')}>
            <Button variant="ghost" size="icon-sm" onClick={download} aria-label={t('download')}>
              <Download />
            </Button>
          </Tooltip>
          {data?.url ? (
            <Tooltip content={t('newTab')}>
              <a href={data.url} target="_blank" rel="noopener noreferrer" aria-label={t('newTab')} className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
                <ExternalLink className="size-4" />
              </a>
            </Tooltip>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label={t('close')}>
            <X />
          </Button>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[oklch(0.2_0.02_310)]">
          {!previewable ? (
            <NoPreview onDownload={download} />
          ) : isLoading ? (
            <Spinner className="size-6 text-white/70" />
          ) : isError || !data ? (
            <NoPreview onDownload={download} error />
          ) : mime?.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.url} alt={fileTitle(file)} className="max-h-full max-w-full object-contain" />
          ) : isPdf ? (
            pdfError ? (
              <NoPreview onDownload={download} error />
            ) : pdfUrl ? (
              <iframe src={pdfUrl} title={fileTitle(file)} className="size-full border-0 bg-white" />
            ) : (
              <Spinner className="size-6 text-white/70" />
            )
          ) : mime?.startsWith('video/') ? (
            <video src={data.url} controls className="max-h-full max-w-full" />
          ) : mime?.startsWith('audio/') ? (
            <audio src={data.url} controls className="w-[min(90%,520px)]" />
          ) : (
            <NoPreview onDownload={download} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NoPreview({ onDownload, error }: { onDownload: () => void; error?: boolean }) {
  const t = useTranslations('vault.viewer')
  return (
    <div className="flex flex-col items-center gap-3 px-6 text-center text-white/80">
      <FileQuestion className="size-10 text-white/50" />
      <p className="max-w-sm text-sm">{error ? t('error') : t('noPreview')}</p>
      <Button size="sm" onClick={onDownload}>
        <Download />
        {t('download')}
      </Button>
    </div>
  )
}
