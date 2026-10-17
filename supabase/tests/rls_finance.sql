-- =============================================================================
-- Tests de RLS para 0003_finance_model.sql
--
-- Usuarios: A (owner) y B (member) del household H; C es ajeno y tiene su
-- propio household H2. Todo corre en una transacción con ROLLBACK, así que no
-- deja datos:
--   pnpm test:rls
-- Si algo falla, el script se detiene con "FALLO: ...". Si todo pasa, la
-- última consulta devuelve "OK".
--
-- Ids fijos para leer los tests con facilidad:
--   cuentas  1...01 A personal, 1...02 compartida H, 1...03 B personal, 1...04 C personal
--   transacc 2...01 A personal, 2...02 compartida (cuenta compartida),
--            2...03 B personal, 2...04 C personal, 2...05 compartida (cuenta personal de A)
--   metas    3...01 compartida, 3...02 A personal
--   deuda    4...01 A;  recurrente 5...01 compartido;  presupuesto 6...01 compartido
--   sección 7: transacciones 2...07 y 2...08 (compartidas)
--   sección 8: transferencias 2...09 (compartida) y 2...0a (personal), gasto 2...0b
-- =============================================================================
begin;

-- --- Ayudas de test (temporales, desaparecen con la sesión) -------------------

-- Actúa como el usuario indicado (rol authenticated + claims del JWT).
create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- Ejecuta `stmt` y exige que falle con el SQLSTATE `expected` (y, si se
-- indica, con el mensaje `message`). Si falla, lo que hizo `stmt` se deshace.
create function pg_temp.expect_error(stmt text, expected text, label text, message text default null)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected or (message is not null and sqlerrm <> message) then
      raise exception 'FALLO: % (esperaba % %, obtuvo % "%")', label, expected,
        coalesce(message, ''), sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

-- Ejecuta `stmt` y exige que NO falle.
create function pg_temp.expect_ok(stmt text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
exception when others then
  raise exception 'FALLO: % (dio % "%")', label, sqlstate, sqlerrm;
end $$;

-- Ejecuta `stmt` (update/delete) y exige que afecte exactamente `n` filas.
create function pg_temp.expect_rows(stmt text, n int, label text)
returns void language plpgsql as $$
declare affected int;
begin
  execute stmt;
  get diagnostics affected = row_count;
  if affected <> n then
    raise exception 'FALLO: % (afectó % filas, esperaba %)', label, affected, n;
  end if;
end $$;

-- Exige que la consulta `q` devuelva el número `n`.
create function pg_temp.expect_count(q text, n bigint, label text)
returns void language plpgsql as $$
declare got bigint;
begin
  execute q into got;
  if got is distinct from n then
    raise exception 'FALLO: % (contó %, esperaba %)', label, got, n;
  end if;
end $$;

-- --- Preparación ---------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-b000-00000000000a', 'authenticated', 'authenticated', 'fin-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-b000-00000000000b', 'authenticated', 'authenticated', 'fin-b@test.local', '{}', '{}'),
  ('00000000-0000-4000-b000-00000000000c', 'authenticated', 'authenticated', 'fin-c@test.local', '{}', '{}');

-- Tasa de ejemplo (la escribe postgres, como lo haría el service role).
insert into public.exchange_rates (base, quote, rate, as_of, source)
values ('USD', 'COP', 4000, current_date, 'sample');

-- A crea H e invita a B; C crea H2.
select pg_temp.login('00000000-0000-4000-b000-00000000000a');
select set_config('test.h', public.create_household('H')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.h')::uuid, encode(sha256(convert_to('fin-token', 'UTF8')), 'hex'));

select pg_temp.login('00000000-0000-4000-b000-00000000000b');
select public.accept_invite('fin-token');

select pg_temp.login('00000000-0000-4000-b000-00000000000c');
select set_config('test.h2', public.create_household('H2')::text, true);

-- --- A crea datos personales y compartidos ---------------------------------------
select pg_temp.login('00000000-0000-4000-b000-00000000000a');

insert into public.accounts (id, household_id, name, type, currency) values
  ('10000000-0000-4000-8000-000000000001', null, 'Cuenta A', 'checking', 'COP'),
  ('10000000-0000-4000-8000-000000000002', current_setting('test.h')::uuid, 'Cuenta casa', 'checking', 'COP');

insert into public.goals (id, household_id, name, target_minor, currency) values
  ('30000000-0000-4000-8000-000000000001', current_setting('test.h')::uuid, 'Viaje', 1200000000, 'COP'),
  ('30000000-0000-4000-8000-000000000002', null, 'Fondo A', 500000, 'USD');

insert into public.debts (id, name, currency, original_principal_minor, apr_bps, apr_kind)
values ('40000000-0000-4000-8000-000000000001', 'Tarjeta', 'COP', 5000000, 2450, 'EA');

insert into public.recurring_items (id, household_id, kind, name, category_key, amount_minor,
  currency, account_id, frequency, anchor_date)
values ('50000000-0000-4000-8000-000000000001', current_setting('test.h')::uuid, 'subscription',
  'Streaming', 'subscriptions', 1599, 'USD', '10000000-0000-4000-8000-000000000002', 'monthly',
  current_date);

insert into public.recurring_occurrences (recurring_item_id, due_on)
values ('50000000-0000-4000-8000-000000000001', current_date);

insert into public.transactions (id, household_id, account_id, kind, category_key, description,
  amount_minor, currency, occurred_on, paid_by) values
  ('20000000-0000-4000-8000-000000000001', null, '10000000-0000-4000-8000-000000000001',
   'expense', 'food', 'Almuerzo A', 25000, 'COP', current_date, '00000000-0000-4000-b000-00000000000a'),
  ('20000000-0000-4000-8000-000000000002', current_setting('test.h')::uuid,
   '10000000-0000-4000-8000-000000000002', 'expense', 'housing', 'Arriendo', 2000000, 'COP',
   current_date, '00000000-0000-4000-b000-00000000000a'),
  ('20000000-0000-4000-8000-000000000005', current_setting('test.h')::uuid,
   '10000000-0000-4000-8000-000000000001', 'expense', 'food', 'Mercado', 300000, 'COP',
   current_date, '00000000-0000-4000-b000-00000000000a');

insert into public.transaction_splits (transaction_id, user_id, share_minor) values
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-b000-00000000000a', 1000000),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-b000-00000000000b', 1000000),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-b000-00000000000a', 150000),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-b000-00000000000b', 150000);

insert into public.goal_contributions (goal_id, amount_minor, currency)
values ('30000000-0000-4000-8000-000000000001', 100000, 'COP');

insert into public.debt_payments (debt_id, paid_on, amount_minor, interest_minor, principal_minor)
values ('40000000-0000-4000-8000-000000000001', current_date, 200000, 50000, 150000);

insert into public.budgets (id, household_id, category_key, limit_minor, currency)
values ('60000000-0000-4000-8000-000000000001', current_setting('test.h')::uuid, 'food', 1500000, 'COP');

insert into public.settlements (household_id, from_user, to_user, amount_minor, currency)
values (current_setting('test.h')::uuid, '00000000-0000-4000-b000-00000000000b',
  '00000000-0000-4000-b000-00000000000a', 500000, 'COP');

-- --- B crea datos personales ------------------------------------------------------
select pg_temp.login('00000000-0000-4000-b000-00000000000b');

insert into public.accounts (id, name, type, currency)
values ('10000000-0000-4000-8000-000000000003', 'Cuenta B', 'savings', 'USD');
insert into public.transactions (id, account_id, kind, category_key, description, amount_minor,
  currency, occurred_on)
values ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'income',
  'salary', 'Sueldo B', 300000, 'USD', current_date);

-- --- C crea datos personales ------------------------------------------------------
select pg_temp.login('00000000-0000-4000-b000-00000000000c');

insert into public.accounts (id, name, type, currency)
values ('10000000-0000-4000-8000-000000000004', 'Cuenta C', 'cash', 'COP');
insert into public.transactions (id, account_id, kind, category_key, description, amount_minor,
  currency, occurred_on)
values ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'expense',
  'other', 'Gasto C', 10000, 'COP', current_date);

-- =============================================================================
-- 1. A no ve lo personal de B; ve lo suyo y lo compartido
-- =============================================================================
select pg_temp.login('00000000-0000-4000-b000-00000000000a');
select pg_temp.expect_count('select count(*) from public.accounts', 2, 'A ve sus 2 cuentas (personal y compartida)');
select pg_temp.expect_count($q$select count(*) from public.accounts where id = '10000000-0000-4000-8000-000000000003'$q$, 0, 'A no ve la cuenta personal de B');
select pg_temp.expect_count('select count(*) from public.transactions', 3, 'A ve su personal y las 2 compartidas');
select pg_temp.expect_count($q$select count(*) from public.transactions where id = '20000000-0000-4000-8000-000000000003'$q$, 0, 'A no ve la transacción personal de B');
select pg_temp.expect_rows($q$update public.transactions set note = 'x' where id = '20000000-0000-4000-8000-000000000003'$q$, 0, 'A no edita la transacción personal de B');

-- =============================================================================
-- 2. B ve y edita lo compartido, no lo personal de A
-- =============================================================================
select pg_temp.login('00000000-0000-4000-b000-00000000000b');
select pg_temp.expect_count('select count(*) from public.accounts', 2, 'B ve la cuenta compartida y la suya');
select pg_temp.expect_count('select count(*) from public.transactions', 3, 'B ve las 2 compartidas y la suya');
select pg_temp.expect_count($q$select count(*) from public.transactions where id = '20000000-0000-4000-8000-000000000001'$q$, 0, 'B no ve la transacción personal de A');
select pg_temp.expect_count('select count(*) from public.transaction_splits', 4, 'B ve los repartos de las compartidas');
select pg_temp.expect_count('select count(*) from public.goals', 1, 'B ve solo la meta compartida');
select pg_temp.expect_count('select count(*) from public.goal_contributions', 1, 'B ve los aportes a la meta compartida');
select pg_temp.expect_count('select count(*) from public.debts', 0, 'B no ve las deudas de A');
select pg_temp.expect_count('select count(*) from public.debt_payments', 0, 'B no ve los pagos de deuda de A');
select pg_temp.expect_count('select count(*) from public.recurring_items', 1, 'B ve el recurrente compartido');
select pg_temp.expect_count('select count(*) from public.recurring_occurrences', 1, 'B ve sus vencimientos');
select pg_temp.expect_count('select count(*) from public.budgets', 1, 'B ve el presupuesto compartido');
select pg_temp.expect_count('select count(*) from public.settlements', 1, 'B ve la liquidación');
select pg_temp.expect_rows($q$update public.transactions set description = 'Arriendo octubre' where id = '20000000-0000-4000-8000-000000000002'$q$, 1, 'B edita una transacción compartida');
select pg_temp.expect_rows($q$update public.transactions set note = 'ok' where id = '20000000-0000-4000-8000-000000000005'$q$, 1, 'B edita una compartida pagada desde la cuenta personal de A');
select pg_temp.expect_rows($q$update public.budgets set limit_minor = 1600000 where id = '60000000-0000-4000-8000-000000000001'$q$, 1, 'B edita el presupuesto compartido');
select pg_temp.expect_rows($q$delete from public.transactions where id = '20000000-0000-4000-8000-000000000001'$q$, 0, 'B no borra la transacción personal de A');

-- =============================================================================
-- 3. C no lee ni escribe nada de A ni de B
-- =============================================================================
select pg_temp.login('00000000-0000-4000-b000-00000000000c');
select pg_temp.expect_count('select count(*) from public.accounts', 1, 'C solo ve su cuenta');
select pg_temp.expect_count('select count(*) from public.transactions', 1, 'C solo ve su transacción');
select pg_temp.expect_count('select count(*) from public.transaction_splits', 0, 'C no ve repartos');
select pg_temp.expect_count('select count(*) from public.goals', 0, 'C no ve metas');
select pg_temp.expect_count('select count(*) from public.goal_contributions', 0, 'C no ve aportes');
select pg_temp.expect_count('select count(*) from public.debts', 0, 'C no ve deudas');
select pg_temp.expect_count('select count(*) from public.debt_payments', 0, 'C no ve pagos de deuda');
select pg_temp.expect_count('select count(*) from public.recurring_items', 0, 'C no ve recurrentes');
select pg_temp.expect_count('select count(*) from public.recurring_occurrences', 0, 'C no ve vencimientos');
select pg_temp.expect_count('select count(*) from public.budgets', 0, 'C no ve presupuestos');
select pg_temp.expect_count('select count(*) from public.settlements', 0, 'C no ve liquidaciones');

select pg_temp.expect_rows($q$update public.transactions set description = 'hack' where id = '20000000-0000-4000-8000-000000000002'$q$, 0, 'C no edita la compartida de H');
select pg_temp.expect_rows($q$update public.accounts set name = 'hack' where id = '10000000-0000-4000-8000-000000000001'$q$, 0, 'C no edita la cuenta de A');
select pg_temp.expect_rows($q$update public.debts set name = 'hack'$q$, 0, 'C no edita deudas ajenas');
select pg_temp.expect_rows($q$delete from public.transactions where id <> '20000000-0000-4000-8000-000000000004'$q$, 0, 'C no borra transacciones ajenas');
select pg_temp.expect_rows('delete from public.settlements', 0, 'C no borra liquidaciones ajenas');
select pg_temp.expect_rows('delete from public.transaction_splits', 0, 'C no borra repartos ajenos');

select pg_temp.expect_error(format($q$insert into public.accounts (household_id, name, type, currency) values (%L, 'x', 'cash', 'COP')$q$, current_setting('test.h')), '42501', 'C no crea cuentas en H');
select pg_temp.expect_error(format($q$insert into public.transactions (household_id, account_id, kind, category_key, description, amount_minor, currency, occurred_on) values (%L, '10000000-0000-4000-8000-000000000002', 'expense', 'food', 'x', 1, 'COP', current_date)$q$, current_setting('test.h')), '42501', 'C no crea transacciones en H');
select pg_temp.expect_error($q$insert into public.transactions (account_id, kind, category_key, description, amount_minor, currency, occurred_on) values ('10000000-0000-4000-8000-000000000001', 'expense', 'food', 'x', 1, 'COP', current_date)$q$, '42501', 'C no usa la cuenta de A en una transacción suya');
select pg_temp.expect_error($q$insert into public.transaction_splits values ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-b000-00000000000c', 1)$q$, '42501', 'C no agrega repartos a la compartida de H');
select pg_temp.expect_error($q$insert into public.goal_contributions (goal_id, amount_minor, currency) values ('30000000-0000-4000-8000-000000000001', 1, 'COP')$q$, '42501', 'C no aporta a la meta de H');
select pg_temp.expect_error($q$insert into public.debt_payments (debt_id, paid_on, amount_minor, principal_minor) values ('40000000-0000-4000-8000-000000000001', current_date, 1, 1)$q$, '42501', 'C no registra pagos en la deuda de A');
select pg_temp.expect_error($q$insert into public.recurring_occurrences (recurring_item_id, due_on) values ('50000000-0000-4000-8000-000000000001', current_date + 30)$q$, '42501', 'C no agrega vencimientos al recurrente de H');
select pg_temp.expect_error(format($q$insert into public.settlements (household_id, from_user, to_user, amount_minor, currency) values (%L, '00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-b000-00000000000b', 1, 'COP')$q$, current_setting('test.h')), '42501', 'C no crea liquidaciones en H');
select pg_temp.expect_error(format($q$insert into public.budgets (household_id, category_key, limit_minor, currency) values (%L, 'food', 1, 'COP')$q$, current_setting('test.h')), '42501', 'C no crea presupuestos en H');

-- =============================================================================
-- 4. Nadie reasigna filas a otro household ni cambia owner_id
-- =============================================================================
select pg_temp.login('00000000-0000-4000-b000-00000000000a');
select pg_temp.expect_error(format($q$update public.transactions set household_id = %L where id = '20000000-0000-4000-8000-000000000002'$q$, current_setting('test.h2')), '42501', 'A no mueve una transacción a H2');
select pg_temp.expect_error(format($q$update public.accounts set household_id = %L where id = '10000000-0000-4000-8000-000000000002'$q$, current_setting('test.h2')), '42501', 'A no mueve una cuenta a H2');
select pg_temp.expect_error(format($q$update public.goals set household_id = %L where id = '30000000-0000-4000-8000-000000000002'$q$, current_setting('test.h2')), '42501', 'A no mueve una meta personal a H2');
select pg_temp.expect_error(format($q$update public.budgets set household_id = %L$q$, current_setting('test.h2')), '42501', 'A no mueve un presupuesto a H2');
select pg_temp.expect_error(format($q$update public.recurring_items set household_id = %L$q$, current_setting('test.h2')), '42501', 'A no mueve un recurrente a H2');
select pg_temp.expect_error(format($q$update public.settlements set household_id = %L$q$, current_setting('test.h2')), '42501', 'A no mueve una liquidación a H2');
select pg_temp.expect_error($q$update public.transactions set owner_id = '00000000-0000-4000-b000-00000000000b' where id = '20000000-0000-4000-8000-000000000001'$q$, '42501', 'A no cambia el owner_id');
select pg_temp.expect_error($q$update public.debts set owner_id = '00000000-0000-4000-b000-00000000000b'$q$, '42501', 'A no regala su deuda');
select pg_temp.expect_error($q$update public.transaction_splits set transaction_id = '20000000-0000-4000-8000-000000000004' where user_id = '00000000-0000-4000-b000-00000000000a'$q$, '42501', 'A no cuelga un reparto de una transacción ajena');

select pg_temp.login('00000000-0000-4000-b000-00000000000b');
select pg_temp.expect_error($q$update public.transactions set household_id = null where id = '20000000-0000-4000-8000-000000000002'$q$, '42501', 'B no vuelve personal una compartida de A');
select pg_temp.expect_error($q$update public.settlements set created_by = '00000000-0000-4000-b000-00000000000b'$q$, '42501', 'B no cambia created_by de una liquidación');
select pg_temp.expect_error(format($q$insert into public.transactions (household_id, account_id, kind, category_key, description, amount_minor, currency, occurred_on, paid_by) values (%L, '10000000-0000-4000-8000-000000000002', 'expense', 'food', 'x', 1, 'COP', current_date, '00000000-0000-4000-b000-00000000000c')$q$, current_setting('test.h')), '42501', 'B no pone como pagador a alguien ajeno');
select pg_temp.expect_error($q$insert into public.transaction_splits values ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-b000-00000000000c', 1)$q$, '42501', 'B no reparte con alguien ajeno al household');
select pg_temp.expect_error($q$insert into public.transactions (owner_id, account_id, kind, category_key, description, amount_minor, currency, occurred_on) values ('00000000-0000-4000-b000-00000000000a', '10000000-0000-4000-8000-000000000003', 'expense', 'food', 'x', 1, 'COP', current_date)$q$, '42501', 'B no crea filas a nombre de A');

select pg_temp.login('00000000-0000-4000-b000-00000000000c');
select pg_temp.expect_error(format($q$update public.transactions set household_id = %L where id = '20000000-0000-4000-8000-000000000004'$q$, current_setting('test.h')), '42501', 'C no mete su transacción en H');
select pg_temp.expect_error(format($q$update public.accounts set household_id = %L where id = '10000000-0000-4000-8000-000000000004'$q$, current_setting('test.h')), '42501', 'C no mete su cuenta en H');

-- =============================================================================
-- 5. exchange_rates, categories y currencies son de solo lectura
-- =============================================================================
select pg_temp.login('00000000-0000-4000-b000-00000000000a');
select pg_temp.expect_count('select count(*) from public.exchange_rates', 1, 'A lee las tasas');
select pg_temp.expect_count('select count(*) from public.categories', 9, 'A lee las 9 categorías');
select pg_temp.expect_count('select count(*) from public.currencies', 2, 'A lee las 2 monedas');
select pg_temp.expect_error($q$insert into public.exchange_rates (base, quote, rate, as_of, source) values ('USD', 'COP', 1, current_date, 'hack')$q$, '42501', 'A no escribe tasas');
select pg_temp.expect_error($q$update public.exchange_rates set rate = 1$q$, '42501', 'A no edita tasas');
select pg_temp.expect_error($q$delete from public.exchange_rates$q$, '42501', 'A no borra tasas');
select pg_temp.expect_error($q$insert into public.categories (key, kind, sort) values ('mia', 'expense', 99)$q$, '42501', 'A no crea categorías');
select pg_temp.expect_error($q$insert into public.currencies (code, exponent) values ('EUR', 2)$q$, '42501', 'A no crea monedas');

-- =============================================================================
-- 6. Integridad básica
-- =============================================================================
select pg_temp.expect_error($q$insert into public.transactions (account_id, kind, category_key, description, amount_minor, currency, occurred_on) values ('10000000-0000-4000-8000-000000000001', 'expense', 'salary', 'x', 1, 'COP', current_date)$q$, '23503', 'un gasto no usa una categoría de ingreso');
select pg_temp.expect_error($q$insert into public.transactions (account_id, kind, description, amount_minor, currency, occurred_on, transfer_to_account_id) values ('10000000-0000-4000-8000-000000000001', 'transfer', 'x', 1, 'COP', current_date, '10000000-0000-4000-8000-000000000001')$q$, '23514', 'no hay transferencias a la misma cuenta');
select pg_temp.expect_error($q$insert into public.transactions (account_id, kind, category_key, description, amount_minor, currency, occurred_on) values ('10000000-0000-4000-8000-000000000001', 'expense', 'food', 'x', 0, 'COP', current_date)$q$, '23514', 'el importe debe ser mayor que 0');
select pg_temp.expect_error($q$insert into public.recurring_occurrences (recurring_item_id, due_on) values ('50000000-0000-4000-8000-000000000001', current_date)$q$, '23505', 'no hay dos vencimientos el mismo día');

-- =============================================================================
-- 7. Repartos (trigger diferido) y desglose de pagos de deuda
--    El trigger de repartos es DEFERRABLE INITIALLY DEFERRED: normalmente se
--    comprueba al hacer COMMIT. Como estos tests terminan en ROLLBACK, cada
--    caso termina con `set constraints all immediate` para forzar la
--    comprobación en ese momento, y empieza con `deferred` para poder crear la
--    transacción y sus repartos en sentencias separadas.
-- =============================================================================
select pg_temp.login('00000000-0000-4000-b000-00000000000a');

-- Todo lo creado en la preparación cumple las reglas.
select pg_temp.expect_ok('set constraints all immediate; set constraints all deferred',
  'los datos de la preparación cumplen las reglas de repartos');

select pg_temp.expect_ok(format($q$
  set constraints all deferred;
  insert into public.transactions (id, household_id, account_id, kind, category_key, description,
    amount_minor, currency, occurred_on, paid_by)
  values ('20000000-0000-4000-8000-000000000007', %L, '10000000-0000-4000-8000-000000000002',
    'expense', 'food', 'Cena', 90000, 'COP', current_date, '00000000-0000-4000-b000-00000000000a');
  insert into public.transaction_splits values
    ('20000000-0000-4000-8000-000000000007', '00000000-0000-4000-b000-00000000000a', 45000),
    ('20000000-0000-4000-8000-000000000007', '00000000-0000-4000-b000-00000000000b', 45000);
  set constraints all immediate$q$, current_setting('test.h')),
  'compartida con repartos que suman el monto pasa');

select pg_temp.expect_error($q$
  set constraints all deferred;
  update public.transaction_splits set share_minor = 50000
  where transaction_id = '20000000-0000-4000-8000-000000000007'
    and user_id = '00000000-0000-4000-b000-00000000000a';
  set constraints all immediate$q$,
  '23514', 'repartos que suman más que el monto fallan', 'splits_sum_mismatch');

select pg_temp.expect_error($q$
  set constraints all deferred;
  update public.transactions set amount_minor = 100000
  where id = '20000000-0000-4000-8000-000000000007';
  set constraints all immediate$q$,
  '23514', 'cambiar el monto sin ajustar los repartos falla', 'splits_sum_mismatch');

select pg_temp.expect_error($q$
  set constraints all deferred;
  delete from public.transaction_splits
  where transaction_id = '20000000-0000-4000-8000-000000000007'
    and user_id = '00000000-0000-4000-b000-00000000000b';
  set constraints all immediate$q$,
  '23514', 'quitar un reparto deja la suma corta y falla', 'splits_sum_mismatch');

select pg_temp.expect_error(format($q$
  set constraints all deferred;
  insert into public.transactions (id, household_id, account_id, kind, category_key, description,
    amount_minor, currency, occurred_on)
  values ('20000000-0000-4000-8000-000000000008', %L, '10000000-0000-4000-8000-000000000002',
    'expense', 'food', 'Sin repartos', 10000, 'COP', current_date);
  set constraints all immediate$q$, current_setting('test.h')),
  '23514', 'una compartida sin repartos falla', 'splits_sum_mismatch');

select pg_temp.expect_ok($q$
  set constraints all deferred;
  update public.transactions set amount_minor = 100000
  where id = '20000000-0000-4000-8000-000000000007';
  update public.transaction_splits set share_minor = 50000
  where transaction_id = '20000000-0000-4000-8000-000000000007';
  set constraints all immediate$q$,
  'cambiar monto y repartos juntos pasa');

select pg_temp.expect_error($q$
  set constraints all deferred;
  insert into public.transaction_splits values
    ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-b000-00000000000a', 25000);
  set constraints all immediate$q$,
  '23514', 'una transacción personal no lleva repartos', 'personal_transaction_has_splits');

select pg_temp.expect_error($q$
  set constraints all deferred;
  update public.transactions set household_id = null
  where id = '20000000-0000-4000-8000-000000000007';
  set constraints all immediate$q$,
  '23514', 'volver personal una compartida con repartos falla', 'personal_transaction_has_splits');

-- Desglose de pagos de deuda (CHECK inmediato).
select pg_temp.expect_ok($q$insert into public.debt_payments (debt_id, paid_on, amount_minor, interest_minor, principal_minor) values ('40000000-0000-4000-8000-000000000001', current_date, 100000, 30000, 70000)$q$,
  'pago de deuda con interés + capital = monto pasa');
select pg_temp.expect_error($q$insert into public.debt_payments (debt_id, paid_on, amount_minor, interest_minor, principal_minor) values ('40000000-0000-4000-8000-000000000001', current_date, 100000, 30000, 60000)$q$,
  '23514', 'pago de deuda con desglose que no suma falla');
select pg_temp.expect_error($q$insert into public.debt_payments (debt_id, paid_on, amount_minor) values ('40000000-0000-4000-8000-000000000001', current_date, 100000)$q$,
  '23514', 'pago de deuda sin desglose falla');

-- =============================================================================
-- 8. Transferencias: no llevan repartos ni se les exige que sumen
-- =============================================================================
select pg_temp.login('00000000-0000-4000-b000-00000000000a');

select pg_temp.expect_ok(format($q$
  set constraints all deferred;
  insert into public.transactions (id, household_id, account_id, kind, description, amount_minor,
    currency, occurred_on, transfer_to_account_id)
  values ('20000000-0000-4000-8000-000000000009', %L, '10000000-0000-4000-8000-000000000002',
    'transfer', 'A la cuenta de A', 50000, 'COP', current_date, '10000000-0000-4000-8000-000000000001');
  set constraints all immediate$q$, current_setting('test.h')),
  'transferencia compartida sin repartos pasa');

select pg_temp.expect_ok($q$
  set constraints all deferred;
  insert into public.transactions (id, account_id, kind, description, amount_minor, currency,
    occurred_on, transfer_to_account_id)
  values ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001',
    'transfer', 'A la cuenta de la casa', 20000, 'COP', current_date, '10000000-0000-4000-8000-000000000002');
  set constraints all immediate$q$,
  'transferencia personal sin repartos pasa');

select pg_temp.expect_error($q$
  set constraints all deferred;
  insert into public.transaction_splits values
    ('20000000-0000-4000-8000-000000000009', '00000000-0000-4000-b000-00000000000a', 25000),
    ('20000000-0000-4000-8000-000000000009', '00000000-0000-4000-b000-00000000000b', 25000);
  set constraints all immediate$q$,
  '23514', 'transferencia compartida con repartos falla (aunque sumen)', 'transfer_has_splits');

select pg_temp.expect_error($q$
  set constraints all deferred;
  insert into public.transaction_splits values
    ('20000000-0000-4000-8000-00000000000a', '00000000-0000-4000-b000-00000000000a', 20000);
  set constraints all immediate$q$,
  '23514', 'transferencia personal con repartos falla', 'transfer_has_splits');

select pg_temp.expect_error($q$
  set constraints all deferred;
  update public.transactions
  set kind = 'transfer', category_key = null,
      transfer_to_account_id = '10000000-0000-4000-8000-000000000001'
  where id = '20000000-0000-4000-8000-000000000007';
  set constraints all immediate$q$,
  '23514', 'convertir en transferencia un gasto con repartos falla', 'transfer_has_splits');

select pg_temp.expect_error(format($q$
  set constraints all deferred;
  insert into public.transactions (id, household_id, account_id, kind, category_key, description,
    amount_minor, currency, occurred_on, paid_by)
  values ('20000000-0000-4000-8000-00000000000b', %L, '10000000-0000-4000-8000-000000000002',
    'expense', 'leisure', 'Cine', 60000, 'COP', current_date, '00000000-0000-4000-b000-00000000000a');
  insert into public.transaction_splits values
    ('20000000-0000-4000-8000-00000000000b', '00000000-0000-4000-b000-00000000000a', 30000),
    ('20000000-0000-4000-8000-00000000000b', '00000000-0000-4000-b000-00000000000b', 20000);
  set constraints all immediate$q$, current_setting('test.h')),
  '23514', 'gasto compartido sigue exigiendo que los repartos sumen', 'splits_sum_mismatch');

select set_config('role', 'postgres', true);
select 'OK: todas las pruebas RLS de finanzas pasaron' as resultado;

rollback;
