-- ============================================================
-- Veltro v2: Bóveda (todos los archivos y links de la cuenta)
--
-- attachments  + account_id: la cuenta dueña (sale del espacio si lo hay)
--              + workspace_id opcional: sin espacio, el archivo queda suelto en la cuenta
--              + title, labels: título visible y etiquetas
--              + chat_id: subido en Pasillo, solo lo ven los miembros del chat
-- Un archivo se puede mover entre espacios de la misma cuenta; el objeto de Storage
-- conserva su ruta original, que empieza por la cuenta o por un espacio de esa cuenta.
-- ============================================================

alter table public.attachments
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists title text check (title is null or char_length(trim(title)) between 1 and 300),
  add column if not exists labels text[] not null default '{}' check (cardinality(labels) <= 20),
  add column if not exists chat_id uuid references public.chats(id) on delete cascade;

update public.attachments a
set account_id = w.account_id
from public.workspaces w
where w.id = a.workspace_id and a.account_id is null;

alter table public.attachments
  alter column account_id set not null,
  alter column workspace_id drop not null;

create index if not exists attachments_account_idx on public.attachments(account_id, created_at desc);
create index if not exists attachments_chat_idx on public.attachments(chat_id);
create index if not exists attachments_labels_idx on public.attachments using gin (labels);
create index if not exists attachments_storage_path_idx on public.attachments(storage_path);

-- Integridad: lo vinculado manda sobre el espacio; el espacio, sobre la cuenta
create or replace function public.attachments_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ws uuid;
  v_acc uuid;
  v_relinked boolean := false;
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := coalesce((select auth.uid()), new.uploaded_by);
  else
    new.uploaded_by := old.uploaded_by;
    new.account_id := old.account_id;
    new.chat_id := old.chat_id;
    new.kind := old.kind;
    new.storage_path := old.storage_path;
    new.created_at := old.created_at;
    -- al vincular a otra tarea, reunión o doc sin elegir espacio, el espacio sale del vínculo
    v_relinked := new.workspace_id is not distinct from old.workspace_id
      and (new.task_id is distinct from old.task_id or new.meeting_id is distinct from old.meeting_id or new.doc_id is distinct from old.doc_id);
  end if;

  if new.task_id is not null then
    select workspace_id into v_ws from tasks where id = new.task_id;
  elsif new.meeting_id is not null then
    select workspace_id into v_ws from meetings where id = new.meeting_id;
  elsif new.doc_id is not null then
    select workspace_id into v_ws from docs where id = new.doc_id;
  end if;
  if v_ws is not null then
    if new.workspace_id is not null and new.workspace_id <> v_ws and not v_relinked then
      raise exception 'attachment_other_workspace' using errcode = 'P0001';
    end if;
    new.workspace_id := v_ws;
  end if;
  if (new.task_id is not null and not exists (select 1 from tasks where id = new.task_id and workspace_id = new.workspace_id))
    or (new.meeting_id is not null and not exists (select 1 from meetings where id = new.meeting_id and workspace_id = new.workspace_id))
    or (new.doc_id is not null and not exists (select 1 from docs where id = new.doc_id and workspace_id = new.workspace_id)) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;

  if new.workspace_id is not null then
    select account_id into v_acc from workspaces where id = new.workspace_id;
    if tg_op = 'INSERT' and new.account_id is null then
      new.account_id := v_acc;
    end if;
    if v_acc is distinct from new.account_id then
      raise exception 'attachment_other_workspace' using errcode = 'P0001';
    end if;
  end if;

  if new.chat_id is not null and not exists (select 1 from chats where id = new.chat_id and account_id = new.account_id) then
    raise exception 'attachment_other_workspace' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' and new.kind = 'file'
    and split_part(new.storage_path, '/', 1) <> new.account_id::text
    and not exists (select 1 from workspaces where id::text = split_part(new.storage_path, '/', 1) and account_id = new.account_id) then
    raise exception 'attachment_bad_path' using errcode = 'P0001';
  end if;
  if new.kind = 'link' and new.url !~* '^https?://' then
    raise exception 'attachment_bad_url' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- de un espacio: según el espacio; suelto: personas de la cuenta (y del chat, si vino de uno)
drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
drop policy if exists attachments_delete on public.attachments;

create policy attachments_select on public.attachments for select to authenticated
  using (
    (workspace_id is not null and workspace_id in (select public.my_workspace_ids()))
    or (workspace_id is null and public.is_active_account_member(account_id)
        and (chat_id is null or chat_id in (select public.my_chat_ids())))
  );
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    (workspace_id is not null and workspace_id in (select public.my_editable_workspace_ids()))
    or (workspace_id is null and public.is_active_account_member(account_id)
        and (chat_id is null or chat_id in (select public.my_chat_ids())))
  );
-- suelto: lo edita quien lo subió o un admin de la cuenta; moverlo a un espacio exige ser editor del destino
create policy attachments_update on public.attachments for update to authenticated
  using (
    (workspace_id is not null and workspace_id in (select public.my_editable_workspace_ids()))
    or (workspace_id is null and public.is_active_account_member(account_id)
        and (uploaded_by = (select auth.uid()) or public.is_account_admin(account_id)))
  )
  with check (
    (workspace_id is not null and workspace_id in (select public.my_editable_workspace_ids()))
    or (workspace_id is null and public.is_active_account_member(account_id)
        and (uploaded_by = (select auth.uid()) or public.is_account_admin(account_id)))
  );
create policy attachments_delete on public.attachments for delete to authenticated
  using (
    (workspace_id is not null and workspace_id in (select public.my_editable_workspace_ids()))
    or (workspace_id is null and public.is_active_account_member(account_id)
        and (uploaded_by = (select auth.uid()) or public.is_account_admin(account_id)))
  );

-- Telemetría: la cuenta viene en la fila; también se sube a un chat o suelto
create or replace function public.usage_on_attachments()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform log_usage('attachment.added', new.account_id, new.workspace_id, new.uploaded_by,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', new.kind,
      'bytes', new.size_bytes,
      'on', case
        when new.task_id is not null then 'task'
        when new.meeting_id is not null then 'meeting'
        when new.doc_id is not null then 'doc'
        when new.chat_id is not null then 'chat'
        when new.workspace_id is null then 'account'
        else 'workspace' end)));
  return null;
end;
$$;

-- ============================================================
-- Storage: la carpeta puede ser un espacio o una cuenta
-- ============================================================

create or replace function public.storage_folder_id(p_name text)
returns uuid
language plpgsql immutable
as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists attachments_select on storage.objects;
drop policy if exists attachments_insert on storage.objects;
drop policy if exists attachments_delete on storage.objects;

-- carpeta de un espacio que puedo leer (las imágenes del editor de docs no tienen fila),
-- o una fila de attachments visible para mí con esa ruta (archivos sueltos, de chat o movidos)
create policy attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (
      public.storage_folder_id(name) in (select public.my_workspace_ids())
      or exists (select 1 from public.attachments a where a.storage_path = objects.name)
    )
  );
create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (
      public.storage_folder_id(name) in (select public.my_editable_workspace_ids())
      or public.is_active_account_member(public.storage_folder_id(name))
    )
  );
create policy attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      public.storage_folder_id(name) in (select public.my_editable_workspace_ids())
      or (public.is_active_account_member(public.storage_folder_id(name))
          and (owner_id = (select auth.uid())::text or public.is_account_admin(public.storage_folder_id(name))))
    )
  );

-- ============================================================
-- Consola: admin_storage cuenta por attachments.account_id (incluye los archivos sueltos)
-- ============================================================

create or replace function public.admin_storage(p_account uuid default null, p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 730);
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev timestamptz := date_trunc('day', now()) - make_interval(days => 2 * v_days - 1);
  v_out jsonb;
begin
  perform platform_assert();

  -- cada adjunto con su cuenta (también los sueltos); todo lo de abajo sale de acá
  with f0 as materialized (
    select at.id, at.name, at.mime_type, coalesce(at.size_bytes, 0)::bigint as bytes, at.kind, at.created_at, at.uploaded_by, at.workspace_id, at.account_id
    from attachments at
  )
  select jsonb_build_object(
    'days', v_days,
    'totals', (
      select jsonb_build_object(
        'bytes', coalesce(sum(f.bytes) filter (where f.kind = 'file'), 0),
        'files', count(*) filter (where f.kind = 'file'),
        'links', count(*) filter (where f.kind = 'link'),
        'accounts', count(distinct f.account_id) filter (where f.kind = 'file'),
        'workspaces', count(distinct f.workspace_id) filter (where f.kind = 'file'),
        'uploaders', count(distinct f.uploaded_by) filter (where f.kind = 'file'),
        'period_bytes', coalesce(sum(f.bytes) filter (where f.kind = 'file' and f.created_at >= v_since), 0),
        'period_files', count(*) filter (where f.kind = 'file' and f.created_at >= v_since),
        'prev_bytes', coalesce(sum(f.bytes) filter (where f.kind = 'file' and f.created_at >= v_prev and f.created_at < v_since), 0)
      )
      from f0 f
    ),
    -- lo que se sube por día en el período (en bytes y archivos)
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day::date, 'bytes', coalesce(s.bytes, 0), 'files', coalesce(s.files, 0)) order by d.day), '[]'::jsonb)
      from generate_series(v_since, date_trunc('day', now()), interval '1 day') as d(day)
      left join (
        select date_trunc('day', f.created_at) as day, sum(f.bytes) as bytes, count(*) as files
        from f0 f
        where f.kind = 'file' and f.created_at >= v_since
        group by 1
      ) s on s.day = d.day
    ),
    'by_type', (
      select coalesce(jsonb_agg(jsonb_build_object('type', x.t, 'files', x.n, 'bytes', x.b) order by x.b desc), '[]'::jsonb)
      from (
        -- el orden importa: los tipos de Office dicen "officedocument" aunque sean hojas o presentaciones
        select case
            when f.mime_type like 'image/%' then 'image'
            when f.mime_type like 'video/%' then 'video'
            when f.mime_type = 'application/pdf' then 'pdf'
            when f.mime_type ~ '(spreadsheet|excel|csv)' then 'sheet'
            when f.mime_type ~ '(presentation|powerpoint)' then 'slides'
            when f.mime_type ~ '(word|document|text/)' then 'doc'
            else 'other' end as t,
          count(*) as n, coalesce(sum(f.bytes), 0) as b
        from f0 f
        where f.kind = 'file' and (p_account is null or f.account_id = p_account)
        group by 1
      ) x
    ),
    -- todas las cuentas con archivos, de la que más ocupa a la que menos
    'accounts', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc, x.files desc), '[]'::jsonb)
      from (
        select a.id, a.name, a.plan_id, a.status,
          coalesce(sum(f.bytes) filter (where f.kind = 'file'), 0) as bytes,
          count(*) filter (where f.kind = 'file') as files,
          count(*) filter (where f.kind = 'link') as links,
          count(distinct f.workspace_id) filter (where f.kind = 'file') as workspaces,
          count(distinct f.uploaded_by) filter (where f.kind = 'file') as uploaders,
          coalesce(sum(f.bytes) filter (where f.kind = 'file' and f.created_at >= v_since), 0) as period_bytes,
          max(f.created_at) filter (where f.kind = 'file') as last_upload_at,
          coalesce(max(f.bytes) filter (where f.kind = 'file'), 0) as largest_bytes
        from f0 f join accounts a on a.id = f.account_id
        group by a.id
        having count(*) filter (where f.kind = 'file') > 0
        order by 5 desc
        limit 500
      ) x
    ),
    'top_workspaces', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc), '[]'::jsonb)
      from (
        select w.id, w.name, w.icon, w.color, w.archived_at, a.id as account_id, a.name as account_name,
          sum(f.bytes) as bytes, count(*) as files, max(f.created_at) as last_upload_at
        from f0 f join workspaces w on w.id = f.workspace_id join accounts a on a.id = f.account_id
        where f.kind = 'file' and (p_account is null or f.account_id = p_account)
        group by w.id, a.id
        order by 8 desc
        limit case when p_account is null then 15 else 200 end
      ) x
    ),
    -- por persona dentro de cada cuenta: quien sube a dos cuentas aparece en las dos
    'top_users', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc), '[]'::jsonb)
      from (
        select p.id, p.full_name, p.email, p.avatar_url, a.id as account_id, a.name as account_name,
          sum(f.bytes) as bytes, count(*) as files, count(distinct f.workspace_id) as workspaces, max(f.created_at) as last_upload_at
        from f0 f join accounts a on a.id = f.account_id left join profiles p on p.id = f.uploaded_by
        where f.kind = 'file' and (p_account is null or f.account_id = p_account)
        group by p.id, a.id
        order by 7 desc
        limit case when p_account is null then 15 else 200 end
      ) x
    ),
    -- detalle de una cuenta: lo de arriba ya viene filtrado; acá sus datos y sus archivos más pesados
    'account', case when p_account is null then null else (
      select jsonb_build_object(
        'id', a.id, 'name', a.name, 'plan_id', a.plan_id, 'status', a.status,
        'bytes', coalesce((select sum(f.bytes) from f0 f where f.account_id = a.id and f.kind = 'file'), 0),
        'files', (select count(*) from f0 f where f.account_id = a.id and f.kind = 'file'),
        'links', (select count(*) from f0 f where f.account_id = a.id and f.kind = 'link'),
        'period_bytes', coalesce((select sum(f.bytes) from f0 f where f.account_id = a.id and f.kind = 'file' and f.created_at >= v_since), 0),
        'largest', (
          select coalesce(jsonb_agg(to_jsonb(x) order by x.bytes desc), '[]'::jsonb)
          from (
            select f.id, f.name, f.mime_type, f.bytes, f.created_at, w.id as workspace_id, w.name as workspace_name,
              p.id as uploader_id, p.full_name as uploader_name
            from f0 f left join workspaces w on w.id = f.workspace_id left join profiles p on p.id = f.uploaded_by
            where f.account_id = a.id and f.kind = 'file'
            order by f.bytes desc
            limit 15
          ) x
        )
      )
      from accounts a where a.id = p_account
    ) end
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.admin_storage(uuid, integer) from public, anon;
grant execute on function public.admin_storage(uuid, integer) to authenticated, service_role;
