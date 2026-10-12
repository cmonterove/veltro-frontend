'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** Enlaces de antes (…?task=<id>, cuando la tarea abría en un panel): llevan a la página de la tarea. */
export function LegacyTaskParam() {
  const router = useRouter()
  const id = useSearchParams().get('task')
  useEffect(() => {
    if (id) router.replace(`/tasks/${id}`)
  }, [id, router])
  return null
}
