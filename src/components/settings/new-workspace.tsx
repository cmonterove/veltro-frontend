'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, FolderKanban, Handshake, LayoutGrid, LifeBuoy, ListTodo, Megaphone, SlidersHorizontal, TrendingUp, UserPlus, type LucideIcon } from 'lucide-react'
import { applyWorkspaceTemplate, createWorkspace } from '@/app/actions/settings'
import { useApp } from '@/components/app/app-context'
import { monogramOf, WorkspaceMark } from '@/components/app/marks'
import { FIELD_ICONS } from '@/components/tasks/custom-fields'
import { StatusIcon } from '@/components/tasks/status-icon'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { Usage } from '@/lib/api/ajustes'
import { WORKSPACE_COLORS } from '@/lib/constants'
import type { TaskStatus } from '@/lib/database.types'
import { cn, workspaceKeyFrom } from '@/lib/utils'
import { WORKSPACE_TEMPLATES, type WorkspaceTemplate } from '@/lib/workspace-templates'

const TEMPLATE_ICON: Record<string, LucideIcon> = { blank: LayoutGrid, client: Handshake, project: FolderKanban, sales: TrendingUp, helpdesk: LifeBuoy, content: Megaphone }
/** Lo que sigue después de crearlo (en pantallas altas, al pie de las plantillas). */
const AFTER: { key: 'after1' | 'after2' | 'after3'; icon: LucideIcon }[] = [
  { key: 'after1', icon: UserPlus },
  { key: 'after2', icon: ListTodo },
  { key: 'after3', icon: SlidersHorizontal },
]
/** «En blanco»: los estados de siempre, uno por categoría. */
const STANDARD: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done']

type Column = { key: string; name: string; category: TaskStatus; tasks: { title: string; n: number }[] }

/**
 * Crear un espacio. Arriba, su identidad en su propio color (la franja se tiñe al elegirlo): nombre,
 * para qué es, color y monograma. Abajo, con qué arranca: las plantillas a la izquierda y, a la
 * derecha, el tablero tal como va a quedar (sus estados como columnas, las primeras tareas con su
 * número y los campos de cada tarea). Llena el alto: nada se desplaza afuera y «Crear» queda a la vista.
 */
export function NewWorkspace({ usage }: { usage: Usage | null }) {
  const t = useTranslations('settings.workspaces')
  const tt = useTranslations('settings.workspaces.templates')
  const ts = useTranslations('tasks.status')
  const te = useTranslations('errors')
  const router = useRouter()
  const { account } = useApp()
  const [form, setForm] = useState({ name: '', icon: '', color: 'violet', description: '' })
  // ?template=client: llega desde la Mesa con la plantilla ya elegida
  const asked = useSearchParams().get('template')
  const [template, setTemplate] = useState(() => (WORKSPACE_TEMPLATES.some((x) => x.key === asked) ? (asked as string) : 'blank'))
  const [pending, start] = useTransition()
  const full = usage?.max_workspaces != null && usage.workspaces_count >= usage.max_workspaces

  const tpl = WORKSPACE_TEMPLATES.find((x) => x.key === template) ?? WORKSPACE_TEMPLATES[0]
  const name = form.name.trim()
  const monogram = form.icon.trim() || monogramOf({ name: name || 'V' })
  const live = { icon: monogram, name: name || 'V', color: form.color }
  const key = workspaceKeyFrom(name)
  const board = boardOf(tpl, tt, ts)
  const taskCount = board.reduce((n, c) => n + c.tasks.length, 0)

  const create = () =>
    start(async () => {
      const res = await createWorkspace(account.id, { ...form, name, icon: monogram })
      if (!res.ok) {
        toast.error(te(res.error))
        return
      }
      // la plantilla: estados, campos y primeras tareas, en el idioma de quien lo crea
      if (tpl.key !== 'blank' && 'id' in res) {
        const applied = await applyWorkspaceTemplate(res.id, {
          statuses: tpl.statuses.map((x) => ({ name: tt(`${tpl.key}.${x.key}`), category: x.category })),
          fields: tpl.fields.map((f) => ({
            name: tt(`${tpl.key}.${f.key}`),
            type: f.type,
            ...(f.options ? { options: f.options.map((o) => tt(`${tpl.key}.${f.key}${o}`)) } : {}),
          })),
          tasks: tpl.tasks.map((x) => ({ title: tt(`${tpl.key}.${x.key}`), status: x.status })),
        })
        if (!applied.ok) toast.error(t('templateFailed'))
      }
      toast.success(t('created'))
      if ('slug' in res) router.push(tpl.key !== 'blank' ? `/w/${res.slug}` : `/settings/workspaces/${res.slug}?tab=statuses`)
      router.refresh()
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* la identidad, en su color: lo que se ve en la barra lateral y en cada tarea */}
      <section
        className={cn(`ws-${form.color}`, 'mb-4 flex shrink-0 items-center gap-4 rounded-[18px] border border-line px-4 py-4 transition-[background-color] duration-300 ease-out sm:gap-5 sm:px-5')}
        style={{ background: 'color-mix(in oklch, var(--ws-color) 11%, var(--panel))' }}
      >
        <WorkspaceMark ws={live} size={56} className="shadow-[0_1px_3px_oklch(0.2_0.02_300/0.14)] transition-[background-color] duration-300 max-sm:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{t('newTitle')}</h1>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-panel/85 pl-3.5 pr-2 ring-1 ring-line-soft transition-shadow focus-within:ring-2 focus-within:ring-accent-mid">
            <input
              id="ws-name"
              aria-label={t('name')}
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name && !full && !pending) create()
              }}
              maxLength={80}
              placeholder={t('namePlaceholder')}
              className="h-11 min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-[-0.015em] text-fg outline-none placeholder:font-medium placeholder:text-fg-subtle"
            />
            {name ? (
              <Tooltip content={t('keyHintNew', { key })}>
                <span className="shrink-0 rounded-md bg-fg/[0.06] px-1.5 py-0.5 font-mono text-xs text-fg-muted">{key}</span>
              </Tooltip>
            ) : null}
          </div>
          {/* debajo del nombre, en una sola fila: para qué es, el color y el monograma */}
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            <input
              aria-label={t('descriptionLabel')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={300}
              placeholder={t('descriptionPlaceholder')}
              className="-ml-px h-8 min-w-48 flex-1 rounded-lg bg-transparent px-3.5 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-subtle hover:bg-panel/45 focus:bg-panel/85 focus:ring-1 focus:ring-line-soft"
            />
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('color')}>
              {WORKSPACE_COLORS.map((c) => {
                const on = form.color === c
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      `ws-${c}`,
                      'flex size-6 items-center justify-center rounded-full outline-none transition-transform duration-150 ease-out hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent-mid focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
                      on && 'scale-110 shadow-[0_0_0_2px_var(--panel),0_0_0_3.5px_var(--ws-color)]',
                    )}
                    style={{ background: 'var(--ws-color)' }}
                  >
                    {on ? <Check className="size-3.5" strokeWidth={3} style={{ color: 'var(--ws-on)' }} /> : null}
                  </button>
                )
              })}
            </div>
            <label className="flex items-center gap-2 text-2xs font-medium text-fg-muted" title={t('iconHint')}>
              {t('icon')}
              <input
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() }))}
                placeholder={monogramOf({ name: name || 'V' })}
                maxLength={2}
                className="h-7 w-11 rounded-md bg-panel/85 text-center text-sm font-semibold uppercase text-fg outline-none ring-1 ring-line-soft placeholder:text-fg-subtle focus:ring-2 focus:ring-accent-mid"
              />
            </label>
          </div>
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card lg:grid lg:min-h-[25rem] lg:grid-cols-[18.5rem_minmax(0,1fr)] 2xl:grid-cols-[21rem_minmax(0,1fr)]">
        {/* con qué arranca */}
        <div className="flex min-h-0 flex-col border-b border-line-soft bg-sidebar/45 lg:border-b-0 lg:border-r">
          <div className="px-4 pb-2 pt-4">
            <h2 className="text-[13px] font-semibold text-fg">{t('templatesHeading')}</h2>
            <p className="mt-0.5 text-xs text-fg-muted">{t('changeLater')}</p>
          </div>
          <div role="radiogroup" aria-label={t('templateTitle')} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
            {WORKSPACE_TEMPLATES.map((x) => {
              const on = x.key === tpl.key
              const Icon = TEMPLATE_ICON[x.key] ?? LayoutGrid
              return (
                <button
                  key={x.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTemplate(x.key)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent-mid',
                    on ? 'bg-panel shadow-card ring-1 ring-line' : 'hover:bg-panel/60',
                  )}
                >
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150', on ? 'bg-accent text-accent-fg' : 'bg-hover text-fg-muted')}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{tt(`${x.key}.name`)}</span>
                    <span className="block truncate text-xs text-fg-muted" title={tt(`${x.key}.description`)}>
                      {tt(`${x.key}.description`)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          {/* en pantallas altas, lo que sigue después de crearlo llena el pie de la columna */}
          <div className="hidden shrink-0 border-t border-line-soft px-4 py-4 [@media(min-height:860px)]:block">
            <p className="text-xs font-semibold text-fg">{t('afterTitle')}</p>
            <ol className="mt-2.5 flex flex-col gap-2.5">
              {AFTER.map(({ key: k, icon: Icon }) => (
                <li key={k} className="flex items-start gap-2.5 text-xs leading-relaxed text-fg-muted">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* así va a quedar */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line-soft px-5 py-3.5">
            <h2 className="text-[13px] font-semibold text-fg">{name ? t('previewBoard', { name }) : t('previewBoardNoName')}</h2>
            <p className="text-xs text-fg-muted">
              {tt(`${tpl.key}.description`)} <span className="text-fg-subtle">· {t('templateMeta', { statuses: board.length, fields: tpl.fields.length, tasks: taskCount })}</span>
            </p>
          </div>

          <div className="min-h-36 flex-1 overflow-auto p-4 scrollbar-thin sm:px-5">
            <div className="flex h-full gap-2.5" aria-hidden>
              {board.map((col) => (
                <div key={col.key} className="flex min-w-[8.5rem] flex-1 flex-col gap-2 rounded-xl bg-canvas/70 p-2 ring-1 ring-inset ring-line-soft">
                  {/* el nombre entero (hasta dos líneas): «En revisión del cliente» cortado no dice nada */}
                  <p className="flex min-h-8 items-start gap-1.5 px-1 pt-0.5 text-xs font-medium leading-tight text-fg">
                    <StatusIcon status={col.category} className="mt-px size-3.5" />
                    <span className="line-clamp-2 min-w-0 flex-1">{col.name}</span>
                    {col.tasks.length ? <span className="shrink-0 tabular-nums text-fg-subtle">{col.tasks.length}</span> : null}
                  </p>
                  {col.tasks.map((task) => (
                    <div key={task.n} className="rounded-lg bg-panel p-2.5 shadow-card ring-1 ring-line-soft">
                      <p className="text-[13px] leading-snug text-fg">{task.title}</p>
                      <p className="mt-2 flex items-center gap-1.5 text-2xs text-fg-subtle">
                        <WorkspaceMark ws={live} size={14} />
                        <span className="font-mono">
                          {key}-{task.n}
                        </span>
                      </p>
                    </div>
                  ))}
                  {col.tasks.length ? null : <div className="h-14 shrink-0 rounded-lg border border-dashed border-line" />}
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-line-soft px-5 py-3">
            <p className="text-xs font-medium text-fg-muted">{t('fieldsHeading')}</p>
            {tpl.fields.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {tpl.fields.map((f) => {
                  const Icon = FIELD_ICONS[f.type]
                  const options = f.options?.map((o) => tt(`${tpl.key}.${f.key}${o}`)) ?? []
                  return (
                    <li key={f.key} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-hover px-2 py-1 text-xs text-fg">
                      <Icon className="size-3.5 shrink-0 text-fg-muted" />
                      <span className="shrink-0 font-medium">{tt(`${tpl.key}.${f.key}`)}</span>
                      {options.length ? <span className="truncate text-fg-subtle">{options.join(' · ')}</span> : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-fg-subtle">{t('noFields')}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft bg-canvas/50 px-5 py-3">
            {full ? (
              <p className="min-w-0 flex-1 rounded-lg bg-warning-soft px-3 py-1.5 text-[13px] text-fg">{t('limitReached')}</p>
            ) : (
              <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
                {!name ? t('needName') : tpl.key === 'blank' ? t('newSummaryBlank', { name }) : t('newSummary', { name, template: tt(`${tpl.key}.name`) })}
              </p>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Link href="/settings/workspaces" className={buttonVariants({ variant: 'ghost' })}>
                {t('cancel')}
              </Link>
              <Button variant="primary" onClick={create} loading={pending} disabled={full || !name}>
                {t('create')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** El tablero de una plantilla: sus estados como columnas y cada primera tarea en la columna de su estado. */
function boardOf(tpl: WorkspaceTemplate, tt: (k: string) => string, ts: (k: TaskStatus) => string): Column[] {
  const cols: Column[] = tpl.statuses.length
    ? tpl.statuses.map((s) => ({ key: s.key, name: tt(`${tpl.key}.${s.key}`), category: s.category, tasks: [] }))
    : STANDARD.map((c) => ({ key: c, name: ts(c), category: c, tasks: [] }))
  tpl.tasks.forEach((task, i) => {
    const col = cols.find((c) => c.category === task.status) ?? cols[0]
    col.tasks.push({ title: tt(`${tpl.key}.${task.key}`), n: i + 1 })
  })
  return cols
}
