'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Textarea que crece con su contenido (títulos de docs y tareas, el compositor de Veltro IA). */
export function AutoTextarea({ className, value, ref: outerRef, ...props }: React.ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      ref.current = el
      if (typeof outerRef === 'function') outerRef(el)
      else if (outerRef) outerRef.current = el
    },
    [outerRef],
  )
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={setRef} rows={1} value={value} className={cn('block w-full resize-none overflow-hidden', className)} {...props} />
}
