-- ============================================================
-- El color de cada cuenta
-- ============================================================
-- Cada cuenta (empresa) elige un color y la app toma ese color mientras estás en ella: el marco, el
-- menú y los acentos. Al pasar a otra cuenta, cambia. Uno de la lista (la web tiene la paleta de cada
-- uno, en claro y oscuro; ciruela es el de Veltro y el de siempre) o uno propio en hexadecimal (#rrggbb,
-- en minúsculas): de ese la web toma el tono y la intensidad y ajusta la luminosidad para que se lea.

alter table public.accounts add column if not exists color text not null default 'plum';
alter table public.accounts drop constraint if exists accounts_color_check;
alter table public.accounts add constraint accounts_color_check
  check (color in ('plum', 'indigo', 'blue', 'teal', 'green', 'terracotta', 'wine', 'graphite') or color ~ '^#[0-9a-f]{6}$');

-- quien administra la cuenta puede cambiarlo (como el nombre: la política accounts_update ya pide admin)
grant update (color) on public.accounts to authenticated;
