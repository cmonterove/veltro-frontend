-- ============================================================
-- Veltro v2: plantillas
--
-- templates  plantillas de tareas (título, descripción, prioridad, etiquetas, subtareas, plazo)
--            y de agenda de reuniones (sus puntos). De un espacio (las ve y usa quien ve el
--            espacio; las editan sus editores) o de toda la cuenta (las editan quien la creó y
--            los admins). Las de espacio (estados y campos al crear uno) viven en la web.
-- ============================================================

create table public.templates (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  kind          text not null check (kind in ('task', 'agenda')),
  name          text not null check (char_length(trim(name)) between 1 and 80),
  data          jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 20000),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index templates_account_idx on public.templates(account_id, kind, lower(name));

create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

create or replace function public.templates_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    if new.workspace_id is not null and not exists (select 1 from workspaces where id = new.workspace_id and account_id = new.account_id) then
      raise exception 'attachment_other_workspace' using errcode = 'P0001';
    end if;
  else
    new.account_id := old.account_id;
    new.workspace_id := old.workspace_id;
    new.kind := old.kind;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger templates_before_write before insert or update on public.templates
  for each row execute function public.templates_before_write();

-- ¿Quien llama puede cambiar la plantilla? De un espacio: editor o admin ahí. De la cuenta: quien la creó o un admin.
create or replace function public.can_edit_template(p_workspace uuid, p_account uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_workspace is not null then public.workspace_role(p_workspace) in ('admin', 'editor')
    else p_creator = (select auth.uid()) or public.is_account_admin(p_account)
  end;
$$;

alter table public.templates enable row level security;

create policy templates_select on public.templates for select to authenticated
  using (public.is_account_member(account_id) and (workspace_id is null or workspace_id in (select public.my_workspace_ids())));
create policy templates_insert on public.templates for insert to authenticated
  with check (public.is_account_member(account_id)
    and (workspace_id is null or public.workspace_role(workspace_id) in ('admin', 'editor')));
create policy templates_update on public.templates for update to authenticated
  using (public.can_edit_template(workspace_id, account_id, created_by))
  with check (public.can_edit_template(workspace_id, account_id, created_by));
create policy templates_delete on public.templates for delete to authenticated
  using (public.can_edit_template(workspace_id, account_id, created_by));

revoke all on public.templates from anon, authenticated;
grant select, insert, delete on public.templates to authenticated;
grant update (name, data) on public.templates to authenticated;
grant all on public.templates to service_role;
