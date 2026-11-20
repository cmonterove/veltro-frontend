-- ============================================================
-- Varias cuentas por persona e invitados a un espacio
-- ============================================================
-- 1) Una persona puede crear más de una cuenta (una «empresa» por cliente, por ejemplo).
--    Antes create_account fallaba con already_in_account si ya pertenecía a alguna; ahora
--    el tope es de 10 cuentas propias (account_limit).
-- 2) Rol de cuenta 'guest' (invitado): alguien a quien se invitó a un espacio puntual.
--    Entra solo a sus espacios y solo ve a la gente que comparte espacio con él (eso lo
--    filtra la API: contexto, miembros y Pasillo). No es admin: nada de lo que piden
--    'owner'/'admin' cambia.

alter table public.account_members drop constraint if exists account_members_role_check;
alter table public.account_members add constraint account_members_role_check
  check (role in ('owner', 'admin', 'member', 'guest'));

alter table public.account_invitations drop constraint if exists account_invitations_role_check;
alter table public.account_invitations add constraint account_invitations_role_check
  check (role in ('admin', 'member', 'guest'));

create or replace function public.create_account(p_name text)
returns public.accounts
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_account public.accounts;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  -- el tope protege de altas en masa; se mide por cuentas propias, no por las que te invitaron
  if (select count(*) from accounts where owner_id = v_uid) >= 10 then
    raise exception 'account_limit' using errcode = 'P0001';
  end if;

  select id into v_plan from plans where is_default order by created_at limit 1;

  insert into accounts (name, plan_id, owner_id)
  values (trim(p_name), coalesce(v_plan, 'free'), v_uid)
  returning * into v_account;

  insert into account_members (account_id, user_id, role)
  values (v_account.id, v_uid, 'owner');

  return v_account;
end;
$$;

-- Con quién comparto algún espacio activo de la cuenta (yo incluido): lo que ve un invitado.
create or replace function public.my_workspace_peers(p_account uuid)
returns table (user_id uuid)
language sql stable security definer set search_path = public
as $$
  select distinct other.user_id
  from workspace_members mine
  join workspaces w on w.id = mine.workspace_id and w.account_id = p_account and w.archived_at is null
  join workspace_members other on other.workspace_id = mine.workspace_id
  where mine.user_id = (select auth.uid())
  union
  select (select auth.uid());
$$;

revoke execute on function public.my_workspace_peers(uuid) from public, anon;
grant execute on function public.my_workspace_peers(uuid) to authenticated, service_role;
