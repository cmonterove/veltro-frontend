-- ============================================================
-- Veltro v2: adjuntos y campos de tareas
--
-- attachments  archivos (Storage) o links, que pertenecen a una tarea,
--              una reunión y/o un doc, o directamente al espacio.
--              Una reunión puede producir adjuntos igual que produce tareas.
-- tasks        + start_date, estimate_hours, custom (valores de campos propios)
-- workspaces   + task_fields: definición de campos propios del espacio
--              [{ "id": "f_xxx", "name": "Cliente", "type": "text|number|date|select|url", "options": ["A","B"] }]
-- ============================================================

alter table public.tasks
  add column if not exists start_date date,
  add column if not exists estimate_hours numeric(7, 2) check (estimate_hours is null or estimate_hours >= 0),
  add column if not exists custom jsonb not null default '{}'::jsonb;

alter table public.workspaces
  add column if not exists task_fields jsonb not null default '[]'::jsonb;

grant update (task_fields) on public.workspaces to authenticated;

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  meeting_id    uuid references public.meetings(id) on delete set null,
  doc_id        uuid references public.docs(id) on delete set null,
  kind          text not null default 'file' check (kind in ('file', 'link')),
  name          text not null check (char_length(trim(name)) between 1 and 300),
  storage_path  text,
  url           text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null))
);

create index attachments_workspace_idx on public.attachments(workspace_id, created_at desc);
create index attachments_task_idx on public.attachments(task_id);
create index attachments_meeting_idx on public.attachments(meeting_id);
create index attachments_doc_idx on public.attachments(doc_id);

-- Integridad: lo vinculado debe ser del mismo espacio; el archivo debe vivir en la carpeta del espacio
create or replace function public.attachments_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by = coalesce((select auth.uid()), new.uploaded_by);
  else
    new.uploaded_by = old.uploaded_by;
    new.workspace_id = old.workspace_id;
  end if;
  if new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and workspace_id = new.workspace_id) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;
  if new.meeting_id is not null and not exists (select 1 from meetings where id = new.meeting_id and workspace_id = new.workspace_id) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;
  if new.doc_id is not null and not exists (select 1 from docs where id = new.doc_id and workspace_id = new.workspace_id) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;
  if new.kind = 'file' and split_part(new.storage_path, '/', 1) <> new.workspace_id::text then
    raise exception 'attachment_bad_path' using errcode = 'P0001';
  end if;
  if new.kind = 'link' and new.url !~* '^https?://' then
    raise exception 'attachment_bad_url' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger attachments_before_write before insert or update on public.attachments
  for each row execute function public.attachments_before_write();

alter table public.attachments enable row level security;

create policy attachments_select on public.attachments for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy attachments_update on public.attachments for update to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()))
  with check (workspace_id in (select public.my_editable_workspace_ids()));
create policy attachments_delete on public.attachments for delete to authenticated
  using (workspace_id in (select public.my_editable_workspace_ids()));

-- Extracto del doc para vistas previas en listas (sin traer el contenido completo)
alter table public.docs
  add column if not exists excerpt text generated always as (left(content_text, 240)) stored;
