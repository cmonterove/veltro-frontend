'use client'

import { useTranslations } from 'next-intl'
import { ApiError } from '@/lib/api/client'

/** Códigos del buzón que se arreglan volviendo a conectar la cuenta (con permiso de leer). */
export const RECONNECT_CODES = ['mail_auth_revoked', 'mail_scope_missing']

/** El mensaje de un error del buzón, en el idioma de la persona (por su código estable). */
export function useMailError() {
  const t = useTranslations('mail.errors')
  return (e: unknown) => {
    const code = e instanceof ApiError ? e.code : typeof e === 'string' ? e : 'generic'
    return t.has(code) ? t(code) : t('generic')
  }
}

export const errorCode = (e: unknown) => (e instanceof ApiError ? e.code : 'generic')
