-- =============================================================================
-- Tests de dashboard_totals (0025, fase E4): con 5 monedas no se guarda cada
-- cruce; la tasa de cada fila se triangula por USD (1 moneda = usd_per_unit
-- USD; A→B = usd_per_unit(A) / usd_per_unit(B)). Aquí se prueban cruces que
-- NO tienen un par guardado directo entre sí (USD→EUR si lo pide con EUR de
-- por medio, COP→MXN, ARS→COP), con display_currency en EUR y en MXN.
-- Usuario A, personal. Todo en una transacción con ROLLBACK (pnpm test:rls).
-- Prefijo dtx_ para no chocar con otros archivos.
-- =============================================================================
begin;

create function pg_temp.dtx_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.dtx_expect(got bigint, expected bigint, label text) returns void language plpgsql as $$
begin
  if got is distinct from expected then
    raise exception 'FALLO: % (obtuvo %, esperaba %)', label, got, expected;
  end if;
end $$;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values ('00000000-0000-4000-b000-000000000101', 'authenticated', 'authenticated', 'dtx-a@test.local', '{}', '{}');

select pg_temp.dtx_login('00000000-0000-4000-b000-000000000101');

insert into public.accounts (id, name, type, currency) values
  ('10000000-0000-4000-9e00-100000000001', 'COP', 'checking', 'COP'),
  ('10000000-0000-4000-9e00-100000000002', 'USD', 'checking', 'USD'),
  ('10000000-0000-4000-9e00-100000000003', 'EUR', 'checking', 'EUR'),
  ('10000000-0000-4000-9e00-100000000004', 'ARS', 'checking', 'ARS'),
  ('10000000-0000-4000-9e00-100000000005', 'MXN', 'checking', 'MXN');

-- Un gasto en cada moneda, el mismo día (15 oct): 100 USD, 400.000 COP,
-- 100.000 ARS, 50 EUR, 2.000 MXN.
insert into public.transactions (account_id, kind, category_key, description, amount_minor, currency, occurred_on) values
  ('10000000-0000-4000-9e00-100000000002', 'expense', 'food', 'usd', 10000, 'USD', '2026-09-01'),
  ('10000000-0000-4000-9e00-100000000001', 'expense', 'food', 'cop', 400000, 'COP', '2026-09-01'),
  ('10000000-0000-4000-9e00-100000000004', 'expense', 'food', 'ars', 10000000, 'ARS', '2026-09-01'),
  ('10000000-0000-4000-9e00-100000000003', 'expense', 'food', 'eur', 5000, 'EUR', '2026-09-01'),
  ('10000000-0000-4000-9e00-100000000005', 'expense', 'food', 'mxn', 200000, 'MXN', '2026-09-01');

select set_config('role', 'postgres', true);
-- Solo las 4 patas a USD, ninguna EUR/COP, EUR/MXN, etc. (eso es justo lo
-- que 0025 deja de necesitar): 1 USD = 4.000 COP, 1 EUR = 1,1 USD,
-- 1 USD = 20 MXN, 1 USD = 1.000 ARS.
insert into public.exchange_rates (base, quote, rate, as_of, source) values
  ('USD', 'COP', 4000, '2026-09-01', 'dtx-test'),
  ('EUR', 'USD', 1.1, '2026-09-01', 'dtx-test'),
  ('USD', 'MXN', 20, '2026-09-01', 'dtx-test'),
  ('USD', 'ARS', 1000, '2026-09-01', 'dtx-test');
reset role;
select pg_temp.dtx_login('00000000-0000-4000-b000-000000000101');

-- --- display_currency = EUR: USD, COP, ARS y MXN triangulan por USD --------
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'EUR') where currency = 'EUR'),
  5000, 'EUR ya está en la moneda elegida');
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'EUR') where currency = 'USD'),
  9091, 'USD→EUR triangulando (100 USD / 1,1 = 90,9090... EUR = 9.091 centavos redondeando)');
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'EUR') where currency = 'COP'),
  9091, 'COP→EUR triangulando (400.000 COP = 100 USD = 90,9090... EUR, mismo redondeo que USD)');
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'EUR') where currency = 'ARS'),
  9091, 'ARS→EUR triangulando (100.000 ARS = 100 USD = 90,9090... EUR)');
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'EUR') where currency = 'MXN'),
  9091, 'MXN→EUR triangulando (2.000 MXN = 100 USD = 90,9090... EUR)');
select pg_temp.dtx_expect(
  (select uncovered_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'EUR') where currency = 'USD'),
  0, 'con las 4 patas guardadas, nada queda sin tasa al elegir EUR');

-- --- display_currency = MXN: COP→MXN y ARS→COP (vía USD) dan el mismo total que entre sí ---
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'MXN') where currency = 'COP'),
  200000, 'COP→MXN triangulando (400.000 COP = 100 USD = 2.000,00 MXN)');
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'MXN') where currency = 'ARS'),
  200000, 'ARS→MXN triangulando (100.000 ARS = 100 USD = 2.000,00 MXN, igual que COP: mismos USD)');
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'MXN') where currency = 'MXN'),
  200000, 'MXN ya está en la moneda elegida');

-- --- display_currency = COP: ARS→COP ----------------------------------------
select pg_temp.dtx_expect(
  (select converted_minor from public.dashboard_totals(null, '2026-09-01', '2026-09-30', 'COP') where currency = 'ARS'),
  400000, 'ARS→COP triangulando (100.000 ARS = 100 USD = 400.000 COP; COP no tiene decimales)');

reset role;

select 'OK: dashboard_totals triangula por USD entre monedas sin un par guardado directo' as resultado;

rollback;
