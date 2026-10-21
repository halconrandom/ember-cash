-- =============================================================================
-- Fase T4: /deuda, /abono, /ahorro (0028). Mismo patrón que telegram.sql:
-- todo en una transacción con ROLLBACK, ayudas con prefijo tdg_.
-- =============================================================================
begin;

create function pg_temp.tdg_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.tdg_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.tdg_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.tdg_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

select pg_temp.tdg_postgres();

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c028-00000000000a', 'authenticated', 'authenticated', 'tdg-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c028-00000000000b', 'authenticated', 'authenticated', 'tdg-b@test.local', '{}', '{}');

-- A y B, cada uno vinculado a su propio telegram_user_id.
select pg_temp.tdg_login('00000000-0000-4000-c028-00000000000a');
select set_config('test.tdg_code_a', public.create_telegram_link_code(), true);
select pg_temp.tdg_service();
select public.telegram_link_with_code(71001, 71001, current_setting('test.tdg_code_a'));

select pg_temp.tdg_login('00000000-0000-4000-c028-00000000000b');
select set_config('test.tdg_code_b', public.create_telegram_link_code(), true);
select pg_temp.tdg_service();
select public.telegram_link_with_code(72002, 72002, current_setting('test.tdg_code_b'));

select pg_temp.tdg_login('00000000-0000-4000-c028-00000000000a');
insert into public.accounts (id, name, type, currency) values
  ('00000000-0000-4000-c028-0000000000a1', 'Ahorros A', 'savings', 'COP');
with ins as (
  insert into public.goals (owner_id, name, target_minor, currency)
  values ('00000000-0000-4000-c028-00000000000a', 'Viaje', 500000, 'USD')
  returning id
)
select set_config('test.tdg_goal', (select id::text from ins), true);

-- -----------------------------------------------------------------------------
-- /deuda: crea la deuda tal como el formulario (sin plan de pago).
-- -----------------------------------------------------------------------------
select pg_temp.tdg_service();
select set_config(
  'test.tdg_debt_draft',
  public.telegram_put_debt_draft(71001, 71001, 'Juan', 500000, 'COP')::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_debt_draft')::jsonb ->> 'name') = 'Juan',
  'el borrador de deuda guarda el nombre'
);
select set_config(
  'test.tdg_debt_commit',
  public.telegram_commit_draft(
    71001, (current_setting('test.tdg_debt_draft')::jsonb ->> 'draft_id')::uuid
  )::text,
  true
);
select set_config(
  'test.tdg_debt', current_setting('test.tdg_debt_commit')::jsonb ->> 'created_id', true
);
select pg_temp.tdg_postgres();
select pg_temp.tdg_expect(
  (
    select owner_id = '00000000-0000-4000-c028-00000000000a'
      and currency = 'COP' and original_principal_minor = 500000
      and apr_bps = 0 and min_payment_minor = 0 and due_day is null
    from public.debts where id = current_setting('test.tdg_debt')::uuid
  ),
  'la deuda del bot queda sin plan de pago (apr 0, mínimo 0, sin día)'
);

-- -----------------------------------------------------------------------------
-- Aislamiento: B no ve ni abona la deuda de A, ni la lista.
-- -----------------------------------------------------------------------------
select pg_temp.tdg_service();
select pg_temp.tdg_expect(
  (public.telegram_list_debts(72002) ->> 'items') = '[]',
  'B no ve la deuda de A en /abono'
);
select pg_temp.tdg_expect(
  (
    public.telegram_begin_debt_payment(72002, 72002, current_setting('test.tdg_debt')::uuid) ->> 'error'
  ) = 'not_found',
  'B no puede elegir la deuda de A para abonar'
);

-- -----------------------------------------------------------------------------
-- /abono: no deja abonar más que el saldo pendiente.
-- -----------------------------------------------------------------------------
select pg_temp.tdg_expect(
  jsonb_array_length((public.telegram_list_debts(71001) ->> 'items')::jsonb) = 1,
  'A ve su deuda en /abono'
);
select set_config(
  'test.tdg_pay_draft',
  public.telegram_begin_debt_payment(71001, 71001, current_setting('test.tdg_debt')::uuid)::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_pay_draft')::jsonb ->> 'balance_minor') = '500000',
  'el saldo inicial es el principal completo'
);
select set_config(
  'test.tdg_pay_id', current_setting('test.tdg_pay_draft')::jsonb ->> 'draft_id', true
);
select pg_temp.tdg_expect(
  (
    public.telegram_answer_debt_payment(71001, current_setting('test.tdg_pay_id')::uuid, 600000)
      ->> 'error'
  ) = 'exceeds_balance',
  'abonar más que el saldo pendiente no avanza'
);

-- El abono correcto sí avanza, y confirmar escribe el pago (sin cuenta en COP
-- disponible más que la de A: se vincula la transacción).
select set_config(
  'test.tdg_pay_answer',
  public.telegram_answer_debt_payment(71001, current_setting('test.tdg_pay_id')::uuid, 200000)::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_pay_answer')::jsonb ->> 'balance_after') = '300000',
  'el saldo después del abono se calcula bien'
);
select set_config(
  'test.tdg_pay_commit',
  public.telegram_commit_draft(71001, current_setting('test.tdg_pay_id')::uuid)::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_pay_commit')::jsonb ->> 'ok')::boolean,
  'confirmar el abono registra el pago'
);
select pg_temp.tdg_postgres();
select pg_temp.tdg_expect(
  (
    select count(*) = 1 and bool_and(principal_minor = 200000 and interest_minor = 0)
    from public.debt_payments where debt_id = current_setting('test.tdg_debt')::uuid
  ),
  'el abono queda como pago de capital puro (sin interés)'
);
select pg_temp.tdg_expect(
  (
    select greatest(
      original_principal_minor - coalesce((
        select sum(principal_minor) from public.debt_payments where debt_id = debts.id
      ), 0), 0
    ) = 300000
    from public.debts where id = current_setting('test.tdg_debt')::uuid
  ),
  'el saldo de la deuda queda en 300000 tras el abono'
);

-- Otro abono por el resto exacto del saldo: no debe dejar pasar más de 300000.
select pg_temp.tdg_service();
select set_config(
  'test.tdg_pay_draft2',
  public.telegram_begin_debt_payment(71001, 71001, current_setting('test.tdg_debt')::uuid)::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_pay_draft2')::jsonb ->> 'balance_minor') = '300000',
  'el segundo borrador ve el saldo ya reducido'
);
select pg_temp.tdg_expect(
  (
    public.telegram_answer_debt_payment(
      71001,
      (current_setting('test.tdg_pay_draft2')::jsonb ->> 'draft_id')::uuid,
      300001
    ) ->> 'error'
  ) = 'exceeds_balance',
  'un solo peso más que el saldo restante sigue rechazándose'
);
select public.telegram_cancel_draft(
  71001, (current_setting('test.tdg_pay_draft2')::jsonb ->> 'draft_id')::uuid
);

-- -----------------------------------------------------------------------------
-- /ahorro: aislamiento y conversión de moneda con "≈".
-- -----------------------------------------------------------------------------
select pg_temp.tdg_expect(
  (public.telegram_list_goals(72002) ->> 'items') = '[]',
  'B no ve la meta de A en /ahorro'
);
select pg_temp.tdg_expect(
  (
    public.telegram_begin_goal_contribution(72002, 72002, current_setting('test.tdg_goal')::uuid)
      ->> 'error'
  ) = 'not_found',
  'B no puede elegir la meta de A para aportar'
);

select pg_temp.tdg_expect(
  jsonb_array_length((public.telegram_list_goals(71001) ->> 'items')::jsonb) = 1,
  'A ve su meta en /ahorro'
);
select set_config(
  'test.tdg_goal_draft',
  public.telegram_begin_goal_contribution(71001, 71001, current_setting('test.tdg_goal')::uuid)::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_goal_draft')::jsonb ->> 'currency') = 'USD',
  'el borrador de aporte queda en la moneda de la meta'
);
select set_config(
  'test.tdg_goal_draft_id', current_setting('test.tdg_goal_draft')::jsonb ->> 'draft_id', true
);

-- Aportar en la MISMA moneda de la meta: sin "entrado" que mostrar.
select set_config(
  'test.tdg_goal_answer',
  public.telegram_answer_goal_contribution(
    71001, current_setting('test.tdg_goal_draft_id')::uuid, 5000, null, null
  )::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_goal_answer')::jsonb ->> 'entered_amount_minor') is null,
  'sin conversión, no hay monto "entrado" en la respuesta'
);
select set_config(
  'test.tdg_goal_commit',
  public.telegram_commit_draft(71001, current_setting('test.tdg_goal_draft_id')::uuid)::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_goal_commit')::jsonb ->> 'ok')::boolean,
  'confirmar el aporte registra la fila'
);
select pg_temp.tdg_postgres();
select pg_temp.tdg_expect(
  (
    select count(*) = 1 and bool_and(amount_minor = 5000 and currency = 'USD'
      and user_id = '00000000-0000-4000-c028-00000000000a')
    from public.goal_contributions where goal_id = current_setting('test.tdg_goal')::uuid
  ),
  'el aporte queda en dólares, a nombre de A'
);

-- Aportar en OTRA moneda: telegram_answer_goal_contribution recibe ya el
-- monto convertido (lo convierte el gateway de TS con lib/money/convert.ts)
-- más lo que escribió la persona, y lo deja en el payload para el "≈".
select pg_temp.tdg_service();
select set_config(
  'test.tdg_goal_draft2',
  public.telegram_begin_goal_contribution(71001, 71001, current_setting('test.tdg_goal')::uuid)::text,
  true
);
select set_config(
  'test.tdg_goal_answer2',
  public.telegram_answer_goal_contribution(
    71001, (current_setting('test.tdg_goal_draft2')::jsonb ->> 'draft_id')::uuid,
    40, 160000, 'COP'
  )::text,
  true
);
select pg_temp.tdg_expect(
  (current_setting('test.tdg_goal_answer2')::jsonb ->> 'entered_amount_minor') = '160000'
    and (current_setting('test.tdg_goal_answer2')::jsonb ->> 'entered_currency') = 'COP'
    and (current_setting('test.tdg_goal_answer2')::jsonb ->> 'amount_minor') = '40',
  'con otra moneda, la respuesta lleva el monto convertido y lo que se escribió'
);
select public.telegram_cancel_draft(
  71001, (current_setting('test.tdg_goal_draft2')::jsonb ->> 'draft_id')::uuid
);

-- -----------------------------------------------------------------------------
-- El paso pendiente vence a los 15 minutos: después, ni se ve ni se contesta.
-- -----------------------------------------------------------------------------
select set_config(
  'test.tdg_goal_draft3',
  public.telegram_begin_goal_contribution(71001, 71001, current_setting('test.tdg_goal')::uuid)::text,
  true
);
select pg_temp.tdg_expect(
  (public.telegram_pending_step(71001) ->> 'pending')::boolean,
  'justo después de elegir la meta, hay un paso pendiente'
);
select pg_temp.tdg_postgres();
update public.telegram_drafts
set expires_at = pg_catalog.now() - interval '1 minute'
where id = (current_setting('test.tdg_goal_draft3')::jsonb ->> 'draft_id')::uuid;
select pg_temp.tdg_service();
select pg_temp.tdg_expect(
  (public.telegram_pending_step(71001) ->> 'pending') = 'false',
  'vencido el borrador, ya no aparece como paso pendiente'
);
select pg_temp.tdg_expect(
  (
    public.telegram_answer_goal_contribution(
      71001, (current_setting('test.tdg_goal_draft3')::jsonb ->> 'draft_id')::uuid, 10, null, null
    ) ->> 'error'
  ) = 'expired',
  'contestar un paso ya vencido no se acepta'
);

-- -----------------------------------------------------------------------------
-- /deshacer: la deuda recién creada (sin pagos) se borra entera.
-- -----------------------------------------------------------------------------
select pg_temp.tdg_service();
select set_config(
  'test.tdg_debt2_draft',
  public.telegram_put_debt_draft(71001, 71001, 'Pepito', 10000, 'COP')::text,
  true
);
select set_config(
  'test.tdg_debt2_commit',
  public.telegram_commit_draft(71001, (current_setting('test.tdg_debt2_draft')::jsonb ->> 'draft_id')::uuid)::text,
  true
);
select pg_temp.tdg_expect(
  (public.telegram_undo(71001) ->> 'ok')::boolean,
  '/deshacer borra la deuda recién creada'
);
select pg_temp.tdg_postgres();
select pg_temp.tdg_expect(
  not exists (
    select 1 from public.debts
    where id = (current_setting('test.tdg_debt2_commit')::jsonb ->> 'created_id')::uuid
  ),
  'la deuda deshecha ya no existe'
);

-- Permisos: security definer con search_path fijo, sin user_id del llamador.
select pg_temp.tdg_expect(
  (
    select count(*) = 9
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
      and p.proname in (
        'telegram_list_debts', 'telegram_put_debt_draft', 'telegram_create_debt',
        'telegram_begin_debt_payment', 'telegram_answer_debt_payment',
        'telegram_list_goals', 'telegram_begin_goal_contribution',
        'telegram_answer_goal_contribution', 'telegram_pending_step'
      )
  ),
  'las nueve funciones de T4 son security definer con search_path fijo'
);
select pg_temp.tdg_expect(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proargnames, array[]::text[])) as arg(name)
    where n.nspname = 'public'
      and p.proname in (
        'telegram_list_debts', 'telegram_put_debt_draft', 'telegram_begin_debt_payment',
        'telegram_answer_debt_payment', 'telegram_list_goals', 'telegram_begin_goal_contribution',
        'telegram_answer_goal_contribution', 'telegram_pending_step'
      )
      and arg.name in ('user_id', 'p_user_id')
  ),
  'ninguna de estas funciones recibe user_id (telegram_create_debt recibe p_owner, ya resuelto)'
);
select pg_temp.tdg_expect(
  not has_function_privilege('authenticated', 'public.telegram_list_debts(bigint)', 'execute')
    and not has_function_privilege('authenticated', 'public.telegram_answer_debt_payment(bigint, uuid, bigint)', 'execute')
    and not has_function_privilege('authenticated', 'public.telegram_list_goals(bigint)', 'execute')
    and not has_function_privilege(
      'authenticated',
      'public.telegram_answer_goal_contribution(bigint, uuid, bigint, bigint, text)',
      'execute'
    ),
  'authenticated no ejecuta ninguna función de T4 directamente'
);

select pg_temp.tdg_postgres();
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

delete from public.goal_contributions
where goal_id = current_setting('test.tdg_goal')::uuid;
delete from public.goals where id = current_setting('test.tdg_goal')::uuid;
delete from public.debt_payments
where debt_id = current_setting('test.tdg_debt')::uuid;
delete from public.transaction_splits
where transaction_id in (
  select id from public.transactions
  where owner_id in ('00000000-0000-4000-c028-00000000000a', '00000000-0000-4000-c028-00000000000b')
);
delete from public.transactions
where owner_id in ('00000000-0000-4000-c028-00000000000a', '00000000-0000-4000-c028-00000000000b');
delete from public.debts where id = current_setting('test.tdg_debt')::uuid;
delete from public.accounts where id = '00000000-0000-4000-c028-0000000000a1';
delete from public.telegram_drafts
where telegram_user_id in (71001, 72002);
delete from public.rate_limits where telegram_user_id in (71001, 72002);
delete from auth.users
where id in ('00000000-0000-4000-c028-00000000000a', '00000000-0000-4000-c028-00000000000b');

select 'OK: /deuda, /abono y /ahorro respetan el saldo, el aislamiento y la ventana de 15 minutos' as resultado;

rollback;
