-- =============================================================================
-- Tests de 0017_account_deletion.sql (beta, B3). Corre en Postgres local
-- (pnpm test:rls / pnpm test:db:fresh), nunca contra el proyecto real.
--
-- Escenarios, con prefijo ad_:
--   1. Sin usuario fantasma todavía: sentinel_missing.
--   2. Sin sesión: not_authenticated.
--   3. Dueño de un hogar con otro miembro (saldo en cero igual): bloqueado,
--      owns_household_with_members, nada se toca.
--   4. Miembro con saldo pendiente: bloqueado, balance_not_settled, nada se
--      toca.
--   5. Nadie puede borrar a otro: delete_account_data no recibe un id, solo
--      actúa sobre auth.uid(); un tercero sin hogares la llama y el hogar y
--      los datos de otra persona quedan intactos.
--   6. Único miembro de un hogar: se borra el hogar entero.
--   7. Miembro con saldo en cero en un hogar con otro miembro: se reasigna
--      lo compartido al usuario fantasma, el hogar sigue, el saldo de quien
--      se queda no cambia, y lo personal (fuera de ese hogar) no se toca
--      aquí (se borra después, al borrar auth.users, fuera de esta RPC).
--   8. La reasignación no choca con el límite de 120 escrituras por minuto
--      (225 filas tocadas en una sola llamada): el ajuste de sesión
--      ember.account_deletion lo deja pasar.
--   9. Las funciones tocadas siguen siendo SECURITY DEFINER (las que ya lo
--      eran) y con search_path fijo.
-- =============================================================================
begin;

create function pg_temp.ad_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.ad_logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.ad_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

create function pg_temp.ad_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    set constraints all immediate;
  exception when others then
    if sqlerrm <> expected and sqlstate <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    set constraints all deferred;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Sin usuario fantasma: sentinel_missing. Antes de crear la fila en
-- deleted_account_sentinel, cualquier persona autenticada la dispara.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ad00-000000000001', 'authenticated', 'authenticated', 'ad-nos@test.local', '{}', '{}');
select pg_temp.ad_login('00000000-0000-4000-ad00-000000000001');
select pg_temp.ad_expect_error($q$select public.delete_account_data()$q$,
  'sentinel_missing', 'sin usuario fantasma, se detiene');

-- -----------------------------------------------------------------------------
-- 2. Sin sesión: not_authenticated.
-- -----------------------------------------------------------------------------
select pg_temp.ad_logout();
select pg_temp.ad_expect_error($q$select public.delete_account_data()$q$,
  '28000', 'sin sesión no se puede borrar nada');

-- -----------------------------------------------------------------------------
-- Usuario fantasma, creado como lo haría el servidor (aquí, a mano: la Admin
-- API la crea de verdad en producción; local-bootstrap.sql ya la imita).
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ad00-00000000ffff', 'authenticated', 'authenticated', 'deleted-user@ember-cash.invalid', '{}', '{}');
insert into public.deleted_account_sentinel (user_id) values ('00000000-0000-4000-ad00-00000000ffff');

-- Una segunda fila choca con la llave primaria (singleton): nunca hay dos.
select pg_temp.ad_expect_error(
  $q$insert into public.deleted_account_sentinel (user_id) values ('00000000-0000-4000-ad00-000000000001')$q$,
  '23505', 'el usuario fantasma es una sola fila');

-- Ahora que existe, la persona sin hogares puede borrar su cuenta sin problema.
select pg_temp.ad_login('00000000-0000-4000-ad00-000000000001');
select pg_temp.ad_expect(
  (public.delete_account_data() ->> 'ok')::boolean,
  'sin hogares, con el fantasma ya creado, se puede borrar');

-- -----------------------------------------------------------------------------
-- 3. Dueño de un hogar con otro miembro: bloqueado aunque el saldo esté en
-- cero. Nada se toca.
-- -----------------------------------------------------------------------------
select pg_temp.ad_logout();
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ad03-00000000000a', 'authenticated', 'authenticated', 'ad3-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-ad03-00000000000b', 'authenticated', 'authenticated', 'ad3-b@test.local', '{}', '{}');
select pg_temp.ad_login('00000000-0000-4000-ad03-00000000000a');
select set_config('test.ad3_h', public.create_household('Casa 3')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.ad3_h')::uuid, encode(sha256(convert_to('ad3-token', 'UTF8')), 'hex'));
select pg_temp.ad_login('00000000-0000-4000-ad03-00000000000b');
select public.accept_invite('ad3-token');

select pg_temp.ad_login('00000000-0000-4000-ad03-00000000000a');
do $$
declare r jsonb;
begin
  r := public.delete_account_data();
  if (r ->> 'error') is distinct from 'owns_household_with_members' then
    raise exception 'FALLO: A (dueño con otro miembro) no quedó bloqueado: %', r;
  end if;
  if (r ->> 'household') is distinct from 'Casa 3' then
    raise exception 'FALLO: el error no dice qué hogar: %', r;
  end if;
end $$;
select pg_temp.ad_expect(
  (select count(*) = 2 from public.household_members where household_id = current_setting('test.ad3_h')::uuid),
  'bloqueado: el hogar sigue con sus dos miembros');

-- -----------------------------------------------------------------------------
-- 4. Miembro con saldo pendiente: bloqueado, nada se toca.
-- -----------------------------------------------------------------------------
insert into public.accounts (id, household_id, name, type, currency)
values ('00000000-0000-4000-ad03-0000000000a1', current_setting('test.ad3_h')::uuid, 'Casa', 'checking', 'COP');
select set_config('test.ad3_tx', public.save_transaction(null, current_setting('test.ad3_h')::uuid,
  '00000000-0000-4000-ad03-0000000000a1', 'expense', 'food', 'Mercado', null, 1000, 'COP', current_date,
  '00000000-0000-4000-ad03-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;

-- B le debe 500 a A: B no puede borrar su cuenta.
select pg_temp.ad_login('00000000-0000-4000-ad03-00000000000b');
do $$
declare r jsonb;
begin
  r := public.delete_account_data();
  if (r ->> 'error') is distinct from 'balance_not_settled' then
    raise exception 'FALLO: B (con saldo pendiente) no quedó bloqueado: %', r;
  end if;
  if (r ->> 'household') is distinct from 'Casa 3' then
    raise exception 'FALLO: el error no dice qué hogar: %', r;
  end if;
end $$;
select pg_temp.ad_expect(
  (select count(*) = 2 from public.household_members where household_id = current_setting('test.ad3_h')::uuid),
  'bloqueado: B sigue siendo miembro');
select pg_temp.ad_expect(
  (select user_id from public.transaction_splits where transaction_id = current_setting('test.ad3_tx')::uuid
   and user_id = '00000000-0000-4000-ad03-00000000000b') is not null,
  'bloqueado: el reparto de B no cambió');

-- -----------------------------------------------------------------------------
-- 5. Nadie puede borrar a otro: un tercero sin hogares llama a la función
-- (que no recibe ningún id) y el hogar/los datos de A y B no cambian.
-- -----------------------------------------------------------------------------
select pg_temp.ad_logout();
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ad05-00000000000c', 'authenticated', 'authenticated', 'ad5-c@test.local', '{}', '{}');
select pg_temp.ad_login('00000000-0000-4000-ad05-00000000000c');
select pg_temp.ad_expect((public.delete_account_data() ->> 'ok')::boolean, 'C borra su propia cuenta (vacía) sin problema');
-- Sale de la sesión de C: lo que sigue verifica datos de A y B, que RLS le
-- ocultaría a C (C no es miembro de Casa 3).
select pg_temp.ad_logout();
select pg_temp.ad_expect(
  (select count(*) = 2 from public.household_members where household_id = current_setting('test.ad3_h')::uuid)
  and (select user_id from public.transaction_splits where transaction_id = current_setting('test.ad3_tx')::uuid
       and user_id = '00000000-0000-4000-ad03-00000000000b') is not null,
  'C no pudo afectar el hogar ni el reparto de B: la función solo ve auth.uid()');

-- -----------------------------------------------------------------------------
-- 6. Único miembro de un hogar: se borra el hogar entero (en cascada).
-- -----------------------------------------------------------------------------
select pg_temp.ad_logout();
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ad06-00000000000a', 'authenticated', 'authenticated', 'ad6-a@test.local', '{}', '{}');
select pg_temp.ad_login('00000000-0000-4000-ad06-00000000000a');
select set_config('test.ad6_h', public.create_household('Casa 6')::text, true);
insert into public.accounts (id, household_id, name, type, currency)
values ('00000000-0000-4000-ad06-0000000000a1', current_setting('test.ad6_h')::uuid, 'Casa', 'checking', 'COP');
select public.save_transaction(null, current_setting('test.ad6_h')::uuid,
  '00000000-0000-4000-ad06-0000000000a1', 'expense', 'food', 'Solo', null, 500, 'COP', current_date,
  '00000000-0000-4000-ad06-00000000000a', null);
set constraints all immediate;
set constraints all deferred;

select pg_temp.ad_expect((public.delete_account_data() ->> 'ok')::boolean, 'único miembro: se puede borrar');
select pg_temp.ad_logout();
select pg_temp.ad_expect(
  not exists (select 1 from public.households where id = current_setting('test.ad6_h')::uuid),
  'el hogar entero desapareció');
select pg_temp.ad_expect(
  not exists (select 1 from public.accounts where household_id = current_setting('test.ad6_h')::uuid),
  'sus cuentas compartidas desaparecieron con el hogar');

-- -----------------------------------------------------------------------------
-- 7. Miembro con saldo en cero: se reasigna lo compartido al fantasma, el
-- hogar sigue, y el saldo de quien se queda no cambia.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ad07-00000000000a', 'authenticated', 'authenticated', 'ad7-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-ad07-00000000000b', 'authenticated', 'authenticated', 'ad7-b@test.local', '{}', '{}');
select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000a');
select set_config('test.ad7_h', public.create_household('Casa 7')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.ad7_h')::uuid, encode(sha256(convert_to('ad7-token', 'UTF8')), 'hex'));
insert into public.accounts (id, household_id, name, type, currency)
values ('00000000-0000-4000-ad07-0000000000a1', current_setting('test.ad7_h')::uuid, 'Casa', 'checking', 'COP');
select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000b');
select public.accept_invite('ad7-token');

-- A paga 1000, B paga 1000: saldo en cero entre los dos.
select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000a');
select set_config('test.ad7_tx_a', public.save_transaction(null, current_setting('test.ad7_h')::uuid,
  '00000000-0000-4000-ad07-0000000000a1', 'expense', 'food', 'Paga A', null, 1000, 'COP', current_date,
  '00000000-0000-4000-ad07-00000000000a', null)::text, true);
select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000b');
select set_config('test.ad7_tx_b', public.save_transaction(null, current_setting('test.ad7_h')::uuid,
  '00000000-0000-4000-ad07-0000000000a1', 'expense', 'food', 'Paga B', null, 1000, 'COP', current_date,
  '00000000-0000-4000-ad07-00000000000b', null)::text, true);
set constraints all immediate;
set constraints all deferred;

-- Una meta compartida, con un aporte de cada uno.
select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000a');
insert into public.goals (id, household_id, name, icon_key, target_minor, currency, started_on)
values ('00000000-0000-4000-ad07-0000000000b1', current_setting('test.ad7_h')::uuid, 'Viaje', 'plane', 10000, 'COP', current_date);
insert into public.goal_contributions (id, goal_id, user_id, amount_minor, currency)
values ('00000000-0000-4000-ad07-0000000000c1', '00000000-0000-4000-ad07-0000000000b1',
  '00000000-0000-4000-ad07-00000000000a', 200, 'COP');
-- El aporte de B lo escribe B: desde 0018 nadie inserta un aporte a nombre de otro.
select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000b');
insert into public.goal_contributions (id, goal_id, user_id, amount_minor, currency)
values ('00000000-0000-4000-ad07-0000000000c2', '00000000-0000-4000-ad07-0000000000b1',
  '00000000-0000-4000-ad07-00000000000b', 300, 'COP');
select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000a');

-- Liquidación ya registrada entre los dos (parte del historial a conservar).
insert into public.settlements (id, household_id, from_user, to_user, amount_minor, currency, created_by)
values ('00000000-0000-4000-ad07-0000000000e1', current_setting('test.ad7_h')::uuid,
  '00000000-0000-4000-ad07-00000000000b', '00000000-0000-4000-ad07-00000000000a', 100, 'COP',
  '00000000-0000-4000-ad07-00000000000a');
insert into public.settlements (id, household_id, from_user, to_user, amount_minor, currency, created_by)
values ('00000000-0000-4000-ad07-0000000000e2', current_setting('test.ad7_h')::uuid,
  '00000000-0000-4000-ad07-00000000000a', '00000000-0000-4000-ad07-00000000000b', 100, 'COP',
  '00000000-0000-4000-ad07-00000000000a');
-- Esas dos liquidaciones se cancelan entre sí (no cambian el saldo 0 de arriba).

-- Saldo de A antes de que B se borre (debe seguir igual después).
select set_config('test.ad7_a_before',
  (select coalesce(sum(case when t.paid_by = '00000000-0000-4000-ad07-00000000000a' then t.amount_minor else 0 end), 0)
     - coalesce((select sum(s.share_minor) from public.transaction_splits s
                 join public.transactions t2 on t2.id = s.transaction_id
                 where s.user_id = '00000000-0000-4000-ad07-00000000000a' and t2.household_id = current_setting('test.ad7_h')::uuid), 0)
   from public.transactions t where t.household_id = current_setting('test.ad7_h')::uuid)::text,
  true);

select pg_temp.ad_login('00000000-0000-4000-ad07-00000000000b');
select pg_temp.ad_expect((public.delete_account_data() ->> 'ok')::boolean, 'B (saldo en cero) puede borrarse');

select pg_temp.ad_logout();
-- El hogar sigue, con solo A.
select pg_temp.ad_expect(
  exists (select 1 from public.households where id = current_setting('test.ad7_h')::uuid),
  'Casa 7 sigue existiendo (A se queda)');
select pg_temp.ad_expect(
  (select array_agg(user_id) from public.household_members where household_id = current_setting('test.ad7_h')::uuid)
    = array['00000000-0000-4000-ad07-00000000000a'::uuid],
  'B ya no es miembro; A sigue');

-- Lo compartido de B quedó a nombre del fantasma, nunca borrado.
select pg_temp.ad_expect(
  (select owner_id from public.transactions where id = current_setting('test.ad7_tx_b')::uuid)
    = '00000000-0000-4000-ad00-00000000ffff'::uuid,
  'la transacción que pagó B ahora es del usuario fantasma (no desapareció)');
select pg_temp.ad_expect(
  (select paid_by from public.transactions where id = current_setting('test.ad7_tx_b')::uuid)
    = '00000000-0000-4000-ad00-00000000ffff'::uuid,
  '"pagó" también apunta al fantasma');
select pg_temp.ad_expect(
  (select count(*) from public.transaction_splits
   where transaction_id in (current_setting('test.ad7_tx_a')::uuid, current_setting('test.ad7_tx_b')::uuid)
     and user_id = '00000000-0000-4000-ad00-00000000ffff')
  = 2,
  'el reparto de B en las dos transacciones ahora es del fantasma');
select pg_temp.ad_expect(
  (select user_id from public.goal_contributions where id = '00000000-0000-4000-ad07-0000000000c2')
    = '00000000-0000-4000-ad00-00000000ffff'::uuid,
  'el aporte de B a la meta compartida ahora es del fantasma');
select pg_temp.ad_expect(
  (select count(*) from public.settlements
   where id in ('00000000-0000-4000-ad07-0000000000e1', '00000000-0000-4000-ad07-0000000000e2')
     and '00000000-0000-4000-ad00-00000000ffff' in (from_user, to_user))
  = 2,
  'las dos liquidaciones con B ahora nombran al fantasma de un lado');

-- Queda un registro de la salida, anonimizado (sin nombre).
select pg_temp.ad_expect(
  (select display_name is null and deleted_account and removed_by is null
   from public.household_departures
   where household_id = current_setting('test.ad7_h')::uuid and user_id = '00000000-0000-4000-ad00-00000000ffff'),
  'queda una salida marcada como borrado de cuenta, sin nombre');

-- El saldo de A (ingresos menos su parte) es exactamente el mismo que antes:
-- se reasignó, no se perdió ni se duplicó nada.
select pg_temp.ad_expect(
  (select coalesce(sum(case when t.paid_by = '00000000-0000-4000-ad07-00000000000a' then t.amount_minor else 0 end), 0)
     - coalesce((select sum(s.share_minor) from public.transaction_splits s
                 join public.transactions t2 on t2.id = s.transaction_id
                 where s.user_id = '00000000-0000-4000-ad07-00000000000a' and t2.household_id = current_setting('test.ad7_h')::uuid), 0)
   from public.transactions t where t.household_id = current_setting('test.ad7_h')::uuid)::text
    = current_setting('test.ad7_a_before'),
  'el saldo de A no cambió con el borrado de B');

-- -----------------------------------------------------------------------------
-- 8. 225 filas en una sola llamada no chocan con el límite de 120/min: el
-- ajuste ember.account_deletion las deja pasar. Las 150 transacciones se
-- crean directo (como postgres, sin sesión: no gasta cupo) para que el único
-- consumo real sea el de delete_account_data.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ad08-00000000000a', 'authenticated', 'authenticated', 'ad8-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-ad08-00000000000b', 'authenticated', 'authenticated', 'ad8-b@test.local', '{}', '{}');
select pg_temp.ad_login('00000000-0000-4000-ad08-00000000000a');
select set_config('test.ad8_h', public.create_household('Casa 8')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.ad8_h')::uuid, encode(sha256(convert_to('ad8-token', 'UTF8')), 'hex'));
insert into public.accounts (id, household_id, name, type, currency)
values ('00000000-0000-4000-ad08-0000000000a1', current_setting('test.ad8_h')::uuid, 'Casa', 'checking', 'COP');
select pg_temp.ad_login('00000000-0000-4000-ad08-00000000000b');
select public.accept_invite('ad8-token');

select pg_temp.ad_logout();
with ins as (
  insert into public.transactions (owner_id, household_id, account_id, kind, category_key, description,
    amount_minor, currency, occurred_on, paid_by)
  select
    case when g % 2 = 0 then '00000000-0000-4000-ad08-00000000000a'::uuid else '00000000-0000-4000-ad08-00000000000b'::uuid end,
    current_setting('test.ad8_h')::uuid, '00000000-0000-4000-ad08-0000000000a1', 'expense', 'food', 'Masivo ' || g,
    1000, 'COP', current_date,
    case when g % 2 = 0 then '00000000-0000-4000-ad08-00000000000a'::uuid else '00000000-0000-4000-ad08-00000000000b'::uuid end
  from generate_series(1, 150) g
  returning id
)
insert into public.transaction_splits (transaction_id, user_id, share_minor)
select id, '00000000-0000-4000-ad08-00000000000a'::uuid, 500 from ins
union all
select id, '00000000-0000-4000-ad08-00000000000b'::uuid, 500 from ins;
set constraints all immediate;
set constraints all deferred;

-- 150 transacciones, 75 pagadas por cada quien, 500/500: saldo en cero.
select pg_temp.ad_expect(public.household_member_settled(current_setting('test.ad8_h')::uuid,
  '00000000-0000-4000-ad08-00000000000b'), 'el saldo de B en Casa 8 está en cero antes de borrar');

-- B se borra: toca sus 150 repartos más sus 75 transacciones (dueño o pagó) =
-- 225 filas, muy por encima de 120, en una sola llamada.
select pg_temp.ad_login('00000000-0000-4000-ad08-00000000000b');
select pg_temp.ad_expect((public.delete_account_data() ->> 'ok')::boolean,
  '225 filas en una sola llamada no chocan con el límite de escrituras');
select pg_temp.ad_logout();
select pg_temp.ad_expect(
  (select count(*) from public.transaction_splits s
   join public.transactions t on t.id = s.transaction_id
   where t.household_id = current_setting('test.ad8_h')::uuid
     and s.user_id = '00000000-0000-4000-ad00-00000000ffff') = 150,
  'los 150 repartos de B ahora son del fantasma');
select pg_temp.ad_expect(
  (select count(*) from public.transactions
   where household_id = current_setting('test.ad8_h')::uuid
     and (owner_id = '00000000-0000-4000-ad00-00000000ffff' or paid_by = '00000000-0000-4000-ad00-00000000ffff')) = 75,
  'las 75 transacciones de B ahora son del fantasma');

-- El límite normal (fuera de un borrado de cuenta) sigue intacto: ya lo
-- cubre supabase/tests/rate_limits.sql; aquí solo confirmamos que el ajuste
-- no quedó encendido después de terminar la función.
select pg_temp.ad_expect(
  coalesce(current_setting('ember.account_deletion', true), '') <> 'on',
  'el ajuste no queda encendido después de que la función termina');

-- -----------------------------------------------------------------------------
-- 9. Las funciones tocadas en 0017 siguen siendo SECURITY DEFINER (las que
-- ya lo eran) y con search_path fijo.
-- -----------------------------------------------------------------------------
do $$
declare
  fn record;
  expect_definer boolean;
begin
  for fn in
    select p.proname, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'delete_account_data', 'lock_former_member_transaction', 'lock_former_member_splits',
        'lock_former_member_settlement', 'enforce_write_rate_limit'
      )
  loop
    if not exists (select 1 from unnest(fn.proconfig) cfg where cfg like 'search_path=%') then
      raise exception 'FALLO: % no tiene search_path fijo', fn.proname;
    end if;
    if not fn.prosecdef then
      raise exception 'FALLO: % no es security definer', fn.proname;
    end if;
  end loop;
end $$;
-- forbid_column_change es SECURITY INVOKER a propósito (igual que antes de
-- esta migración): corre con los permisos de quien dispara el UPDATE.
select pg_temp.ad_expect(
  (select not prosecdef from pg_proc where proname = 'forbid_column_change' and pronamespace = 'public'::regnamespace),
  'forbid_column_change sigue siendo security invoker, como antes de 0017');
select pg_temp.ad_expect(
  (select exists (select 1 from unnest(proconfig) cfg where cfg like 'search_path=%')
   from pg_proc where proname = 'forbid_column_change' and pronamespace = 'public'::regnamespace),
  'forbid_column_change sigue con search_path fijo');

select 'OK: todas las pruebas de eliminar cuenta y datos pasaron' as resultado;

rollback;
