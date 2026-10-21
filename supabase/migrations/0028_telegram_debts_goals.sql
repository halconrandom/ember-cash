-- =============================================================================
-- Fase T4: comandos del bot de Telegram (2/2). /deuda crea una deuda como el
-- formulario (misma validación, lib/debts/schema.ts), siempre "debo": el
-- formulario de Deudas no modela "me deben" todavía, así que esa dirección
-- se reconoce en el texto pero no crea nada (fase futura). /abono y
-- /ahorro reutilizan exactamente la lógica de recordPayment y
-- addContribution (app/(app)/(shell)/debts/actions.ts,
-- app/(app)/(shell)/savings/actions.ts), traducida a SQL porque el webhook
-- no tiene sesión.
--
-- Dos pasos para /abono y /ahorro (fuerza_reply + 15 min, igual que
-- cualquier otro borrador): elegir la deuda o meta (telegram_begin_*) deja
-- un borrador con amount_minor en null -- por eso esa columna y
-- category_key pasan a ser opcionales -- y telegram_answer_* completa el
-- monto una vez que la persona contesta. telegram_commit_draft solo
-- escribe al confirmar, como todo lo demás del bot.
-- =============================================================================

alter table public.telegram_drafts
  alter column amount_minor drop not null,
  alter column category_key drop not null;

-- -----------------------------------------------------------------------------
-- telegram_list_debts: hasta 5 deudas abiertas (ni borradas ni cerradas),
-- con el saldo igual que lib/debts/queries.ts (original − capital pagado,
-- nunca negativo). Las deudas son siempre personales.
-- -----------------------------------------------------------------------------
create function public.telegram_list_debts(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_items jsonb;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  with open as (
    select
      d.id, d.name, d.currency,
      greatest(
        d.original_principal_minor - coalesce((
          select sum(p.principal_minor) from public.debt_payments p where p.debt_id = d.id
        ), 0),
        0
      ) as balance_minor
    from public.debts d
    where d.owner_id = v_uid and d.deleted_at is null and d.closed_at is null
    order by d.name
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'debt_id', open.id,
    'name', open.name,
    'currency', open.currency,
    'balance_minor', open.balance_minor::text
  ) order by open.name), '[]'::jsonb)
  into v_items
  from open;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke all on function public.telegram_list_debts(bigint) from public, anon, authenticated;
grant execute on function public.telegram_list_debts(bigint) to service_role;

-- -----------------------------------------------------------------------------
-- telegram_put_debt_draft: /deuda, de un solo paso (ya trae el monto). Las
-- mismas comprobaciones de validateDebt que aplican a lo que pide el
-- comando (nombre, monto, moneda activa); apr, mínimo y día de pago no se
-- piden por Telegram y quedan en 0/sin fecha (sin plan de pago), igual que
-- telegram_create_debt los va a insertar.
-- -----------------------------------------------------------------------------
create function public.telegram_put_debt_draft(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_name text,
  p_amount_minor bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_tz text;
  v_enabled text[];
  v_name text;
  v_today date;
  v_id uuid;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select p.timezone, p.enabled_currencies into v_tz, v_enabled
  from public.profiles p
  where p.id = v_uid;

  if v_tz is null or v_enabled is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 or p_currency is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not (p_currency = any (v_enabled)) then
    return jsonb_build_object('ok', false, 'error', 'currency_disabled');
  end if;

  v_name := pg_catalog.btrim(coalesce(p_name, ''));
  if pg_catalog.char_length(v_name) < 1 or pg_catalog.char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  begin
    v_today := (pg_catalog.now() at time zone v_tz)::date;
  exception
    when invalid_parameter_value then
      v_today := (pg_catalog.now() at time zone 'America/Bogota')::date;
  end;

  delete from public.telegram_drafts
  where telegram_user_id = p_telegram_user_id
    and transaction_id is null
    and created_id is null;

  insert into public.telegram_drafts (
    telegram_user_id, chat_id, user_id, draft_kind, kind, amount_minor, currency,
    description, account_id, occurred_on, expires_at
  ) values (
    p_telegram_user_id, p_chat_id, v_uid, 'debt', 'expense', p_amount_minor, p_currency,
    v_name, null, v_today,
    pg_catalog.now() + interval '15 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', v_id,
    'name', v_name,
    'amount_minor', p_amount_minor::text,
    'currency', p_currency
  );
end;
$$;

revoke all on function public.telegram_put_debt_draft(bigint, bigint, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.telegram_put_debt_draft(bigint, bigint, text, bigint, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_create_debt: la inserción de saveDebt (una deuda nueva), movida a
-- SQL. Sin apr, sin mínimo y sin día de pago (0/null): no hay recurrente de
-- pago mínimo que sincronizar (keepsSchedule, lib/recurring/debts.ts, exige
-- min_payment_minor > 0 y due_day no nulo), así que no hace falta llamar a
-- syncDebtRecurring desde aquí.
-- -----------------------------------------------------------------------------
create function public.telegram_create_debt(
  p_owner uuid,
  p_name text,
  p_amount_minor bigint,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_id uuid;
begin
  if p_owner is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) > 80 then
    raise exception 'invalid' using errcode = '22023';
  end if;

  select timezone into v_tz from public.profiles where id = p_owner;
  begin
    v_today := (pg_catalog.now() at time zone coalesce(v_tz, 'America/Bogota'))::date;
  exception
    when invalid_parameter_value then
      v_today := (pg_catalog.now() at time zone 'America/Bogota')::date;
  end;

  insert into public.debts (
    owner_id, name, currency, original_principal_minor, apr_bps, apr_kind,
    min_payment_minor, due_day, started_on
  ) values (
    p_owner, pg_catalog.btrim(p_name), p_currency, p_amount_minor, 0, 'nominal',
    0, null, v_today
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.telegram_create_debt(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.telegram_create_debt(uuid, text, bigint, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_begin_debt_payment: primer paso de /abono (elegir la deuda).
-- -----------------------------------------------------------------------------
create function public.telegram_begin_debt_payment(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_debt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_tz text;
  v_today date;
  v_debt record;
  v_balance bigint;
  v_id uuid;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 or p_debt_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select timezone into v_tz from public.profiles where id = v_uid;
  begin
    v_today := (pg_catalog.now() at time zone coalesce(v_tz, 'America/Bogota'))::date;
  exception
    when invalid_parameter_value then
      v_today := (pg_catalog.now() at time zone 'America/Bogota')::date;
  end;

  select d.id, d.name, d.currency into v_debt
  from public.debts d
  where d.id = p_debt_id
    and d.owner_id = v_uid
    and d.deleted_at is null
    and d.closed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select greatest(
    original_principal_minor - coalesce((
      select sum(principal_minor) from public.debt_payments where debt_id = p_debt_id
    ), 0),
    0
  ) into v_balance
  from public.debts where id = p_debt_id;

  if v_balance <= 0 then
    return jsonb_build_object('ok', false, 'error', 'settled');
  end if;

  delete from public.telegram_drafts
  where telegram_user_id = p_telegram_user_id
    and transaction_id is null
    and created_id is null;

  insert into public.telegram_drafts (
    telegram_user_id, chat_id, user_id, draft_kind, kind, currency,
    description, account_id, occurred_on, expires_at, payload
  ) values (
    p_telegram_user_id, p_chat_id, v_uid, 'debt_payment', 'expense', v_debt.currency,
    v_debt.name, null, v_today,
    pg_catalog.now() + interval '15 minutes',
    jsonb_build_object('debt_id', p_debt_id, 'step', 'await_amount')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', v_id,
    'name', v_debt.name,
    'currency', v_debt.currency,
    'balance_minor', v_balance::text
  );
end;
$$;

revoke all on function public.telegram_begin_debt_payment(bigint, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.telegram_begin_debt_payment(bigint, bigint, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_answer_debt_payment: segundo paso. El saldo se vuelve a calcular
-- aquí, no con el que devolvió telegram_begin_debt_payment: pudo cambiar
-- entre elegir la deuda y contestar el monto.
-- -----------------------------------------------------------------------------
create function public.telegram_answer_debt_payment(
  p_telegram_user_id bigint,
  p_draft_id uuid,
  p_amount_minor bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_draft public.telegram_drafts%rowtype;
  v_debt_id uuid;
  v_balance bigint;
begin
  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select * into v_draft
  from public.telegram_drafts
  where id = p_draft_id
    and telegram_user_id = p_telegram_user_id
    and user_id = v_uid
    and draft_kind = 'debt_payment'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_draft.transaction_id is not null or v_draft.created_id is not null then
    return jsonb_build_object('ok', false, 'error', 'already_saved');
  end if;
  if v_draft.expires_at <= pg_catalog.now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  v_debt_id := (v_draft.payload ->> 'debt_id')::uuid;
  select greatest(
    original_principal_minor - coalesce((
      select sum(principal_minor) from public.debt_payments where debt_id = v_debt_id
    ), 0),
    0
  ) into v_balance
  from public.debts where id = v_debt_id;

  if p_amount_minor > v_balance then
    return jsonb_build_object('ok', false, 'error', 'exceeds_balance', 'balance_minor', v_balance::text);
  end if;

  update public.telegram_drafts
  set amount_minor = p_amount_minor,
      payload = v_draft.payload || jsonb_build_object('step', 'confirm')
  where id = p_draft_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', p_draft_id,
    'name', v_draft.description,
    'currency', v_draft.currency,
    'amount_minor', p_amount_minor::text,
    'balance_after', (v_balance - p_amount_minor)::text
  );
end;
$$;

revoke all on function public.telegram_answer_debt_payment(bigint, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.telegram_answer_debt_payment(bigint, uuid, bigint)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_list_goals: hasta 5 metas activas, personales y de cualquier
-- hogar del que sea miembro (como telegram_due_occurrences, no como el
-- borrador de transacción libre). "Ahorrado" solo suma aportes en la
-- moneda de la meta, igual que lib/goals/queries.ts.
-- -----------------------------------------------------------------------------
create function public.telegram_list_goals(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_items jsonb;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  with visible as (
    select g.id, g.name, g.currency, g.target_minor
    from public.goals g
    where g.archived_at is null
      and (
        (g.household_id is null and g.owner_id = v_uid)
        or (
          g.household_id is not null
          and exists (
            select 1 from public.household_members m
            where m.household_id = g.household_id and m.user_id = v_uid
          )
        )
      )
    order by g.started_on, g.name
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'goal_id', visible.id,
    'name', visible.name,
    'currency', visible.currency,
    'target_minor', visible.target_minor::text,
    'saved_minor', coalesce((
      select sum(c.amount_minor) from public.goal_contributions c
      where c.goal_id = visible.id and c.currency = visible.currency
    ), 0)::text
  ) order by visible.name), '[]'::jsonb)
  into v_items
  from visible;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke all on function public.telegram_list_goals(bigint) from public, anon, authenticated;
grant execute on function public.telegram_list_goals(bigint) to service_role;

-- -----------------------------------------------------------------------------
-- telegram_begin_goal_contribution: primer paso de /ahorro (elegir la meta).
-- -----------------------------------------------------------------------------
create function public.telegram_begin_goal_contribution(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_goal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_tz text;
  v_today date;
  v_goal record;
  v_id uuid;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 or p_goal_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select timezone into v_tz from public.profiles where id = v_uid;
  begin
    v_today := (pg_catalog.now() at time zone coalesce(v_tz, 'America/Bogota'))::date;
  exception
    when invalid_parameter_value then
      v_today := (pg_catalog.now() at time zone 'America/Bogota')::date;
  end;

  select g.id, g.name, g.currency into v_goal
  from public.goals g
  where g.id = p_goal_id
    and g.archived_at is null
    and (
      (g.household_id is null and g.owner_id = v_uid)
      or (
        g.household_id is not null
        and exists (
          select 1 from public.household_members m
          where m.household_id = g.household_id and m.user_id = v_uid
        )
      )
    );

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  delete from public.telegram_drafts
  where telegram_user_id = p_telegram_user_id
    and transaction_id is null
    and created_id is null;

  insert into public.telegram_drafts (
    telegram_user_id, chat_id, user_id, draft_kind, kind, currency,
    description, account_id, occurred_on, expires_at, payload
  ) values (
    p_telegram_user_id, p_chat_id, v_uid, 'goal_contribution', 'expense', v_goal.currency,
    v_goal.name, null, v_today,
    pg_catalog.now() + interval '15 minutes',
    jsonb_build_object('goal_id', p_goal_id, 'step', 'await_amount')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', v_id,
    'name', v_goal.name,
    'currency', v_goal.currency
  );
end;
$$;

revoke all on function public.telegram_begin_goal_contribution(bigint, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.telegram_begin_goal_contribution(bigint, bigint, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_answer_goal_contribution: segundo paso. p_amount_minor ya viene
-- en la moneda de la meta (quien llama convierte con lib/money/convert.ts
-- si la persona escribió otra); p_entered_amount_minor/p_entered_currency
-- son lo que escribió, solo para el "≈" del resumen, y pueden venir null
-- si no hizo falta convertir.
-- -----------------------------------------------------------------------------
create function public.telegram_answer_goal_contribution(
  p_telegram_user_id bigint,
  p_draft_id uuid,
  p_amount_minor bigint,
  p_entered_amount_minor bigint,
  p_entered_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_draft public.telegram_drafts%rowtype;
  v_payload jsonb;
begin
  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select * into v_draft
  from public.telegram_drafts
  where id = p_draft_id
    and telegram_user_id = p_telegram_user_id
    and user_id = v_uid
    and draft_kind = 'goal_contribution'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_draft.transaction_id is not null or v_draft.created_id is not null then
    return jsonb_build_object('ok', false, 'error', 'already_saved');
  end if;
  if v_draft.expires_at <= pg_catalog.now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  v_payload := v_draft.payload || jsonb_build_object('step', 'confirm');
  if p_entered_currency is not null and p_entered_currency <> v_draft.currency then
    v_payload := v_payload || jsonb_build_object(
      'entered_amount_minor', p_entered_amount_minor::text,
      'entered_currency', p_entered_currency
    );
  end if;

  update public.telegram_drafts
  set amount_minor = p_amount_minor, payload = v_payload
  where id = p_draft_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', p_draft_id,
    'name', v_draft.description,
    'currency', v_draft.currency,
    'amount_minor', p_amount_minor::text,
    'entered_amount_minor', case when p_entered_currency is not null and p_entered_currency <> v_draft.currency
      then p_entered_amount_minor::text else null end,
    'entered_currency', case when p_entered_currency is not null and p_entered_currency <> v_draft.currency
      then p_entered_currency else null end
  );
end;
$$;

revoke all on function public.telegram_answer_goal_contribution(bigint, uuid, bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.telegram_answer_goal_contribution(bigint, uuid, bigint, bigint, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_pending_step: ¿hay un borrador esperando el monto (/abono o
-- /ahorro)? El webhook lo consulta antes de tratar un mensaje sin "/" como
-- texto libre.
-- -----------------------------------------------------------------------------
create function public.telegram_pending_step(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.telegram_drafts%rowtype;
begin
  select * into v_draft
  from public.telegram_drafts
  where telegram_user_id = p_telegram_user_id
    and draft_kind in ('debt_payment', 'goal_contribution')
    and transaction_id is null
    and created_id is null
    and amount_minor is null
    and expires_at > pg_catalog.now()
    and coalesce(payload ->> 'step', '') = 'await_amount'
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'pending', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'draft_kind', v_draft.draft_kind,
    'draft_id', v_draft.id,
    'name', v_draft.description,
    'currency', v_draft.currency
  );
end;
$$;

revoke all on function public.telegram_pending_step(bigint) from public, anon, authenticated;
grant execute on function public.telegram_pending_step(bigint) to service_role;

-- -----------------------------------------------------------------------------
-- telegram_commit_draft: agrega 'debt', 'debt_payment' y 'goal_contribution'
-- al despacho de T3. 'debt' no toca cuentas (como 'subscription'). 'debt_payment'
-- y 'goal_contribution' escriben lo mismo que recordPayment/addContribution,
-- cada uno en su propia rama (ninguno de los dos deja siempre un
-- transaction_id, así que no comparten el tramo final de 'transaction' /
-- 'occurrence_payment').
-- -----------------------------------------------------------------------------
create or replace function public.telegram_commit_draft(
  p_telegram_user_id bigint,
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_draft public.telegram_drafts%rowtype;
  v_household uuid;
  v_tx uuid;
  v_created uuid;
  v_debt_id uuid;
  v_goal_id uuid;
  v_balance bigint;
  v_account_id uuid;
  v_item_id uuid;
  v_occ_id uuid;
  v_occ_status text;
  v_month_from date;
  v_month_to date;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 or p_draft_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select * into v_draft
  from public.telegram_drafts
  where id = p_draft_id
    and telegram_user_id = p_telegram_user_id
  for update;

  if not found or v_draft.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_draft.transaction_id is not null or v_draft.created_id is not null then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'transaction_id', v_draft.transaction_id,
      'created_id', v_draft.created_id
    );
  end if;

  if v_draft.expires_at <= pg_catalog.now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if v_draft.draft_kind in ('debt_payment', 'goal_contribution') and v_draft.amount_minor is null then
    -- Todavía está en "¿cuánto...?": nada que confirmar aún.
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_uid::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );

  if v_draft.draft_kind = 'subscription' then
    begin
      v_created := public.telegram_create_subscription(
        v_uid, v_draft.description, v_draft.amount_minor, v_draft.currency,
        v_draft.payload ->> 'frequency', v_draft.occurred_on
      );
      update public.telegram_drafts
      set created_id = v_created, saved_at = pg_catalog.clock_timestamp()
      where id = v_draft.id;
    exception
      when others then
        if sqlerrm = 'rate_limited' then
          return jsonb_build_object('ok', false, 'error', 'rate_limited');
        end if;
        raise;
    end;
    return jsonb_build_object('ok', true, 'created_id', v_created, 'already', false);
  end if;

  if v_draft.draft_kind = 'debt' then
    begin
      v_created := public.telegram_create_debt(
        v_uid, v_draft.description, v_draft.amount_minor, v_draft.currency
      );
      update public.telegram_drafts
      set created_id = v_created, saved_at = pg_catalog.clock_timestamp()
      where id = v_draft.id;
    exception
      when others then
        if sqlerrm = 'rate_limited' then
          return jsonb_build_object('ok', false, 'error', 'rate_limited');
        end if;
        raise;
    end;
    return jsonb_build_object('ok', true, 'created_id', v_created, 'already', false);
  end if;

  if v_draft.draft_kind = 'debt_payment' then
    v_debt_id := (v_draft.payload ->> 'debt_id')::uuid;

    if not exists (
      select 1 from public.debts
      where id = v_debt_id and owner_id = v_uid and deleted_at is null and closed_at is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    select greatest(
      original_principal_minor - coalesce((
        select sum(principal_minor) from public.debt_payments where debt_id = v_debt_id
      ), 0),
      0
    ) into v_balance
    from public.debts where id = v_debt_id;

    if v_draft.amount_minor > v_balance then
      return jsonb_build_object('ok', false, 'error', 'exceeds_balance');
    end if;

    -- Cuenta personal por defecto (la última usada), igual que un borrador
    -- de transacción libre. Sin cuenta, el pago se registra sin movimiento.
    select a.id into v_account_id
    from public.accounts a
    left join lateral (
      select max(t.created_at) as last_used
      from public.transactions t
      where t.account_id = a.id
        and t.owner_id = v_uid
        and t.deleted_at is null
        and t.kind in ('expense', 'income')
    ) u on true
    where a.owner_id = v_uid
      and a.household_id is null
      and a.archived_at is null
      and a.currency = v_draft.currency
    order by u.last_used desc nulls last, a.name asc
    limit 1;

    begin
      if v_account_id is not null then
        insert into public.transactions (
          account_id, kind, category_key, description, amount_minor, currency,
          occurred_on, paid_by, debt_id
        ) values (
          v_account_id, 'expense', 'other', v_draft.description, v_draft.amount_minor, v_draft.currency,
          v_draft.occurred_on, v_uid, v_debt_id
        )
        returning id into v_tx;
      end if;

      insert into public.debt_payments (
        debt_id, paid_on, amount_minor, interest_minor, principal_minor, transaction_id
      ) values (
        v_debt_id, v_draft.occurred_on, v_draft.amount_minor, 0, v_draft.amount_minor, v_tx
      )
      returning id into v_created;
    exception
      when others then
        if sqlerrm = 'rate_limited' then
          return jsonb_build_object('ok', false, 'error', 'rate_limited');
        end if;
        raise;
    end;

    -- Como markDebtOccurrencePaid (lib/recurring/debts.ts): salda el
    -- vencimiento de ese mes si esta deuda tiene recurrente de pago mínimo.
    select ri.id into v_item_id
    from public.recurring_items ri
    where ri.debt_id = v_debt_id and ri.kind = 'debt_payment'
    limit 1;

    if v_item_id is not null then
      v_month_from := pg_catalog.date_trunc('month', v_draft.occurred_on)::date;
      v_month_to := (v_month_from + interval '1 month' - interval '1 day')::date;
      select ro.id, ro.status into v_occ_id, v_occ_status
      from public.recurring_occurrences ro
      where ro.recurring_item_id = v_item_id
        and ro.status in ('scheduled', 'overdue')
        and ro.due_on >= v_month_from
        and ro.due_on <= v_month_to
      order by ro.due_on
      limit 1;
      if v_occ_id is not null then
        update public.recurring_occurrences
        set status = 'paid', transaction_id = v_tx
        where id = v_occ_id;
      end if;
    end if;

    update public.telegram_drafts
    set created_id = v_created,
        transaction_id = v_tx,
        saved_at = pg_catalog.clock_timestamp(),
        payload = v_draft.payload || case when v_occ_id is not null
          then jsonb_build_object('occurrence_id', v_occ_id, 'prior_status', v_occ_status)
          else '{}'::jsonb end
    where id = v_draft.id;

    return jsonb_build_object('ok', true, 'created_id', v_created, 'already', false);
  end if;

  if v_draft.draft_kind = 'goal_contribution' then
    v_goal_id := (v_draft.payload ->> 'goal_id')::uuid;

    if not exists (
      select 1 from public.goals g
      where g.id = v_goal_id
        and g.archived_at is null
        and (
          (g.household_id is null and g.owner_id = v_uid)
          or (
            g.household_id is not null
            and exists (
              select 1 from public.household_members m
              where m.household_id = g.household_id and m.user_id = v_uid
            )
          )
        )
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    begin
      insert into public.goal_contributions (goal_id, user_id, amount_minor, currency, contributed_on)
      values (v_goal_id, v_uid, v_draft.amount_minor, v_draft.currency, v_draft.occurred_on)
      returning id into v_created;
      update public.telegram_drafts
      set created_id = v_created, saved_at = pg_catalog.clock_timestamp()
      where id = v_draft.id;
    exception
      when others then
        if sqlerrm = 'rate_limited' then
          return jsonb_build_object('ok', false, 'error', 'rate_limited');
        end if;
        raise;
    end;
    return jsonb_build_object('ok', true, 'created_id', v_created, 'already', false);
  end if;

  -- transaction y occurrence_payment: la cuenta tiene que seguir siendo
  -- usable por esta persona (pudo dejar el hogar, o archivarse, entre el
  -- borrador y el Guardar).
  select a.household_id into v_household
  from public.accounts a
  where a.id = v_draft.account_id
    and a.archived_at is null
    and (
      (a.household_id is null and a.owner_id = v_uid)
      or (
        a.household_id is not null
        and exists (
          select 1 from public.household_members m
          where m.household_id = a.household_id
            and m.user_id = v_uid
        )
      )
    );

  if not found then
    return jsonb_build_object('ok', false, 'error', 'account_forbidden');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and v_draft.currency = any (p.enabled_currencies)
  ) then
    return jsonb_build_object('ok', false, 'error', 'currency_disabled');
  end if;

  begin
    if v_draft.draft_kind = 'transaction' then
      v_tx := public.save_transaction(
        null,
        v_household,
        v_draft.account_id,
        v_draft.kind,
        v_draft.category_key,
        v_draft.description,
        null,
        v_draft.amount_minor,
        v_draft.currency,
        v_draft.occurred_on,
        v_uid,
        null
      );
    else
      -- occurrence_payment
      v_tx := public.post_occurrence(
        (v_draft.payload ->> 'occurrence_id')::uuid,
        v_draft.account_id,
        v_draft.occurred_on
      );
    end if;
    update public.telegram_drafts
    set transaction_id = v_tx, saved_at = pg_catalog.clock_timestamp()
    where id = v_draft.id;
  exception
    when others then
      if sqlerrm = 'rate_limited' then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
      end if;
      if sqlerrm in ('former_member_locked', 'payer_not_member') then
        return jsonb_build_object('ok', false, 'error', 'account_forbidden');
      end if;
      raise;
  end;

  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'already', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- telegram_undo: agrega 'debt', 'debt_payment' y 'goal_contribution'. Cada
-- uno se deshace por su cuenta (created_id, no siempre transaction_id) antes
-- de llegar al tramo final de 'transaction'/'occurrence_payment'.
-- -----------------------------------------------------------------------------
create or replace function public.telegram_undo(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_draft public.telegram_drafts%rowtype;
  v_updated integer;
  v_occurrence_id uuid;
  v_prior_status text;
begin
  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select * into v_draft
  from public.telegram_drafts d
  where d.telegram_user_id = p_telegram_user_id
    and d.user_id = v_uid
    and d.saved_at >= pg_catalog.now() - interval '10 minutes'
    and (d.transaction_id is not null or d.created_id is not null)
  order by d.saved_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_uid::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );

  if v_draft.draft_kind = 'subscription' then
    if v_draft.created_id is null then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    if exists (
      select 1 from public.recurring_occurrences
      where recurring_item_id = v_draft.created_id and status <> 'scheduled'
    ) then
      return jsonb_build_object('ok', false, 'error', 'cannot_undo');
    end if;
    delete from public.recurring_items
    where id = v_draft.created_id and owner_id = v_uid;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_draft.draft_kind = 'debt' then
    if v_draft.created_id is null then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    if exists (select 1 from public.debt_payments where debt_id = v_draft.created_id) then
      return jsonb_build_object('ok', false, 'error', 'cannot_undo');
    end if;
    delete from public.debts where id = v_draft.created_id and owner_id = v_uid;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_draft.draft_kind = 'goal_contribution' then
    if v_draft.created_id is null then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    delete from public.goal_contributions where id = v_draft.created_id and user_id = v_uid;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_draft.draft_kind = 'debt_payment' then
    if v_draft.created_id is null then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    if not exists (select 1 from public.debt_payments where id = v_draft.created_id) then
      return jsonb_build_object('ok', false, 'error', 'nothing');
    end if;
    v_occurrence_id := (v_draft.payload ->> 'occurrence_id')::uuid;
    v_prior_status := v_draft.payload ->> 'prior_status';
    if v_occurrence_id is not null and v_prior_status is not null then
      update public.recurring_occurrences
      set status = v_prior_status, transaction_id = null
      where id = v_occurrence_id and transaction_id = v_draft.transaction_id and status = 'paid';
    end if;
    delete from public.debt_payments where id = v_draft.created_id;
    if v_draft.transaction_id is not null then
      update public.transactions
      set deleted_at = pg_catalog.now()
      where id = v_draft.transaction_id and owner_id = v_uid and deleted_at is null;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if v_draft.transaction_id is null then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;

  if not exists (
    select 1 from public.transactions
    where id = v_draft.transaction_id and owner_id = v_uid and deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;

  if v_draft.draft_kind = 'occurrence_payment' then
    v_occurrence_id := (v_draft.payload ->> 'occurrence_id')::uuid;
    v_prior_status := v_draft.payload ->> 'prior_status';
    if v_occurrence_id is null or v_prior_status is null then
      return jsonb_build_object('ok', false, 'error', 'cannot_undo');
    end if;
    if not exists (
      select 1 from public.recurring_occurrences
      where id = v_occurrence_id and transaction_id = v_draft.transaction_id and status = 'paid'
    ) then
      -- Alguien ya movió o repagó el vencimiento: deshacer solo este
      -- movimiento no sería seguro.
      return jsonb_build_object('ok', false, 'error', 'cannot_undo');
    end if;
    delete from public.debt_payments where transaction_id = v_draft.transaction_id;
    update public.recurring_occurrences
    set status = v_prior_status, transaction_id = null
    where id = v_occurrence_id;
  end if;

  update public.transactions
  set deleted_at = pg_catalog.now()
  where id = v_draft.transaction_id
    and owner_id = v_uid
    and deleted_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
