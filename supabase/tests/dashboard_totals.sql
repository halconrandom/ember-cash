-- =============================================================================
-- Tests de dashboard_totals (0012 + 0021, fase E3): convierte cada fila a la
-- moneda elegida con la tasa vigente en la fecha de ESA fila (no la de hoy).
-- Usuario A, personal. Todo en una transacción con ROLLBACK (pnpm test:rls).
-- Prefijo dt_ para no chocar con otros archivos.
-- =============================================================================
begin;

create function pg_temp.dt_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.dt_expect(got bigint, expected bigint, label text) returns void language plpgsql as $$
begin
  if got is distinct from expected then
    raise exception 'FALLO: % (obtuvo %, esperaba %)', label, got, expected;
  end if;
end $$;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values ('00000000-0000-4000-b000-00000000de01', 'authenticated', 'authenticated', 'dt-a@test.local', '{}', '{}');

select pg_temp.dt_login('00000000-0000-4000-b000-00000000de01');

insert into public.accounts (id, name, type, currency) values
  ('10000000-0000-4000-9e00-000000000001', 'COP', 'checking', 'COP'),
  ('10000000-0000-4000-9e00-000000000002', 'USD', 'checking', 'USD'),
  ('10000000-0000-4000-9e00-000000000003', 'EUR', 'checking', 'EUR');

-- Un gasto en cada moneda, el mismo mes:
--   COP: ya en la moneda elegida, no necesita tasa.
--   USD: en un día SIN tasa (16 oct): debe usar la última disponible (15 oct).
--   EUR: no hay ninguna tasa EUR/COP ni EUR/USD en todo el test: "sin tasa".
insert into public.transactions (account_id, kind, category_key, description, amount_minor, currency, occurred_on) values
  ('10000000-0000-4000-9e00-000000000001', 'expense', 'food', 'cop', 100000, 'COP', '2026-10-15'),
  ('10000000-0000-4000-9e00-000000000002', 'expense', 'food', 'usd sin tasa ese día', 1000, 'USD', '2026-10-16'),
  ('10000000-0000-4000-9e00-000000000003', 'expense', 'food', 'eur sin ninguna tasa', 500, 'EUR', '2026-10-15');

select set_config('role', 'postgres', true);
-- Solo hay tasa USD/COP del 15: el gasto del 16 debe usar esta (la última
-- disponible antes de esa fecha), nunca una del día que no existe.
insert into public.exchange_rates (base, quote, rate, as_of, source)
values ('USD', 'COP', 4000, '2026-10-15', 'test');
reset role;
select pg_temp.dt_login('00000000-0000-4000-b000-00000000de01');

-- --- 1. Todo convertido a COP ------------------------------------------------
select pg_temp.dt_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'COP'),
  100000, '1. COP ya está en la moneda elegida');
select pg_temp.dt_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'USD'),
  40000, '1. USD del 16 usa la tasa del 15 (última disponible), 10 USD × 4.000');
select pg_temp.dt_expect(
  (select uncovered_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'USD'),
  0, '1. USD no queda como sin tasa: sí había una disponible');
select pg_temp.dt_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'EUR'),
  0, '1. EUR sin ninguna tasa: converted_minor en 0, nunca inventado');
select pg_temp.dt_expect(
  (select uncovered_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'EUR'),
  500, '1. EUR queda marcado aparte como sin tasa, con su monto de origen');
select pg_temp.dt_expect(
  (select total_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'EUR'),
  500, '1. total_minor (desglose por origen) no depende de si hay tasa');

-- --- 2. Un día SIN ninguna tasa anterior (antes de que exista la primera) --
insert into public.transactions (account_id, kind, category_key, description, amount_minor, currency, occurred_on)
values ('10000000-0000-4000-9e00-000000000002', 'expense', 'food', 'usd antes de toda tasa', 2000, 'USD', '2026-10-01');
select pg_temp.dt_expect(
  (select uncovered_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'USD'),
  2000, '2. sin tasa anterior a esa fecha, esa fila queda sin tasa (nunca se adelanta una posterior)');
select pg_temp.dt_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP') where currency = 'USD'),
  40000, '2. la fila del 16 sigue convertida; solo la del 01 queda sin tasa');

-- --- 3. En USD: EUR/USD no existe, así que EUR también queda sin tasa ------
select pg_temp.dt_expect(
  (select uncovered_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'USD') where currency = 'EUR'),
  500, '3. tampoco hay EUR/USD: EUR sin tasa al elegir USD');
select pg_temp.dt_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'USD') where currency = 'COP'),
  2500, '3. COP a USD con la tasa del 15 (4.000): 100.000 / 4.000 = 25,00 USD = 2.500 centavos');

-- Vuelve al rol de la sesión: en test:db:fresh el siguiente archivo asume
-- que puede insertar en auth.users sin haber iniciado sesión antes.
reset role;

select 'OK: dashboard_totals convierte con la tasa de la fecha de cada fila' as resultado;

rollback;
