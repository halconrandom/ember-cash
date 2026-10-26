-- =============================================================================
-- Deudas de tarjeta (0031). Una deuda por tarjeta personal del mismo dueño;
-- un pago de la deuda enlazada tiene que ser una transferencia a la tarjeta
-- (baja la deuda de la cuenta y no es gasto); /abono no la lista.
-- Caso: Banco de Bogotá, cupo 4.700.000, saldo 4.167.943. Prefijo cdb_.
-- =============================================================================
begin;

create function pg_temp.cdb_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.cdb_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function pg_temp.cdb_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

create function pg_temp.cdb_fails(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

-- Gastos del mes (dashboard_totals, security invoker: llamar como el dueño).
create function pg_temp.cdb_expenses() returns bigint language sql stable as $$
  select coalesce((
    select sum(d.total_minor)
    from public.dashboard_totals(
      null,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
      'COP'
    ) d
    where d.kind = 'expense'
  ), 0)::bigint;
$$;

select pg_temp.cdb_postgres();
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c031-00000000000a', 'authenticated', 'authenticated', 'cdb-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c031-00000000000b', 'authenticated', 'authenticated', 'cdb-b@test.local', '{}', '{}');
insert into public.telegram_links (user_id, telegram_user_id, chat_id)
values ('00000000-0000-4000-c031-00000000000a', 73101, 73101);

select pg_temp.cdb_login('00000000-0000-4000-c031-00000000000a');
insert into public.accounts (id, name, type, currency, credit_limit_minor, payment_day) values
  ('00000000-0000-4000-c031-0000000000c1', 'Tarjeta de Credito Clasica', 'credit_card', 'COP', 4700000, 21),
  ('00000000-0000-4000-c031-0000000000a1', 'Ahorros', 'savings', 'COP', null, null);
insert into public.transactions (account_id, kind, description, amount_minor, currency, occurred_on)
values ('00000000-0000-4000-c031-0000000000c1', 'opening', 'Clasica', 4167943, 'COP', current_date);

-- La deuda enlazada (como syncCardDebt): tasa 25 % EA, mínimo 250.000.
insert into public.debts (id, name, currency, original_principal_minor, apr_bps, apr_kind,
  min_payment_minor, due_day, account_id)
values ('00000000-0000-4000-c031-0000000000d1', 'Tarjeta de Credito Clasica', 'COP', 4167943, 2500,
  'EA', 250000, 21, '00000000-0000-4000-c031-0000000000c1');

-- 1. Una sola deuda por tarjeta.
select pg_temp.cdb_fails(
  $$insert into public.debts (name, currency, original_principal_minor, apr_bps, apr_kind, account_id)
    values ('Otra', 'COP', 1, 0, 'EA', '00000000-0000-4000-c031-0000000000c1')$$,
  'una segunda deuda para la misma tarjeta'
);
-- Solo tarjetas.
select pg_temp.cdb_fails(
  $$insert into public.debts (name, currency, original_principal_minor, apr_bps, apr_kind, account_id)
    values ('Ahorro', 'COP', 1, 0, 'EA', '00000000-0000-4000-c031-0000000000a1')$$,
  'enlazar una cuenta que no es tarjeta'
);

-- 2. Un pago sin transferencia a la tarjeta se rechaza (p. ej. un gasto).
insert into public.transactions (id, account_id, kind, category_key, description, amount_minor,
  currency, occurred_on, paid_by, debt_id)
values ('00000000-0000-4000-c031-0000000000e1', '00000000-0000-4000-c031-0000000000a1', 'expense',
  'other', 'Clasica', 100000, 'COP', current_date, '00000000-0000-4000-c031-00000000000a',
  '00000000-0000-4000-c031-0000000000d1');
select pg_temp.cdb_fails(
  $$insert into public.debt_payments (debt_id, paid_on, amount_minor, principal_minor, transaction_id)
    values ('00000000-0000-4000-c031-0000000000d1', current_date, 100000, 100000,
      '00000000-0000-4000-c031-0000000000e1')$$,
  'pago de tarjeta con un gasto'
);
select pg_temp.cdb_fails(
  $$insert into public.debt_payments (debt_id, paid_on, amount_minor, principal_minor)
    values ('00000000-0000-4000-c031-0000000000d1', current_date, 100000, 100000)$$,
  'pago de tarjeta sin transacción'
);
update public.transactions set deleted_at = now() where id = '00000000-0000-4000-c031-0000000000e1';

-- 3. Pago con transferencia (como recordPayment): baja la tarjeta y no es gasto.
insert into public.transactions (id, account_id, transfer_to_account_id, kind, description,
  amount_minor, currency, occurred_on, debt_id)
values ('00000000-0000-4000-c031-0000000000e2', '00000000-0000-4000-c031-0000000000a1',
  '00000000-0000-4000-c031-0000000000c1', 'transfer', 'Clasica', 500000, 'COP', current_date,
  '00000000-0000-4000-c031-0000000000d1');
insert into public.debt_payments (debt_id, paid_on, amount_minor, principal_minor, transaction_id)
values ('00000000-0000-4000-c031-0000000000d1', current_date, 500000, 500000,
  '00000000-0000-4000-c031-0000000000e2');
select pg_temp.cdb_expect(
  public.account_balance('00000000-0000-4000-c031-0000000000c1') = 3667943,
  'la deuda de la tarjeta baja con el pago'
);
-- Saldo de la deuda (debtBalances) = deuda de la tarjeta; original = saldo + pagado.
select pg_temp.cdb_expect(
  public.account_balance('00000000-0000-4000-c031-0000000000c1')
    + (select sum(principal_minor) from public.debt_payments
       where debt_id = '00000000-0000-4000-c031-0000000000d1') = 4167943,
  'saldo + pagado = saldo al enlazar'
);
select pg_temp.cdb_expect(pg_temp.cdb_expenses() = 0, 'ni el saldo ni el pago cuentan como gasto');

-- Resincronizar varias veces (original = saldo + pagado) no rompe nada.
update public.debts set original_principal_minor = 4167943
where id = '00000000-0000-4000-c031-0000000000d1';
update public.debts set original_principal_minor = 4167943
where id = '00000000-0000-4000-c031-0000000000d1';
select pg_temp.cdb_expect(
  (select count(*) from public.debts where account_id = '00000000-0000-4000-c031-0000000000c1') = 1,
  'sigue una sola deuda por tarjeta'
);

-- Borrar la transferencia sigue funcionando (la FK deja el pago sin transacción).
delete from public.transactions where id = '00000000-0000-4000-c031-0000000000e2';
select pg_temp.cdb_expect(
  public.account_balance('00000000-0000-4000-c031-0000000000c1') = 4167943,
  'borrar la transferencia devuelve la deuda a la tarjeta'
);

-- 4. /abono no lista la deuda de la tarjeta.
select pg_temp.cdb_postgres();
select pg_temp.cdb_expect(
  (public.telegram_list_debts(73101) ->> 'items') = '[]',
  '/abono deja fuera la deuda de la tarjeta'
);

-- 5. Aislamiento: B no ve la deuda ni enlaza la tarjeta de A.
select pg_temp.cdb_login('00000000-0000-4000-c031-00000000000b');
select pg_temp.cdb_expect(
  not exists (select 1 from public.debts where id = '00000000-0000-4000-c031-0000000000d1'),
  'B no ve la deuda de tarjeta de A'
);
select pg_temp.cdb_fails(
  $$insert into public.debts (name, currency, original_principal_minor, apr_bps, apr_kind, account_id)
    values ('Robada', 'COP', 1, 0, 'EA', '00000000-0000-4000-c031-0000000000c1')$$,
  'B enlaza la tarjeta de A'
);

select pg_temp.cdb_postgres();
delete from public.telegram_links where user_id = '00000000-0000-4000-c031-00000000000a';
delete from auth.users
where id in ('00000000-0000-4000-c031-00000000000a', '00000000-0000-4000-c031-00000000000b');

select 'OK: la deuda de la tarjeta es única, se paga con transferencia y no se cuenta dos veces' as resultado;

rollback;
