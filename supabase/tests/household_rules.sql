-- =============================================================================
-- Tests de 0009_household_rules.sql: repartos según la fecha de ingreso y
-- presupuestos por mes. A crea el hogar; B entra. Ayudas con prefijo hr_.
-- =============================================================================
begin;

create function pg_temp.hr_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.hr_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

create function pg_temp.hr_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
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

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-f000-00000000000a', 'authenticated', 'authenticated', 'hr-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-f000-00000000000b', 'authenticated', 'authenticated', 'hr-b@test.local', '{}', '{}');

select pg_temp.hr_login('00000000-0000-4000-f000-00000000000a');
select set_config('test.hr_h', public.create_household('H')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.hr_h')::uuid, encode(sha256(convert_to('hr-token', 'UTF8')), 'hex'));
insert into public.accounts (id, household_id, name, type, currency)
values ('81000000-0000-4000-8000-000000000001', current_setting('test.hr_h')::uuid, 'Casa', 'checking', 'COP');

select pg_temp.hr_login('00000000-0000-4000-f000-00000000000b');
select public.accept_invite('hr-token');

-- B "entró" dentro de 2 días (se mueve su fecha de ingreso como postgres).
select set_config('role', 'postgres', true);
update public.household_members set joined_at = now() + interval '2 days'
where user_id = '00000000-0000-4000-f000-00000000000b';

select pg_temp.hr_login('00000000-0000-4000-f000-00000000000a');

-- 1. Gasto de hoy: B todavía no era miembro → todo para A.
select set_config('test.hr_t1', public.save_transaction(null, current_setting('test.hr_h')::uuid,
  '81000000-0000-4000-8000-000000000001', 'expense', 'food', 'Antes de B', null, 1000, 'COP', current_date,
  '00000000-0000-4000-f000-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hr_expect((select count(*) = 1 and sum(share_minor) = 1000 and min(user_id::text) = '00000000-0000-4000-f000-00000000000a'
  from public.transaction_splits where transaction_id = current_setting('test.hr_t1')::uuid),
  'un gasto anterior al ingreso de B no se reparte con B');

-- 2. Editarlo después no lo reparte con B.
select public.save_transaction(current_setting('test.hr_t1')::uuid, current_setting('test.hr_h')::uuid,
  '81000000-0000-4000-8000-000000000001', 'expense', 'food', 'Antes de B', 'editado', 2000, 'COP', current_date,
  '00000000-0000-4000-f000-00000000000a', null);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hr_expect((select count(*) = 1 and sum(share_minor) = 2000 from public.transaction_splits
  where transaction_id = current_setting('test.hr_t1')::uuid), 'editar un gasto viejo no lo reparte con el miembro nuevo');

-- 3. Gasto con fecha posterior al ingreso de B: 50/50.
select set_config('test.hr_t2', public.save_transaction(null, current_setting('test.hr_h')::uuid,
  '81000000-0000-4000-8000-000000000001', 'expense', 'food', 'Con B', null, 1001, 'COP', current_date + 3,
  '00000000-0000-4000-f000-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hr_expect((select count(*) = 2 and sum(share_minor) = 1001 from public.transaction_splits
  where transaction_id = current_setting('test.hr_t2')::uuid), 'un gasto posterior al ingreso se reparte entre los dos');

-- 4. Gasto anterior a la creación del hogar: 100 % del pagador.
select set_config('test.hr_t3', public.save_transaction(null, current_setting('test.hr_h')::uuid,
  '81000000-0000-4000-8000-000000000001', 'expense', 'food', 'Muy viejo', null, 500, 'COP', current_date - 30,
  '00000000-0000-4000-f000-00000000000a', null)::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.hr_expect((select count(*) = 1 and sum(share_minor) = 500 from public.transaction_splits
  where transaction_id = current_setting('test.hr_t3')::uuid), 'gasto anterior al hogar: todo del pagador');

-- 5. B ve el historial completo (incluidos los gastos anteriores a su ingreso).
select pg_temp.hr_login('00000000-0000-4000-f000-00000000000b');
select pg_temp.hr_expect((select count(*) = 3 from public.transactions where household_id = current_setting('test.hr_h')::uuid),
  'B ve todo el historial del hogar');

-- 6. Presupuestos por mes: mismo mes repetido falla; otro mes sí.
insert into public.budgets (household_id, category_key, limit_minor, currency, month)
values (current_setting('test.hr_h')::uuid, 'food', 1200000, 'COP', '2026-10-01');
insert into public.budgets (household_id, category_key, limit_minor, currency, month)
values (current_setting('test.hr_h')::uuid, 'food', 1300000, 'COP', '2026-11-01');
select pg_temp.hr_expect_error(format($q$insert into public.budgets (household_id, category_key, limit_minor, currency, month)
  values (%L, 'food', 1, 'COP', '2026-10-01')$q$, current_setting('test.hr_h')), '23505', 'un solo presupuesto por categoría y mes');
select pg_temp.hr_expect_error(format($q$insert into public.budgets (household_id, category_key, limit_minor, currency, month)
  values (%L, 'housing', 1, 'COP', '2026-10-15')$q$, current_setting('test.hr_h')), '23514', 'el mes es el primer día');

select set_config('role', 'postgres', true);
select 'OK: todas las pruebas de reglas del hogar pasaron' as resultado;

rollback;
