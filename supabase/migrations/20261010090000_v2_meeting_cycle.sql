-- ============================================================
-- Veltro v2: ciclo de reunión (Preparar → En vivo → Cerrar)
--
-- meetings.phase      fase actual de la reunión
-- meetings.series_key agrupa ocurrencias de una reunión recurrente
--                     (recurringEventId de Google) para arrastrar pendientes
-- meeting_items       lo que se captura: agenda, nota, decisión, acción, pregunta.
--                     Las decisiones forman el registro de acuerdos del espacio;
--                     las acciones se convierten en tareas al cerrar.
-- ============================================================

alter table public.meetings
  add column if not exists series_key text,
  add column if not exists phase text not null default 'prep' check (phase in ('prep', 'live', 'closed')),
  add column if not exists summary text,
  add column if not exists follow_up text,
  add column if not exists closed_at timestamptz;

create index if not exists meetings_series_idx on public.meetings(workspace_id, series_key, starts_at desc);

create table public.meeting_items (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.meetings(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  kind          text not null check (kind in ('agenda', 'note', 'decision', 'action', 'question')),
  text          text not null default '' check (char_length(text) <= 2000),
  assignee_id   uuid references public.profiles(id) on delete set null,
  due_date      date,
  task_id       uuid references public.tasks(id) on delete set null,
  done          boolean not null default false,
  source        text not null default 'manual' check (source in ('manual', 'assistant', 'carry')),
  position      double precision not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index meeting_items_meeting_idx on public.meeting_items(meeting_id, position);
create index meeting_items_workspace_kind_idx on public.meeting_items(workspace_id, kind, created_at desc);
create index meeting_items_task_idx on public.meeting_items(task_id);

create trigger meeting_items_updated_at before update on public.meeting_items
  for each row execute function public.set_updated_at();

-- workspace_id siempre el de la reunión; autor = usuario actual
create or replace function public.meeting_items_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select workspace_id into new.workspace_id from meetings where id = new.meeting_id;
  if new.workspace_id is null then
    raise exception 'meeting_not_found' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.created_by = coalesce((select auth.uid()), new.created_by);
  else
    new.created_by = old.created_by;
  end if;
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and public.workspace_role_for(new.workspace_id, new.assignee_id) is null then
    raise exception 'assignee_not_in_workspace' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger meeting_items_before_write before insert or update on public.meeting_items
  for each row execute function public.meeting_items_before_write();

alter table public.meeting_items enable row level security;

create policy meeting_items_select on public.meeting_items for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy meeting_items_insert on public.meeting_items for insert to authenticated
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy meeting_items_update on public.meeting_items for update to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()))
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy meeting_items_delete on public.meeting_items for delete to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()));
