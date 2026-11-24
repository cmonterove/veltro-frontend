-- ============================================================
-- Traspasar la cuenta a otra persona
-- ============================================================
-- El dueño le puede pasar la cuenta a un admin o a un miembro: esa persona queda como dueña y quien
-- la traspasa, como admin. El trigger que protege al dueño (no se degrada, nadie más se vuelve dueño)
-- lo permite solo dentro de ese traspaso, que la API marca en su propia transacción
-- (set_config('veltro.owner_transfer', <id de la cuenta>, true): dura solo esa transacción).

create or replace function public.protect_account_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_traspaso boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_traspaso := new.account_id = old.account_id
      and coalesce(current_setting('veltro.owner_transfer', true), '') = new.account_id::text;
  end if;

  if old.role = 'owner' then
    if tg_op = 'DELETE' then
      -- permitido solo si la cuenta se está borrando (cascade)
      if exists (select 1 from accounts where id = old.account_id) then
        raise exception 'cannot_remove_owner' using errcode = 'P0001';
      end if;
      return old;
    end if;
    if new.role <> 'owner' and not v_traspaso then
      raise exception 'cannot_remove_owner' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' and new.role = 'owner' and not v_traspaso then
    raise exception 'cannot_assign_owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
