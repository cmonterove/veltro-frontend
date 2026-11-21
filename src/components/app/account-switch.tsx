'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { setCurrentAccount } from '@/app/actions/preferences'
import { brandAttrs, brandOf } from '@/lib/brand'
import { useApp } from './app-context'
import { useHydrated } from '@/lib/hooks'
import { AccountLogo } from './marks'

type Target = { id: string; name: string; color?: string; logo_updated_at?: string | null }
/** desde dónde nace el círculo (el clic); sin él, el centro de la pantalla */
type Origin = { x: number; y: number }

const AccountSwitchContext = createContext<{ switchTo: (to: Target, o?: { origin?: Origin; path?: string }) => void }>({ switchTo: () => {} })
export const useAccountSwitch = () => useContext(AccountSwitchContext)

/**
 * Adónde volver en la otra cuenta: la misma vista. Lo que es de la cuenta anterior (un espacio, una
 * reunión, un chat, una solicitud o un ticket abiertos, los ajustes de un espacio) vuelve a la lista de
 * su sección; los parámetros que apuntan a algo concreto (?file, ?task) se quitan.
 */
export function pathInOtherAccount(pathname: string, search: string) {
  if (pathname.startsWith('/w/')) return '/home'
  if (pathname.startsWith('/m/')) return '/calendar'
  if (/^\/chat\/.+/.test(pathname)) return '/chat'
  if (/^\/requests\/.+/.test(pathname)) return '/requests'
  if (/^\/support\/.+/.test(pathname)) return '/support'
  if (/^\/settings\/workspaces\/.+/.test(pathname)) return '/settings/workspaces'
  const params = new URLSearchParams(search)
  params.delete('file')
  params.delete('task')
  const q = params.toString()
  return q ? `${pathname}?${q}` : pathname
}

// lo justo para que se vea el paso (y no un parpadeo) y un tope por si la cuenta no llega
const MIN_MS = 900
const MAX_MS = 12_000

/**
 * Cambiar de cuenta con su animación: el color de la cuenta nueva crece en un círculo desde el clic y
 * cubre la pantalla, con su inicial y «Cambiando de cuenta»; cuando la app ya tiene la cuenta nueva
 * (y su color), se desvanece. Te quedas en la misma vista (pathInOtherAccount).
 */
export function AccountSwitchHost({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav.switching')
  const router = useRouter()
  const pathname = usePathname()
  const { account } = useApp()
  const reduce = useReducedMotion()
  const hydrated = useHydrated()
  const [, startTransition] = useTransition()
  const [target, setTarget] = useState<(Target & Origin & { at: number }) | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timers = useRef<number[]>([])

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }

  const switchTo = useCallback(
    (to: Target, o: { origin?: Origin; path?: string } = {}) => {
      if (to.id === account.id && !o.path) return
      clear()
      const origin = o.origin && (o.origin.x || o.origin.y) ? o.origin : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      setLeaving(false)
      setTarget({ ...to, ...origin, at: Date.now() })
      const next = o.path ?? pathInOtherAccount(pathname, window.location.search)
      startTransition(async () => {
        await setCurrentAccount(to.id)
        router.replace(next, { scroll: false })
        router.refresh()
      })
      // si la cuenta no llega, se quita igual y avisa
      timers.current.push(
        window.setTimeout(() => {
          setLeaving(true)
          toast.error(t('failed'))
        }, MAX_MS),
      )
    },
    [account.id, pathname, router, t],
  )

  // la app ya tiene la cuenta nueva: se desvanece (después del mínimo, para que se vea el paso)
  useEffect(() => {
    if (!target || leaving || account.id !== target.id) return
    clear()
    const wait = Math.max(0, MIN_MS - (Date.now() - target.at))
    timers.current.push(window.setTimeout(() => setLeaving(true), wait))
  }, [account.id, target, leaving])

  useEffect(() => clear, [])

  const value = useMemo(() => ({ switchTo }), [switchTo])
  const initial = target?.name.trim().charAt(0).toUpperCase() ?? ''

  return (
    <AccountSwitchContext.Provider value={value}>
      {children}
      {!hydrated
        ? null
        : createPortal(
            <AnimatePresence onExitComplete={() => setTarget(null)}>
              {target && !leaving ? (
                <motion.div
                  key={target.at}
                  {...brandAttrs(brandOf(target.color))}
                  role="status"
                  aria-live="polite"
                  // el color va aquí y el texto claro (on-frame) adentro: en el mismo elemento, las reglas del color pisarían el texto claro
                  className="frame-bg fixed inset-0 z-[100]"
                  initial={reduce ? { opacity: 0 } : { clipPath: `circle(0px at ${target.x}px ${target.y}px)` }}
                  animate={reduce ? { opacity: 1 } : { clipPath: `circle(150vmax at ${target.x}px ${target.y}px)` }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0.2 : 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="on-frame flex size-full items-center justify-center">
                  <motion.div
                    className="flex flex-col items-center gap-4 text-center"
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: reduce ? 0 : 0.18, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="relative flex size-20 items-center justify-center rounded-[26px] shadow-[0_18px_40px_-14px_oklch(0_0_0/0.5)]">
                      <AccountLogo
                        account={target}
                        size={80}
                        fallback={
                          <span className="flex size-20 items-center justify-center rounded-[26px] bg-accent text-[34px] font-bold text-accent-fg">{initial}</span>
                        }
                      />
                      {/* un anillo que late mientras carga */}
                      <span className="absolute -inset-2 animate-ping rounded-[30px] ring-2 ring-accent/50 [animation-duration:1.6s]" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[26px] font-semibold tracking-[-0.025em] text-fg">{target.name}</p>
                      <p className="mt-1 text-sm text-fg-muted">{t('label')}</p>
                    </div>
                    <span className="relative mt-1 h-1 w-40 overflow-hidden rounded-full bg-fg/[0.12]" aria-hidden>
                      <span className="absolute inset-y-0 left-0 w-1/3 animate-[switch-bar_1.1s_ease-in-out_infinite] rounded-full bg-accent" />
                    </span>
                  </motion.div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )}
    </AccountSwitchContext.Provider>
  )
}
