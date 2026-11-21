-- Logos: el de cada cuenta y el de cada espacio.
--
-- Los bytes van en una tabla propia (no en accounts/workspaces: ahí cualquier `returning *` o
-- consulta amplia arrastraría la imagen). Nadie la toca con su sesión: la API comprueba el permiso
-- (admin de la cuenta o del espacio para cambiarlo; quien ve la cuenta o el espacio para leerlo) y
-- después la usa como servicio. Cuentas y espacios guardan cuándo cambió su logo: así la app sabe
-- si tienen uno y arma la URL (?v=…) que el navegador puede guardar para siempre.

alter table public.accounts add column if not exists logo_updated_at timestamptz;
alter table public.workspaces add column if not exists logo_updated_at timestamptz;

create table if not exists public.logos (
  owner_kind text not null check (owner_kind in ('account', 'workspace')),
  owner_id uuid not null,
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 262144),
  updated_at timestamptz not null default now(),
  primary key (owner_kind, owner_id)
);

alter table public.logos enable row level security;
-- sin policies: con la sesión de una persona no se ve ni se escribe nada (solo la API como servicio)
revoke all on public.logos from anon, authenticated;
grant all on public.logos to service_role;

-- al borrar la cuenta o el espacio, su logo se va con ellos
create or replace function public.delete_owner_logo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.logos where owner_kind = tg_argv[0] and owner_id = old.id;
  return old;
end $$;

drop trigger if exists accounts_logo_cleanup on public.accounts;
create trigger accounts_logo_cleanup after delete on public.accounts
  for each row execute function public.delete_owner_logo('account');

drop trigger if exists workspaces_logo_cleanup on public.workspaces;
create trigger workspaces_logo_cleanup after delete on public.workspaces
  for each row execute function public.delete_owner_logo('workspace');
