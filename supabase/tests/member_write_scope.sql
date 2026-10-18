-- =============================================================================
-- M-03: dentro del mismo hogar, A no reescribe lo de B.
-- Dos miembros (A administra, B es miembro) y un tercero C que no es miembro,
-- solo para armar una liquidación en la que A no participa.
--
-- A sobre una transacción de B falla por insert, update, delete y por la RPC
-- save_transaction. Lo mismo con el aporte de B y con una liquidación en la
-- que A no es quien paga ni quien recibe. Lo de A sí pasa, incluido el
-- reparto de los dos que crea save_transaction.
--
-- El escape de delete_account_data, la salida del hogar y el candado del ex
-- miembro se prueban en account_deletion.sql y household_leave.sql.
-- =============================================================================
begin;

create function pg_temp.m03_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.m03_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FALLO: %', label;
  end if;
end $$;

create function pg_temp.m03_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
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

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-ec18-00000000000a', 'authenticated', 'authenticated', 'm03-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-ec18-00000000000b', 'authenticated', 'authenticated', 'm03-b@test.local', '{}', '{}'),
  ('00000000-0000-4000-ec18-00000000000c', 'authenticated', 'authenticated', 'm03-c@test.local', '{}', '{}');

select pg_temp.m03_login('00000000-0000-4000-ec18-00000000000a');
select set_config('test.m03_h', public.create_household('Casa M03')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.m03_h')::uuid, encode(sha256(convert_to('m03-token', 'UTF8')), 'hex'));
insert into public.accounts (id, household_id, name, type, currency)
values ('00000000-0000-4000-ec18-0000000000a1', current_setting('test.m03_h')::uuid, 'Casa', 'checking', 'COP');
insert into public.goals (id, household_id, name, target_minor, currency)
values ('00000000-0000-4000-ec18-0000000000b1', current_setting('test.m03_h')::uuid, 'Viaje', 100000, 'COP');

select pg_temp.m03_login('00000000-0000-4000-ec18-00000000000b');
select public.accept_invite('m03-token');

-- B guarda un gasto compartido: el reparto de los dos se crea, aunque el de A
-- no sea el user_id de quien llama.
select set_config('test.m03_tx_b', public.save_transaction(null, current_setting('test.m03_h')::uuid,
  '00000000-0000-4000-ec18-0000000000a1', 'expense', 'food', 'Paga B', null, 1000, 'COP', current_date,
  '00000000-0000-4000-ec18-00000000000b', null)::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.m03_expect(
  (select count(*) = 2 and sum(share_minor) = 1000 from public.transaction_splits
   where transaction_id = current_setting('test.m03_tx_b')::uuid),
  'B guarda su gasto y el reparto de los dos queda creado');

insert into public.goal_contributions (id, goal_id, user_id, amount_minor, currency)
values ('00000000-0000-4000-ec18-0000000000c2', '00000000-0000-4000-ec18-0000000000b1',
  '00000000-0000-4000-ec18-00000000000b', 300, 'COP');

-- Liquidación en la que A no participa (B paga a C, y C no es del hogar).
-- La inserta postgres: no es la API. Sirve para el update y el delete.
select set_config('role', 'postgres', true);
insert into public.settlements (id, household_id, from_user, to_user, amount_minor, currency, created_by)
values ('00000000-0000-4000-ec18-0000000000e2', current_setting('test.m03_h')::uuid,
  '00000000-0000-4000-ec18-00000000000b', '00000000-0000-4000-ec18-00000000000c', 40, 'COP',
  '00000000-0000-4000-ec18-00000000000b');

-- -----------------------------------------------------------------------------
-- A no altera lo de B
-- -----------------------------------------------------------------------------
select pg_temp.m03_login('00000000-0000-4000-ec18-00000000000a');

select pg_temp.m03_expect_error($q$
  insert into public.transaction_splits (transaction_id, user_id, share_minor)
  values (current_setting('test.m03_tx_b')::uuid, '00000000-0000-4000-ec18-00000000000a', 1)
$q$, 'not_transaction_owner', 'A no inserta un reparto en la transacción de B');

select pg_temp.m03_expect_error($q$
  update public.transaction_splits set share_minor = 1
  where transaction_id = current_setting('test.m03_tx_b')::uuid
    and user_id = '00000000-0000-4000-ec18-00000000000b'
$q$, 'not_transaction_owner', 'A no edita el reparto de B');

select pg_temp.m03_expect_error($q$
  delete from public.transaction_splits
  where transaction_id = current_setting('test.m03_tx_b')::uuid
$q$, 'not_transaction_owner', 'A no borra los repartos de la transacción de B');

select pg_temp.m03_expect_error(format($q$
  select public.save_transaction(%L, %L, '00000000-0000-4000-ec18-0000000000a1',
    'expense', 'food', 'Paga B', null, 1000, 'COP', current_date,
    '00000000-0000-4000-ec18-00000000000a', null)
$q$, current_setting('test.m03_tx_b'), current_setting('test.m03_h')),
  'not_transaction_owner', 'A no reescribe el gasto de B con save_transaction');

select pg_temp.m03_expect(
  (select count(*) = 2 and sum(share_minor) = 1000 and bool_and(share_minor = 500)
   from public.transaction_splits where transaction_id = current_setting('test.m03_tx_b')::uuid),
  'el reparto de B sigue igual después de los intentos de A');

select pg_temp.m03_expect_error($q$
  insert into public.goal_contributions (goal_id, user_id, amount_minor, currency)
  values ('00000000-0000-4000-ec18-0000000000b1', '00000000-0000-4000-ec18-00000000000b', 10, 'COP')
$q$, 'not_contribution_owner', 'A no inserta un aporte a nombre de B');

select pg_temp.m03_expect_error(format($q$
  insert into public.goal_contributions (goal_id, user_id, amount_minor, currency, transaction_id)
  values ('00000000-0000-4000-ec18-0000000000b1', '00000000-0000-4000-ec18-00000000000a', 10, 'COP', %L)
$q$, current_setting('test.m03_tx_b')),
  'not_transaction_owner', 'A no cuelga su aporte de la transacción de B');

select pg_temp.m03_expect_error($q$
  update public.goal_contributions set amount_minor = 11
  where id = '00000000-0000-4000-ec18-0000000000c2'
$q$, 'not_contribution_owner', 'A no edita el aporte de B');

select pg_temp.m03_expect_error($q$
  delete from public.goal_contributions where id = '00000000-0000-4000-ec18-0000000000c2'
$q$, 'not_contribution_owner', 'A no borra el aporte de B');

select pg_temp.m03_expect(
  (select amount_minor = 300 and user_id = '00000000-0000-4000-ec18-00000000000b'
   from public.goal_contributions where id = '00000000-0000-4000-ec18-0000000000c2'),
  'el aporte de B sigue igual');

select pg_temp.m03_expect_error(format($q$
  insert into public.settlements (household_id, from_user, to_user, amount_minor, currency)
  values (%L, '00000000-0000-4000-ec18-00000000000b', '00000000-0000-4000-ec18-00000000000c', 10, 'COP')
$q$, current_setting('test.m03_h')),
  'not_settlement_party', 'A no inserta una liquidación en la que no participa');

select pg_temp.m03_expect_error($q$
  update public.settlements set amount_minor = 41
  where id = '00000000-0000-4000-ec18-0000000000e2'
$q$, 'not_settlement_party', 'A no edita una liquidación en la que no participa');

select pg_temp.m03_expect_error($q$
  delete from public.settlements where id = '00000000-0000-4000-ec18-0000000000e2'
$q$, 'not_settlement_party', 'A no borra una liquidación en la que no participa');

select pg_temp.m03_expect(
  (select amount_minor = 40 from public.settlements where id = '00000000-0000-4000-ec18-0000000000e2'),
  'esa liquidación sigue igual');

-- No hay una RPC de authenticated, distinta de save_transaction y
-- post_occurrence (las dos security invoker, las frena el mismo disparador),
-- que reescriba estas tablas. delete_account_data es la excepción y solo
-- corre con el ajuste de sesión.
select pg_temp.m03_expect(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname not in ('delete_account_data', 'household_member_settled', 'transaction_has_former_member')
      and pg_get_functiondef(p.oid) ~ 'transaction_splits|goal_contributions|settlements'
  ),
  'ninguna RPC security definer de authenticated reescribe estas tablas salvo delete_account_data');

-- -----------------------------------------------------------------------------
-- A sobre lo propio sí puede, incluido el reparto del otro miembro
-- -----------------------------------------------------------------------------
select set_config('test.m03_tx_a', public.save_transaction(null, current_setting('test.m03_h')::uuid,
  '00000000-0000-4000-ec18-0000000000a1', 'expense', 'food', 'Paga A', null, 1000, 'COP', current_date,
  '00000000-0000-4000-ec18-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.m03_expect(
  (select count(*) = 2 and sum(share_minor) = 1000 from public.transaction_splits
   where transaction_id = current_setting('test.m03_tx_a')::uuid),
  'A guarda su gasto y se crean los dos repartos');

select pg_temp.m03_expect(
  (select public.save_transaction(current_setting('test.m03_tx_a')::uuid, current_setting('test.m03_h')::uuid,
     '00000000-0000-4000-ec18-0000000000a1', 'expense', 'housing', 'Paga A', 'nota', 1000, 'COP', current_date,
     '00000000-0000-4000-ec18-00000000000a', null)
   ) = current_setting('test.m03_tx_a')::uuid,
  'A vuelve a guardar su propio gasto por la RPC');
set constraints all immediate;
set constraints all deferred;
select pg_temp.m03_expect(
  (select category_key = 'housing' and note = 'nota' and count(*) = 2
   from public.transactions t
   join public.transaction_splits s on s.transaction_id = t.id
   where t.id = current_setting('test.m03_tx_a')::uuid
   group by t.category_key, t.note),
  'la RPC de A actualiza su gasto y rehace los dos repartos');

set constraints all deferred;
update public.transaction_splits set share_minor = 600
where transaction_id = current_setting('test.m03_tx_a')::uuid
  and user_id = '00000000-0000-4000-ec18-00000000000a';
update public.transaction_splits set share_minor = 400
where transaction_id = current_setting('test.m03_tx_a')::uuid
  and user_id = '00000000-0000-4000-ec18-00000000000b';
select pg_temp.m03_expect(
  (select share_minor = 400 from public.transaction_splits
   where transaction_id = current_setting('test.m03_tx_a')::uuid
     and user_id = '00000000-0000-4000-ec18-00000000000b'),
  'A edita también la parte de B en su propia transacción');
delete from public.transaction_splits where transaction_id = current_setting('test.m03_tx_a')::uuid;
insert into public.transaction_splits (transaction_id, user_id, share_minor) values
  (current_setting('test.m03_tx_a')::uuid, '00000000-0000-4000-ec18-00000000000a', 500),
  (current_setting('test.m03_tx_a')::uuid, '00000000-0000-4000-ec18-00000000000b', 500);
set constraints all immediate;
set constraints all deferred;
select pg_temp.m03_expect(
  (select count(*) = 2 and sum(share_minor) = 1000 from public.transaction_splits
   where transaction_id = current_setting('test.m03_tx_a')::uuid),
  'A borra y vuelve a crear los repartos de su transacción');

insert into public.goal_contributions (id, goal_id, amount_minor, currency)
values ('00000000-0000-4000-ec18-0000000000c1', '00000000-0000-4000-ec18-0000000000b1', 200, 'COP');
update public.goal_contributions set amount_minor = 250
where id = '00000000-0000-4000-ec18-0000000000c1';
select pg_temp.m03_expect(
  (select amount_minor = 250 and user_id = '00000000-0000-4000-ec18-00000000000a'
   from public.goal_contributions where id = '00000000-0000-4000-ec18-0000000000c1'),
  'A edita su propio aporte');
delete from public.goal_contributions where id = '00000000-0000-4000-ec18-0000000000c1';
select pg_temp.m03_expect(
  (select count(*) = 0 from public.goal_contributions where id = '00000000-0000-4000-ec18-0000000000c1'),
  'A borra su propio aporte');

-- Entre A y B los dos participan: A puede crearla, editarla y borrarla.
insert into public.settlements (id, household_id, from_user, to_user, amount_minor, currency)
values ('00000000-0000-4000-ec18-0000000000e1', current_setting('test.m03_h')::uuid,
  '00000000-0000-4000-ec18-00000000000b', '00000000-0000-4000-ec18-00000000000a', 100, 'COP');
update public.settlements set amount_minor = 80 where id = '00000000-0000-4000-ec18-0000000000e1';
select pg_temp.m03_expect(
  (select amount_minor = 80 from public.settlements where id = '00000000-0000-4000-ec18-0000000000e1'),
  'A edita una liquidación en la que es quien recibe');
select pg_temp.m03_expect_error($q$
  update public.settlements
  set from_user = '00000000-0000-4000-ec18-00000000000b',
      to_user = '00000000-0000-4000-ec18-00000000000c'
  where id = '00000000-0000-4000-ec18-0000000000e1'
$q$, 'not_settlement_party', 'A no se saca de una liquidación para dejarla solo entre otros');
delete from public.settlements where id = '00000000-0000-4000-ec18-0000000000e1';
select pg_temp.m03_expect(
  (select count(*) = 0 from public.settlements where id = '00000000-0000-4000-ec18-0000000000e1'),
  'A borra una liquidación en la que participa');

-- El escape de sesión deja pasar una escritura que si no fallaría.
select set_config('ember.account_deletion', 'on', true);
update public.transaction_splits set share_minor = share_minor
where transaction_id = current_setting('test.m03_tx_b')::uuid;
select pg_temp.m03_expect(true, 'con ember.account_deletion A puede tocar el reparto de B');
select set_config('ember.account_deletion', 'off', true);
select pg_temp.m03_expect(
  coalesce(current_setting('ember.account_deletion', true), '') <> 'on',
  'el ajuste no queda encendido');

-- test:db:fresh junta todos los archivos en una sola transacción. Si esta
-- sesión se queda como authenticated, el archivo siguiente no puede insertar
-- en auth.users.
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select 'OK: un miembro no reescribe repartos, aportes ni liquidaciones ajenas' as resultado;

rollback;
