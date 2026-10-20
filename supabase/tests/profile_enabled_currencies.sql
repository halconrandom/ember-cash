-- =============================================================================
-- Tests de 0025_currencies_ars_mxn.sql (lado profiles): display_currency
-- admite ARS y MXN, sigue rechazando lo que no está en el catálogo, y
-- enabled_currencies valida cada código contra currencies y que
-- display_currency esté entre las habilitadas. Todo en una transacción con
-- ROLLBACK (pnpm test:rls). Prefijo ecur_ para no chocar con otros archivos.
-- =============================================================================
begin;

create function pg_temp.ecur_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.ecur_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

create function pg_temp.ecur_expect_rows(stmt text, n int, label text) returns void language plpgsql as $$
declare affected int;
begin
  execute stmt;
  get diagnostics affected = row_count;
  if affected <> n then
    raise exception 'FALLO: % (afectó % filas, esperaba %)', label, affected, n;
  end if;
end $$;

create function pg_temp.ecur_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FALLO: %', label;
  end if;
end $$;

reset role;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values ('00000000-0000-4000-b000-0000000000ec', 'authenticated', 'authenticated', 'ecur-a@test.local', '{}', '{}');

select pg_temp.ecur_login('00000000-0000-4000-b000-0000000000ec');

-- enabled_currencies por defecto: COP/USD/EUR (sin tocar nada, nadie pierde acceso).
select pg_temp.ecur_expect(
  (select enabled_currencies from public.profiles where id = '00000000-0000-4000-b000-0000000000ec')
    = array['COP', 'USD', 'EUR'],
  'default de enabled_currencies es COP/USD/EUR');

-- --- display_currency: ARS y MXN ya son válidas; lo que no está en el catálogo sigue sin serlo ---
select pg_temp.ecur_expect_rows(
  $q$update public.profiles set enabled_currencies = array['COP', 'USD', 'EUR', 'ARS', 'MXN'] where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  1, 'habilitar las 5 monedas (hace falta antes de elegir ARS/MXN como display_currency)');

select pg_temp.ecur_expect_rows(
  $q$update public.profiles set display_currency = 'ARS' where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  1, 'ARS es una moneda de visualización válida');

select pg_temp.ecur_expect_rows(
  $q$update public.profiles set display_currency = 'MXN' where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  1, 'MXN es una moneda de visualización válida');

select pg_temp.ecur_expect_error(
  $q$update public.profiles set display_currency = 'GBP' where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  '23514', 'GBP sigue sin ser una moneda de visualización válida (no está en currencies)');

-- --- enabled_currencies: cada código debe existir en currencies ------------
select pg_temp.ecur_expect_error(
  $q$update public.profiles set enabled_currencies = array['COP', 'GBP'] where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  '23514', 'GBP en enabled_currencies se rechaza: no está en currencies');

-- Vuelve a dejar el perfil en un estado válido antes del siguiente check
-- (display_currency sigue siendo MXN, así que MXN debe seguir habilitada).
select pg_temp.ecur_expect_rows(
  $q$update public.profiles set enabled_currencies = array['COP', 'USD', 'MXN'] where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  1, 'enabled_currencies con solo códigos del catálogo se guarda');

-- --- display_currency debe estar entre las habilitadas ---------------------
select pg_temp.ecur_expect_error(
  $q$update public.profiles set enabled_currencies = array['COP', 'USD'] where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  '23514', 'quitar MXN de enabled_currencies con display_currency = MXN se rechaza');

-- Las dos cosas a la vez si quedan consistentes sí se puede.
select pg_temp.ecur_expect_rows(
  $q$update public.profiles set display_currency = 'COP', enabled_currencies = array['COP', 'USD'] where id = '00000000-0000-4000-b000-0000000000ec'$q$,
  1, 'cambiar las dos columnas juntas, dejando display_currency habilitada, sí se puede');

reset role;

select 'OK: display_currency admite ARS/MXN y enabled_currencies valida contra currencies' as resultado;

rollback;
