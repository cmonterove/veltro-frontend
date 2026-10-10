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
