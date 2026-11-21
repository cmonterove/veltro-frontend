import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config'

// Prioridad: cookie (sincronizada con profiles.locale al iniciar sesión) → env (español). No se mira
// el idioma del navegador: español por defecto (pedido del usuario, 2026-11-03).
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale

  return {
    locale,
    messages: await loadMessages(locale),
  }
})

/**
 * En desarrollo los textos se leen del archivo en cada petición: el servidor de desarrollo guardaba el
 * JSON importado y, al agregar textos, las páginas mostraban las claves sin traducir hasta reiniciarlo.
 * En producción se importan (van en el paquete).
 */
async function loadMessages(locale: string) {
  if (process.env.NODE_ENV === 'development') {
    return JSON.parse(await readFile(path.join(process.cwd(), 'src/messages', `${locale}.json`), 'utf8'))
  }
  return (await import(`../messages/${locale}.json`)).default
}
