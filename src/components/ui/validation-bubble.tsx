'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert } from 'lucide-react'

/**
 * Avisos de validación con la cara de Veltro, para todos los formularios de la app.
 * El navegador sigue validando (required, type="email", minLength...): aquí se cambia solo cómo
 * se avisa. En vez de la burbuja nativa sale una propia, animada y traducida, el campo se marca
 * en rojo con una sacudida corta y el aviso cambia o se va mientras la persona escribe.
 */

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
type Shown = { el: Field; message: string; id: number }

const isField = (el: EventTarget | null): el is Field => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
const BUBBLE_ID = 'veltro-validation-bubble'
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function ValidationBubble() {
  const t = useTranslations('validation')
  const [shown, setShown] = useState<Shown | null>(null)
  const [box, setBox] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const firstOfSubmit = useRef(false)
  const counter = useRef(0)

  // qué decir según lo que falla; los mensajes del navegador vienen en su idioma, no en el de la app
  const messageFor = useCallback(
    (el: Field) => {
      const v = el.validity
      const type = el instanceof HTMLInputElement ? el.type : ''
      if (v.valueMissing) {
        if (type === 'checkbox') return t('checkbox')
        if (type === 'email') return t('emailMissing')
        if (type === 'password') return t('passwordMissing')
        if (el instanceof HTMLSelectElement) return t('select')
        return t('required')
      }
      if (v.typeMismatch) {
        if (type === 'email') return el.value.includes('@') ? t('emailFormat') : t('emailAt', { value: el.value.trim() })
        if (type === 'url') return t('url')
        return t('format')
      }
      if (v.tooShort) return t('tooShort', { min: (el as HTMLInputElement).minLength, count: el.value.length })
      if (v.tooLong) return t('tooLong', { max: (el as HTMLInputElement).maxLength })
      if (v.patternMismatch) return el.title || t('format')
      if (v.rangeUnderflow) return t('min', { min: (el as HTMLInputElement).min })
      if (v.rangeOverflow) return t('max', { max: (el as HTMLInputElement).max })
      if (v.badInput) return t('number')
      if (v.stepMismatch) return t('step')
      return el.validationMessage || t('format')
    },
    [t],
  )

  const clear = useCallback((el: Field) => {
    el.removeAttribute('data-invalid')
    el.removeAttribute('aria-invalid')
    if (el.getAttribute('aria-describedby') === BUBBLE_ID) el.removeAttribute('aria-describedby')
  }, [])

  useEffect(() => {
    const onInvalid = (e: Event) => {
      if (!isField(e.target)) return
      const el = e.target
      e.preventDefault() // sin la burbuja del navegador
      el.setAttribute('data-invalid', '')
      el.setAttribute('aria-invalid', 'true')
      // al enviar, el navegador avisa de cada campo inválido: se muestra el primero y el resto queda marcado
      if (firstOfSubmit.current) return
      firstOfSubmit.current = true
      window.setTimeout(() => (firstOfSubmit.current = false), 0)
      el.setAttribute('aria-describedby', BUBBLE_ID)
      el.focus({ preventScroll: true })
      const r = el.getBoundingClientRect()
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' })
      if (!reduceMotion()) {
        el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], {
          duration: 320,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        })
      }
      setShown({ el, message: messageFor(el), id: ++counter.current })
    }
    // mientras escribe: si ya está bien se limpia; si no, el aviso dice lo que falta ahora
    const onInput = (e: Event) => {
      if (!isField(e.target) || !e.target.hasAttribute('data-invalid')) return
      const el = e.target
      if (el.validity.valid) {
        clear(el)
        setShown((s) => (s?.el === el ? null : s))
      } else {
        setShown((s) => (s?.el === el ? { ...s, message: messageFor(el) } : s))
      }
    }
    document.addEventListener('invalid', onInvalid, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onInput, true)
    return () => {
      document.removeEventListener('invalid', onInvalid, true)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('change', onInput, true)
    }
  }, [messageFor, clear])

  // el aviso se va al salir del campo (el campo sigue en rojo hasta que esté bien), con Escape o si el campo desaparece
  useEffect(() => {
    if (!shown) return
    const el = shown.el
    const onBlur = () => window.setTimeout(() => setShown((s) => (s?.el === el && document.activeElement !== el ? null : s)), 120)
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') setShown(null)
    }
    el.addEventListener('blur', onBlur)
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('blur', onBlur)
      el.removeEventListener('keydown', onKey)
    }
  }, [shown])

  // sigue al campo si la página se mueve
  useLayoutEffect(() => {
    if (!shown) {
      setBox(null)
      return
    }
    let raf = 0
    const place = () => {
      if (!shown.el.isConnected) {
        setShown(null)
        return
      }
      const r = shown.el.getBoundingClientRect()
      const above = r.bottom + 72 > window.innerHeight && r.top > 80
      const next = { top: above ? r.top - 10 : r.bottom + 10, left: Math.max(12, Math.min(r.left, window.innerWidth - 332)), above }
      setBox((b) => (b && b.top === next.top && b.left === next.left && b.above === next.above ? b : next))
      raf = requestAnimationFrame(place)
    }
    place()
    return () => cancelAnimationFrame(raf)
  }, [shown])

  return (
    <AnimatePresence>
      {shown && box ? (
        <motion.div
          key={shown.id}
          id={BUBBLE_ID}
          role="alert"
          initial={{ opacity: 0, y: box.above ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: box.above ? 4 : -4, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
          className="pointer-events-none fixed z-[200] max-w-[320px]"
          style={{ top: box.top, left: box.left, translate: box.above ? '0 -100%' : undefined, transformOrigin: box.above ? 'bottom left' : 'top left' }}
        >
          {/* la flecha apunta al campo */}
          <span
            aria-hidden
            className={`absolute left-5 size-2.5 rotate-45 border-danger/30 bg-panel ${box.above ? '-bottom-[5px] border-b border-r' : '-top-[5px] border-l border-t'}`}
          />
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-panel py-2.5 pl-2.5 pr-3.5 text-sm text-fg shadow-popover">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <CircleAlert className="size-3.5" strokeWidth={2.4} />
            </span>
            <motion.span key={shown.message} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="pt-0.5 leading-snug">
              {shown.message}
            </motion.span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
