import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "Trade Marketing Ñandú" → "trade-marketing-nandu" */
export function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** "Trade Marketing" → "TM", "Promoting" → "PRO" */
export function workspaceKeyFrom(name: string) {
  const clean = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'WS'
  const key = words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join('').slice(0, 4)
  return key.length >= 2 ? key.toUpperCase() : (key + 'X').toUpperCase()
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

/** Posición entre dos vecinos para ordenamiento fraccional. */
export function positionBetween(before: number | null | undefined, after: number | null | undefined) {
  if (before == null && after == null) return 1000
  if (before == null) return (after as number) - 1000
  if (after == null) return before + 1000
  return (before + after) / 2
}

export function taskRef(key: string, number: number) {
  return `${key}-${number}`
}

/** Extracto legible de un texto multilínea: une las líneas con un separador para que títulos y párrafos no se peguen. */
export function excerptOf(text: string | null | undefined, max = 240) {
  const out = (text ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' · ')
  return out.length > max ? `${out.slice(0, max).trimEnd()}…` : out
}
