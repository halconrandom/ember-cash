-- =============================================================================
-- Tests de 0010_household_leave.sql: salir o quitar a un miembro, bloqueo de
-- lo que involucra a un ex miembro y post_occurrence con joined_at.
-- A crea el hogar; B y C entran. Ayudas con prefijo hl_.
-- =============================================================================
begin;

create function pg_temp.hl_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.hl_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

create function pg_temp.hl_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    set constraints all immediate;
  exception when others then
    if sqlerrm <> expected and sqlstate <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    -- Deja los constraints diferidos otra vez para los pasos siguientes.
    set constraints all deferred;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-d100-00000000000a', 'authenticated', 'authenticated', 'hl-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-d100-00000000000b', 'authenticated', 'authenticated', 'hl-b@test.local', '{}', '{}'),
  ('00000000-0000-4000-d100-00000000000c', 'authenticated', 'authenticated', 'hl-c@test.local', '{}', '{}');
update public.profiles set display_name = 'Bea' where id = '00000000-0000-4000-d100-00000000000b';

select pg_temp.hl_login('00000000-0000-4000-d100-00000000000a');
select set_config('test.hl_h', public.create_household('H')::text, true);
insert into public.household_invites (household_id, token_hash) values
  (current_setting('test.hl_h')::uuid, encode(sha256(convert_to('hl-token-b', 'UTF8')), 'hex')),
  (current_setting('test.hl_h')::uuid, encode(sha256(convert_to('hl-token-c', 'UTF8')), 'hex'));
insert into public.accounts (id, household_id, name, type, currency)
values ('83000000-0000-4000-8000-000000000001', current_setting('test.hl_h')::uuid, 'Casa', 'checking', 'COP');

select pg_temp.hl_login('00000000-0000-4000-d100-00000000000b');
select public.accept_invite('hl-token-b');

-- A paga 1000 (50/50): B le debe 500.
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000a');
select set_config('test.hl_t1', public.save_transaction(null, current_setting('test.hl_h')::uuid,
  '83000000-0000-4000-8000-000000000001', 'expense', 'food', 'Mercado', null, 1000, 'COP', current_date,
  '00000000-0000-4000-d100-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;

-- Suscripción compartida de B.
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000b');
insert into public.recurring_items (id, household_id, kind, name, category_key, amount_minor, currency,
  account_id, frequency, anchor_date)
values ('84000000-0000-4000-8000-000000000001', current_setting('test.hl_h')::uuid, 'subscription', 'Streaming',
  'subscriptions', 30000, 'COP', '83000000-0000-4000-8000-000000000001', 'monthly', current_date);

-- 1. Con saldo pendiente no puede salir ni ser quitada.
select pg_temp.hl_expect_error($q$select public.leave_household(current_setting('test.hl_h')::uuid)$q$,
  'balance_not_settled', 'B no puede salir con saldo pendiente');
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000a');
select pg_temp.hl_expect_error($q$select public.remove_household_member(current_setting('test.hl_h')::uuid, '00000000-0000-4000-d100-00000000000b')$q$,
  'balance_not_settled', 'A no puede quitar a B con saldo pendiente');

-- 2. Quien administra no puede salir; un miembro no puede quitar a otro.
select pg_temp.hl_expect_error($q$select public.leave_household(current_setting('test.hl_h')::uuid)$q$,
  'owner_cannot_leave', 'quien administra no puede salir');
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000b');
select pg_temp.hl_expect_error($q$select public.remove_household_member(current_setting('test.hl_h')::uuid, '00000000-0000-4000-d100-00000000000a')$q$,
  '42501', 'un miembro no puede quitar a otro');
select pg_temp.hl_expect_error($q$delete from public.household_members where user_id = '00000000-0000-4000-d100-00000000000b'$q$,
  '42501', 'nadie borra membresías directamente');

-- 3. Liquidación parcial: sigue sin poder salir. Total: ya puede.
insert into public.settlements (household_id, from_user, to_user, amount_minor, currency)
values (current_setting('test.hl_h')::uuid, '00000000-0000-4000-d100-00000000000b', '00000000-0000-4000-d100-00000000000a', 200, 'COP');
select pg_temp.hl_expect_error($q$select public.leave_household(current_setting('test.hl_h')::uuid)$q$,
  'balance_not_settled', 'con liquidación parcial sigue sin poder salir');
-- Un saldo en otra moneda también cuenta.
insert into public.settlements (household_id, from_user, to_user, amount_minor, currency) values
  (current_setting('test.hl_h')::uuid, '00000000-0000-4000-d100-00000000000b', '00000000-0000-4000-d100-00000000000a', 300, 'COP'),
  (current_setting('test.hl_h')::uuid, '00000000-0000-4000-d100-00000000000b', '00000000-0000-4000-d100-00000000000a', 100, 'USD');
select pg_temp.hl_expect_error($q$select public.leave_household(current_setting('test.hl_h')::uuid)$q$,
  'balance_not_settled', 'un saldo en USD también impide salir');
select set_config('role', 'postgres', true);
delete from public.settlements where currency = 'USD' and household_id = current_setting('test.hl_h')::uuid;
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000b');
select public.leave_household(current_setting('test.hl_h')::uuid);
select pg_temp.hl_expect(not public.is_household_member(current_setting('test.hl_h')::uuid), 'B salió con el saldo en cero');

-- 4. El ex miembro ya no ve nada del hogar.
select pg_temp.hl_expect((select count(*) = 0 from public.transactions where household_id = current_setting('test.hl_h')::uuid),
  'B ya no ve los gastos del hogar');
select pg_temp.hl_expect((select count(*) = 0 from public.settlements where household_id = current_setting('test.hl_h')::uuid),
  'B ya no ve las liquidaciones');

-- 5. El historial queda tal cual y la salida queda registrada.
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000a');
select pg_temp.hl_expect((select count(*) = 2 from public.transaction_splits where transaction_id = current_setting('test.hl_t1')::uuid),
  'los repartos con B se conservan');
select pg_temp.hl_expect((select count(*) = 2 from public.settlements where household_id = current_setting('test.hl_h')::uuid),
  'las liquidaciones con B se conservan');
select pg_temp.hl_expect((select display_name = 'Bea' and removed_by is null
  from public.household_departures where household_id = current_setting('test.hl_h')::uuid),
  'la salida guarda el nombre');
select pg_temp.hl_expect((select household_id = current_setting('test.hl_h')::uuid from public.recurring_items
  where id = '84000000-0000-4000-8000-000000000001'), 'la suscripción de B sigue en el hogar');

-- 6. Gasto con reparto de un ex miembro: solo categoría y nota.
select public.save_transaction(current_setting('test.hl_t1')::uuid, current_setting('test.hl_h')::uuid,
  '83000000-0000-4000-8000-000000000001', 'expense', 'housing', 'Mercado', 'nota nueva', 1000, 'COP', current_date,
  '00000000-0000-4000-d100-00000000000a', null);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hl_expect((select category_key = 'housing' and note = 'nota nueva' from public.transactions
  where id = current_setting('test.hl_t1')::uuid), 'se pueden editar categoría y nota');
select pg_temp.hl_expect((select count(*) = 2 from public.transaction_splits where transaction_id = current_setting('test.hl_t1')::uuid),
  'editar categoría y nota no rehace el reparto');
select pg_temp.hl_expect_error($q$select public.save_transaction(current_setting('test.hl_t1')::uuid, current_setting('test.hl_h')::uuid,
  '83000000-0000-4000-8000-000000000001', 'expense', 'housing', 'Mercado', null, 2000, 'COP', current_date,
  '00000000-0000-4000-d100-00000000000a', null)$q$, 'former_member_locked', 'el monto queda bloqueado');
select pg_temp.hl_expect_error($q$update public.transactions set occurred_on = current_date - 1 where id = current_setting('test.hl_t1')::uuid$q$,
  'former_member_locked', 'la fecha queda bloqueada');
select pg_temp.hl_expect_error($q$update public.transactions set deleted_at = now() where id = current_setting('test.hl_t1')::uuid$q$,
  'former_member_locked', 'no se puede borrar');
select pg_temp.hl_expect_error($q$delete from public.transaction_splits where transaction_id = current_setting('test.hl_t1')::uuid$q$,
  'former_member_locked', 'el reparto queda bloqueado');
select pg_temp.hl_expect_error($q$delete from public.settlements where household_id = current_setting('test.hl_h')::uuid$q$,
  'former_member_locked', 'una liquidación con un ex miembro no se borra');

-- 7. Un gasto nuevo después de la salida es solo de A y se puede editar.
select set_config('test.hl_t2', public.save_transaction(null, current_setting('test.hl_h')::uuid,
  '83000000-0000-4000-8000-000000000001', 'expense', 'food', 'Después', null, 800, 'COP', current_date,
  '00000000-0000-4000-d100-00000000000a', null)::text, true);
select public.save_transaction(current_setting('test.hl_t2')::uuid, current_setting('test.hl_h')::uuid,
  '83000000-0000-4000-8000-000000000001', 'expense', 'food', 'Después', null, 900, 'COP', current_date,
  '00000000-0000-4000-d100-00000000000a', null);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hl_expect((select count(*) = 1 and sum(share_minor) = 900 from public.transaction_splits
  where transaction_id = current_setting('test.hl_t2')::uuid), 'un gasto posterior no incluye al ex miembro y se edita normal');

-- 8. Quitar a un miembro (C) sin saldo; el aviso se puede cerrar.
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000c');
select public.accept_invite('hl-token-c');
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000a');
select public.remove_household_member(current_setting('test.hl_h')::uuid, '00000000-0000-4000-d100-00000000000c');
select pg_temp.hl_expect((select removed_by = '00000000-0000-4000-d100-00000000000a' from public.household_departures
  where user_id = '00000000-0000-4000-d100-00000000000c'), 'quien administra quita a C sin saldo');
update public.household_departures set notice_dismissed_at = now() where household_id = current_setting('test.hl_h')::uuid;
select pg_temp.hl_expect((select count(*) = 2 from public.household_departures where notice_dismissed_at is not null),
  'un miembro puede cerrar el aviso');
select pg_temp.hl_expect_error($q$update public.household_departures set display_name = 'x'$q$,
  '42501', 'los miembros solo pueden cerrar el aviso');

-- 9. post_occurrence respeta joined_at (igual que save_transaction en household_rules.sql).
-- C vuelve a entrar con fecha de ingreso dentro de 2 días.
select set_config('role', 'postgres', true);
insert into public.household_members (household_id, user_id, role, joined_at)
values (current_setting('test.hl_h')::uuid, '00000000-0000-4000-d100-00000000000c', 'member', now() + interval '2 days');
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000a');
insert into public.recurring_items (id, household_id, kind, name, category_key, amount_minor, currency,
  account_id, frequency, anchor_date)
values ('84000000-0000-4000-8000-000000000002', current_setting('test.hl_h')::uuid, 'bill', 'Luz',
  'housing', 1001, 'COP', '83000000-0000-4000-8000-000000000001', 'monthly', current_date);
insert into public.recurring_occurrences (id, recurring_item_id, due_on) values
  ('85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', current_date),
  ('85000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002', current_date + 3),
  ('85000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000002', current_date - 400);
select set_config('test.hl_p1', public.post_occurrence('85000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.hl_p2', public.post_occurrence('85000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.hl_p3', public.post_occurrence('85000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000001')::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hl_expect((select count(*) = 1 and sum(share_minor) = 1001 from public.transaction_splits
  where transaction_id = current_setting('test.hl_p1')::uuid), 'post_occurrence: vencimiento anterior al ingreso de C no se reparte con C');
select pg_temp.hl_expect((select count(*) = 2 and sum(share_minor) = 1001 and max(share_minor) = 501 from public.transaction_splits
  where transaction_id = current_setting('test.hl_p2')::uuid), 'post_occurrence: vencimiento posterior se reparte entre los dos');
select pg_temp.hl_expect((select count(*) = 1 and min(user_id::text) = '00000000-0000-4000-d100-00000000000a' from public.transaction_splits
  where transaction_id = current_setting('test.hl_p3')::uuid), 'post_occurrence: anterior al hogar, todo para quien paga');

-- 10. La suscripción de B (ex miembro) no se registra sola: sin usuario,
-- post_occurrence falla (0011). A sí puede marcarla como pagada.
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
insert into public.recurring_occurrences (id, recurring_item_id, due_on)
values ('85000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000001', current_date);
select pg_temp.hl_expect_error($q$select public.post_occurrence('85000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000001')$q$,
  'not_authenticated', 'nada se registra a nombre de un ex miembro sin confirmar');
select pg_temp.hl_login('00000000-0000-4000-d100-00000000000a');
select set_config('test.hl_p4', public.post_occurrence('85000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000001')::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hl_expect((select paid_by = '00000000-0000-4000-d100-00000000000a' from public.transactions
  where id = current_setting('test.hl_p4')::uuid), 'quien marca como pagado es quien paga');
select set_config('role', 'postgres', true);

-- 11. Borrar el hogar (cascada) no choca con el bloqueo.
delete from public.households where id = current_setting('test.hl_h')::uuid;
set constraints all immediate;
select pg_temp.hl_expect((select count(*) = 0 from public.transactions where id = current_setting('test.hl_t1')::uuid),
  'borrar el hogar borra en cascada aunque haya ex miembros');
set constraints all deferred;

select 'OK: todas las pruebas de salida del hogar pasaron';
rollback;
