'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'
const MAX_CHARS = 340_000 // ~256 KB en base64

const OUT = 256
type Rgba = [number, number, number, number]

function loadImage(file: File): Promise<{ img: HTMLImageElement; done: () => void }> {
  const src = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve({ img: el, done: () => URL.revokeObjectURL(src) })
    el.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error('image'))
    }
    el.src = src
  })
}

const near = (a: Rgba, b: Rgba, tol: number) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol && Math.abs(a[3] - b[3]) <= tol

/**
 * Prepara el logo en el navegador antes de subirlo, para que se vea bien en una baldosa cuadrada:
 * - quita los márgenes sobrantes (transparentes, o del color de fondo que tienen las cuatro esquinas);
 * - lo centra en un cuadrado de 256 px con un aire parejo, sobre su propio fondo si lo tiene;
 * - sale como PNG (conserva la transparencia). Si aún pesara mucho, prueba más chico.
 */
async function toLogoDataUrl(file: File): Promise<string> {
  const { img, done } = await loadImage(file)
  try {
    const iw = img.naturalWidth || 512
    const ih = img.naturalHeight || 512
    // una copia de trabajo de hasta 512 px para leer los píxeles
    const k = Math.min(1, 512 / Math.max(iw, ih))
    const w = Math.max(1, Math.round(iw * k))
    const h = Math.max(1, Math.round(ih * k))
    const work = document.createElement('canvas')
    work.width = w
    work.height = h
    const wctx = work.getContext('2d', { willReadFrequently: true })!
    wctx.drawImage(img, 0, 0, w, h)
    const data = wctx.getImageData(0, 0, w, h).data
    const px = (x: number, y: number): Rgba => {
      const i = (y * w + x) * 4
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
    }
    const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)]
    const transparent = corners.every((c) => c[3] < 16)
    const solid = !transparent && corners.every((c) => c[3] > 240 && near(c, corners[0]!, 18))
    const bg: Rgba | null = transparent ? [0, 0, 0, 0] : solid ? corners[0]! : null

    // el recuadro de lo que no es fondo
    let x0 = 0
    let y0 = 0
    let x1 = w - 1
    let y1 = h - 1
    if (bg) {
      const isBg = (c: Rgba) => (transparent ? c[3] < 16 : near(c, bg, 24))
      x0 = w
      y0 = h
      x1 = -1
      y1 = -1
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (!isBg(px(x, y))) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
      if (x1 < 0) throw new Error('image') // todo fondo: no hay logo
    }
    // en el original
    const sx = x0 / k
    const sy = y0 / k
    const sw = (x1 - x0 + 1) / k
    const sh = (y1 - y0 + 1) / k

    for (const size of [OUT, 192, 128]) {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      // con fondo propio, la baldosa entera es de ese color; transparente, queda transparente
      if (solid && bg) {
        ctx.fillStyle = `rgb(${bg[0]} ${bg[1]} ${bg[2]})`
        ctx.fillRect(0, 0, size, size)
      }
      // aire alrededor solo si se recortó (una imagen sin fondo que recortar va de borde a borde)
      const room = bg ? size * (1 - 2 * 0.12) : size
      const scale = Math.min(room / sw, room / sh)
      const dw = sw * scale
      const dh = sh * scale
      ctx.drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh)
      const url = canvas.toDataURL('image/png')
      if (url.length <= MAX_CHARS) return url
    }
    throw new Error('size')
  } finally {
    done()
  }
}

/**
 * Subir y quitar el logo de una cuenta o de un espacio. Mientras sube, `preview` trae la imagen nueva
 * para mostrarla al instante; al terminar refresca la página y la marca de siempre ya trae el logo.
 */
function useLogoUpload(kind: 'account' | 'workspace', id: string) {
  const t = useTranslations('logo')
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const path = `/v1/${kind === 'account' ? 'accounts' : 'workspaces'}/${id}/logo`

  const upload = (file: File) =>
    start(async () => {
      let image: string
      try {
        image = await toLogoDataUrl(file)
      } catch (e) {
        toast.error((e as Error).message === 'size' ? t('tooBig') : t('invalid'))
        return
      }
      setPreview(image)
      try {
        await api(path, { method: 'PUT', body: { image } })
        toast.success(t('saved'))
        router.refresh()
      } catch {
        setPreview(null)
        toast.error(t('error'))
      }
    })

  const remove = () =>
    start(async () => {
      try {
        await api(path, { method: 'DELETE' })
        setPreview(null)
        toast.success(t('removed'))
        router.refresh()
      } catch {
        toast.error(t('error'))
      }
    })

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) upload(f)
      }}
    />
  )

  return { t, preview, pending, pick: () => input.current?.click(), remove, fileInput }
}

function PreviewTile({ src, radius }: { src: string; size?: number; radius: number }) {
  return (
    <span className="logo-tile flex size-full items-center justify-center overflow-hidden" style={{ borderRadius: radius }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-contain" />
    </span>
  )
}

/**
 * La marca (logo o inicial) que se toca para subir un logo: al pasar el mouse aparece la imagen con
 * un «+» y, si ya hay uno, la «×» para quitarlo. Sin permiso, solo la marca.
 */
export function LogoPicker({
  kind,
  id,
  hasLogo,
  canEdit,
  size,
  radius,
  children,
  className,
}: {
  kind: 'account' | 'workspace'
  id: string
  hasLogo: boolean
  canEdit: boolean
  size: number
  radius: number
  /** la marca de siempre (AccountLogo o WorkspaceMark) */
  children: React.ReactNode
  className?: string
}) {
  const { t, preview, pending, pick, remove, fileInput } = useLogoUpload(kind, id)
  if (!canEdit) return <>{children}</>

  return (
    <span className={cn('group/logo relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={pick}
        disabled={pending}
        aria-label={hasLogo ? t('change') : t('upload')}
        title={hasLogo ? t('change') : t('upload')}
        className="relative block size-full outline-none focus-visible:ring-2 focus-visible:ring-accent-mid focus-visible:ring-offset-2"
        style={{ borderRadius: radius }}
      >
        {preview ? <PreviewTile src={preview} size={size} radius={radius} /> : children}
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-[oklch(0.2_0.02_300/0.5)] text-[oklch(0.985_0.006_54.5)] transition-opacity duration-150',
            pending ? 'opacity-100' : 'opacity-0 group-hover/logo:opacity-100 group-focus-within/logo:opacity-100',
          )}
          style={{ borderRadius: radius }}
          aria-hidden
        >
          {pending ? <Loader2 className="size-2/5 animate-spin" /> : <ImagePlus className="size-2/5" />}
        </span>
      </button>
      {hasLogo || preview ? (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={t('remove')}
          title={t('remove')}
          className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-panel text-fg-muted shadow-card ring-1 ring-line hover:text-danger group-hover/logo:flex group-focus-within/logo:flex"
        >
          <X className="size-3" />
        </button>
      ) : null}
      {fileInput}
    </span>
  )
}

/**
 * La marca con sus botones a la vista («Subir logo» / «Cambiar» y «Quitar»): para la pantalla de
 * ajustes, donde subir el logo es una de las cosas que se vienen a hacer.
 */
export function LogoField({
  kind,
  id,
  hasLogo,
  size,
  radius,
  children,
  extra,
}: {
  kind: 'account' | 'workspace'
  id: string
  hasLogo: boolean
  size: number
  radius: number
  children: React.ReactNode
  /** algo más al lado de los botones (p. ej. el monograma) */
  extra?: React.ReactNode
}) {
  const { t, preview, pending, pick, remove, fileInput } = useLogoUpload(kind, id)
  const showing = hasLogo || !!preview

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={pick}
        disabled={pending}
        aria-label={showing ? t('change') : t('upload')}
        className="group/logo relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-mid focus-visible:ring-offset-2"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        {preview ? <PreviewTile src={preview} size={size} radius={radius} /> : children}
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-[oklch(0.2_0.02_300/0.5)] text-[oklch(0.985_0.006_54.5)] transition-opacity duration-150',
            pending ? 'opacity-100' : 'opacity-0 group-hover/logo:opacity-100',
          )}
          style={{ borderRadius: radius }}
          aria-hidden
        >
          {pending ? <Loader2 className="size-2/5 animate-spin" /> : <ImagePlus className="size-2/5" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={pick} disabled={pending}>
            <Upload />
            {showing ? t('change') : t('upload')}
          </Button>
          {showing ? (
            <Button type="button" variant="danger-ghost" size="sm" onClick={remove} disabled={pending}>
              <Trash2 />
              {t('remove')}
            </Button>
          ) : null}
          {extra}
        </div>
        <p className="mt-1.5 text-xs text-fg-muted">{t('hint')}</p>
      </div>
      {fileInput}
    </div>
  )
}
