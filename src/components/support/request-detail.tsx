'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Ban, Check, Lightbulb, ThumbsUp } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toErrorCode } from '@/lib/errors'
import { useDateLocale } from '@/lib/dates'
import { useMarkRequestRead, useRequest, useToggleSupport, type RequestDetail as Request } from '@/lib/queries/support'
import { firstName, joinNames, requestTimeline, type RequestStatus } from '@/lib/support'
import { cn } from '@/lib/utils'
import { IMPACT_ICON, REQUEST_TONE, StatusPill, useAgo } from './support-bits'

/** Un requerimiento: lo que se pide, quién lo apoya y en qué va. */
export function RequestDetail({ id }: { id: string }) {
  const t = useTranslations('request')
  const router = useRouter()
  const { data: r, isLoading, isError } = useRequest(id)
  const { mutate: markRead } = useMarkRequestRead()

  // al abrirlo, las novedades quedan vistas
  const unread = r?.unread ?? false
  useEffect(() => {
    if (unread && document.visibilityState === 'visible') markRead(id)
  }, [id, unread, markRead])

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="h-14 border-b border-line" />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
        </div>
      </div>
    )
  }
  if (isError || !r) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <EmptyState
          icon={<Lightbulb />}
          title={t('notFound')}
          description={t('notFoundHint')}
          action={
            <Button size="sm" onClick={() => router.push('/support')}>
              <ArrowLeft />
              {t('back')}
            </Button>
          }
        />
      </div>
    )
  }
  return <RequestView r={r} />
}

function RequestView({ r }: { r: Request }) {
  const t = useTranslations('request')
  const ts = useTranslations('support')
  const te = useTranslations('errors')
  const router = useRouter()
  const { user } = useApp()
  const ago = useAgo()
  const toggle = useToggleSupport(r.id)
  const Impact = IMPACT_ICON[r.impact]
  const closed = r.status === 'done' || r.status === 'declined'
  const { steps, reached } = requestTimeline(
    r.status,
    r.updates.map((u) => u.status),
  )
  // «Lo apoyan tú, Ana y Diego»
  const names = [...(r.supportedByMe ? [ts('you')] : []), ...r.supporters.filter((s) => s.id !== user.id).map((s) => firstName(s.fullName))]
  const n = r.supportersCount
  const supportersText = !n ? t('nobody') : n === 1 && r.supportedByMe ? t('supportedByYou') : t('supportedBy', { count: n, names: joinNames(names, ts('and')) })
  const author = r.creator?.fullName ?? ts('someone')

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => router.push('/support')} aria-label={t('back')}>
          <ArrowLeft />
        </Button>
        <Lightbulb className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="font-mono text-xs text-fg-muted">{r.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{r.title}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-12 pt-7 sm:px-8">
          <section>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill label={ts(`requestStatus.${r.status}`)} tone={REQUEST_TONE[r.status]} />
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-hover px-2 text-2xs font-medium text-fg-muted">
                <Impact className="size-3" aria-hidden />
                {ts(`impact.${r.impact}`)}
              </span>
            </div>
            <h1 className="mt-2.5 text-balance text-xl font-semibold leading-tight tracking-[-0.015em] text-fg">{r.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-fg-muted">
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar name={author} src={r.creator?.avatarUrl} seed={r.createdBy} size={18} />
                <span className="truncate">{r.mine ? t('mine', { when: ago(r.createdAt) }) : t('theirs', { name: author, when: ago(r.createdAt) })}</span>
              </span>
              {r.workspace ? (
                <span className="flex items-center gap-1.5">
                  <WorkspaceMark ws={r.workspace} size={16} />
                  {r.workspace.name}
                </span>
              ) : null}
            </div>
          </section>

          {/* lo que se pide */}
          <section className="rounded-xl border border-line bg-panel px-5 py-4">
            <h2 className="text-xs font-medium text-fg-muted">{t('needLabel')}</h2>
            <p className="mt-1 max-w-[68ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{r.need}</p>
            {r.why ? (
              <>
                <h2 className="mt-4 text-xs font-medium text-fg-muted">{t('whyLabel')}</h2>
                <p className="mt-1 max-w-[68ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{r.why}</p>
              </>
            ) : null}
          </section>

          {/* apoyo */}
          <section className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-highlight/60 px-5 py-4">
            {n ? <AvatarStack people={r.supporters.map((s) => ({ id: s.id, full_name: s.fullName, avatar_url: s.avatarUrl }))} size={28} max={4} ring="panel" /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{ts('supports', { count: n })}</p>
              <p className="text-xs text-fg-muted">{supportersText}</p>
              {r.mine && !closed ? <p className="mt-1 text-xs text-fg-muted">{t('mineNote')}</p> : null}
            </div>
            {closed || r.mine ? null : (
              <Button
                size="sm"
                variant={r.supportedByMe ? 'primary' : 'secondary'}
                aria-pressed={r.supportedByMe}
                loading={toggle.isPending}
                onClick={() => toggle.mutate(!r.supportedByMe, { onError: (e) => toast.error(t('toggleError'), { description: te(toErrorCode(e)) }) })}
              >
                {toggle.isPending ? null : r.supportedByMe ? <Check /> : <ThumbsUp />}
                {r.supportedByMe ? t('supported') : t('support')}
              </Button>
            )}
          </section>

          {/* en qué va */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-fg">{t('progress')}</h2>
            <ol className="rounded-xl border border-line bg-panel px-5 py-5">
              {steps.map((st, i) => (
                <StepRow key={st} r={r} status={st} index={i} reached={reached} last={i === steps.length - 1} />
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}

function StepRow({ r, status, index, reached, last }: { r: Request; status: RequestStatus; index: number; reached: number; last: boolean }) {
  const t = useTranslations('request')
  const ts = useTranslations('support')
  const dl = useDateLocale()
  const done = index <= reached
  const current = index === reached
  const declined = status === 'declined'
  // la última actualización que dejó el requerimiento en este estado
  const update = [...r.updates].reverse().find((u) => u.status === status)
  // la primera la crea la base sin texto: se cuenta con palabras de la app
  const body = update ? update.body.trim() || (status === 'received' ? t('receivedNote') : '') : ''
  return (
    <li className="flex gap-3.5" aria-current={current ? 'step' : undefined}>
      <div className="flex w-5 flex-col items-center">
        {declined ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-hover text-fg-muted">
            <Ban className="size-3" aria-hidden />
          </span>
        ) : current ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft">
            <span className="size-2.5 rounded-full bg-accent-mid" />
          </span>
        ) : done ? (
          <span className="flex size-5 items-center justify-center">
            <span className="flex size-4 items-center justify-center rounded-full bg-accent-mid text-accent-fg">
              <Check className="size-2.5" strokeWidth={3} aria-hidden />
            </span>
          </span>
        ) : (
          <span className="flex size-5 items-center justify-center">
            <span className="size-3 rounded-full border-2 border-line-strong bg-panel" />
          </span>
        )}
        {!last ? <span className={cn('my-1 w-0.5 flex-1 rounded-full', index < reached ? 'bg-accent-mid' : 'bg-line')} /> : null}
      </div>
      <div className={cn('min-w-0 flex-1', !last && 'pb-5')}>
        <p className={cn('text-sm', current ? 'font-semibold text-fg' : done ? 'text-fg' : 'text-fg-muted')}>
          {ts(`requestStatus.${status}`)}
          <span className="sr-only"> · {current ? t('current') : done ? t('doneStep') : t('pending')}</span>
        </p>
        {update ? (
          <>
            <p className="text-xs tabular-nums text-fg-subtle">
              {format(new Date(update.createdAt), 'd MMM yyyy', { locale: dl })}
              {update.authorKind === 'veltro' ? ` · ${ts('to.veltro')}` : update.author ? ` · ${update.author.fullName}` : ''}
            </p>
            {body ? <p className="mt-1 max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed text-fg">{body}</p> : null}
          </>
        ) : index === reached + 1 ? (
          <p className="text-xs text-fg-muted">{t('nextNote')}</p>
        ) : null}
      </div>
    </li>
  )
}
