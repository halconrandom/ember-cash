-- =============================================================================
-- Pago inicial de deuda (0029). set_debt_opening guarda principal − pagos
-- reales − saldo actual como un único pago is_opening: sin transacción, sin
-- saldar vencimientos, sin duplicarse al editar. Ayudas con prefijo dop_.
-- Todo en una transacción con ROLLBACK.
-- =============================================================================
begin;

create function pg_temp.dop_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.dop_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

-- Saldo con la misma fórmula de la app y de telegram_list_debts (0028).
create function pg_temp.dop_balance(d uuid) returns bigint language sql stable as $$
  select greatest(
    original_principal_minor - coalesce((
      select sum(principal_minor) from public.debt_payments where debt_id = d
    ), 0),
    0
  ) from public.debts where id = d;
$$;

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c029-00000000000a', 'authenticated', 'authenticated', 'dop-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c029-00000000000b', 'authenticated', 'authenticated', 'dop-b@test.local', '{}', '{}');

select pg_temp.dop_login('00000000-0000-4000-c029-00000000000a');
insert into public.accounts (id, name, type, currency) values
  ('00000000-0000-4000-c029-0000000000a1', 'Ahorros', 'savings', 'COP');
insert into public.debts (id, name, currency, original_principal_minor, apr_bps, apr_kind, min_payment_minor, due_day)
values ('00000000-0000-4000-c029-0000000000d1', 'Tugo', 'COP', 5000000, 1770, 'EA', 196082, 15);
insert into public.recurring_items (id, kind, name, amount_minor, currency, account_id, frequency, anchor_date, debt_id)
values ('00000000-0000-4000-c029-0000000000e1', 'debt_payment', 'Tugo', 196082, 'COP',
  '00000000-0000-4000-c029-0000000000a1', 'monthly', current_date,
  '00000000-0000-4000-c029-0000000000d1');
insert into public.recurring_occurrences (id, recurring_item_id, due_on)
values ('00000000-0000-4000-c029-0000000000f1', '00000000-0000-4000-c029-0000000000e1', current_date);

-- 1. Sin saldo actual: no hay pago inicial (comportamiento de siempre).
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 5000000, null) = 'ok',
  'sin saldo actual responde ok'
);
select pg_temp.dop_expect(
  not exists (select 1 from public.debt_payments where debt_id = '00000000-0000-4000-c029-0000000000d1'),
  'sin saldo actual no crea pagos'
);

-- 2. Saldo actual 2.849.990: pago inicial de 2.150.010, capital puro.
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 5000000, 2849990) = 'ok',
  'con saldo actual responde ok'
);
select pg_temp.dop_expect(
  (select count(*) = 1 and sum(principal_minor) = 2150010 and sum(amount_minor) = 2150010
     and sum(interest_minor) = 0 and bool_and(is_opening) and bool_and(transaction_id is null)
   from public.debt_payments where debt_id = '00000000-0000-4000-c029-0000000000d1'),
  'el pago inicial es la diferencia, sin interés ni transacción'
);
select pg_temp.dop_expect(
  pg_temp.dop_balance('00000000-0000-4000-c029-0000000000d1') = 2849990,
  'el saldo queda en el saldo actual'
);
select pg_temp.dop_expect(
  not exists (select 1 from public.transactions),
  'el pago inicial no crea transacciones (ni gasto ni balance)'
);
select pg_temp.dop_expect(
  public.account_balance('00000000-0000-4000-c029-0000000000a1') = 0,
  'la cuenta no se mueve'
);
select pg_temp.dop_expect(
  (select status = 'scheduled' and transaction_id is null
   from public.recurring_occurrences where id = '00000000-0000-4000-c029-0000000000f1'),
  'el pago inicial no salda vencimientos'
);

-- 3. Saldo mayor que el principal: rechazado, sin cambios.
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 5000000, 5000001) = 'balance_too_high',
  'saldo mayor que el principal se rechaza'
);
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 5000000, -1) = 'balance_too_high',
  'saldo negativo se rechaza'
);
select pg_temp.dop_expect(
  pg_temp.dop_balance('00000000-0000-4000-c029-0000000000d1') = 2849990,
  'un rechazo no cambia el saldo'
);

-- 4. Un pago real posterior; editar varias veces no duplica ni lo toca.
insert into public.debt_payments (debt_id, paid_on, amount_minor, interest_minor, principal_minor)
values ('00000000-0000-4000-c029-0000000000d1', current_date, 300000, 50000, 250000);
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 5000000, 2000000) = 'ok',
  'editar el saldo actual responde ok'
);
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 6000000, 2000000) = 'ok',
  'editar otra vez (principal mayor) responde ok'
);
select pg_temp.dop_expect(
  (select count(*) from public.debt_payments
   where debt_id = '00000000-0000-4000-c029-0000000000d1' and is_opening) = 1,
  'editar varias veces deja un solo pago inicial'
);
select pg_temp.dop_expect(
  (select principal_minor from public.debt_payments
   where debt_id = '00000000-0000-4000-c029-0000000000d1' and is_opening) = 3750000,
  'el pago inicial = principal − pagos reales − saldo'
);
select pg_temp.dop_expect(
  (select count(*) = 1 and sum(principal_minor) = 250000 from public.debt_payments
   where debt_id = '00000000-0000-4000-c029-0000000000d1' and not is_opening),
  'el pago real no cambia'
);
select pg_temp.dop_expect(
  pg_temp.dop_balance('00000000-0000-4000-c029-0000000000d1') = 2000000,
  'el saldo es el saldo actual escrito'
);
-- Saldo máximo al editar = principal − pagos reales.
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 6000000, 5750001) = 'balance_too_high',
  'al editar, el saldo no puede pasar de principal − pagos reales'
);

-- 5. Principal menor que los pagos reales: rechazado (función y trigger).
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 200000, null) = 'principal_below_paid',
  'principal menor que lo pagado se rechaza'
);
do $$
begin
  begin
    update public.debts set original_principal_minor = 1000000
    where id = '00000000-0000-4000-c029-0000000000d1';
  exception when check_violation then
    return;
  end;
  raise exception 'FALLO: bajar el principal por debajo de lo pagado debería fallar';
end $$;

-- 6. Quitar el saldo actual borra solo el pago inicial.
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 6000000, null) = 'ok',
  'quitar el saldo actual responde ok'
);
select pg_temp.dop_expect(
  (select count(*) = 1 and bool_and(not is_opening) from public.debt_payments
   where debt_id = '00000000-0000-4000-c029-0000000000d1'),
  'queda solo el pago real'
);

-- 7. Forma: un pago inicial no lleva transacción ni interés.
do $$
begin
  begin
    insert into public.debt_payments (debt_id, paid_on, amount_minor, interest_minor, principal_minor, is_opening)
    values ('00000000-0000-4000-c029-0000000000d1', current_date, 100, 10, 90, true);
  exception when check_violation then
    return;
  end;
  raise exception 'FALLO: un pago inicial con interés debería fallar';
end $$;

-- 8. Aislamiento: B no ve ni cambia la deuda de A.
select pg_temp.dop_login('00000000-0000-4000-c029-00000000000b');
select pg_temp.dop_expect(
  public.set_debt_opening('00000000-0000-4000-c029-0000000000d1', 6000000, 1000) = 'not_found',
  'B no puede fijar el pago inicial de la deuda de A'
);

-- Limpieza (pnpm test:db:fresh corre todos los archivos en una sola transacción).
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
delete from auth.users
where id in ('00000000-0000-4000-c029-00000000000a', '00000000-0000-4000-c029-00000000000b');

select 'OK: el pago inicial de deuda es único, sin transacción y sin vencimientos' as resultado;

rollback;
