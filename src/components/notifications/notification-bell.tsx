'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowRightLeft, AtSign, Bell, BellOff, CalendarClock, CalendarSync, CalendarX2, CheckCheck, CircleCheck, MessageSquare, UserRoundCheck, UserRoundPlus, LockOpen, Inbox } from 'lucide-react'
import { LogoMark } from '@/components/app/logo'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/tasks/status-icon'
import {
  useNotificationMutations,
  useNotifications,
  useNotificationsUnread,
  type AppNotification,
  type NotificationFilter,
  type NotificationKind,
} from '@/lib/queries/notifications'
import { disableDesktop, enableDesktop, useDesktopState } from '@/lib/desktop-notify'
import { useOpenTask } from '@/lib/use-open-task'
import { useDateLocale } from '@/lib/dates'
import { track } from '@/lib/telemetry'
import type { TaskStatus } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { vars } from './notification-copy'

/**
 * La campana: avisos de la cuenta (te asignaron, comentaron o terminaron una tarea tuya, te
 * mencionaron). Se mece cuando llega uno nuevo. Abrir un aviso lo marca leído y lleva a lo suyo.
 */

type Variant = 'sidebar' | 'rail' | 'topbar' | 'frame'

const TRIGGER: Record<Variant, string> = {
  sidebar:
    'relative inline-flex size-[26px] shrink-0 items-center justify-center rounded-md text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35 data-[popup-open]:bg-hover data-[popup-open]:text-fg [&_svg]:size-[15px]',
  rail: 'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted outline-none transition-colors duration-150 hover:bg-hover/80 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35 data-[popup-open]:bg-hover [&_svg]:size-4',
  topbar:
    'relative inline-flex size-8 items-center justify-center rounded-md text-fg-muted outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-mid/35 [&_svg]:size-4',
  /** en la barra de arriba, sobre el marco */
  frame:
    'relative inline-flex size-9 items-center justify-center rounded-[10px] text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:bg-hover data-[popup-open]:text-fg [&_svg]:size-[17px]',
}

export function NotificationBell({ variant = 'sidebar' }: { variant?: Variant }) {
  const t = useTranslations('notifications')
  const { data: unread = 0 } = useNotificationsUnread()
  const [open, setOpen] = useState(false)
  // cuando sube la cuenta, la campana se mece (cambia la key y la animación vuelve a correr)
  const prev = useRef(unread)
  const [ring, setRing] = useState(0)
  useEffect(() => {
    if (unread > prev.current) setRing((r) => r + 1)
    prev.current = unread
  }, [unread])

  const label = unread ? t('openCount', { count: unread }) : t('open')
  const side = variant === 'rail' ? 'right' : 'bottom'
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) track('feature.notifications_open')
      }}
    >
      <Tooltip content={t('title')} side={side}>
        <PopoverTrigger className={TRIGGER[variant]} aria-label={label} data-tour="notifications">
          <Bell key={ring} className={ring ? 'bell-ring' : undefined} />
          {unread ? (
            variant === 'rail' ? (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-accent ring-2 ring-sidebar" aria-hidden />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'absolute -right-1 -top-1 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent px-[3px] text-[9.5px] font-semibold tabular-nums leading-none text-accent-fg ring-2',
                  variant === 'sidebar' || variant === 'frame' ? 'ring-sidebar' : 'ring-canvas',
                )}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )
          ) : null}
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side={side} align={variant === 'frame' ? 'end' : 'start'} sideOffset={8} className="flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden p-0">
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('notifications')
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const query = useNotifications(filter)
  const { data: unread = 0 } = useNotificationsUnread()
  const { markRead } = useNotificationMutations()
  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line-soft px-4 pb-2.5 pt-3">
        <h2 className="text-[13.5px] font-semibold text-fg">{t('title')}</h2>
        {unread ? <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums text-accent-ink">{unread}</span> : null}
        <div className="ml-auto flex items-center gap-1">
          <div role="tablist" aria-label={t('title')} className="flex rounded-md bg-hover p-0.5">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'h-6 rounded-[5px] px-2 text-xs font-medium text-fg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/35',
                  filter === f ? 'bg-panel text-fg shadow-card' : 'hover:text-fg',
                )}
              >
                {t(`tabs.${f}`)}
              </button>
            ))}
          </div>
          <Tooltip content={t('markAllRead')}>
            <button
              type="button"
              disabled={!unread}
              onClick={() => markRead.mutate(undefined)}
              aria-label={t('markAllRead')}
              className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/35 disabled:pointer-events-none disabled:opacity-40"
            >
              <CheckCheck className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="max-h-[min(480px,65vh)] overflow-y-auto scrollbar-thin">
        {query.isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-[30px] rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length ? (
          <ul className="flex flex-col py-1">
            {items.map((n) => (
              <NotificationItem key={n.id} n={n} onOpened={onClose} />
            ))}
            {query.hasNextPage ? (
              <li className="flex justify-center py-2">
                <Button variant="ghost" size="xs" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                  {t('loadMore')}
                </Button>
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-done-soft text-done">
              <CheckCheck className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-fg">{filter === 'unread' ? t('emptyUnread') : t('emptyAll')}</p>
            <p className="mt-1 max-w-[30ch] text-xs leading-relaxed text-fg-muted">{t('emptyHint')}</p>
          </div>
        )}
      </div>

      <DesktopRow />
    </>
  )
}

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  task_assigned: UserRoundPlus,
  task_comment: MessageSquare,
  task_mention: AtSign,
  task_done: CircleCheck,
  chat_mention: AtSign,
  task_due_today: CalendarClock,
  task_overdue: CalendarX2,
  member_joined: UserRoundCheck,
  task_status: ArrowRightLeft,
  task_due_changed: CalendarSync,
  task_unblocked: LockOpen,
  request_new: Inbox,
  request_message: MessageSquare,
  request_status: ArrowRightLeft,
}

// el color dice qué pasó: asignada en ciruela, hecha en frambuesa, mención y «vence hoy» en mandarina,
// vencida en rojo, alguien nuevo en verde, comentario neutro
const KIND_TONE: Record<NotificationKind, string> = {
  task_assigned: 'bg-accent text-accent-fg',
  task_comment: 'bg-fg-muted text-canvas',
  task_mention: 'bg-mandarina text-on-mandarina',
  task_done: 'bg-done text-canvas',
  chat_mention: 'bg-mandarina text-on-mandarina',
  task_due_today: 'bg-mandarina text-on-mandarina',
  task_overdue: 'bg-danger text-canvas',
  member_joined: 'bg-success text-canvas',
  task_status: 'bg-info text-canvas',
  task_due_changed: 'bg-mandarina text-on-mandarina',
  task_unblocked: 'bg-success text-canvas',
  request_new: 'bg-mandarina text-on-mandarina',
  request_message: 'bg-fg-muted text-canvas',
  request_status: 'bg-info text-canvas',
}

function NotificationItem({ n, onOpened }: { n: AppNotification; onOpened: () => void }) {
  const t = useTranslations('notifications')
  const locale = useDateLocale()
  const router = useRouter()
  const { open: openTask } = useOpenTask()
  const { markRead, markUnread } = useNotificationMutations()
  const Icon = KIND_ICON[n.kind]
  const unread = !n.readAt
  const excerpt = n.comment?.excerpt ?? n.message?.excerpt ?? ''

  const open = () => {
    if (unread) markRead.mutate([n.id])
    track('feature.notification_click', { props: { kind: n.kind } })
    onOpened()
    if (n.chat && n.message) router.push(`/chat/${n.chat.id}?m=${n.message.id}`)
    else if (n.request) router.push(`/requests/${n.request.id}`)
    else if (n.task) openTask(n.task.id)
    else if (n.kind === 'member_joined') router.push('/settings/members')
  }

  return (
    <li className="group/ntf relative">
      <button
        type="button"
        onClick={open}
        className={cn(
          'flex w-full gap-3 py-2.5 pl-4 pr-10 text-left outline-none transition-colors duration-150 hover:bg-hover/60 focus-visible:bg-hover/60',
          unread && 'bg-highlight/45',
        )}
      >
        <span className="relative mt-0.5 flex shrink-0 self-start">
          {/* sin persona (recordatorios): lo dice Veltro */}
          {n.actor ? (
            <Avatar name={n.actor.fullName} src={n.actor.avatarUrl} seed={n.actor.id} size={30} />
          ) : (
            <span className="flex size-[30px] items-center justify-center rounded-full bg-highlight">
              <LogoMark className="size-4" />
            </span>
          )}
          <span className={cn('absolute -bottom-1 -right-1 flex size-[17px] items-center justify-center rounded-full ring-2 ring-panel', KIND_TONE[n.kind])}>
            <Icon className="size-[10px]" strokeWidth={2.6} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[13px] leading-snug', unread ? 'text-fg' : 'text-fg-muted')}>
            {t.rich(`kinds.${n.kind}`, { ...vars(n, t, locale), b: (c) => <span className="font-semibold text-fg">{c}</span> })}
          </span>
          {n.task ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg">
              <StatusIcon status={n.task.status as TaskStatus} />
              <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{n.task.ref}</span>
              <span className="truncate">{n.task.title}</span>
            </span>
          ) : null}
          {n.request ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg">
              <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{n.request.code}</span>
              <span className="truncate">{n.request.title}</span>
            </span>
          ) : null}
          {excerpt ? <span className="mt-1.5 line-clamp-2 rounded-md bg-hover/70 px-2 py-1 text-[12.5px] leading-snug text-fg-muted">{excerpt}</span> : null}
          <span className="mt-1 block text-[11px] text-fg-subtle">
            {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true, locale })}
            {n.workspace ? ` · ${n.workspace.name}` : ''}
          </span>
        </span>
      </button>
      <Tooltip content={unread ? t('markRead') : t('markUnread')} side="left">
        <button
          type="button"
          onClick={() => (unread ? markRead.mutate([n.id]) : markUnread.mutate(n.id))}
          aria-label={unread ? t('markRead') : t('markUnread')}
          className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-mid/35"
        >
          <span
            className={cn(
              'size-2 rounded-full transition-opacity duration-150',
              unread ? 'bg-accent' : 'opacity-0 ring-[1.5px] ring-line-strong group-hover/ntf:opacity-100 group-focus-within/ntf:opacity-100',
            )}
          />
        </button>
      </Tooltip>
    </li>
  )
}

/** Avisos del escritorio: ofrecerlos, prenderlos o apagarlos (o explicar que el navegador los bloqueó). */
function DesktopRow() {
  const t = useTranslations('notifications.desktop')
  const state = useDesktopState()
  if (state === 'unsupported') return null
  return (
    <div className="flex items-center gap-3 border-t border-line-soft bg-canvas/60 px-4 py-2.5 text-xs">
      {state === 'denied' ? (
        <>
          <BellOff className="size-3.5 shrink-0 text-fg-subtle" />
          <p className="text-fg-muted">{t('denied')}</p>
        </>
      ) : state === 'default' ? (
        <>
          <p className="min-w-0 flex-1 text-fg-muted">{t('offer')}</p>
          <Button
            size="xs"
            variant="primary"
            onClick={async () => {
              const s = await enableDesktop()
              track('feature.desktop_notifications', { props: { state: s } })
            }}
          >
            {t('enable')}
          </Button>
        </>
      ) : (
        <label className="flex w-full cursor-pointer items-center gap-3">
          <span className="min-w-0 flex-1 text-fg-muted">{t('on')}</span>
          <Switch checked={state === 'on'} onCheckedChange={(v) => (v ? void enableDesktop() : disableDesktop())} />
        </label>
      )}
    </div>
  )
}
