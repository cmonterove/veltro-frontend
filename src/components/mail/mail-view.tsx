'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMailboxes } from '@/lib/queries/mail'
import { cn } from '@/lib/utils'
import { MailComposer } from './mail-composer'
import { MailConnect } from './mail-connect'
import { useMailError } from './mail-errors'
import { MailList, type MailNav } from './mail-list'
import { MailEmpty, MailThread } from './mail-thread'

/**
 * El Correo: el buzón de Gmail dentro de Veltro. Como Pasillo, la lista sobre el marco y lo abierto
 * en la hoja (en el celular, una u otra). Todo vive en la dirección: ?b= la cuenta, ?f= la carpeta,
 * ?q= la búsqueda, ?h= el hilo abierto y ?c=new escribir uno nuevo. Sin una cuenta que se pueda
 * leer, la invitación a conectarla.
 */
export function MailView() {
  const t = useTranslations('mail')
  const tConnect = useTranslations('mail.connectErrors')
  const mailError = useMailError()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const boxes = useMailboxes()

  const readable = useMemo(() => (boxes.data?.items ?? []).filter((b) => b.canRead), [boxes.data])
  const box = readable.find((b) => b.id === params.get('b')) ?? readable[0] ?? null
  const q = params.get('q') ?? ''
  const folder = params.get('f') ?? (q ? null : 'INBOX')
  const threadId = params.get('h')
  const composing = params.get('c') === 'new'

  const go: MailNav = useCallback(
    (patch, push = false) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      const url = next.size ? `${pathname}?${next}` : pathname
      if (push) router.push(url, { scroll: false })
      else router.replace(url, { scroll: false })
    },
    [params, pathname, router],
  )

  const hrefFor = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('h', id)
      next.delete('c')
      if (box) next.set('b', box.id)
      return `${pathname}?${next}`
    },
    [params, pathname, box],
  )

  // la vuelta de Google: ?mail=connected (o el motivo); se avisa y se limpia
  useEffect(() => {
    const status = params.get('mail')
    if (!status) return
    if (status === 'connected') toast.success(t('connected'))
    else toast.error(tConnect.has(status) ? tConnect(status) : tConnect('generic'))
    go({ mail: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (boxes.isLoading) {
    return (
      <div className="flex h-full min-h-0">
        <aside className="hidden w-[400px] shrink-0 flex-col gap-3 p-4 md:flex">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </aside>
        <main className="min-h-0 flex-1 md:rounded-[20px] md:bg-canvas md:shadow-sheet" />
      </div>
    )
  }
  if (!boxes.data) {
    return (
      <div className="flex h-full min-h-0">
        <main className="flex flex-1 items-center justify-center px-6 text-center md:rounded-[20px] md:bg-canvas md:shadow-sheet">
          <p className="max-w-sm text-sm text-fg-muted">{mailError(boxes.error)}</p>
        </main>
      </div>
    )
  }
  if (!box) return <MailConnect boxes={boxes.data} />

  const detail = Boolean(threadId || composing)
  const back = () => go({ h: null, c: null })

  return (
    <div className="flex h-full min-h-0">
      {/* encima de la sombra de la hoja: el hilo abierto de la lista se une a ella sin un borde oscuro */}
      <aside className={cn('min-h-0 w-full shrink-0 md:on-frame md:relative md:z-[1] lg:flex lg:w-[380px] 2xl:w-[440px]', detail ? 'hidden' : 'flex')}>
        <MailList box={box} boxes={readable} folder={folder} q={q} activeId={threadId} hrefFor={hrefFor} go={go} onCompose={() => go({ c: 'new', h: null }, true)} />
      </aside>
      <main className={cn('min-h-0 min-w-0 flex-1 md:overflow-hidden md:rounded-[20px] md:bg-canvas md:shadow-sheet', detail ? 'flex' : 'hidden lg:flex')}>
        {composing ? (
          <div className="flex min-h-0 w-full flex-col">
            <header className="flex shrink-0 items-center gap-2 border-b border-line-soft px-4 py-3 sm:px-6">
              <Button variant="ghost" size="icon" onClick={back} aria-label={t('backToList')} className="lg:hidden">
                <ArrowLeft />
              </Button>
              <h1 className="text-lg font-semibold tracking-[-0.015em] text-fg">{t('newMessage')}</h1>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
              <MailComposer box={box.id} fromEmail={box.email} mode={{ kind: 'new' }} onClose={back} className="mx-auto max-w-[860px]" />
            </div>
          </div>
        ) : threadId ? (
          <MailThread key={`${box.id}-${threadId}`} box={box.id} fromEmail={box.email} threadId={threadId} folder={folder} onBack={back} />
        ) : (
          <MailEmpty unread={box.unread} onCompose={() => go({ c: 'new' }, true)} />
        )}
      </main>
    </div>
  )
}
