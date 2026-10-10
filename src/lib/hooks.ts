'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const noopSubscribe = () => () => {}

/** false en el render del servidor y en la hidratación; true después. Para valores que solo existen en el navegador. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

/** Hora actual que se refresca cada `ms`. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) setValue(JSON.parse(raw) as T)
    } catch {
      // storage no disponible
    }
  }, [key])
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          // storage no disponible
        }
        return resolved
      })
    },
    [key],
  )
  return [value, update] as const
}

/** Panel de tarea global: ?task=<id> en la URL actual. */
export function useTaskPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const openId = params.get('task')

  const open = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('task', id)
      router.push(`${pathname}?${next}`, { scroll: false })
    },
    [params, pathname, router],
  )

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString())
    next.delete('task')
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, pathname, router])

  return { openId, open, close }
}

export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
