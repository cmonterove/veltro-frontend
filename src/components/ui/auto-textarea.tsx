'use client'

import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Textarea que crece con su contenido (títulos de docs y tareas). */
export function AutoTextarea({ className, value, ...props }: React.ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} rows={1} value={value} className={cn('block w-full resize-none overflow-hidden', className)} {...props} />
}
