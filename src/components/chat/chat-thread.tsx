'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { addDays, differenceInMinutes, format, isSameDay, isToday, isYesterday } from 'date-fns'
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  Copy,
  FileText,
  LogOut,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Reply,
  Search,
  SendHorizontal,
  Upload,
  UserPlus,
  Vault,
  Video,
  X,
} from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { DocMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/tasks/status-icon'
import { NewMeetingDialog } from '@/components/calendar/new-meeting-dialog'
import { FileKindIcon, fileTitle } from '@/components/vault/file-visual'
import { useChatMessages, useChatMutations, useChats, type ChatSummary, type NewMessage } from '@/lib/queries/chats'
import { useAttachmentMutations, useVaultFiles } from '@/lib/queries/attachments'
import { useTasks } from '@/lib/queries/tasks'
import { useDocsIn } from '@/lib/queries/docs'
import { useCalendarEvents } from '@/lib/queries/calendar'
import { useDateLocale } from '@/lib/dates'
import { track } from '@/lib/telemetry'
import type { ChatMessageRow, MeetingInvite } from '@/lib/database.types'
import type { CalendarEvent } from '@/lib/types'
import { cn, taskRef } from '@/lib/utils'
import { ChatAvatar, useChatName } from './chat-bits'
import { DocCard, FileCard, InviteCard, TaskCard } from './message-cards'
import { PeopleDialog } from './new-chat-dialog'
import { inviteFrom, useMeetNow } from './meet-now'
import { useConfirm } from '@/components/ui/confirm'

/** Mensajes seguidos de la misma persona dentro de estos minutos van juntos, sin repetir nombre. */
const GROUP_MINUTES = 7

export function ChatThread({ chatId }: { chatId: string }) {
  const t = useTranslations('pasillo')
  const router = useRouter()
  const { user } = useApp()
  const { data: chats, isLoading: loadingChats } = useChats({ fast: true })
  const chat = chats?.find((c) => c.id === chatId)
  const { data: messages, isLoading } = useChatMessages(chatId)
  const { markRead } = useChatMutations()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [replyTo, setReplyTo] = useState<ChatMessageRow | null>(null)

  // "Nuevos": dónde estaba la última lectura al abrir el chat (no se mueve mientras se lee)
  const [readMark, setReadMark] = useState<string | null | undefined>(undefined)
  const myRead = chat?.members.find((m) => m.user_id === user.id)?.last_read_at
  useEffect(() => {
    if (chat && readMark === undefined) setReadMark(myRead ?? '')
  }, [chat, myRead, readMark])

  // leer = marcar leído cuando llega algo nuevo con el chat abierto
  const lastId = messages?.at(-1)?.id
  const unread = chat?.unread ?? 0
  useEffect(() => {
    if (lastId && unread > 0 && document.visibilityState === 'visible') markRead.mutate(chatId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, lastId, unread])

  // abajo de todo al abrir y cuando llega algo, salvo que estés leyendo más arriba. Las tarjetas cargan
  // después y cambian el alto: mientras estés abajo, se acompaña ese crecimiento.
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages?.length, chatId])
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [chat?.id, isLoading])

  if (!chat) {
    return loadingChats ? (
      <div className="flex flex-1 flex-col gap-3 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16" />
      </div>
    ) : (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-fg-muted">{t('notFound')}</div>
    )
  }

  const firstNew = readMark ? messages?.find((m) => m.created_at > readMark && m.user_id !== user.id && m.kind !== 'system')?.id : undefined

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ThreadHeader chat={chat} onBack={() => router.push('/chat')} />
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-4 pt-2 scrollbar-thin"
      >
        <div ref={contentRef} className="flex min-h-full flex-col">
          {isLoading ? (
            <div className="flex flex-col gap-4 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : messages?.length ? (
            <MessageList messages={messages} firstNew={firstNew} onReply={setReplyTo} />
          ) : (
            <EmptyThread chat={chat} />
          )}
        </div>
      </div>
      <Composer
        chat={chat}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSent={() => {
          stick.current = true
        }}
      />
    </div>
  )
}

function ThreadHeader({ chat, onBack }: { chat: ChatSummary; onBack: () => void }) {
  const t = useTranslations('pasillo')
  const { user, members } = useApp()
  const memberMap = useMemberMap()
  const chatName = useChatName()
  const { rename, addMembers, leave } = useChatMutations()
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const people = chat.members.flatMap((m) => memberMap.get(m.user_id) ?? [])
  const other = chat.kind === 'direct' ? people.find((p) => p.id !== user.id) : undefined
  const otherRole = other ? members.find((m) => m.id === other.id) : undefined
  const meet = useMeetNow(chat)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onBack} aria-label={t('back')}>
        <ArrowLeft />
      </Button>
      <ChatAvatar chat={chat} size={32} />
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-fg">{chatName(chat)}</h1>
        <p className="truncate text-xs text-fg-muted">
          {chat.kind === 'group'
            ? t('membersList', { count: people.length, names: people.map((p) => (p.id === user.id ? t('you') : p.full_name.split(' ')[0])).join(', ') })
            : (otherRole?.title ?? other?.email ?? '')}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {chat.kind === 'group' ? <AvatarStack people={people} size={24} max={4} className="hidden sm:flex" /> : null}
        <Tooltip content={t('meetNow.hint')}>
          <Button size="sm" onClick={meet.start} loading={meet.pending} aria-label={t('meetNow.label')}>
            {meet.pending ? null : <Video />}
            <span className="hidden xl:inline">{t('meetNow.label')}</span>
          </Button>
        </Tooltip>
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('more')} />}>
            <MoreHorizontal />
          </MenuTrigger>
          <MenuContent align="end" className="w-56">
            {chat.kind === 'group' ? (
              <>
                <MenuItem
                  onClick={() => {
                    setName(chat.name ?? '')
                    setRenaming(true)
                  }}
                >
                  <Pencil />
                  {t('rename')}
                </MenuItem>
                <MenuItem onClick={() => setAdding(true)}>
                  <UserPlus />
                  {t('addPeople')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  onClick={async () => {
                    if (!(await confirm({ title: t('leaveConfirm', { name: chatName(chat) }), danger: true, confirmLabel: tConfirm('leave') }))) return
                    leave.mutate(chat.id, { onSuccess: () => router.push('/chat') })
                  }}
                >
                  <LogOut />
                  {t('leave')}
                </MenuItem>
              </>
            ) : (
              <MenuItem onClick={() => setAdding(true)}>
                <UserPlus />
                {t('makeGroup')}
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="max-w-sm">
          <DialogHeader title={t('rename')} />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              rename.mutate({ chatId: chat.id, name })
              setRenaming(false)
            }}
          >
            <DialogBody>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} placeholder={t('groupNamePlaceholder')} />
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* en un grupo suma personas; en un directo arma un grupo nuevo con quien se elija */}
      <PeopleDialog
        open={adding}
        onOpenChange={setAdding}
        mode={chat.kind === 'group' ? 'add' : 'group'}
        exclude={chat.members.map((m) => m.user_id)}
        preselected={chat.kind === 'direct' ? chat.members.map((m) => m.user_id).filter((id) => id !== user.id) : []}
        onDone={(ids) => {
          if (chat.kind === 'group') addMembers.mutate({ chatId: chat.id, userIds: ids })
        }}
      />
    </header>
  )
}

function dayLabel(d: Date, t: (k: string) => string, locale: Parameters<typeof format>[2]) {
  if (isToday(d)) return t('today')
  if (isYesterday(d)) return t('yesterday')
  return format(d, 'EEEE d MMMM', locale)
}

function MessageList({ messages, firstNew, onReply }: { messages: ChatMessageRow[]; firstNew?: string; onReply: (m: ChatMessageRow) => void }) {
  const t = useTranslations('pasillo')
  const locale = useDateLocale()
  // un bloque por día: así la etiqueta del día queda fija arriba solo mientras se lee ese día
  const days: ChatMessageRow[][] = []
  for (const m of messages) {
    const last = days.at(-1)
    if (last && isSameDay(new Date(last[0].created_at), new Date(m.created_at))) last.push(m)
    else days.push([m])
  }
  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <section key={day[0].id}>
          <div className="sticky top-0 z-[1] flex justify-center py-2">
            <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-2xs font-medium capitalize text-fg-muted shadow-card">
              {dayLabel(new Date(day[0].created_at), t, { locale })}
            </span>
          </div>
          {day.map((m, i) => {
            const prev = day[i - 1]
            const joined =
              prev &&
              prev.kind !== 'system' &&
              m.kind !== 'system' &&
              prev.user_id === m.user_id &&
              differenceInMinutes(new Date(m.created_at), new Date(prev.created_at)) < GROUP_MINUTES &&
              m.id !== firstNew
            return (
              <Fragment key={m.id}>
                {m.id === firstNew ? (
                  <div className="my-2 flex items-center gap-2 px-5" role="separator">
                    <span className="h-px flex-1 bg-danger/40" />
                    <span className="text-2xs font-semibold uppercase tracking-wide text-danger">{t('newMessages')}</span>
                  </div>
                ) : null}
                {m.kind === 'system' ? <SystemLine m={m} /> : <MessageRow m={m} joined={Boolean(joined)} onReply={() => onReply(m)} />}
              </Fragment>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function SystemLine({ m }: { m: ChatMessageRow }) {
  const t = useTranslations('pasillo.system')
  const { user } = useApp()
  const memberMap = useMemberMap()
  const who = (id: string | null) => (id === user.id ? t('you') : (memberMap.get(id ?? '')?.full_name.split(' ')[0] ?? '?'))
  const others = (m.meta.users ?? []).map(who).join(', ')
  const kind = m.meta.system ?? 'created'
  return <p className="px-5 py-1.5 text-center text-xs text-fg-subtle">{t(kind, { who: who(m.user_id), others, name: m.meta.name ?? '' })}</p>
}

const URL_RE = /(https?:\/\/[^\s]+)/g

/** Texto con los links clicables. */
function RichText({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-ink underline decoration-accent-mid/40 underline-offset-2 hover:decoration-accent-mid"
          >
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

function MessageRow({ m, joined, onReply }: { m: ChatMessageRow; joined: boolean; onReply: () => void }) {
  const t = useTranslations('pasillo')
  const { user } = useApp()
  const memberMap = useMemberMap()
  const author = memberMap.get(m.user_id ?? '')
  const at = new Date(m.created_at)
  const sending = m.id.startsWith('temp-')
  const quoted = m.meta.replyTo
  const quotedAuthor = quoted ? (quoted.userId === user.id ? t('you') : (memberMap.get(quoted.userId ?? '')?.full_name.split(' ')[0] ?? '?')) : ''
  return (
    <div id={`msg-${m.id}`} className={cn('group/msg relative flex gap-3 px-5 py-0.5 hover:bg-hover/40', !joined && 'mt-2.5 pt-1', sending && 'opacity-60')}>
      {sending ? null : (
        <div className="absolute -top-3 right-5 z-[2] hidden items-center rounded-lg border border-line bg-panel p-0.5 shadow-card group-hover/msg:flex group-focus-within/msg:flex">
          <Tooltip content={t('reply')}>
            <button
              type="button"
              onClick={onReply}
              aria-label={t('reply')}
              className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
            >
              <Reply className="size-4" />
            </button>
          </Tooltip>
          {m.body ? (
            <Tooltip content={t('copyText')}>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(m.body)
                  toast.success(t('copied'))
                }}
                aria-label={t('copyText')}
                className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
              >
                <Copy className="size-4" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      )}
      <div className="w-9 shrink-0">
        {joined ? (
          <span className="block pt-0.5 text-right text-2xs tabular-nums text-fg-subtle opacity-0 group-hover/msg:opacity-100">{format(at, 'HH:mm')}</span>
        ) : (
          <Avatar name={author?.full_name} src={author?.avatar_url} seed={m.user_id ?? m.id} size={36} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {joined ? null : (
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-fg">{m.user_id === user.id ? t('you') : (author?.full_name ?? '?')}</span>
            <span className="text-2xs tabular-nums text-fg-subtle">{format(at, 'HH:mm')}</span>
          </p>
        )}
        {quoted ? (
          <button
            type="button"
            onClick={() => document.getElementById(`msg-${quoted.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="mb-1 mt-0.5 flex max-w-md items-baseline gap-1.5 rounded-md bg-hover/70 px-2 py-1 text-left text-xs text-fg-muted hover:bg-hover"
          >
            <Reply className="size-3 shrink-0 self-center text-fg-subtle" />
            <span className="shrink-0 font-medium text-fg">{quotedAuthor}</span>
            <span className="truncate">{quoted.body || t('quotedCard')}</span>
          </button>
        ) : null}
        {m.body ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
            <RichText text={m.body} />
          </p>
        ) : null}
        {m.kind === 'task' && m.ref_id ? <TaskCard id={m.ref_id} /> : null}
        {m.kind === 'file' && m.ref_id ? <FileCard id={m.ref_id} /> : null}
        {m.kind === 'doc' && m.ref_id ? <DocCard id={m.ref_id} /> : null}
        {m.kind === 'meeting' ? <InviteCard message={m} /> : null}
      </div>
    </div>
  )
}

function EmptyThread({ chat }: { chat: ChatSummary }) {
  const t = useTranslations('pasillo')
  const chatName = useChatName()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <ChatAvatar chat={chat} size={56} />
      <p className="text-sm font-medium text-fg">{chat.kind === 'group' ? t('emptyGroup', { name: chatName(chat) }) : t('emptyDirect', { name: chatName(chat) })}</p>
      <p className="max-w-sm text-sm text-fg-muted">{t('emptyHint')}</p>
    </div>
  )
}

// ---------------- compositor ----------------

type Pending = { kind: NonNullable<NewMessage['kind']>; refId?: string; title: string; meta?: ChatMessageRow['meta']; icon: React.ReactNode }
type PickerKind = 'task' | 'file' | 'doc' | 'meeting'

function Composer({ chat, onSent, replyTo, onClearReply }: { chat: ChatSummary; onSent: () => void; replyTo: ChatMessageRow | null; onClearReply: () => void }) {
  const t = useTranslations('pasillo.composer')
  const tp = useTranslations('pasillo')
  const { google, user } = useApp()
  const memberMap = useMemberMap()
  const chatName = useChatName()
  const { send } = useChatMutations()
  const { upload } = useAttachmentMutations()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [picker, setPicker] = useState<PickerKind | null>(null)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const can = text.trim().length > 0 || pending !== null

  const submit = () => {
    if (!can) return
    const reply = replyTo ? { replyTo: { id: replyTo.id, userId: replyTo.user_id, body: replyTo.body.slice(0, 140) } } : {}
    send.mutate({ chatId: chat.id, kind: pending?.kind ?? 'text', body: text.trim(), refId: pending?.refId ?? null, meta: { ...pending?.meta, ...reply } })
    track(`feature.chat_send_${pending?.kind ?? 'text'}`)
    setText('')
    setPending(null)
    onClearReply()
    onSent()
  }

  // al elegir "Responder" el foco va al cuadro de texto
  useEffect(() => {
    if (replyTo) textRef.current?.focus()
  }, [replyTo])
  const replyAuthor = replyTo ? (replyTo.user_id === user.id ? tp('you') : (memberMap.get(replyTo.user_id ?? '')?.full_name.split(' ')[0] ?? '?')) : ''

  const toInvite = (e: CalendarEvent): MeetingInvite => inviteFrom(e, user.id)
  const meet = useMeetNow(chat)

  const pick = (p: Pending) => {
    setPending(p)
    setPicker(null)
    textRef.current?.focus()
  }

  const attendees = chat.members.filter((m) => m.user_id !== user.id).flatMap((m) => memberMap.get(m.user_id)?.email ?? [])

  return (
    <div className="shrink-0 px-3 pb-3 sm:px-5 sm:pb-4">
      {picker ? <PickerPanel kind={picker} onPick={pick} onClose={() => setPicker(null)} toInvite={toInvite} /> : null}
      <div className="rounded-xl border border-line bg-panel shadow-card transition-colors focus-within:border-accent-mid">
        {replyTo ? (
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
            <Reply className="size-4 shrink-0 text-fg-subtle" />
            <span className="shrink-0 text-xs text-fg-muted">{tp('replyingTo', { name: replyAuthor })}</span>
            <span className="min-w-0 truncate text-fg-muted">{replyTo.body || tp('quotedCard')}</span>
            <button
              type="button"
              onClick={onClearReply}
              className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label={tp('cancelReply')}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {pending ? (
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
            <span className="flex shrink-0">{pending.icon}</span>
            <span className="shrink-0 text-xs text-fg-muted">{t(`attached.${pending.kind}`)}</span>
            <span className="min-w-0 truncate font-medium text-fg">{pending.title}</span>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label={t('removeAttached')}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        <AutoTextarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape' && picker) setPicker(null)
            else if (e.key === 'Escape' && replyTo) onClearReply()
          }}
          placeholder={pending ? t('commentPlaceholder') : t('placeholder', { name: chatName(chat) })}
          maxLength={4000}
          className="max-h-40 bg-transparent px-3.5 pb-1 pt-3 text-sm leading-relaxed outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <ToolButton label={t('shareTask')} active={picker === 'task'} onClick={() => setPicker(picker === 'task' ? null : 'task')}>
            <CircleCheck />
          </ToolButton>
          <Menu>
            <Tooltip content={t('shareFile')}>
              <MenuTrigger className={toolClass(picker === 'file')} aria-label={t('shareFile')}>
                <Paperclip />
              </MenuTrigger>
            </Tooltip>
            <MenuContent side="top" className="w-56">
              <MenuItem onClick={() => setPicker('file')}>
                <Vault />
                {t('fromVault')}
              </MenuItem>
              <MenuItem onClick={() => fileInput.current?.click()}>
                <Upload />
                {t('fromDevice')}
              </MenuItem>
            </MenuContent>
          </Menu>
          <ToolButton label={t('shareDoc')} active={picker === 'doc'} onClick={() => setPicker(picker === 'doc' ? null : 'doc')}>
            <FileText />
          </ToolButton>
          {google ? (
            <Menu>
              <Tooltip content={t('invite')}>
                <MenuTrigger className={toolClass(picker === 'meeting')} aria-label={t('invite')}>
                  <CalendarPlus />
                </MenuTrigger>
              </Tooltip>
              <MenuContent side="top" className="w-60">
                <MenuItem onClick={meet.start} disabled={meet.pending}>
                  <Video />
                  {tp('meetNow.label')}
                </MenuItem>
                <MenuItem onClick={() => setMeetingOpen(true)}>
                  <CalendarPlus />
                  {t('newMeeting')}
                </MenuItem>
                <MenuItem onClick={() => setPicker('meeting')}>
                  <CalendarDays />
                  {t('fromCalendar')}
                </MenuItem>
              </MenuContent>
            </Menu>
          ) : null}
          <span className="ml-auto mr-2 hidden text-2xs text-fg-subtle sm:inline">{t('hint')}</span>
          <Tooltip content={t('send')} shortcut={['↵']}>
            <Button variant="primary" size="icon-sm" onClick={submit} disabled={!can} aria-label={t('send')}>
              <SendHorizontal />
            </Button>
          </Tooltip>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (!list.length) return
          // se suben a la bóveda (sueltos) y cada uno sale como tarjeta; el texto escrito acompaña al primero
          upload.mutate(
            { parent: { chatId: chat.id }, files: list },
            {
              onSuccess: (rows) => {
                rows.forEach((row, i) => send.mutate({ chatId: chat.id, kind: 'file', refId: row.id, body: i === 0 ? text.trim() : '' }))
                setText('')
                onSent()
              },
            },
          )
        }}
      />
      <NewMeetingDialog
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        defaults={{ title: chat.kind === 'group' ? (chat.name ?? '') : '', attendees }}
        onCreated={(event) => {
          send.mutate({ chatId: chat.id, kind: 'meeting', body: text.trim(), meta: { invite: toInvite(event) } })
          setText('')
          onSent()
        }}
      />
    </div>
  )
}

const toolClass = (active: boolean) =>
  cn(
    'inline-flex size-8 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:bg-hover [&_svg]:size-4',
    active && 'bg-accent-soft text-accent-ink hover:bg-accent-soft',
  )

function ToolButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={toolClass(active)}>
        {children}
      </button>
    </Tooltip>
  )
}

type PickRow = { id: string; label: string; sub: string; icon: React.ReactNode; pending: Pending }

/** Buscador sobre el compositor para elegir qué compartir: tarea, archivo, doc o reunión del calendario. */
function PickerPanel({ kind, onPick, onClose, toInvite }: { kind: PickerKind; onPick: (p: Pending) => void; onClose: () => void; toInvite: (e: CalendarEvent) => MeetingInvite }) {
  const t = useTranslations('pasillo.composer')
  const td = useTranslations('docs')
  const locale = useDateLocale()
  const { workspaces, observedWorkspaces, google } = useApp()
  const wsMap = useWorkspaceMap()
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const [q, setQ] = useState('')
  const { data: tasks } = useTasks(kind === 'task' ? { kind: 'workspaces', workspaceIds: wsIds } : null)
  const { data: files } = useVaultFiles()
  const { data: docs } = useDocsIn(kind === 'doc' ? wsIds : [])
  const range = useMemo(() => ({ from: new Date(), to: addDays(new Date(), 21) }), [])
  const { data: events } = useCalendarEvents(range.from, range.to, kind === 'meeting' && Boolean(google))

  const rows: PickRow[] = useMemo(() => {
    if (kind === 'task') {
      return (tasks ?? [])
        .filter((x) => x.status !== 'done')
        .map((x) => {
          const w = wsMap.get(x.workspace_id)
          const ref = w ? taskRef(w.key, x.number) : ''
          return {
            id: x.id,
            label: x.title,
            sub: `${ref} · ${w?.name ?? ''}`,
            icon: <StatusIcon status={x.status} />,
            pending: { kind: 'task', refId: x.id, title: `${ref} ${x.title}`, icon: <StatusIcon status={x.status} /> },
          }
        })
    }
    if (kind === 'file') {
      return (files ?? []).map((f) => {
        const w = wsMap.get(f.workspace_id ?? '')
        return {
          id: f.id,
          label: fileTitle(f),
          sub: w?.name ?? t('loose'),
          icon: <FileKindIcon a={f} />,
          pending: { kind: 'file', refId: f.id, title: fileTitle(f), icon: <FileKindIcon a={f} /> },
        }
      })
    }
    if (kind === 'doc') {
      return (docs ?? []).map((d) => ({
        id: d.id,
        label: d.title || td('untitled'),
        sub: wsMap.get(d.workspace_id)?.name ?? '',
        icon: <DocMark source={d.source} />,
        pending: { kind: 'doc', refId: d.id, title: d.title || td('untitled'), icon: <DocMark source={d.source} /> },
      }))
    }
    return (events ?? [])
      .filter((e) => !e.allDay && new Date(e.end) > new Date())
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({
        id: e.id,
        label: e.title || t('untitledMeeting'),
        sub: format(new Date(e.start), 'EEE d MMM · HH:mm', { locale }),
        icon: <CalendarDays className="size-4 text-accent-mid" />,
        pending: { kind: 'meeting', title: e.title, meta: { invite: toInvite(e) }, icon: <CalendarDays className="size-4 text-accent-mid" /> },
      }))
  }, [kind, tasks, files, docs, events, wsMap, t, td, locale, toInvite])

  const needle = q.trim().toLowerCase()
  const shown = (needle ? rows.filter((r) => r.label.toLowerCase().includes(needle) || r.sub.toLowerCase().includes(needle)) : rows).slice(0, 40)

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-line bg-panel shadow-popover">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search className="size-3.5 shrink-0 text-fg-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && shown[0]) {
              e.preventDefault()
              onPick(shown[0].pending)
            }
          }}
          autoFocus
          placeholder={t(`search.${kind}`)}
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
          aria-label={t('closePicker')}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
        {shown.map((r) => (
          <button key={r.id} type="button" onClick={() => onPick(r.pending)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
            <span className="flex shrink-0">{r.icon}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.label}</span>
            <span className="shrink-0 truncate text-xs text-fg-subtle">{r.sub}</span>
          </button>
        ))}
        {shown.length === 0 ? <p className="px-2 py-3 text-sm text-fg-subtle">{t('nothing')}</p> : null}
      </div>
    </div>
  )
}
