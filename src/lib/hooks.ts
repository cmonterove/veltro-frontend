'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

/** false en el render del servidor y en la hidratación; true después. Para valores que solo existen en el navegador. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

/** ¿Se cumple la media query? false en el servidor y en la hidratación. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** El valor, pero recién cuando deja de cambiar por `ms` (para no pedir algo en cada tecla). */
export function useDebounced<T>(value: T, ms = 400) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
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

// Preferencias en localStorage, leídas antes de pintar: antes se mostraba un instante el valor por
// defecto (otra pestaña, otra vista) y después saltaba al guardado. Si el navegador no deja guardar,
// el valor vive en memoria mientras dure la página.
const memory = new Map<string, string>()
const listeners = new Set<() => void>()

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

function subscribeStorage(onChange: () => void) {
  listeners.add(onChange)
  // otra pestaña cambió la preferencia
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function useLocalStorage<T>(key: string, initial: T) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => readRaw(key),
    () => null,
  )
  // el valor inicial puede ser un objeto nuevo en cada render: se toma el primero
  const [fallback] = useState(initial)
  const value = useMemo<T>(() => {
    if (raw == null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }, [raw, fallback])
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      // lo vigente se lee en el momento: dos cambios seguidos no se pisan
      let prev = fallback
      const current = readRaw(key)
      if (current != null) {
        try {
          prev = JSON.parse(current) as T
        } catch {
          // valor corrupto: se parte del inicial
        }
      }
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      const text = JSON.stringify(resolved)
      try {
        localStorage.setItem(key, text)
      } catch {
        // storage no disponible: queda en memoria
        memory.set(key, text)
      }
      listeners.forEach((l) => l())
    },
    [key, fallback],
  )
  return [value, update] as const
}

export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
