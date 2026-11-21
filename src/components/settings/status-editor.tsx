'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusIcon } from '@/components/tasks/status-icon'
import { api, ApiError } from '@/lib/api/client'
import type { ApiTaskStatuses } from '@/lib/api/tareas'
import { TASK_STATUSES } from '@/lib/constants'
import { defaultStatusDefs } from '@/lib/statuses'
import { cn } from '@/lib/utils'
import { SideSection, SplitPanel } from './ui'
import type { TaskStatus, TaskStatusDef } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { useConfirm } from '@/components/ui/confirm'

/** En orden de categoría (Backlog → Hecha) y, dentro de cada una, como estén. */
const flatten = (list: TaskStatusDef[]) => TASK_STATUSES.flatMap((c) => list.filter((s) => s.category === c))

/**
 * Estados propios de un espacio, una fila por categoría (Backlog, Por hacer, En progreso, Bloqueada,
 * Hecha) con sus estados como fichas que se escriben ahí mismo. La categoría es la que entienden Pulso,
 * Mesa y los contadores, así un «En revisión cliente» cuenta como «En progreso». Al lado: cómo queda el
 * menú de estados de una tarea.
 */
export function StatusEditor({ workspace }: { workspace: WorkspaceWithRole }) {
  const t = useTranslations('settings.workspaces.statuses')
  const tCat = useTranslations('tasks.status')
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const router = useRouter()
  const defaults = () => defaultStatusDefs(Object.fromEntries(TASK_STATUSES.map((c) => [c, tCat(c)])) as Record<TaskStatus, string>)
  const [custom, setCustom] = useState(Boolean(workspace.task_statuses?.length))
  // lo guardado (lo que hay en la API) y lo que se ve (con lo que se está escribiendo)
  const [saved, setSaved] = useState<TaskStatusDef[]>(() => (workspace.task_statuses?.length ? workspace.task_statuses : defaults()))
  const [draft, setDraft] = useState<TaskStatusDef[]>(saved)
  // la ficha recién agregada, todavía sin nombre (no se guarda hasta que lo tenga)
  const [fresh, setFresh] = useState<string | null>(null)
  const [saving, setSaving] = useState(0)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const savedRef = useRef(saved)
  savedRef.current = saved

  /**
   * Cada cambio se guarda solo, al momento (antes había que tocar «Guardar cambios» abajo y un Enter
   * no hacía nada: lo escrito se perdía al salir). Se guarda la lista entera y en orden, uno tras otro.
   */
  const persist = (next: TaskStatusDef[], done: string) => {
    const clean = flatten(next)
      .map((s) => ({ ...s, name: s.name.trim().slice(0, 40) }))
      .filter((s) => s.name)
    setSaving((n) => n + 1)
    queue.current = queue.current.then(async () => {
      try {
        // la lista vacía vuelve a los estándar; las tareas de un estado quitado se quedan con su categoría
        const res = await api<ApiTaskStatuses>(`/v1/workspaces/${workspace.id}/task-statuses`, { method: 'PUT', body: { statuses: clean } })
        const list = res.custom ? res.items.map((s) => ({ id: s.id!, name: s.name, category: s.category })) : defaults()
        setSaved(list)
        setCustom(res.custom)
        // lo guardado, más la ficha nueva que se esté escribiendo (si hay)
        setDraft((d) => [...list, ...d.filter((s) => !s.name.trim() && !list.some((x) => x.id === s.id))])
        toast.success(done)
        router.refresh()
      } catch (e) {
        setDraft(savedRef.current)
        toast.error(t('error'), { description: problemOf(e) })
      } finally {
        setSaving((n) => n - 1)
      }
    })
  }

  const of = (c: TaskStatus) => draft.filter((s) => s.category === c)
  const rename = (id: string, name: string) => setDraft((d) => d.map((s) => (s.id === id ? { ...s, name } : s)))
  const revert = (id: string) => {
    const before = saved.find((s) => s.id === id)
    if (before) rename(id, before.name)
    else setDraft((d) => d.filter((s) => s.id !== id))
    if (fresh === id) setFresh(null)
  }

  // al salir de la ficha (o con Enter): si cambió, se guarda; vacía o repetida, vuelve a como estaba
  const commit = (id: string) => {
    const s = draft.find((x) => x.id === id)
    if (!s) return
    const name = s.name.trim()
    const before = saved.find((x) => x.id === id)
    if (!name) {
      if (before) toast.error(t('emptyName'))
      revert(id)
      return
    }
    if (draft.some((x) => x.id !== id && x.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error(t('duplicate', { name }))
      revert(id)
      return
    }
    if (before?.name === name) return
    if (fresh === id) setFresh(null)
    persist(
      draft.map((x) => (x.id === id ? { ...x, name } : x)),
      before ? t('renamed', { name }) : t('added', { name }),
    )
  }

  const add = (c: TaskStatus) => {
    // una ficha nueva a la vez: si ya hay una sin nombre, se usa esa
    if (fresh && draft.some((s) => s.id === fresh)) {
      setDraft((d) => d.map((s) => (s.id === fresh ? { ...s, category: c } : s)))
      return
    }
    const id = `s_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    setFresh(id)
    setDraft((d) => [...d, { id, name: '', category: c }])
  }

  const remove = async (s: TaskStatusDef) => {
    if (!saved.some((x) => x.id === s.id)) return revert(s.id)
    const to = saved.find((x) => x.category === s.category && x.id !== s.id) ?? saved.find((x) => x.id !== s.id)
    const ok = await confirm({
      title: t('removeConfirm', { name: s.name }),
      description: to ? t('removeHint', { to: to.name }) : undefined,
      danger: true,
      confirmLabel: tConfirm('remove'),
    })
    if (ok) persist(saved.filter((x) => x.id !== s.id), t('removed', { name: s.name }))
  }

  // mover dentro de su categoría: se cambia de lugar con el vecino de la misma categoría
  const move = (id: string, dir: -1 | 1) => {
    const list = [...saved]
    const s = list.find((x) => x.id === id)
    if (!s) return
    const peers = list.filter((x) => x.category === s.category)
    const j = peers.findIndex((x) => x.id === id) + dir
    if (j < 0 || j >= peers.length) return
    const a = list.indexOf(s)
    const b = list.indexOf(peers[j])
    ;[list[a], list[b]] = [list[b], list[a]]
    setDraft((d) => [...list, ...d.filter((x) => !list.some((y) => y.id === x.id))])
    persist(list, t('saved'))
  }

  const menu = flatten(draft).filter((s) => s.name.trim())

  return (
    <SplitPanel
      main={
        <div className="flex min-h-0 flex-1 flex-col divide-y divide-line-soft overflow-y-auto scrollbar-thin">
          {TASK_STATUSES.map((c) => {
            const list = of(c)
            return (
              <section key={c} className="flex min-h-[4.75rem] flex-1 items-center gap-6 px-5 py-3">
                <div className="w-44 shrink-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <StatusIcon status={c} className="size-4" />
                    {tCat(c)}
                  </p>
                  <p className="mt-0.5 pl-6 text-xs leading-snug text-fg-muted">{t(`categoryHints.${c}`)}</p>
                </div>
                <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {list.map((s, i) => {
                    const isNew = !saved.some((x) => x.id === s.id)
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          'group/chip flex h-8 cursor-text items-center gap-1.5 rounded-lg bg-panel pl-2.5 pr-1 shadow-card ring-1 transition-shadow hover:ring-line-strong focus-within:ring-2 focus-within:ring-accent-mid',
                          isNew ? 'ring-accent-mid/60' : 'ring-line',
                        )}
                        title={t('renameHint')}
                      >
                        <StatusIcon status={c} className="size-3.5 shrink-0" />
                        <input
                          value={s.name}
                          size={Math.max(8, s.name.length + 1)}
                          autoFocus={s.id === fresh}
                          onChange={(e) => rename(s.id, e.target.value)}
                          onBlur={() => commit(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              e.currentTarget.blur()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              revert(s.id)
                              // sin guardar: al salir de la ficha ya no hay nada que guardar
                              requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur())
                            }
                          }}
                          placeholder={t('namePlaceholder')}
                          maxLength={40}
                          aria-label={t('namePlaceholder')}
                          className="min-w-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
                        />
                        {isNew ? null : (
                          <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/chip:opacity-100">
                            {list.length > 1 ? (
                              <>
                                <ChipButton label={t('moveLeft')} disabled={i === 0} onClick={() => move(s.id, -1)}>
                                  <ChevronLeft />
                                </ChipButton>
                                <ChipButton label={t('moveRight')} disabled={i === list.length - 1} onClick={() => move(s.id, 1)}>
                                  <ChevronRight />
                                </ChipButton>
                              </>
                            ) : null}
                            <ChipButton label={t('remove')} danger disabled={saved.length <= 1} onClick={() => remove(s)}>
                              <X />
                            </ChipButton>
                          </span>
                        )}
                      </li>
                    )
                  })}
                  <li>
                    <button
                      type="button"
                      // que el clic no le quite el foco a la ficha que se está escribiendo antes de tiempo
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => add(c)}
                      disabled={draft.length >= 30}
                      className="flex h-8 items-center gap-1 rounded-lg border border-dashed border-line-strong px-2.5 text-xs text-fg-muted outline-none transition-colors hover:border-accent-mid hover:text-accent-ink focus-visible:border-accent-mid disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                      {t('add')}
                    </button>
                  </li>
                </ul>
              </section>
            )
          })}
        </div>
      }
      side={
        <>
          <SideSection title={t('howTitle')}>
            <p className="text-xs leading-relaxed text-fg-muted">{t('hint')}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-done" />}
              {saving ? t('saving') : t('autosave')}
            </p>
          </SideSection>
          <SideSection title={t('menuPreview')}>
            {/* el menú de estados de una tarea, con lo que estás escribiendo */}
            <div className="rounded-xl bg-panel p-1.5 shadow-card ring-1 ring-line-soft">
              {menu.map((s, i) => (
                <div key={s.id} className={cn('flex h-8 items-center gap-2 rounded-md px-2 text-[13px]', i === 0 ? 'bg-hover text-fg' : 'text-fg-muted')}>
                  <StatusIcon status={s.category} className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {i === 0 ? <Check className="size-3.5 text-fg-subtle" /> : null}
                </div>
              ))}
            </div>
          </SideSection>
          <SideSection className="mt-auto">
            {custom ? (
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-fg-muted">{t('customNote')}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (await confirm({ title: t('resetConfirm'), danger: true, confirmLabel: tConfirm('reset') })) persist([], t('saved'))
                  }}
                >
                  <RotateCcw />
                  {t('reset')}
                </Button>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-fg-muted">{t('standardNote')}</p>
            )}
          </SideSection>
        </>
      }
    />
  )
}

/** Lo que dijo la API (p. ej. «Nombre repetido»), para que el aviso diga qué pasó y no solo que falló. */
function problemOf(e: unknown): string | undefined {
  if (!(e instanceof ApiError)) return undefined
  const details = Array.isArray(e.details) ? (e.details as { problem?: string }[]) : []
  return details.map((d) => d.problem).filter(Boolean).join(' · ') || e.text || undefined
}

function ChipButton({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-md text-fg-subtle outline-none disabled:opacity-30 [&_svg]:size-3.5',
        danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
