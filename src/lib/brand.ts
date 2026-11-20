import type { CSSProperties } from 'react'

/**
 * El color de cada cuenta (accounts.color): la app toma ese tono mientras estás en ella. Uno de la lista
 * (su paleta vive en globals.css: [data-brand='…'] fija el tono --bh y la intensidad --bc) o uno propio
 * en hexadecimal: de ese se toman el tono y la intensidad, y la luminosidad la pone Veltro (la misma de
 * la lista) para que el texto se lea siempre, sea el color claro u oscuro.
 */
export const BRANDS = ['plum', 'indigo', 'blue', 'teal', 'green', 'terracotta', 'wine', 'graphite'] as const
export type BrandPreset = (typeof BRANDS)[number]
/** de la lista, o propio (#rrggbb) */
export type Brand = BrandPreset | `#${string}`
export const DEFAULT_BRAND: Brand = 'plum'

const HEX = /^#[0-9a-f]{6}$/i
export const isHex = (v: unknown): v is `#${string}` => typeof v === 'string' && HEX.test(v)
export const isPreset = (v: unknown): v is BrandPreset => typeof v === 'string' && (BRANDS as readonly string[]).includes(v)
export const brandOf = (v: unknown): Brand => (isPreset(v) ? v : isHex(v) ? (v.toLowerCase() as Brand) : DEFAULT_BRAND)

/** #rrggbb → OKLCH (luminosidad 0–1, croma, tono en grados). */
export function hexToOklch(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h }
}

/**
 * Lo que va en el elemento que lleva el color: el atributo y, si es propio, su tono e intensidad. La
 * intensidad se mide contra el croma del acento ciruela (0,15): un gris queda casi como grafito.
 */
export function brandAttrs(brand: Brand): { 'data-brand': string; style?: CSSProperties } {
  if (!isHex(brand)) return { 'data-brand': brand }
  const { c, h } = hexToOklch(brand)
  const bc = Math.min(1.15, Math.max(0.12, c / 0.13))
  return { 'data-brand': 'custom', style: { '--bh': h.toFixed(1), '--bc': bc.toFixed(3) } as CSSProperties }
}
