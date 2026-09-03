-- =====================================================================
-- KAL Analiza y Registra — schema completo
--
-- Snapshot fiel de la base en producción (septiembre 2026).
-- Pégalo entero en Supabase → SQL Editor → Run para reconstruir todo
-- desde cero. Es idempotente: se puede correr sobre una base que ya
-- existe sin romper nada.
--
-- Orden obligatorio: casas antes que apuestas y movimientos, apuestas
-- antes que selecciones y sombra. Las claves foráneas lo exigen.
-- =====================================================================


-- ---------------------------------------------------------------------
-- CASAS — una fila por casa de apuestas. El saldo inicial es el punto
-- de partida contra el que se mide todo lo demás.
-- ---------------------------------------------------------------------
create table if not exists public.casas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null,
  saldo_inicial numeric(12,2) not null default 0,
  creado_en     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- APUESTAS — el boleto. Las patas viven en selecciones.
--   cuota_total: la que imprime la casa. Si está, manda sobre el
--                producto de las cuotas (la casa redondea).
--   cash_out:    lo que devolvió la casa al cerrar antes de tiempo.
--                Si tiene valor, el boleto está cerrado pase lo que pase.
-- ---------------------------------------------------------------------
create table if not exists public.apuestas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null default current_date,
  casa_id     uuid references public.casas(id) on delete set null,
  stake       numeric(12,2) not null check (stake > 0),
  notas       text,
  creado_en   timestamptz not null default now(),
  cuota_total numeric(12,4) check (cuota_total is null or cuota_total > 1),
  cash_out    numeric(12,2) check (cash_out is null or cash_out >= 0)
);


-- ---------------------------------------------------------------------
-- SELECCIONES — las patas del boleto.
--   mercados: jsonb para los BetBuilder. Cada elemento {t, e}: texto
--             del mercado y su estado. Con dos o más, el estado de la
--             selección se deduce de ahí y se ignora la columna estado.
--   mi_prob:  tu probabilidad estimada ANTES de mirar la cuota.
--   cuota_cierre: la cuota a la que arrancó el partido. Es lo que
--             permite medir CLV, que es la única métrica que dice algo
--             con muestras chicas.
-- ---------------------------------------------------------------------
create table if not exists public.selecciones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  apuesta_id   uuid not null references public.apuestas(id) on delete cascade,
  orden        int  not null default 0,
  partido      text not null,
  mercado      text,
  cuota        numeric(8,3) not null check (cuota > 1),
  estado       text not null default 'pendiente'
               check (estado in ('pendiente','ganada','perdida',
                                 'anulada','media_ganada','media_perdida')),
  mi_prob      numeric(5,4) check (mi_prob is null or (mi_prob > 0 and mi_prob < 1)),
  cuota_cierre numeric(8,3) check (cuota_cierre is null or cuota_cierre > 1),
  mercados     jsonb
);


-- ---------------------------------------------------------------------
-- MOVIMIENTOS — depósitos y retiros. Van aparte de las apuestas para
-- que el saldo de cada casa siempre cuadre contra la casa real.
-- ---------------------------------------------------------------------
create table if not exists public.movimientos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  casa_id   uuid not null references public.casas(id) on delete cascade,
  fecha     date not null default current_date,
  tipo      text not null check (tipo in ('deposito','retiro')),
  monto     numeric(12,2) not null check (monto > 0),
  nota      text,
  creado_en timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- COLA — partidos pendientes de analizar por el modelo.
--   mercados:  jsonb con las líneas y cuotas que se van a evaluar.
--   respuesta: jsonb con lo que devolvió el análisis.
--   estado:    ciclo de vida del análisis, no de la apuesta.
-- ---------------------------------------------------------------------
create table if not exists public.cola (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creado_en      timestamptz not null default now(),
  local          text not null,
  visitante      text not null,
  competicion    text,
  fecha_partido  date,
  hora           text,
  mercados       jsonb,
  arbitro        text,
  arb_amarillas  numeric(4,2),
  arb_rojas      numeric(4,2),
  fase           text,
  resultado_ida  text,
  pos_local      text,
  pos_visitante  text,
  prev_corners   numeric(5,2),
  prev_tarjetas  numeric(5,2),
  bajas          text,
  notas          text,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','analizando','listo','error')),
  respuesta      jsonb,
  analizado_en   timestamptz,
  cuota_mercado  numeric(8,3) check (cuota_mercado is null or cuota_mercado > 1),
  pais           text
);


-- ---------------------------------------------------------------------
-- SOMBRA — estimaciones del modelo hechas SIN ver las cuotas.
-- Es el registro que permite separar criterio de suerte: se anota lo
-- que el modelo dijo y después lo que pasó.
--   apuesta_id nulo = estimación que no llegó a apostarse. Son la
--   mayoría, y son justamente las que hacen honesto el número.
--   confianza: 0 a 100, declarada antes del resultado.
-- ---------------------------------------------------------------------
create table if not exists public.sombra (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  apuesta_id    uuid references public.apuestas(id) on delete cascade,
  creado_en     timestamptz not null default now(),
  partido       text not null,
  mercado_tuyo  text,
  cuota_tuya    numeric(8,3),
  mercado_ia    text,
  cuota_ia      numeric(8,3),
  prob_ia       numeric(5,4),
  ev_ia         numeric(6,4),
  confianza     integer check (confianza is null or (confianza >= 0 and confianza <= 100)),
  veredicto     text,
  razonamiento  text,
  acerto_ia     boolean,
  acerto_tuyo   boolean,
  competicion   text
);


-- ---------------------------------------------------------------------
-- ARBITROS y COMPETICIONES — catálogos para el autocompletado.
-- El UNIQUE por (user_id, nombre) es lo que evita que se dupliquen
-- entradas al escribirlas distinto.
-- ---------------------------------------------------------------------
create table if not exists public.arbitros (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  amarillas  numeric(4,2),
  rojas      numeric(4,2),
  visto_en   timestamptz not null default now(),
  unique (user_id, nombre)
);

create table if not exists public.competiciones (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre   text not null,
  visto_en timestamptz not null default now(),
  pais     text,
  unique (user_id, nombre)
);


-- =====================================================================
-- ÍNDICES
-- =====================================================================
create index if not exists idx_apu_user_fecha on public.apuestas(user_id, fecha desc);
create index if not exists idx_sel_apuesta    on public.selecciones(apuesta_id);
create index if not exists idx_mov_user       on public.movimientos(user_id, fecha desc);
create index if not exists idx_cola_user      on public.cola(user_id, creado_en desc);
create index if not exists idx_sombra_user    on public.sombra(user_id, creado_en desc);

-- Estas dos no existen todavía. Son claves foráneas sin índice: al
-- borrar una casa o una apuesta, Postgres tiene que escanear la tabla
-- entera para encontrar las filas dependientes. Con pocos registros no
-- se nota; conviene tenerlas antes de que se note.
create index if not exists idx_mov_casa      on public.movimientos(casa_id);
create index if not exists idx_sombra_apuesta on public.sombra(apuesta_id);


-- =====================================================================
-- ROW LEVEL SECURITY
-- Sin esto cualquiera con la clave anónima leería los datos de todos.
-- Va tabla por tabla: activar RLS y una política de dueño.
-- =====================================================================
alter table public.casas         enable row level security;
alter table public.apuestas      enable row level security;
alter table public.selecciones   enable row level security;
alter table public.movimientos   enable row level security;
alter table public.cola          enable row level security;
alter table public.sombra        enable row level security;
alter table public.arbitros      enable row level security;
alter table public.competiciones enable row level security;

drop policy if exists "casas propias" on public.casas;
create policy "casas propias" on public.casas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "apuestas propias" on public.apuestas;
create policy "apuestas propias" on public.apuestas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "selecciones propias" on public.selecciones;
create policy "selecciones propias" on public.selecciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "movimientos propios" on public.movimientos;
create policy "movimientos propios" on public.movimientos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cola propia" on public.cola;
create policy "cola propia" on public.cola
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sombra propia" on public.sombra;
create policy "sombra propia" on public.sombra
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "arbitros propios" on public.arbitros;
create policy "arbitros propios" on public.arbitros
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "competiciones propias" on public.competiciones;
create policy "competiciones propias" on public.competiciones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- =====================================================================
-- CASAS POR DEFECTO AL REGISTRARSE
-- El trigger vive en auth.users, así que un dump de public solo NO lo
-- incluye. Por eso queda escrito a mano aquí.
-- =====================================================================
create or replace function public.crear_casas_iniciales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.casas (user_id, nombre, saldo_inicial)
  values (new.id, 'Paniplay', 0), (new.id, 'Betpro', 0), (new.id, 'Honduwin', 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_casas_iniciales();


-- =====================================================================
-- LA VISTA apuestas_resueltas QUEDÓ FUERA A PROPÓSITO
--
-- Sigue existiendo en la base pero está desactualizada y da números
-- equivocados: se escribió antes de cash_out, de mercados jsonb, de
-- cuota_total y de los estados anulada / media_ganada / media_perdida.
-- Un boleto cerrado con cash_out le sale como pendiente, y uno con una
-- pata anulada le sale como perdido.
--
-- La app no la usa: App.jsx lee apuestas con selecciones(*) y resuelve
-- todo en src/lib/calc.js. Recrearla sería mantener dos verdades sobre
-- el mismo dato, y tarde o temprano se contradicen.
--
-- Para borrarla de tu base, corre esta línea aparte:
--     drop view if exists public.apuestas_resueltas;
-- =====================================================================


-- =====================================================================
-- OPCIONAL — fecha de resolución
--
-- Hoy la curva de banca se ordena por la fecha en que registraste la
-- apuesta, no por la que se resolvió. Una del día 1 que se decide el
-- día 5 aparece antes que una del día 2 ya cerrada, y eso distorsiona
-- el drawdown y las rachas.
--
-- calc.js ya usa fecha_resuelta si existe y cae en fecha si no, así que
-- agregar la columna no rompe nada y las filas viejas siguen igual.
-- Falta escribirla desde Historial.jsx cuando una apuesta se resuelve.
--
--     alter table public.apuestas add column if not exists fecha_resuelta date;
-- =====================================================================
