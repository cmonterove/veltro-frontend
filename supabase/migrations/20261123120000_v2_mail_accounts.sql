-- ============================================================
-- Veltro v2: cuentas de correo de cada persona (avisar por correo desde la propia cuenta)
--
-- Al crear una tarea o una solicitud, la persona puede mandarle un correo a quien la recibe desde
-- una de SUS cuentas (Gmail ahora; Microsoft después). Puede conectar varias, de los dos
-- proveedores, y una queda como la de por defecto. Los tokens van cifrados por la API
-- (AES-256-GCM, como google_connections): la tabla no tiene policies, solo service_role la lee y
-- la escribe; la persona ve las suyas (sin tokens) con get_my_mail_accounts().
--
-- mail_sends anota cada correo enviado (de qué cuenta, a quién, por qué tarea o solicitud).
-- ============================================================

create table if not exists public.mail_accounts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  provider                 text not null check (provider in ('google', 'microsoft')),
  email                    text not null check (char_length(email) between 3 and 320),
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  scopes                   text[] not null default '{}',
  is_default               boolean not null default false,
  last_used_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (user_id, provider, email)
);
-- una sola por defecto por persona
create unique index if not exists mail_accounts_default_idx on public.mail_accounts (user_id) where is_default;

drop trigger if exists mail_accounts_updated_at on public.mail_accounts;
create trigger mail_accounts_updated_at before update on public.mail_accounts
  for each row execute function public.set_updated_at();

alter table public.mail_accounts enable row level security;
revoke all on public.mail_accounts from anon, authenticated;
grant all on public.mail_accounts to service_role;

-- Las mías, sin tokens: la por defecto primero.
create or replace function public.get_my_mail_accounts()
returns table (id uuid, provider text, email text, is_default boolean, last_used_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select id, provider, email, is_default, last_used_at, created_at
  from mail_accounts
  where user_id = (select auth.uid())
  order by is_default desc, created_at;
$$;
revoke execute on function public.get_my_mail_accounts() from public, anon;
grant execute on function public.get_my_mail_accounts() to authenticated, service_role;

create table if not exists public.mail_sends (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  mail_account_id      uuid references public.mail_accounts(id) on delete set null,
  account_id           uuid not null references public.accounts(id) on delete cascade,
  item_type            text not null check (item_type in ('task', 'request')),
  item_id              uuid not null,
  from_email           text not null,
  to_emails            text[] not null,
  provider_message_id  text,
  created_at           timestamptz not null default now()
);
create index if not exists mail_sends_item_idx on public.mail_sends (item_type, item_id, created_at);
create index if not exists mail_sends_user_idx on public.mail_sends (user_id, created_at);

alter table public.mail_sends enable row level security;
-- cada quien ve lo que mandó; lo anota la API (service_role)
drop policy if exists mail_sends_select on public.mail_sends;
create policy mail_sends_select on public.mail_sends for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.mail_sends from anon, authenticated;
grant select on public.mail_sends to authenticated;
grant all on public.mail_sends to service_role;
