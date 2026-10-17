-- =============================================================================
-- 0008_post_occurrence.sql
-- Subtítulo de un recurrente (la línea chica de la tarjeta de suscripción) y
-- la RPC post_occurrence: crea la transacción de un vencimiento y lo marca
-- pagado, en una sola transacción de base de datos.
--
-- SECURITY INVOKER: RLS aplica. Con la service role (cron) auth.uid() es
-- nulo y el owner de la transacción es el del recurrente. Con un usuario, el
-- owner es él mismo, así que la política de insert se cumple.
--
-- Idempotente: si el vencimiento ya está pagado, devuelve su transacción.
-- Un pago de deuda además deja la fila en debt_payments (interés 0 y todo el
-- monto a capital: el vencimiento no trae el reparto de interés).
-- =============================================================================

alter table public.recurring_items
  add column subtitle text check (char_length(subtitle) <= 120);

create or replace function public.post_occurrence(
  p_occurrence_id uuid,
  p_account_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_occ public.recurring_occurrences%rowtype;
  v_item public.recurring_items%rowtype;
  v_amount bigint;
  v_kind text;
  v_category text;
  v_owner uuid;
  v_tx uuid;
begin
  select * into v_occ
  from public.recurring_occurrences
  where id = p_occurrence_id
  for update;
  if not found then
    raise exception 'occurrence_not_found' using errcode = 'P0002';
  end if;

  if v_occ.status = 'skipped' then
    raise exception 'occurrence_skipped' using errcode = 'P0001';
  end if;

  -- Segunda llamada (cron y "Marcar como pagado" a la vez): no duplica.
  if v_occ.status = 'paid' and v_occ.transaction_id is not null then
    return v_occ.transaction_id;
  end if;

  select * into v_item from public.recurring_items where id = v_occ.recurring_item_id;
  if not found then
    raise exception 'occurrence_not_found' using errcode = 'P0002';
  end if;

  if p_account_id is null then
    raise exception 'account_required' using errcode = 'P0001';
  end if;

  v_amount := coalesce(v_occ.amount_override_minor, v_item.amount_minor);
  v_owner := coalesce(auth.uid(), v_item.owner_id);

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

  insert into public.transactions (
    owner_id, household_id, account_id, kind, category_key, description,
    amount_minor, currency, occurred_on, paid_by, recurring_item_id, debt_id
  ) values (
    v_owner, v_item.household_id, p_account_id, v_kind, v_category, v_item.name,
    v_amount, v_item.currency, v_occ.due_on, v_owner, v_item.id, v_item.debt_id
  )
  returning id into v_tx;

  if v_item.household_id is not null then
    insert into public.transaction_splits (transaction_id, user_id, share_minor)
    select
      v_tx,
      m.user_id,
      v_amount / m.n + case when m.rn <= (v_amount % m.n) then 1 else 0 end
    from (
      select
        hm.user_id,
        row_number() over (order by hm.joined_at, hm.user_id) as rn,
        count(*) over () as n
      from public.household_members hm
      where hm.household_id = v_item.household_id
    ) m;
  end if;

  if v_item.debt_id is not null then
    insert into public.debt_payments (
      debt_id, paid_on, amount_minor, interest_minor, principal_minor, transaction_id
    ) values (
      v_item.debt_id, v_occ.due_on, v_amount, 0, v_amount, v_tx
    );
  end if;

  update public.recurring_occurrences
  set status = 'paid', transaction_id = v_tx
  where id = v_occ.id;

  return v_tx;
end;
$$;

revoke execute on function public.post_occurrence(uuid, uuid) from public, anon;
grant execute on function public.post_occurrence(uuid, uuid) to authenticated, service_role;
