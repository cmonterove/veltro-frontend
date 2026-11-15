-- ============================================================
-- Veltro v2: vistas guardadas
--
-- saved_views  una forma de mirar Tareas con nombre: el alcance, los filtros y la pestaña (lo que va
--              en la URL) y la agrupación. Personal o compartida con la cuenta. La edita y la borra
--              quien la creó (las compartidas, también un admin).
-- ============================================================

create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  page        text not null default 'tasks' check (page in ('tasks')),
  name        text not null check (char_length(trim(name)) between 1 and 60),
  -- la URL de la vista sin el «?» (scope=…&status=…&tab=…)
  query       text not null default '' check (char_length(query) <= 2000),
  group_by    text check (group_by is null or char_length(group_by) <= 30),
  shared      boolean not null default false,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index saved_views_account_idx on public.saved_views(account_id, page, position);

create trigger saved_views_updated_at before update on public.saved_views
  for each row execute function public.set_updated_at();

-- quién la creó y de qué cuenta es no cambian
create or replace function public.saved_views_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce((select auth.uid()), new.user_id);
  else
    new.user_id := old.user_id;
    new.account_id := old.account_id;
    new.page := old.page;
  end if;
  return new;
end;
$$;

create trigger saved_views_before_write before insert or update on public.saved_views
  for each row execute function public.saved_views_before_write();

alter table public.saved_views enable row level security;

create policy saved_views_select on public.saved_views for select to authenticated
  using (public.is_account_member(account_id) and (user_id = (select auth.uid()) or shared));
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_account_member(account_id));
create policy saved_views_update on public.saved_views for update to authenticated
  using (user_id = (select auth.uid()) or (shared and public.is_account_admin(account_id)))
  with check (public.is_account_member(account_id));
create policy saved_views_delete on public.saved_views for delete to authenticated
  using (user_id = (select auth.uid()) or (shared and public.is_account_admin(account_id)));

revoke all on public.saved_views from anon, authenticated;
grant select, insert, delete on public.saved_views to authenticated;
grant update (name, query, group_by, shared, position) on public.saved_views to authenticated;
grant all on public.saved_views to service_role;
