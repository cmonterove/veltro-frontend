import { differenceInCalendarDays, format, isSameYear, isToday, isYesterday } from 'date-fns'
import type { es } from 'date-fns/locale'
import type { ApiMailMessage, MailAddress, MailPerson } from '@/lib/api/correo'

// Lo que el buzón necesita sin pintar nada: cómo se llama cada quien, fechas cortas, a quién se
// responde, el texto citado y el HTML del correo listo para mostrarse sin riesgos.

type Locale = typeof es

export const personName = (p: Pick<MailPerson, 'name' | 'email'>) => p.name?.trim() || p.email.split('@')[0] || p.email
export const firstName = (p: Pick<MailPerson, 'name' | 'email'>) => personName(p).replace(/^"|"$/g, '').split(/[\s,]+/)[0] ?? personName(p)

/** Hoy la hora, ayer «ayer», en la semana el día, este año «d MMM», si no «d/M/yy». */
export function shortWhen(iso: string, locale: Locale, yesterday: string) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return yesterday
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, 'EEE', { locale })
  return format(d, isSameYear(d, new Date()) ? 'd MMM' : 'd/M/yy', { locale })
}

export const longWhen = (iso: string, locale: Locale) => format(new Date(iso), "EEE d MMM yyyy, HH:mm", { locale })

/** Para buscar sin que importen tildes ni mayúsculas («sofia» encuentra a «Sofía»). */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const same = (a: { email: string }, b: { email: string }) => a.email.toLowerCase() === b.email.toLowerCase()
const unique = <T extends { email: string }>(xs: T[]) => xs.filter((x, i) => xs.findIndex((y) => same(x, y)) === i)

/**
 * A quién va una respuesta. A quien escribió (o a su Reply-To); si el último lo mandé yo, a quienes
 * se lo mandé. «Responder a todos» suma al resto de Para y a los de Cc, nunca a mí.
 */
export function replyTargets(m: ApiMailMessage, all: boolean): { to: MailAddress[]; cc: MailAddress[] } {
  const mine = (p: { email: string; me?: boolean }) => Boolean((p as MailPerson).me)
  const base: MailAddress[] = m.from.me ? m.to.filter((p) => !mine(p)) : m.replyTo.length ? m.replyTo : [m.from]
  const to = unique(base.map(({ name, email }) => ({ name, email })))
  if (!all) return { to, cc: [] }
  const rest = [...(m.from.me ? [] : m.to), ...m.cc].filter((p) => !mine(p) && !to.some((x) => same(x, p)))
  return { to, cc: unique(rest.map(({ name, email }) => ({ name, email }))) }
}

export const replySubject = (s: string) => (/^\s*re\s*:/i.test(s) ? s.trim() : `Re: ${s.trim()}`.trim())
export const forwardSubject = (s: string) => (/^\s*(fwd?|rv)\s*:/i.test(s) ? s.trim() : `Fwd: ${s.trim()}`.trim())

/** El HTML de un correo a texto (para citarlo o para la descripción de una tarea). */
export function htmlToText(html: string) {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('style,script,head,title').forEach((n) => n.remove())
  doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'))
  doc.querySelectorAll('p,div,tr,li,h1,h2,h3,h4,h5,blockquote,table').forEach((el) => el.append('\n'))
  return (doc.body.textContent ?? '')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const bodyText = (m: Pick<ApiMailMessage, 'text' | 'html' | 'snippet'>) => (m.text?.trim() || (m.html ? htmlToText(m.html) : '') || m.snippet).trim()

/** El mensaje citado al pie de una respuesta, con su encabezado («El … escribió:»). */
export const quoted = (header: string, m: ApiMailMessage) => `${header}\n${bodyText(m).split('\n').map((l) => `> ${l}`).join('\n')}`

// ── El HTML del correo, listo para el iframe ────────────────────────────────

const BASE_CSS = `
html,body{margin:0;padding:0;background:#ffffff}
body{padding:2px 2px 6px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f1f1f;overflow-wrap:anywhere;word-break:break-word}
img{max-width:100%;height:auto}
table{max-width:100%!important}
pre{white-space:pre-wrap}
a{color:#1a5fd0}
blockquote{margin:0 0 0 .8ex;border-left:2px solid #dadada;padding-left:1ex;color:#555}
`

/** Lo citado de respuestas anteriores (Gmail, Apple Mail, Outlook, Yahoo): se pliega. */
const QUOTE_SELECTORS = '.gmail_quote, blockquote[type="cite"], .yahoo_quoted, #divRplyFwdMsg, #appendonsend, .moz-cite-prefix + blockquote'

export type PreparedEmail = { doc: string; hasRemoteImages: boolean; hasQuote: boolean }

/**
 * Un correo HTML (de cualquiera) listo para mostrarse en un iframe con sandbox y sin scripts. Por si
 * acaso se quita todo lo activo (scripts, formularios, marcos, redirecciones, eventos, enlaces
 * javascript:); los enlaces abren en otra pestaña; las imágenes de dentro (cid:) salen de sus
 * adjuntos y las de afuera quedan apagadas hasta que se pidan (avisan a quien manda que se abrió).
 */
export function prepareEmailHtml(html: string, o: { images: boolean; cid: Map<string, string>; showQuote: boolean }): PreparedEmail {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,iframe,frame,frameset,object,embed,applet,form,base,meta,link,noscript,title,portal').forEach((n) => n.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase()
      if (n.startsWith('on') || n === 'formaction' || n === 'srcdoc' || n === 'ping') el.removeAttribute(a.name)
      else if (['href', 'src', 'xlink:href', 'action', 'background', 'poster'].includes(n) && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value)) el.removeAttribute(a.name)
    }
  })
  doc.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  })

  let hasRemoteImages = false
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (/^cid:/i.test(src)) {
      const url = o.cid.get(src.slice(4).trim().replace(/^<|>$/g, ''))
      if (url) img.setAttribute('src', url)
      else img.removeAttribute('src')
      return
    }
    if (/^(https?:)?\/\//i.test(src)) {
      hasRemoteImages = true
      if (!o.images) {
        img.removeAttribute('src')
        img.removeAttribute('srcset')
      }
    }
  })
  if (!hasRemoteImages && /url\(\s*['"]?(https?:)?\/\//i.test(html)) hasRemoteImages = true

  const quotes = doc.querySelectorAll<HTMLElement>(QUOTE_SELECTORS)
  if (!o.showQuote) quotes.forEach((q) => q.style.setProperty('display', 'none', 'important'))

  const remote = o.images ? ' https: http:' : ''
  const csp = `default-src 'none'; img-src 'self' data: blob:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}`
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${BASE_CSS}</style>`
  return {
    doc: `<!doctype html><html><head>${head}${doc.head.innerHTML}</head><body>${doc.body.innerHTML}</body></html>`,
    hasRemoteImages,
    hasQuote: quotes.length > 0,
  }
}

/** Partes de un texto plano con sus enlaces (para pintarlos como <a>). */
export function linkParts(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = []
  const re = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], href: m[0] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** «Nombre <correo>», o solo el correo, a una dirección (null si no parece un correo). */
export function parseAddress(raw: string): MailAddress | null {
  const s = raw.trim().replace(/[,;]+$/, '')
  if (!s) return null
  const m = /^(.*?)<([^<>]+)>$/.exec(s)
  const email = (m ? m[2] : s).trim()
  if (!/^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(email)) return null
  const name = m ? m[1].trim().replace(/^"|"$/g, '').trim() : ''
  return { name: name || null, email }
}
