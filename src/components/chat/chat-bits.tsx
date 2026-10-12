'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import type { ChatSummary } from '@/lib/queries/chats'
import { cn } from '@/lib/utils'

/** El nombre de un chat: el del grupo, o la otra persona en un directo. */
export function useChatName() {
  const t = useTranslations('pasillo')
  const { user } = useApp()
  const memberMap = useMemberMap()
  return useCallback(
    (chat: Pick<ChatSummary, 'kind' | 'name' | 'members'>) => {
      if (chat.kind === 'group') return chat.name || t('untitledGroup')
      const other = chat.members.find((m) => m.user_id !== user.id)
      return (other && memberMap.get(other.user_id)?.full_name) || t('onlyYou')
    },
    [memberMap, user.id, t],
  )
}

/** La última línea de un chat en corto: lo escrito, o qué se compartió. */
export function useChatPreview() {
  const t = useTranslations('pasillo')
  return useCallback(
    (last: ChatSummary['last']) =>
      !last
        ? t('noMessages')
        : last.kind === 'system'
          ? t('preview.system')
          : last.kind === 'meeting'
            ? t('preview.meeting', { title: last.meta.invite?.title ?? '' })
            : last.kind === 'text'
              ? last.body
              : last.body || t(`preview.${last.kind}`),
    [t],
  )
}

/** Avatar de un chat: la cara de la otra persona, o las iniciales del grupo sobre un tono propio. */
export function ChatAvatar({ chat, size = 36, className }: { chat: Pick<ChatSummary, 'id' | 'kind' | 'name' | 'members'>; size?: number; className?: string }) {
  const { user } = useApp()
  const memberMap = useMemberMap()
  const name = useChatName()(chat)
  if (chat.kind === 'direct') {
    const other = memberMap.get(chat.members.find((m) => m.user_id !== user.id)?.user_id ?? '')
    return <Avatar name={other?.full_name ?? name} src={other?.avatar_url} seed={other?.id ?? chat.id} size={size} className={className} />
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '#'
  const hue = [...chat.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 360
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[30%] font-semibold text-accent-fg', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `oklch(0.58 0.13 ${hue})` }}
    >
      {initials}
    </span>
  )
}
