-- =====================================================================
-- Libro de apuestas — schema completo
-- Pégalo entero en Supabase → SQL Editor → Run
-- =====================================================================

-- ---------- CASAS ----------
create table if not exists public.casas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null,
  saldo_inicial numeric(12,2) not null default 0,
  creado_en     timestamptz not null default now()
);

-- ---------- APUESTAS ----------
create table if not exists public.apuestas (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha     date not null default current_date,
  casa_id   uuid references public.casas(id) on delete set null,
  stake     numeric(12,2) not null check (stake > 0),
  notas     text,
  creado_en timestamptz not null default now()
);

-- ---------- SELECCIONES (las patas del parlay) ----------
create table if not exists public.selecciones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  apuesta_id   uuid not null references public.apuestas(id) on delete cascade,
  orden        int  not null default 0,
  partido      text not null,
  mercado      text,
  cuota        numeric(8,3) not null check (cuota > 1),
  estado       text not null default 'pendiente'
               check (estado in ('pendiente','ganada','perdida')),
  mi_prob      numeric(5,4) check (mi_prob is null or (mi_prob > 0 and mi_prob < 1)),
  cuota_cierre numeric(8,3) check (cuota_cierre is null or cuota_cierre > 1)
);

create index if not exists idx_sel_apuesta on public.selecciones(apuesta_id);
create index if not exists idx_apu_user_fecha on public.apuestas(user_id, fecha desc);

-- =====================================================================
-- ROW LEVEL SECURITY — sin esto, cualquiera podría leer tus datos
-- =====================================================================
alter table public.casas       enable row level security;
alter table public.apuestas    enable row level security;
alter table public.selecciones enable row level security;

drop policy if exists "casas propias" on public.casas;
create policy "casas propias" on public.casas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "apuestas propias" on public.apuestas;
create policy "apuestas propias" on public.apuestas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "selecciones propias" on public.selecciones;
create policy "selecciones propias" on public.selecciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
-- VISTA: resuelve cada apuesta a partir de sus selecciones
--   una perdida        -> perdida
--   todas ganadas      -> ganada
--   cualquier otra cosa-> pendiente
-- =====================================================================
create or replace view public.apuestas_resueltas
with (security_invoker = true) as
select
  a.id,
  a.user_id,
  a.fecha,
  a.casa_id,
  c.nombre                                as casa,
  a.stake,
  a.notas,
  count(s.id)                             as n_selecciones,
  coalesce(exp(sum(ln(s.cuota))), 1)      as cuota_total,
  case
    when bool_or(s.estado = 'perdida')  then 'perdida'
    when count(s.id) > 0
     and bool_and(s.estado = 'ganada')  then 'ganada'
    else 'pendiente'
  end                                     as estado,
  case
    when bool_or(s.estado = 'perdida')  then -a.stake
    when count(s.id) > 0
     and bool_and(s.estado = 'ganada')
      then a.stake * (coalesce(exp(sum(ln(s.cuota))), 1) - 1)
    else 0
  end                                     as resultado,
  -- CLV medio de la apuesta (solo si registraste cuotas de cierre)
  avg(case when s.cuota_cierre is not null
           then s.cuota / s.cuota_cierre - 1 end) as clv
from public.apuestas a
left join public.selecciones s on s.apuesta_id = a.id
left join public.casas c       on c.id = a.casa_id
group by a.id, c.nombre;

-- =====================================================================
-- Casas por defecto al registrarte (opcional: bórralo si no lo quieres)
-- =====================================================================
create or replace function public.crear_casas_iniciales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.casas (user_id, nombre, saldo_inicial)
  values (new.id, 'Paniplay', 0), (new.id, 'Casa 2', 0), (new.id, 'Casa 3', 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_casas_iniciales();
