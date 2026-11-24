-- ============================================================
-- Veltro v2: alertas push en el teléfono
--
-- push_devices: los teléfonos de cada persona con su token de Expo (uno por instalación; si el
-- teléfono cambia de dueño, el token pasa a la persona que entró). Al salir de la app el token se
-- borra; si Expo dice que ya no existe, queda apagado (disabled_at).
--
-- push_outbox: la cola de lo que hay que mandar. Cada aviso nuevo (notifications) de alguien con
-- un teléfono activo entra a la cola; la API la vacía cada pocos segundos y manda el push. Los
-- avisos que se juntan (comentarios, mensajes de una solicitud) se borran y se vuelven a insertar:
-- si el viejo no había salido todavía, sale solo el nuevo (la cola se va con el aviso).
-- Solo service_role las lee y escribe: la API registra el teléfono de quien tiene la sesión.
-- ============================================================

create table if not exists public.push_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  token         text not null unique check (char_length(token) between 10 and 300),
  platform      text not null check (platform in ('ios', 'android')),
  device_name   text check (char_length(device_name) <= 120),
  app_version   text check (char_length(app_version) <= 40),
  disabled_at   timestamptz,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id) where disabled_at is null;

alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
grant all on public.push_devices to service_role;

create table if not exists public.push_outbox (
  notification_id  uuid primary key references public.notifications(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  attempts         integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists push_outbox_created_idx on public.push_outbox (created_at);

alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;
grant all on public.push_outbox to service_role;

-- Cada aviso nuevo entra a la cola si la persona tiene algún teléfono activo.
create or replace function public.notifications_push_enqueue()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from push_devices d where d.user_id = new.user_id and d.disabled_at is null) then
    insert into push_outbox (notification_id, user_id) values (new.id, new.user_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function public.notifications_push_enqueue() from public, anon, authenticated;

drop trigger if exists notifications_push_enqueue on public.notifications;
create trigger notifications_push_enqueue after insert on public.notifications
  for each row execute function public.notifications_push_enqueue();
