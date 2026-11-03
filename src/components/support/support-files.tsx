'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CircleAlert, Download, ExternalLink, Paperclip, RotateCw, Upload, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { formatBytes } from '@/components/attachments/attachments'
import { FileKindIcon } from '@/components/vault/file-visual'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip } from '@/components/ui/tooltip'
import { toErrorCode } from '@/lib/errors'
import { uploadSupportFile, type TicketFile, type TicketFileUrl } from '@/lib/queries/support'
import { FILE_ACCEPT, LIMITS, supportMimeOf } from '@/lib/support'
import { cn } from '@/lib/utils'

// Fotos y documentos de un ticket: se suben apenas se eligen (así el error sale antes de enviar)
// y al enviar solo viajan los uploadToken. Pegar, arrastrar o elegir.

export type QueuedFile = {
  key: string
  file: File
  mime: string
  /** vista previa local de las imágenes */
  preview: string | null
  status: 'uploading' | 'done' | 'error'
  token?: string
  error?: string
}

const isImage = (mime: string) => mime.startsWith('image/') && mime !== 'image/heic'

export function useFileQueue() {
  const t = useTranslations('ticket')
  const te = useTranslations('errors')
  const { account } = useApp()
  const [items, setItems] = useState<QueuedFile[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items

  const patch = (key: string, p: Partial<QueuedFile>) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)))

  const upload = useCallback(
    (q: QueuedFile) => {
      patch(q.key, { status: 'uploading', error: undefined })
      uploadSupportFile(account.id, q.file, q.mime)
        .then((token) => patch(q.key, { status: 'done', token }))
        .catch((e) => patch(q.key, { status: 'error', error: te(toErrorCode(e)) }))
    },
    [account.id, te],
  )

  const add = useCallback(
    (files: File[]) => {
      const room = LIMITS.files - itemsRef.current.length
      if (files.length > room) toast.error(t('tooMany', { count: LIMITS.files }))
      const accepted: QueuedFile[] = []
      for (const file of files.slice(0, Math.max(0, room))) {
        const mime = supportMimeOf(file)
        if (!mime) {
          toast.error(t('badType', { name: file.name }))
          continue
        }
        if (file.size > LIMITS.fileBytes) {
          toast.error(t('tooBig', { name: file.name }))
          continue
        }
        if (file.size === 0) {
          toast.error(te('file_empty'))
          continue
        }
        accepted.push({ key: crypto.randomUUID(), file, mime, preview: isImage(mime) ? URL.createObjectURL(file) : null, status: 'uploading' })
      }
      if (!accepted.length) return
      setItems((list) => [...list, ...accepted])
      for (const q of accepted) upload(q)
    },
    [t, te, upload],
  )

  const remove = useCallback((key: string) => {
    setItems((list) => {
      const gone = list.find((x) => x.key === key)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return list.filter((x) => x.key !== key)
    })
  }, [])

  const clear = useCallback(() => {
    for (const x of itemsRef.current) if (x.preview) URL.revokeObjectURL(x.preview)
    setItems([])
  }, [])

  // al desmontar, las vistas previas se sueltan
  useEffect(() => () => itemsRef.current.forEach((x) => x.preview && URL.revokeObjectURL(x.preview)), [])

  /** Pegar capturas o archivos (⌘V) en el formulario. */
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files)
      if (!files.length) return
      e.preventDefault()
      // las capturas pegadas llegan como «image.png»: se les da un nombre que se entienda
      add(files.map((f, i) => (f.name === 'image.png' ? new File([f], `${t('pastedName')}-${Date.now().toString(36)}${i ? `-${i}` : ''}.png`, { type: f.type }) : f)))
    },
    [add, t],
  )

  return {
    items,
    add,
    remove,
    clear,
    retry: (key: string) => {
      const q = itemsRef.current.find((x) => x.key === key)
      if (q) upload(q)
    },
    onPaste,
    uploading: items.some((x) => x.status === 'uploading'),
    failed: items.some((x) => x.status === 'error'),
    full: items.length >= LIMITS.files,
    /** lo que va en `files` al enviar */
    payload: () => items.filter((x) => x.status === 'done' && x.token).map((x) => ({ uploadToken: x.token!, name: x.file.name })),
  }
}

export type FileQueue = ReturnType<typeof useFileQueue>

/** Arrastrar archivos sobre un área: devuelve si hay algo encima y los manejadores. */
export function useDropTarget(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setOver(true)
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
      },
      onDrop: (e: React.DragEvent) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setOver(false)
        onFiles(Array.from(e.dataTransfer.files))
      },
    },
  }
}

/** El área para soltar o elegir archivos, con los límites a la vista. */
export function FileDropzone({ queue, className }: { queue: FileQueue; className?: string }) {
  const t = useTranslations('ticket')
  const input = useRef<HTMLInputElement>(null)
  const drop = useDropTarget(queue.add)
  return (
    <div className={className}>
      <div
        {...drop.props}
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed px-3 py-3 transition-colors',
          drop.over ? 'border-accent-mid bg-accent-soft/60' : 'border-line-strong bg-canvas',
          queue.full && 'opacity-60',
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-hover text-fg-muted">
          <Upload className="size-4" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 text-sm text-fg-muted">
          {drop.over ? (
            <span className="font-medium text-accent-ink">{t('dropHere')}</span>
          ) : (
            <>
              {t('drop')}{' '}
              <button
                type="button"
                disabled={queue.full}
                onClick={() => input.current?.click()}
                className="font-medium text-accent-ink underline decoration-accent-mid/40 underline-offset-2 hover:decoration-accent-mid disabled:no-underline"
              >
                {t('choose')}
              </button>
            </>
          )}
          <span className="block text-xs text-fg-subtle">{t('filesHint', { count: LIMITS.files })}</span>
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            queue.add(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>
      <QueuedFiles queue={queue} className="mt-2.5" />
    </div>
  )
}

/** Botón de clip (en el compositor de respuestas). */
export function AttachButton({ queue }: { queue: FileQueue }) {
  const t = useTranslations('ticket')
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Tooltip content={queue.full ? t('tooMany', { count: LIMITS.files }) : t('attach')}>
        <button
          type="button"
          disabled={queue.full}
          onClick={() => input.current?.click()}
          aria-label={t('attach')}
          className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
        >
          <Paperclip className="size-4" />
        </button>
      </Tooltip>
      <input
        ref={input}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          queue.add(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </>
  )
}

/** Lo que se va a enviar: miniatura para las imágenes, ícono + nombre + tamaño para lo demás. */
export function QueuedFiles({ queue, className }: { queue: FileQueue; className?: string }) {
  const t = useTranslations('ticket')
  if (!queue.items.length) return null
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {queue.items.map((q) => (
        <li key={q.key} className="group/file relative">
          {q.preview ? (
            <span className="relative block size-16 overflow-hidden rounded-lg border border-line bg-hover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.preview} alt={q.file.name} className="size-full object-cover" />
              <UploadState q={q} onRetry={() => queue.retry(q.key)} overlay />
            </span>
          ) : (
            <span
              className={cn(
                'flex h-16 w-52 items-center gap-2.5 rounded-lg border bg-panel px-2.5',
                q.status === 'error' ? 'border-danger/40' : 'border-line',
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-hover">
                <FileKindIcon a={{ kind: 'file', mime_type: q.mime, name: q.file.name }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg" title={q.file.name}>
                  {q.file.name}
                </span>
                <span className={cn('block truncate text-xs', q.status === 'error' ? 'text-danger' : 'text-fg-subtle')}>
                  {q.status === 'error' ? q.error : q.status === 'uploading' ? t('uploading') : formatBytes(q.file.size)}
                </span>
              </span>
              <UploadState q={q} onRetry={() => queue.retry(q.key)} />
            </span>
          )}
          <button
            type="button"
            onClick={() => queue.remove(q.key)}
            aria-label={t('remove', { name: q.file.name })}
            className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-fg text-canvas opacity-0 shadow-card ring-2 ring-panel transition-opacity focus-visible:opacity-100 group-hover/file:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function UploadState({ q, onRetry, overlay }: { q: QueuedFile; onRetry: () => void; overlay?: boolean }) {
  const t = useTranslations('ticket')
  if (q.status === 'done') return null
  const body =
    q.status === 'uploading' ? (
      <Spinner className="size-4" />
    ) : (
      <Tooltip content={`${q.error ?? t('uploadError')} · ${t('retry')}`}>
        <button type="button" onClick={onRetry} aria-label={t('retry')} className="inline-flex size-7 items-center justify-center rounded-md text-danger hover:bg-danger-soft">
          {overlay ? <CircleAlert className="size-4" /> : <RotateCw className="size-4" />}
        </button>
      </Tooltip>
    )
  return overlay ? <span className="absolute inset-0 flex items-center justify-center bg-panel/70">{body}</span> : <span className="shrink-0">{body}</span>
}

/**
 * Los archivos de un mensaje ya enviado: miniaturas que abren la vista previa y documentos con
 * abrir y descargar. Las URLs firmadas llegan aparte (`urls`), así la lista se dibuja enseguida.
 */
export function SentFiles({ files, urls, className }: { files: TicketFile[]; urls: Map<string, TicketFileUrl> | undefined; className?: string }) {
  const t = useTranslations('ticket')
  const [viewing, setViewing] = useState<TicketFileUrl | null>(null)
  if (!files.length) return null
  const images = files.filter((f) => isImage(f.mimeType))
  const docs = files.filter((f) => !isImage(f.mimeType))
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {images.length ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((f) => {
            const u = urls?.get(f.id)
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => u && setViewing(u)}
                  disabled={!u}
                  aria-label={t('preview', { name: f.name })}
                  className="block h-24 w-32 overflow-hidden rounded-lg border border-line bg-hover transition-[box-shadow,transform] duration-150 ease-out hover:shadow-card active:scale-[0.98]"
                >
                  {u ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.url} alt={f.name} className="size-full object-cover" loading="lazy" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {docs.length ? (
        <ul className="flex flex-wrap gap-2">
          {docs.map((f) => {
            const u = urls?.get(f.id)
            return (
              <li key={f.id} className="flex h-12 w-64 max-w-full items-center gap-2.5 rounded-lg border border-line bg-panel pl-2.5 pr-1">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-hover">
                  <FileKindIcon a={{ kind: 'file', mime_type: f.mimeType, name: f.name }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg" title={f.name}>
                    {f.name}
                  </span>
                  <span className="block text-xs tabular-nums text-fg-subtle">{formatBytes(f.sizeBytes)}</span>
                </span>
                {u?.inline ? (
                  <Tooltip content={t('open')}>
                    <a href={u.url} target="_blank" rel="noopener noreferrer" aria-label={`${t('open')} ${f.name}`} className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
                      <ExternalLink className="size-4" />
                    </a>
                  </Tooltip>
                ) : null}
                <Tooltip content={t('download')}>
                  <a
                    href={u?.downloadUrl}
                    aria-disabled={!u}
                    aria-label={`${t('download')} ${f.name}`}
                    className={cn('inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg', !u && 'pointer-events-none opacity-40')}
                  >
                    <Download className="size-4" />
                  </a>
                </Tooltip>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl overflow-hidden p-0" hideClose>
          {viewing ? (
            <figure className="flex flex-col">
              <div className="flex max-h-[72vh] min-h-48 items-center justify-center bg-sidebar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewing.url} alt={viewing.name} className="max-h-[72vh] w-auto max-w-full object-contain" />
              </div>
              <figcaption className="flex items-center gap-2 border-t border-line px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{viewing.name}</span>
                <span className="text-xs tabular-nums text-fg-subtle">{formatBytes(viewing.sizeBytes)}</span>
                <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:bg-hover hover:text-fg">
                  <ExternalLink className="size-4" />
                  {t('open')}
                </a>
                <a href={viewing.downloadUrl} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:bg-hover hover:text-fg">
                  <Download className="size-4" />
                  {t('download')}
                </a>
                <button type="button" onClick={() => setViewing(null)} aria-label={t('closePreview')} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg">
                  <X className="size-4" />
                </button>
              </figcaption>
            </figure>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
