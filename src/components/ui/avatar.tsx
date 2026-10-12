import { cn, initials } from '@/lib/utils'

const TONES = ['violet', 'mandarina', 'blue', 'teal', 'green', 'pink', 'lavender', 'amber']

function toneFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]
}

export function Avatar({
  name,
  src,
  seed,
  size = 20,
  className,
}: {
  name?: string | null
  src?: string | null
  seed?: string
  size?: number
  className?: string
}) {
  const tone = toneFor(seed ?? name ?? '?')
  // En tamaños chicos dos letras no caben legibles: se usa solo la inicial.
  const compact = size < 22
  const text = compact ? initials(name).slice(0, 1) : initials(name)
  return (
    <span
      className={cn(
        `ws-${tone} relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold`,
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * (compact ? 0.52 : 0.4))), background: 'var(--ws-color)', color: 'var(--ws-on)' }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        text
      )}
    </span>
  )
}

/** Varias personas en poco espacio: caras superpuestas y "+N" si no entran. */
export function AvatarStack({
  people,
  size = 20,
  max = 3,
  ring = 'canvas',
  className,
}: {
  people: { id: string; full_name: string; avatar_url?: string | null }[]
  size?: number
  max?: number
  /** color del fondo donde se dibuja, para separar las caras */
  ring?: 'canvas' | 'panel' | 'sidebar'
  className?: string
}) {
  if (!people.length) return null
  const shown = people.slice(0, people.length > max ? max - 1 : max)
  const extra = people.length - shown.length
  const ringCls = ring === 'panel' ? 'ring-panel' : ring === 'sidebar' ? 'ring-sidebar' : 'ring-canvas'
  return (
    <span className={cn('flex shrink-0 items-center', className)} title={people.map((p) => p.full_name).join(', ')}>
      {shown.map((p, i) => (
        <Avatar key={p.id} name={p.full_name} src={p.avatar_url} seed={p.id} size={size} className={cn('ring-2', ringCls, i > 0 && '-ml-1.5')} />
      ))}
      {extra > 0 ? (
        <span
          className={cn('-ml-1.5 inline-flex shrink-0 items-center justify-center rounded-full bg-hover font-medium text-fg-muted ring-2', ringCls)}
          style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  )
}
