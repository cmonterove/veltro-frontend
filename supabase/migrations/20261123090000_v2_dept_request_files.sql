-- ============================================================
-- Veltro v2: archivos de las solicitudes entre departamentos (fotos y documentos)
--
-- Igual que los de soporte (20261104110000_v2_support_files.sql): cada archivo es una fila, los
-- del alta de la solicitud (event_id null) y los de cada mensaje (event_id = ese mensaje). Mismo
-- bucket privado `attachments`, carpeta {cuenta}/requests/{uuid}.{ext}; la ruta la genera la API
-- y el archivo se lee solo con la URL firmada que ella entrega a quien ve la solicitud (no hay
-- policy de lectura en storage.objects). No van a `attachments`: así no aparecen en la Bóveda.
-- ============================================================

create table if not exists public.dept_request_files (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  request_id   uuid not null references public.dept_requests(id) on delete cascade,
  -- null: del alta de la solicitud; si no, de ese mensaje
  event_id     uuid references public.dept_request_events(id) on delete cascade,
  storage_path text not null unique,
  name         text not null check (char_length(name) between 1 and 200),
  mime_type    text not null check (char_length(mime_type) between 1 and 120),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists dept_request_files_request_idx on public.dept_request_files (request_id, created_at);
create index if not exists dept_request_files_event_idx on public.dept_request_files (event_id) where event_id is not null;
create index if not exists dept_request_files_account_idx on public.dept_request_files (account_id);

-- La cuenta sale de la solicitud; la ruta tiene que ser de su carpeta de solicitudes y el
-- mensaje, de la misma solicitud. Quien sube y cuándo los pone la base.
create or replace function public.dept_request_files_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_account uuid;
begin
  select account_id into v_account from dept_requests where id = new.request_id;
  if v_account is null then
    raise exception 'request_not_found' using errcode = '23503';
  end if;
  new.account_id := v_account;
  if (select auth.uid()) is not null then
    new.uploaded_by := (select auth.uid());
    -- clock_timestamp: varios archivos del mismo envío quedan en el orden en que se adjuntaron
    new.created_at := clock_timestamp();
  end if;
  if split_part(new.storage_path, '/', 1) <> v_account::text or split_part(new.storage_path, '/', 2) <> 'requests' then
    raise exception 'request_file_path' using errcode = '23514';
  end if;
  if new.event_id is not null and not exists (
    select 1 from dept_request_events e where e.id = new.event_id and e.request_id = new.request_id and e.kind = 'message'
  ) then
    raise exception 'request_file_event' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists dept_request_files_before_insert on public.dept_request_files;
create trigger dept_request_files_before_insert before insert on public.dept_request_files
  for each row execute function public.dept_request_files_before_insert();

alter table public.dept_request_files enable row level security;

-- Los ve quien ve la solicitud: quien la pidió, su departamento y los admins (dept_request_role).
drop policy if exists dept_request_files_select on public.dept_request_files;
create policy dept_request_files_select on public.dept_request_files for select to authenticated
  using (public.dept_request_role(request_id, (select auth.uid())) is not null);

-- Los sube la persona misma, a una solicitud en la que puede escribir. Nadie los edita ni los
-- borra desde la app (se van con la solicitud o con la cuenta).
drop policy if exists dept_request_files_insert on public.dept_request_files;
create policy dept_request_files_insert on public.dept_request_files for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.dept_request_role(request_id, (select auth.uid())) is not null);

revoke all on public.dept_request_files from anon, authenticated;
grant select, insert on public.dept_request_files to authenticated;
grant all on public.dept_request_files to service_role;
