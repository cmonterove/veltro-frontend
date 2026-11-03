-- ============================================================
-- Veltro v2: archivos de soporte (fotos y documentos en los tickets)
--
-- Antes un ticket solo llevaba hasta 3 capturas de imagen en support_tickets.screenshots.
-- Ahora cada archivo es una fila: los del alta del ticket (message_id null) y los de cada
-- respuesta (message_id = esa respuesta). Mismo bucket privado `attachments`, carpeta
-- {cuenta}/support/{uuid}.{ext}; la ruta la genera la API y el archivo se lee solo con la URL
-- firmada que ella entrega a quien ve el ticket (no hay policy de lectura en storage.objects).
--
-- support_tickets.screenshots queda sin usar (las capturas pasan a filas más abajo). No se
-- borra: la consola todavía la lee hasta que pase a la API.
-- ============================================================

create table if not exists public.support_files (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
  -- null: del alta del ticket; si no, de esa respuesta
  message_id   uuid references public.support_ticket_messages(id) on delete cascade,
  storage_path text not null unique,
  name         text not null check (char_length(name) between 1 and 200),
  mime_type    text not null check (char_length(mime_type) between 1 and 120),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists support_files_ticket_idx on public.support_files (ticket_id, created_at);
create index if not exists support_files_message_idx on public.support_files (message_id) where message_id is not null;
create index if not exists support_files_account_idx on public.support_files (account_id);

-- La cuenta sale del ticket; la ruta tiene que ser de su carpeta de soporte y la respuesta, del
-- mismo ticket. Quien sube y cuándo los pone la base.
create or replace function public.support_files_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_account uuid;
begin
  select account_id into v_account from support_tickets where id = new.ticket_id;
  if v_account is null then
    raise exception 'ticket_not_found' using errcode = '23503';
  end if;
  new.account_id := v_account;
  -- desde la app (con sesión): la persona, ahora y en la carpeta de soporte de la cuenta. Sin
  -- sesión (el traspaso de capturas de abajo) se respetan los datos que trae la fila.
  if (select auth.uid()) is not null then
    new.uploaded_by := (select auth.uid());
    -- clock_timestamp: varios archivos del mismo envío quedan en el orden en que se adjuntaron
    new.created_at := clock_timestamp();
    if split_part(new.storage_path, '/', 1) <> v_account::text or split_part(new.storage_path, '/', 2) <> 'support' then
      raise exception 'support_file_path' using errcode = '23514';
    end if;
  end if;
  if new.message_id is not null and not exists (select 1 from support_ticket_messages m where m.id = new.message_id and m.ticket_id = new.ticket_id) then
    raise exception 'support_file_message' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists support_files_before_insert on public.support_files;
create trigger support_files_before_insert before insert on public.support_files
  for each row execute function public.support_files_before_insert();

alter table public.support_files enable row level security;

-- La ve quien ve el ticket (la RLS de support_tickets decide).
drop policy if exists support_files_select on public.support_files;
create policy support_files_select on public.support_files for select to authenticated
  using (exists (select 1 from support_tickets t where t.id = ticket_id));

-- La sube la persona misma, a un ticket que ve y que no está resuelto. Nadie la edita ni la
-- borra desde la app (se va con el ticket o con la cuenta).
drop policy if exists support_files_insert on public.support_files;
create policy support_files_insert on public.support_files for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (select 1 from support_tickets t where t.id = ticket_id and t.status <> 'resolved')
  );

grant select, insert on public.support_files to authenticated;

-- Las capturas que ya había pasan a filas (del alta del ticket). El tamaño sale de Storage;
-- si el objeto no está (o en la base local, sin Storage), 1 byte: la fila igual apunta al archivo.
insert into public.support_files (account_id, ticket_id, message_id, storage_path, name, mime_type, size_bytes, uploaded_by, created_at)
select t.account_id, t.id, null, s.path,
  t.code || '-captura-' || s.n || '.' || lower(coalesce(substring(s.path from '\.([A-Za-z0-9]+)$'), 'bin')),
  case lower(coalesce(substring(s.path from '\.([A-Za-z0-9]+)$'), 'bin'))
    when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp'
    when 'gif' then 'image/gif' when 'heic' then 'image/heic' when 'avif' then 'image/avif'
    else 'application/octet-stream'
  end,
  greatest(1, coalesce((
    select (o.metadata->>'size')::bigint from storage.objects o where o.bucket_id = 'attachments' and o.name = s.path
  ), 1)),
  t.created_by, t.created_at
from public.support_tickets t
cross join lateral unnest(t.screenshots) with ordinality as s(path, n)
on conflict (storage_path) do nothing;
