-- =============================================================================
-- Tests de 0008_post_occurrence.sql. A y B en el hogar H; C es ajeno.
-- Todo en una transacción con ROLLBACK.
-- =============================================================================
begin;

create function pg_temp.po_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.po_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

create function pg_temp.po_expect_error(stmt text, expected text, label text) returns void language plpgsql as $$
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
  ('00000000-0000-4000-e100-00000000000a', 'authenticated', 'authenticated', 'po-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-e100-00000000000b', 'authenticated', 'authenticated', 'po-b@test.local', '{}', '{}'),
  ('00000000-0000-4000-e100-00000000000c', 'authenticated', 'authenticated', 'po-c@test.local', '{}', '{}');

select pg_temp.po_login('00000000-0000-4000-e100-00000000000a');
select set_config('test.po_h', public.create_household('H')::text, true);
insert into public.household_invites (household_id, token_hash)
values (current_setting('test.po_h')::uuid, encode(sha256(convert_to('po-token', 'UTF8')), 'hex'));
insert into public.accounts (id, name, type, currency) values
  ('72000000-0000-4000-8000-000000000001', 'Personal A', 'checking', 'COP');
insert into public.accounts (id, household_id, name, type, currency)
values ('72000000-0000-4000-8000-000000000003', current_setting('test.po_h')::uuid, 'Casa', 'checking', 'COP');

select pg_temp.po_login('00000000-0000-4000-e100-00000000000b');
select public.accept_invite('po-token');

-- 1. Suscripción personal: crea la transacción, la vincula y marca pagado.
select pg_temp.po_login('00000000-0000-4000-e100-00000000000a');
insert into public.recurring_items (id, kind, name, category_key, amount_minor, currency, account_id,
  frequency, anchor_date, auto_post)
values ('73000000-0000-4000-8000-000000000001', 'subscription', 'Nube', 'subscriptions', 11960, 'COP',
  '72000000-0000-4000-8000-000000000001', 'monthly', current_date, true);
insert into public.recurring_occurrences (id, recurring_item_id, due_on)
values ('74000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', current_date);

select set_config('test.po_tx', public.post_occurrence(
  '74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001')::text, true);
set constraints all immediate;
set constraints all deferred;
select pg_temp.po_expect((select status = 'paid' and transaction_id = current_setting('test.po_tx')::uuid
  from public.recurring_occurrences where id = '74000000-0000-4000-8000-000000000001'),
  'el vencimiento queda pagado y apunta a la transacción');
select pg_temp.po_expect((select kind = 'expense' and category_key = 'subscriptions'
  and recurring_item_id = '73000000-0000-4000-8000-000000000001' and amount_minor = 11960
  from public.transactions where id = current_setting('test.po_tx')::uuid),
  'la transacción es un gasto de suscripción vinculado');
select pg_temp.po_expect((select count(*) = 0 from public.transaction_splits
  where transaction_id = current_setting('test.po_tx')::uuid), 'la personal no lleva repartos');

-- 2. Llamarla otra vez devuelve la misma transacción.
select pg_temp.po_expect(public.post_occurrence(
  '74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001')
  = current_setting('test.po_tx')::uuid, 'es idempotente');
select pg_temp.po_expect((select count(*) = 1 from public.transactions
  where recurring_item_id = '73000000-0000-4000-8000-000000000001'), 'no duplica la transacción');

-- 3. Sin cuenta, falla (el vencimiento existe; la cuenta no).
insert into public.recurring_occurrences (id, recurring_item_id, due_on)
values ('74000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000001', current_date + 30);
select pg_temp.po_expect_error($q$select public.post_occurrence('74000000-0000-4000-8000-000000000002', null)$q$,
  'P0001', 'sin cuenta no registra');

-- 4. Compartida: los repartos suman.
insert into public.recurring_items (id, household_id, kind, name, category_key, amount_minor, currency,
  account_id, frequency, anchor_date)
values ('73000000-0000-4000-8000-000000000002', current_setting('test.po_h')::uuid, 'bill', 'Arriendo',
  'housing', 1001, 'COP', '72000000-0000-4000-8000-000000000003', 'monthly', current_date);
insert into public.recurring_occurrences (id, recurring_item_id, due_on)
values ('74000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000002', current_date);
select public.post_occurrence('74000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003');
set constraints all immediate;
set constraints all deferred;
select pg_temp.po_expect((select array_agg(share_minor order by share_minor desc) = array[501, 500]::bigint[]
  from public.transaction_splits s
  join public.recurring_occurrences o on o.transaction_id = s.transaction_id
  where o.id = '74000000-0000-4000-8000-000000000003'), 'reparto equitativo 501 + 500');

-- 5. Pago de deuda: deja el pago con interés 0 y capital = monto.
insert into public.debts (id, name, currency, original_principal_minor, apr_bps, apr_kind, min_payment_minor, due_day)
values ('75000000-0000-4000-8000-000000000001', 'Tarjeta', 'COP', 1000000, 0, 'nominal', 50000, 15);
insert into public.recurring_items (id, kind, name, amount_minor, currency, account_id, frequency, anchor_date, debt_id)
values ('73000000-0000-4000-8000-000000000004', 'debt_payment', 'Tarjeta', 50000, 'COP',
  '72000000-0000-4000-8000-000000000001', 'monthly', current_date, '75000000-0000-4000-8000-000000000001');
insert into public.recurring_occurrences (id, recurring_item_id, due_on)
values ('74000000-0000-4000-8000-000000000004', '73000000-0000-4000-8000-000000000004', current_date);
select public.post_occurrence('74000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000001');
set constraints all immediate;
set constraints all deferred;
select pg_temp.po_expect((select interest_minor = 0 and principal_minor = 50000 and amount_minor = 50000
  from public.debt_payments where debt_id = '75000000-0000-4000-8000-000000000001'),
  'el pago de deuda va entero a capital');

-- 6. C no registra el vencimiento de A.
select pg_temp.po_login('00000000-0000-4000-e100-00000000000c');
select pg_temp.po_expect_error($q$select public.post_occurrence(
  '74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001')$q$,
  'P0002', 'C no registra lo de A');

-- 7. La columna subtitle existe y acepta el texto de la tarjeta.
select pg_temp.po_login('00000000-0000-4000-e100-00000000000a');
update public.recurring_items set subtitle = '200 GB' where id = '73000000-0000-4000-8000-000000000001';
select pg_temp.po_expect((select subtitle = '200 GB' from public.recurring_items
  where id = '73000000-0000-4000-8000-000000000001'), 'guarda el subtítulo');

select set_config('role', 'postgres', true);
select 'OK: todas las pruebas de post_occurrence pasaron' as resultado;

rollback;
