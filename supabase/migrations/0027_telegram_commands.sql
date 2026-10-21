-- =============================================================================
-- Fase T3: comandos del bot de Telegram (1/2). Generaliza telegram_drafts
-- para que un borrador no sea siempre una transacción: ahora lleva
-- draft_kind ('transaction', 'subscription', 'occurrence_payment', y
-- 'debt'/'debt_payment'/'goal_contribution' reservados para T4) y un
-- payload jsonb con los datos propios de cada tipo. Las columnas que ya
-- existían (amount_minor, currency, category_key, description, account_id,
-- occurred_on) se siguen usando para lo que se puede mostrar igual en
-- cualquier tipo; payload solo lleva lo que no cabe ahí.
--
-- transaction_id sigue siendo "la transacción que dejó este borrador"
-- (transaction y occurrence_payment, que crean una fila de transactions).
-- created_id es lo mismo para lo que no es una transacción (el id del
-- recurring_items que crea 'subscription'). Un borrador está guardado si
-- cualquiera de los dos no es null; el índice de "un pendiente por chat" y
-- el borrado del borrador anterior ahora miran los dos.
--
-- telegram_commit_draft despacha por draft_kind. telegram_cancel_draft y
-- telegram_undo se generalizan igual. telegram_create_subscription hace la
-- inserción de recurring_items con las mismas comprobaciones que
-- saveRecurringItem (app/(app)/(shell)/subscriptions/actions.ts): no se
-- llama con el user_id del cliente, se la pasa telegram_commit_draft ya
-- resuelto desde el vínculo. Las suscripciones del bot son siempre
-- personales (household_id null): igual que /gasto e /ingreso, el bot no
-- tiene un selector de Personal/Hogar.
--
-- telegram_put_occurrence_draft y telegram_due_occurrences alcanzan tanto
-- lo personal como lo del hogar de la persona (a diferencia del borrador de
-- transacción libre, que solo mira su cuenta personal): "Marcar como
-- pagado" ya es una acción que puede afectar a todo el hogar, como en la
-- app.
-- =============================================================================

alter table public.telegram_drafts
  add column draft_kind text not null default 'transaction'
    check (draft_kind in (
      'transaction', 'subscription', 'occurrence_payment',
      'debt', 'debt_payment', 'goal_contribution'
    )),
  add column payload jsonb,
  add column created_id uuid,
  -- Una suscripción no tiene cuenta propia (igual que en la app: se elige
  -- al "Marcar como pagado", no al crearla).
  alter column account_id drop not null;

drop index public.telegram_drafts_one_pending_idx;

-- "Pendiente" ahora es: ni transaction_id (transacción u ocurrencia pagada)
-- ni created_id (suscripción creada) tienen valor.
create unique index telegram_drafts_one_pending_idx
  on public.telegram_drafts (telegram_user_id)
  where transaction_id is null and created_id is null;

-- -----------------------------------------------------------------------------
-- telegram_put_draft (T1): mismo contrato, ahora marca draft_kind y borra el
-- pendiente anterior mirando las dos columnas de "ya guardado".
-- -----------------------------------------------------------------------------
create or replace function public.telegram_put_draft(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_kind text,
  p_amount_minor bigint,
  p_currency text,
  p_category_key text,
  p_description text,
  p_account_id uuid
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
  v_description text;
  v_account_id uuid;
  v_account_name text;
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

  if p_kind not in ('expense', 'income')
     or p_amount_minor is null
     or p_amount_minor <= 0
     or p_currency is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if not (p_currency = any (v_enabled)) then
    return jsonb_build_object('ok', false, 'error', 'currency_disabled');
  end if;

  if not exists (
    select 1 from public.categories c
    where c.key = p_category_key and c.kind = p_kind
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  v_description := pg_catalog.btrim(coalesce(p_description, ''));
  if pg_catalog.char_length(v_description) < 1 or pg_catalog.char_length(v_description) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if p_account_id is null then
    select a.id, a.name into v_account_id, v_account_name
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
    order by u.last_used desc nulls last, a.name asc
    limit 1;
    if v_account_id is null then
      return jsonb_build_object('ok', false, 'error', 'no_account');
    end if;
  else
    select a.id, a.name into v_account_id, v_account_name
    from public.accounts a
    where a.id = p_account_id
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
    if v_account_id is null then
      return jsonb_build_object('ok', false, 'error', 'account_forbidden');
    end if;
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
    category_key, description, account_id, occurred_on, expires_at
  ) values (
    p_telegram_user_id, p_chat_id, v_uid, 'transaction', p_kind, p_amount_minor, p_currency,
    p_category_key, v_description, v_account_id, v_today,
    pg_catalog.now() + interval '15 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', v_id,
    'kind', p_kind,
    'amount_minor', p_amount_minor::text,
    'currency', p_currency,
    'category_key', p_category_key,
    'description', v_description,
    'account_name', v_account_name,
    'occurred_on', v_today
  );
end;
$$;

revoke all on function public.telegram_put_draft(bigint, bigint, text, bigint, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.telegram_put_draft(bigint, bigint, text, bigint, text, text, text, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_put_subscription_draft: valida como saveRecurringItem (nombre,
-- monto, moneda activa, frecuencia, día del mes solo con mensual) y deja el
-- borrador. No crea la suscripción: eso lo hace telegram_create_subscription
-- al confirmar. Siempre personal (household_id null), cuenta sin asignar,
-- igual que crear una suscripción nueva en la app.
-- -----------------------------------------------------------------------------
create function public.telegram_put_subscription_draft(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_name text,
  p_amount_minor bigint,
  p_currency text,
  p_frequency text,
  p_day_of_month integer
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
  v_month0 date;
  v_last0 date;
  v_day0 integer;
  v_candidate0 date;
  v_month1 date;
  v_last1 date;
  v_day1 integer;
  v_anchor date;
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

  if p_frequency not in ('weekly', 'monthly', 'yearly') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if p_day_of_month is not null and p_frequency <> 'monthly' then
    return jsonb_build_object('ok', false, 'error', 'day_only_monthly');
  end if;

  if p_day_of_month is not null and (p_day_of_month < 1 or p_day_of_month > 31) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
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

  if p_day_of_month is null then
    v_anchor := v_today;
  else
    -- Día p_day_of_month de este mes, recortado al último día si no existe
    -- (31 en un mes de 30, etc.). Si ya pasó, el mismo recorte del mes
    -- siguiente.
    v_month0 := pg_catalog.date_trunc('month', v_today)::date;
    v_last0 := (v_month0 + interval '1 month' - interval '1 day')::date;
    v_day0 := least(p_day_of_month, pg_catalog.date_part('day', v_last0)::integer);
    v_candidate0 := v_month0 + (v_day0 - 1);
    if v_candidate0 < v_today then
      v_month1 := (v_month0 + interval '1 month')::date;
      v_last1 := (v_month1 + interval '1 month' - interval '1 day')::date;
      v_day1 := least(p_day_of_month, pg_catalog.date_part('day', v_last1)::integer);
      v_anchor := v_month1 + (v_day1 - 1);
    else
      v_anchor := v_candidate0;
    end if;
  end if;

  delete from public.telegram_drafts
  where telegram_user_id = p_telegram_user_id
    and transaction_id is null
    and created_id is null;

  insert into public.telegram_drafts (
    telegram_user_id, chat_id, user_id, draft_kind, kind, amount_minor, currency,
    category_key, description, account_id, occurred_on, expires_at, payload
  ) values (
    p_telegram_user_id, p_chat_id, v_uid, 'subscription', 'expense', p_amount_minor, p_currency,
    'subscriptions', v_name, null, v_anchor,
    pg_catalog.now() + interval '15 minutes',
    jsonb_build_object('frequency', p_frequency)
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', v_id,
    'name', v_name,
    'amount_minor', p_amount_minor::text,
    'currency', p_currency,
    'frequency', p_frequency,
    'next_charge', v_anchor
  );
end;
$$;

revoke all on function public.telegram_put_subscription_draft(bigint, bigint, text, bigint, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.telegram_put_subscription_draft(bigint, bigint, text, bigint, text, text, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_create_subscription: la inserción de recurring_items que hace
-- saveRecurringItem, movida a SQL para que el bot la llame al confirmar.
-- p_owner ya viene resuelto (el vínculo), nunca del llamador.
-- -----------------------------------------------------------------------------
create function public.telegram_create_subscription(
  p_owner uuid,
  p_name text,
  p_amount_minor bigint,
  p_currency text,
  p_frequency text,
  p_anchor_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_owner is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_frequency not in ('weekly', 'monthly', 'yearly') then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_name)) > 80 then
    raise exception 'invalid' using errcode = '22023';
  end if;

  insert into public.recurring_items (
    owner_id, household_id, kind, name, category_key, amount_minor, currency,
    frequency, "interval", anchor_date, status
  ) values (
    p_owner, null, 'subscription', pg_catalog.btrim(p_name), 'subscriptions', p_amount_minor, p_currency,
    p_frequency, 1, p_anchor_date, 'active'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.telegram_create_subscription(uuid, text, bigint, text, text, date)
  from public, anon, authenticated;
grant execute on function public.telegram_create_subscription(uuid, text, bigint, text, text, date)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_due_occurrences: hasta 5 vencimientos vencidos o de hoy, de la
-- cuenta personal y de cualquier hogar del que sea miembro. A diferencia del
-- borrador de transacción libre, /pagar sí alcanza lo compartido (es lo
-- mismo que "Marcar como pagado" en el calendario).
-- -----------------------------------------------------------------------------
create function public.telegram_due_occurrences(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_tz text;
  v_today date;
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

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  begin
    v_today := (pg_catalog.now() at time zone v_tz)::date;
  exception
    when invalid_parameter_value then
      v_today := (pg_catalog.now() at time zone 'America/Bogota')::date;
  end;

  with due as (
    select o.id, i.name, coalesce(o.amount_override_minor, i.amount_minor) as amount_minor,
           i.currency, o.due_on
    from public.recurring_occurrences o
    join public.recurring_items i on i.id = o.recurring_item_id
    where o.status in ('scheduled', 'overdue')
      and o.due_on <= v_today
      and i.status = 'active'
      and (
        (i.household_id is null and i.owner_id = v_uid)
        or (
          i.household_id is not null
          and exists (
            select 1 from public.household_members m
            where m.household_id = i.household_id and m.user_id = v_uid
          )
        )
      )
    order by o.due_on, i.name
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'occurrence_id', due.id,
    'name', due.name,
    'amount_minor', due.amount_minor::text,
    'currency', due.currency,
    'due_on', due.due_on
  ) order by due.due_on, due.name), '[]'::jsonb)
  into v_items
  from due;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke all on function public.telegram_due_occurrences(bigint) from public, anon, authenticated;
grant execute on function public.telegram_due_occurrences(bigint) to service_role;

-- -----------------------------------------------------------------------------
-- telegram_put_occurrence_draft: borrador de "Marcar como pagado" desde
-- /pagar. La cuenta por defecto es la del recurrente si todavía es usable
-- por esta persona; si no, la misma resolución de telegram_put_draft (la
-- personal usada más recientemente). payload guarda occurrence_id y el
-- status anterior, para que /deshacer pueda devolverlo a como estaba.
-- -----------------------------------------------------------------------------
create function public.telegram_put_occurrence_draft(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_occurrence_id uuid
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
  v_occ public.recurring_occurrences%rowtype;
  v_item public.recurring_items%rowtype;
  v_amount bigint;
  v_kind text;
  v_category text;
  v_account_id uuid;
  v_account_name text;
  v_id uuid;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 or p_occurrence_id is null then
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

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select * into v_occ
  from public.recurring_occurrences
  where id = p_occurrence_id
    and status in ('scheduled', 'overdue');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_item from public.recurring_items where id = v_occ.recurring_item_id;
  if not found or v_item.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Un chat no ve ni paga vencimientos de un hogar o una cuenta personal
  -- ajenos: lo mismo que el aislamiento de telegram_put_draft.
  if not (
    (v_item.household_id is null and v_item.owner_id = v_uid)
    or (
      v_item.household_id is not null
      and exists (
        select 1 from public.household_members m
        where m.household_id = v_item.household_id and m.user_id = v_uid
      )
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_item.account_id is not null and exists (
    select 1 from public.accounts a
    where a.id = v_item.account_id
      and a.archived_at is null
      and (
        (a.household_id is null and a.owner_id = v_uid)
        or (
          a.household_id is not null
          and exists (
            select 1 from public.household_members m
            where m.household_id = a.household_id and m.user_id = v_uid
          )
        )
      )
  ) then
    select a.id, a.name into v_account_id, v_account_name
    from public.accounts a
    where a.id = v_item.account_id;
  else
    select a.id, a.name into v_account_id, v_account_name
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
    order by u.last_used desc nulls last, a.name asc
    limit 1;
  end if;

  if v_account_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;

  begin
    v_today := (pg_catalog.now() at time zone v_tz)::date;
  exception
    when invalid_parameter_value then
      v_today := (pg_catalog.now() at time zone 'America/Bogota')::date;
  end;

  v_amount := coalesce(v_occ.amount_override_minor, v_item.amount_minor);
  if v_item.kind = 'income' then
    v_kind := 'income';
    v_category := coalesce(v_item.category_key, 'other_income');
  else
    v_kind := 'expense';
    v_category := coalesce(
      v_item.category_key,
      case when v_item.kind = 'subscription' then 'subscriptions' else 'other' end
    );
  end if;

  delete from public.telegram_drafts
  where telegram_user_id = p_telegram_user_id
    and transaction_id is null
    and created_id is null;

  insert into public.telegram_drafts (
    telegram_user_id, chat_id, user_id, draft_kind, kind, amount_minor, currency,
    category_key, description, account_id, occurred_on, expires_at, payload
  ) values (
    p_telegram_user_id, p_chat_id, v_uid, 'occurrence_payment', v_kind, v_amount, v_item.currency,
    v_category, v_item.name, v_account_id, v_today,
    pg_catalog.now() + interval '15 minutes',
    jsonb_build_object('occurrence_id', v_occ.id, 'prior_status', v_occ.status, 'due_on', v_occ.due_on)
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', v_id,
    'name', v_item.name,
    'amount_minor', v_amount::text,
    'currency', v_item.currency,
    'due_on', v_occ.due_on,
    'account_name', v_account_name
  );
end;
$$;

revoke all on function public.telegram_put_occurrence_draft(bigint, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.telegram_put_occurrence_draft(bigint, bigint, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- telegram_commit_draft: despacha por draft_kind. transaction y
-- occurrence_payment comparten la misma comprobación de cuenta y el mismo
-- truco de jwt.claim.sub (la sesión del webhook no trae JWT: se fija aquí,
-- en esta transacción). subscription no toca cuentas ni hogares: siempre
-- personal.
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

  if v_draft.draft_kind = 'subscription' then
    perform pg_catalog.set_config('request.jwt.claim.sub', v_uid::text, true);
    perform pg_catalog.set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text,
      true
    );
    begin
      v_created := public.telegram_create_subscription(
        v_uid,
        v_draft.description,
        v_draft.amount_minor,
        v_draft.currency,
        v_draft.payload ->> 'frequency',
        v_draft.occurred_on
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

  perform pg_catalog.set_config('request.jwt.claim.sub', v_uid::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );

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
-- telegram_cancel_draft: "ya guardado" ahora mira las dos columnas.
-- -----------------------------------------------------------------------------
create or replace function public.telegram_cancel_draft(
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
  v_tx uuid;
  v_created uuid;
begin
  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select d.transaction_id, d.created_id into v_tx, v_created
  from public.telegram_drafts d
  where d.id = p_draft_id
    and d.telegram_user_id = p_telegram_user_id
    and d.user_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_tx is not null or v_created is not null then
    return jsonb_build_object('ok', false, 'error', 'already_saved');
  end if;

  delete from public.telegram_drafts
  where id = p_draft_id
    and telegram_user_id = p_telegram_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- telegram_undo: 10 minutos, y ahora cubre las tres clases de borrador.
-- transaction y occurrence_payment se deshacen con el borrado suave de
-- siempre; occurrence_payment además devuelve el vencimiento a su estado
-- anterior y, si era de una deuda, quita el pago que post_occurrence dejó
-- en debt_payments (si no, el plan de pago quedaría con un pago fantasma).
-- subscription se borra entera (con sus ocurrencias, en cascada) solo si
-- nadie la pagó todavía; si ya hay un vencimiento pagado, deshacerla no es
-- seguro y el bot lo dice sin tocar nada.
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

-- -----------------------------------------------------------------------------
-- purge_old_telegram_data: lo mismo que purge_old_rate_limits, pero para lo
-- efímero del bot. Un borrador sin guardar se borra cuando vence
-- (expires_at); uno ya guardado no se toca hasta que pasan los 10 minutos
-- de /deshacer (saved_at), aunque su expires_at ya haya pasado — si no, un
-- borrador confirmado justo antes de vencer podría desaparecer mientras su
-- ventana de deshacer todavía está abierta. Un código de un solo uso se
-- borra en cuanto se usa o vence: no hace falta guardarlo más.
-- Lo llama el mismo cron diario que purge_old_rate_limits
-- (app/api/cron/purge-deleted/route.ts), con la service role.
-- -----------------------------------------------------------------------------
create function public.purge_old_telegram_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_count integer;
begin
  delete from public.telegram_drafts
  where (
      transaction_id is null and created_id is null
      and expires_at <= pg_catalog.now()
    )
    or (
      (transaction_id is not null or created_id is not null)
      and saved_at <= pg_catalog.now() - interval '10 minutes'
    );
  get diagnostics v_count = row_count;
  v_deleted := v_deleted + v_count;

  delete from public.telegram_link_codes
  where used_at is not null or expires_at <= pg_catalog.now();
  get diagnostics v_count = row_count;
  v_deleted := v_deleted + v_count;

  return v_deleted;
end;
$$;

revoke all on function public.purge_old_telegram_data() from public, anon, authenticated;
grant execute on function public.purge_old_telegram_data() to service_role;
