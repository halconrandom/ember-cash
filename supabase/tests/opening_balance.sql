-- =============================================================================
-- Saldo inicial (0024). kind opening entra en account_balance y no en
-- dashboard_totals. En una tarjeta es deuda, no un gasto del mes. No se
-- edita como ingreso y no se reparte. Las filas que F1 guardó como
-- other_income (o other en una tarjeta) se convierten.
-- Todo en una transacción con ROLLBACK. Ayudas con prefijo opb_.
-- =============================================================================
begin;

create function pg_temp.opb_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.opb_expect_error(stmt text, expected text, label text) returns void
language plpgsql as $$
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

create function pg_temp.opb_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

-- Suma del mes en la moneda de origen. El llamador tiene que ser el dueño:
-- dashboard_totals es security invoker.
create function pg_temp.opb_total(hid uuid, k text) returns bigint
language sql stable as $$
  select coalesce((
    select sum(d.total_minor)
    from public.dashboard_totals(
      hid,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
      'COP'
    ) d
    where d.kind = k
  ), 0)::bigint;
$$;

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c024-00000000000a', 'authenticated', 'authenticated', 'opb-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c024-00000000000b', 'authenticated', 'authenticated', 'opb-b@test.local', '{}', '{}');

select pg_temp.opb_login('00000000-0000-4000-c024-00000000000a');
select set_config('test.opb_h', public.create_household('Casa OPB')::text, true);

insert into public.accounts (id, name, type, currency) values
  ('00000000-0000-4000-c024-0000000000a1', 'Ahorros', 'savings', 'COP'),
  ('00000000-0000-4000-c024-0000000000a2', 'Tarjeta', 'credit_card', 'COP'),
  ('00000000-0000-4000-c024-0000000000a3', 'Alcancia', 'cash', 'COP'),
  ('00000000-0000-4000-c024-0000000000a6', 'Visa', 'credit_card', 'COP');
insert into public.accounts (id, household_id, name, type, currency) values
  ('00000000-0000-4000-c024-0000000000a4', current_setting('test.opb_h')::uuid, 'Casa', 'checking', 'COP'),
  ('00000000-0000-4000-c024-0000000000a5', current_setting('test.opb_h')::uuid, 'Olla', 'cash', 'COP');

insert into public.household_invites (household_id, token_hash)
values (
  current_setting('test.opb_h')::uuid,
  encode(sha256(convert_to('opb-token', 'UTF8')), 'hex')
);

select pg_temp.opb_login('00000000-0000-4000-c024-00000000000b');
select public.accept_invite('opb-token');

-- 1. Saldo inicial de un ahorro: la cuenta sube y el mes no.
select pg_temp.opb_login('00000000-0000-4000-c024-00000000000a');
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a1') = 0,
  'sin movimientos el saldo es 0'
);

insert into public.transactions (
  account_id, kind, description, amount_minor, currency, occurred_on
) values (
  '00000000-0000-4000-c024-0000000000a1', 'opening', 'Ahorros', 500000, 'COP', current_date
);

select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a1') = 500000,
  'el saldo inicial queda en la cuenta'
);
select pg_temp.opb_expect(pg_temp.opb_total(null, 'income') = 0, 'el saldo inicial no es ingreso del mes');
select pg_temp.opb_expect(pg_temp.opb_total(null, 'expense') = 0, 'el saldo inicial no es gasto del mes');

insert into public.transactions (
  account_id, kind, category_key, description, amount_minor, currency, occurred_on, paid_by
) values
  ('00000000-0000-4000-c024-0000000000a1', 'income', 'salary', 'Sueldo', 50000, 'COP', current_date,
   '00000000-0000-4000-c024-00000000000a'),
  ('00000000-0000-4000-c024-0000000000a1', 'expense', 'food', 'Mercado', 10000, 'COP', current_date,
   '00000000-0000-4000-c024-00000000000a');

select pg_temp.opb_expect(pg_temp.opb_total(null, 'income') = 50000, 'el ingreso real sí entra en el mes');
select pg_temp.opb_expect(pg_temp.opb_total(null, 'expense') = 10000, 'el gasto real sí entra en el mes');
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a1') = 540000,
  'el saldo suma inicial + ingreso - gasto'
);

-- 2. En una tarjeta el saldo inicial es deuda. Un gasto posterior sí entra en el mes.
insert into public.transactions (
  account_id, kind, description, amount_minor, currency, occurred_on
) values (
  '00000000-0000-4000-c024-0000000000a2', 'opening', 'Tarjeta', 200000, 'COP', current_date
);

select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a2') = 200000,
  'el saldo inicial de la tarjeta es deuda'
);
select pg_temp.opb_expect(
  pg_temp.opb_total(null, 'expense') = 10000,
  'esa deuda no sube el gasto del mes'
);

insert into public.transactions (
  account_id, kind, category_key, description, amount_minor, currency, occurred_on, paid_by
) values (
  '00000000-0000-4000-c024-0000000000a2', 'expense', 'other', 'Compra', 1000, 'COP', current_date,
  '00000000-0000-4000-c024-00000000000a'
);

select pg_temp.opb_expect(pg_temp.opb_total(null, 'expense') = 11000, 'un gasto nuevo de la tarjeta sí entra');
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a2') = 201000,
  'la deuda de la tarjeta suma el gasto nuevo'
);

-- 3. En el hogar no hay repartos y no entra en el mes del hogar ni en el personal.
insert into public.transactions (
  household_id, account_id, kind, description, amount_minor, currency, occurred_on
) values (
  current_setting('test.opb_h')::uuid,
  '00000000-0000-4000-c024-0000000000a4', 'opening', 'Casa', 7000, 'COP', current_date
);

select pg_temp.opb_expect(
  (select count(*) = 0 from public.transaction_splits s
   join public.transactions t on t.id = s.transaction_id
   where t.account_id = '00000000-0000-4000-c024-0000000000a4'),
  'el saldo inicial del hogar no tiene repartos'
);
select pg_temp.opb_expect(
  pg_temp.opb_total(current_setting('test.opb_h')::uuid, 'income') = 0
  and pg_temp.opb_total(current_setting('test.opb_h')::uuid, 'expense') = 0,
  'el saldo del hogar no entra en los totales del hogar'
);
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a4') = 7000,
  'el saldo de la cuenta del hogar sí cambia'
);
select pg_temp.opb_expect(
  pg_temp.opb_total(null, 'income') = 50000 and pg_temp.opb_total(null, 'expense') = 11000,
  'el saldo del hogar no entra en los totales personales'
);

-- 4. Huella de F1: ingreso other_income, gasto other en tarjeta, ingreso compartido.
select public.save_transaction(
  null, null, '00000000-0000-4000-c024-0000000000a3',
  'income', 'other_income', 'Alcancia', null, 3000, 'COP', current_date,
  '00000000-0000-4000-c024-00000000000a', null
);
select public.save_transaction(
  null, null, '00000000-0000-4000-c024-0000000000a6',
  'expense', 'other', 'Visa', '', 4000, 'COP', current_date,
  '00000000-0000-4000-c024-00000000000a', null
);
select public.save_transaction(
  null, current_setting('test.opb_h')::uuid, '00000000-0000-4000-c024-0000000000a5',
  'income', 'other_income', 'Olla', null, 8000, 'COP', current_date,
  '00000000-0000-4000-c024-00000000000a', null
);
set constraints all immediate;
set constraints all deferred;

select pg_temp.opb_expect(pg_temp.opb_total(null, 'income') = 53000, 'antes de migrar, Alcancia cuenta como ingreso');
select pg_temp.opb_expect(pg_temp.opb_total(null, 'expense') = 15000, 'antes de migrar, Visa cuenta como gasto');
select pg_temp.opb_expect(
  pg_temp.opb_total(current_setting('test.opb_h')::uuid, 'income') = 8000,
  'antes de migrar, Olla cuenta como ingreso del hogar'
);
select pg_temp.opb_expect(
  (select count(*) = 2 from public.transaction_splits s
   join public.transactions t on t.id = s.transaction_id
   where t.account_id = '00000000-0000-4000-c024-0000000000a5'),
  'el ingreso compartido de F1 sí se repartió'
);

select pg_temp.opb_expect_error(
  $q$select public.migrate_wizard_opening_balances()$q$,
  '42501',
  'authenticated no ejecuta la migración'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

select pg_temp.opb_expect(
  public.household_member_settled(
    current_setting('test.opb_h')::uuid,
    '00000000-0000-4000-c024-00000000000a'
  ) = false,
  'antes de migrar el hogar no está saldado'
);
select pg_temp.opb_expect(
  public.migrate_wizard_opening_balances() = 3,
  'se convierten las tres filas del wizard'
);
select pg_temp.opb_expect(
  public.household_member_settled(
    current_setting('test.opb_h')::uuid,
    '00000000-0000-4000-c024-00000000000a'
  ) = true,
  'al quitar el reparto el hogar queda saldado'
);

select pg_temp.opb_login('00000000-0000-4000-c024-00000000000a');
select pg_temp.opb_expect(pg_temp.opb_total(null, 'income') = 50000, 'después, el ingreso del mes no incluye Alcancia');
select pg_temp.opb_expect(pg_temp.opb_total(null, 'expense') = 11000, 'después, el gasto del mes no incluye Visa');
select pg_temp.opb_expect(
  pg_temp.opb_total(current_setting('test.opb_h')::uuid, 'income') = 0,
  'después, el hogar no tiene ese ingreso'
);
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a3') = 3000,
  'Alcancia conserva el saldo'
);
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a6') = 4000,
  'Visa conserva la deuda y ya no es gasto del mes'
);
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a5') = 8000,
  'Olla conserva el saldo'
);
select pg_temp.opb_expect(
  (select count(*) = 3 and bool_and(category_key is null and paid_by is null)
   from public.transactions
   where account_id in (
     '00000000-0000-4000-c024-0000000000a3',
     '00000000-0000-4000-c024-0000000000a5',
     '00000000-0000-4000-c024-0000000000a6'
   ) and kind = 'opening' and deleted_at is null),
  'las tres filas quedaron como saldo inicial, sin categoría ni pagador'
);
select pg_temp.opb_expect(
  (select count(*) = 0 from public.transaction_splits s
   join public.transactions t on t.id = s.transaction_id
   where t.account_id = '00000000-0000-4000-c024-0000000000a5'),
  'el reparto de Olla se borró'
);

-- 5. No se edita como ingreso, no se duplica y borrarlo sí baja el saldo.
select pg_temp.opb_expect_error(
  $q$select public.save_transaction(null, null, '00000000-0000-4000-c024-0000000000a1',
    'opening', null, 'X', null, 1, 'COP', current_date, null, null)$q$,
  '22023',
  'save_transaction no crea un saldo inicial'
);
select pg_temp.opb_expect_error(
  $q$select public.save_transaction(
    (select id from public.transactions
     where account_id = '00000000-0000-4000-c024-0000000000a1'
       and kind = 'opening' and deleted_at is null),
    null, '00000000-0000-4000-c024-0000000000a1',
    'income', 'salary', 'X', null, 1, 'COP', current_date, null, null)$q$,
  '22023',
  'save_transaction no convierte el saldo inicial en ingreso'
);
select pg_temp.opb_expect_error(
  $q$update public.transactions set amount_minor = 1
    where account_id = '00000000-0000-4000-c024-0000000000a1'
      and kind = 'opening' and deleted_at is null$q$,
  '22023',
  'no se cambia el monto de un saldo inicial'
);
select pg_temp.opb_expect_error(
  $q$insert into public.transactions (account_id, kind, description, amount_minor, currency, occurred_on)
    values ('00000000-0000-4000-c024-0000000000a1', 'opening', 'Otro', 1, 'COP', current_date)$q$,
  '23505',
  'una cuenta no tiene dos saldos iniciales vivos'
);

insert into public.transaction_splits (transaction_id, user_id, share_minor)
select id, '00000000-0000-4000-c024-00000000000a', 1
from public.transactions
where account_id = '00000000-0000-4000-c024-0000000000a2'
  and kind = 'opening' and deleted_at is null;
select pg_temp.opb_expect_error(
  'set constraints all immediate',
  '23514',
  'un saldo inicial no admite repartos'
);
delete from public.transaction_splits s
using public.transactions t
where s.transaction_id = t.id
  and t.account_id = '00000000-0000-4000-c024-0000000000a2'
  and t.kind = 'opening';
set constraints all deferred;

update public.transactions set deleted_at = now()
where account_id = '00000000-0000-4000-c024-0000000000a1'
  and kind = 'opening' and deleted_at is null;
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a1') = 40000,
  'borrar el saldo inicial lo saca de la cuenta y deja el ingreso y el gasto'
);

-- B ve la cuenta del hogar y no la personal de A.
select pg_temp.opb_login('00000000-0000-4000-c024-00000000000b');
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a1') is null,
  'B no ve el saldo personal de A'
);
select pg_temp.opb_expect(
  public.account_balance('00000000-0000-4000-c024-0000000000a4') = 7000,
  'B sí ve el saldo de la cuenta del hogar'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- created_by del hogar es ON DELETE RESTRICT: primero las filas, después el usuario.
delete from public.transactions
where owner_id in (
  '00000000-0000-4000-c024-00000000000a',
  '00000000-0000-4000-c024-00000000000b'
);
delete from public.accounts
where owner_id in (
  '00000000-0000-4000-c024-00000000000a',
  '00000000-0000-4000-c024-00000000000b'
);
delete from public.households
where created_by = '00000000-0000-4000-c024-00000000000a';
delete from auth.users
where id in (
  '00000000-0000-4000-c024-00000000000a',
  '00000000-0000-4000-c024-00000000000b'
);

select 'OK: el saldo inicial no entra en el mes y sí en la cuenta' as resultado;

rollback;
