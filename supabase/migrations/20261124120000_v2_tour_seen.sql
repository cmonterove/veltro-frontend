-- ============================================================
-- El recorrido de bienvenida, en el perfil
-- ============================================================
-- Cuándo cerró cada persona el recorrido de bienvenida (lo terminó o le dio «Ahora no»). Antes quedaba
-- solo en el navegador (localStorage) y volvía a salir en otra dirección o en otra computadora aunque ya
-- lo hubiera cerrado. Null: todavía no.

alter table public.profiles add column if not exists tour_seen_at timestamptz;

-- cada persona lo marca en su propio perfil (la política de update de profiles ya la limita a sí misma)
grant update (tour_seen_at) on public.profiles to authenticated;
