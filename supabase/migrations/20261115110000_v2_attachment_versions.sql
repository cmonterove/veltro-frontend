-- ============================================================
-- Veltro v2: versiones de archivos
--
-- attachments.version      la versión vigente (1 al subirlo). version_by / version_at: quién y
--                          cuándo subió la vigente (null mientras sea la primera).
-- attachment_versions      las versiones anteriores, con su archivo, para verlas o bajarlas.
--                          Subir una versión nueva o volver a una anterior guarda la vigente aquí.
-- Solo las funciones de abajo cambian el archivo de un adjunto (el disparador lo protege).
-- ============================================================

alter table public.attachments
  add column if not exists version integer not null default 1,
  add column if not exists version_by uuid references public.profiles(id) on delete set null,
  add column if not exists version_at timestamptz;

create table public.attachment_versions (
  id             uuid primary key default gen_random_uuid(),
  attachment_id  uuid not null references public.attachments(id) on delete cascade,
  version        integer not null,
  name           text not null,
  storage_path   text not null,
  mime_type      text,
  size_bytes     bigint,
  uploaded_by    uuid references public.profiles(id) on delete set null,
  -- cuándo se subió esa versión y cuándo dejó de ser la vigente
  uploaded_at    timestamptz not null,
  replaced_at    timestamptz not null default now(),
  unique (attachment_id, version)
);

create index attachment_versions_attachment_idx on public.attachment_versions(attachment_id, version desc);

alter table public.attachment_versions enable row level security;

-- se ven si se ve el adjunto
create policy attachment_versions_select on public.attachment_versions for select to authenticated
  using (exists (select 1 from public.attachments a where a.id = attachment_id));

revoke all on public.attachment_versions from anon, authenticated;
grant select on public.attachment_versions to authenticated;
grant all on public.attachment_versions to service_role;

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
    -- el archivo solo lo cambia una versión nueva (attachment_new_version / attachment_restore_version)
    if coalesce(current_setting('veltro.attachment_version', true), '') = '' then
      new.storage_path := old.storage_path;
      new.version := old.version;
      new.version_by := old.version_by;
      new.version_at := old.version_at;
    end if;
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

-- ¿Quien llama puede cambiar este adjunto? De un espacio: editor o admin ahí. Suelto o de un chat:
-- quien lo subió o un admin de la cuenta.
create or replace function public.can_edit_attachment(p_attachment uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when a.workspace_id is not null then public.workspace_role(a.workspace_id) in ('admin', 'editor')
    else a.uploaded_by = (select auth.uid()) or public.is_account_admin(a.account_id)
  end
  from attachments a where a.id = p_attachment;
$$;

-- guarda la vigente en la historia y deja el archivo nuevo como vigente
create or replace function public.attachment_swap_file(p_attachment uuid, p_path text, p_name text, p_mime text, p_size bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a attachments%rowtype;
begin
  select * into a from attachments where id = p_attachment for update;
  if not found or a.kind <> 'file' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not coalesce(public.can_edit_attachment(p_attachment), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into attachment_versions (attachment_id, version, name, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at)
  values (a.id, a.version, a.name, a.storage_path, a.mime_type, a.size_bytes, coalesce(a.version_by, a.uploaded_by), coalesce(a.version_at, a.created_at));
  perform set_config('veltro.attachment_version', 'x', true);
  update attachments set
    storage_path = p_path, name = p_name, mime_type = p_mime, size_bytes = p_size,
    version = a.version + 1, version_by = (select auth.uid()), version_at = now()
  where id = a.id;
  perform set_config('veltro.attachment_version', '', true);
end;
$$;

revoke execute on function public.attachment_swap_file(uuid, text, text, text, bigint) from public, anon, authenticated;

-- Versión nueva: el archivo ya subido (la API comprobó tamaño y contenido) pasa a ser el vigente.
create or replace function public.attachment_new_version(p_attachment uuid, p_path text, p_name text, p_mime text, p_size bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_acc uuid;
begin
  select account_id into v_acc from attachments where id = p_attachment;
  -- la carpeta del archivo es de la cuenta o de uno de sus espacios
  if split_part(p_path, '/', 1) <> v_acc::text
     and not exists (select 1 from workspaces where id::text = split_part(p_path, '/', 1) and account_id = v_acc) then
    raise exception 'attachment_bad_path' using errcode = 'P0001';
  end if;
  if exists (select 1 from attachments where storage_path = p_path) or exists (select 1 from attachment_versions where storage_path = p_path) then
    raise exception 'already_registered' using errcode = 'P0001';
  end if;
  perform public.attachment_swap_file(p_attachment, p_path, p_name, p_mime, p_size);
end;
$$;

revoke execute on function public.attachment_new_version(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.attachment_new_version(uuid, text, text, text, bigint) to authenticated;

-- Volver a una versión anterior: queda como la vigente (con número nuevo); la historia no se borra.
create or replace function public.attachment_restore_version(p_attachment uuid, p_version uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v attachment_versions%rowtype;
begin
  select * into v from attachment_versions where id = p_version and attachment_id = p_attachment;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform public.attachment_swap_file(p_attachment, v.storage_path, v.name, v.mime_type, v.size_bytes);
end;
$$;

revoke execute on function public.attachment_restore_version(uuid, uuid) from public, anon;
grant execute on function public.attachment_restore_version(uuid, uuid) to authenticated;
