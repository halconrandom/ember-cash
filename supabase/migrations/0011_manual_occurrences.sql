-- =============================================================================
-- 0011_manual_occurrences.sql
-- Cambio de regla de la fase 9: ya no hay registro automático.
--
-- 1. Se quita recurring_items.auto_post. Ningún vencimiento crea su
--    transacción solo: la única forma es "Marcar como pagado".
-- 2. Nuevo estado 'overdue' (Vencida): el cron solo marca así los
--    vencimientos con fecha pasada que nadie confirmó
--    (mark_overdue_occurrences). Los existentes se marcan aquí.
-- 3. post_occurrence exige un usuario (auth.uid()): con la service role (el
--    cron) falla con not_authenticated, y además la service role ya no
--    puede ejecutarla. Recibe la fecha real de pago (p_paid_on); el reparto
--    usa esa fecha, igual que save_transaction. Acepta 'scheduled' y
--    'overdue'.
-- 4. Salir del hogar (0010) ya no apaga nada: se quita
--    household_departures.auto_post_disabled y la salida solo guarda quién
--    salió.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4. household_detach_member sin auto_post (antes de borrar la columna)
-- -----------------------------------------------------------------------------
create or replace function public.household_detach_member(hid uuid, uid uuid, removed_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.household_members where household_id = hid and user_id = uid) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if not public.household_member_settled(hid, uid) then
    raise exception 'balance_not_settled' using errcode = 'P0001';
  end if;

  insert into public.household_departures (household_id, user_id, display_name, removed_by)
  select hid, uid, p.display_name, removed_by
  from (select 1) x left join public.profiles p on p.id = uid;

  delete from public.household_members where household_id = hid and user_id = uid;
end;
$$;

revoke execute on function public.household_detach_member(uuid, uuid, uuid) from public, anon, authenticated;

alter table public.household_departures drop column auto_post_disabled;

-- -----------------------------------------------------------------------------
-- 1. Sin registro automático
-- -----------------------------------------------------------------------------
alter table public.recurring_items drop column auto_post;

-- -----------------------------------------------------------------------------
-- 2. Estado 'overdue'
-- -----------------------------------------------------------------------------
alter table public.recurring_occurrences drop constraint recurring_occurrences_status_check;
alter table public.recurring_occurrences add constraint recurring_occurrences_status_check
  check (status in ('scheduled', 'overdue', 'paid', 'skipped'));

-- Marca como vencidos los vencimientos sin confirmar con fecha anterior a
-- `p_today` del dueño del recurrente. Lo llama el cron (service role) por
-- perfil, con el día civil de su zona. Devuelve cuántos marcó.
create or replace function public.mark_overdue_occurrences(p_owner uuid, p_today date)
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.recurring_occurrences o
    set status = 'overdue'
    from public.recurring_items i
    where i.id = o.recurring_item_id
      and i.owner_id = p_owner
      and o.status = 'scheduled'
      and o.due_on < p_today
    returning o.id
  )
  select count(*)::integer from marked;
$$;

revoke execute on function public.mark_overdue_occurrences(uuid, date) from public, anon, authenticated;
grant execute on function public.mark_overdue_occurrences(uuid, date) to service_role;

-- Los que ya están atrasados hoy (día civil de la zona de cada dueño).
update public.recurring_occurrences o
set status = 'overdue'
from public.recurring_items i
left join public.profiles p on p.id = i.owner_id
where i.id = o.recurring_item_id
  and o.status = 'scheduled'
  and o.due_on < (now() at time zone coalesce(p.timezone, 'America/Bogota'))::date;

-- -----------------------------------------------------------------------------
-- 3. post_occurrence: solo una persona, con la fecha real de pago
-- -----------------------------------------------------------------------------
drop function public.post_occurrence(uuid, uuid);

create function public.post_occurrence(
  p_occurrence_id uuid,
  p_account_id uuid,
  p_paid_on date default null
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
  v_owner uuid := (select auth.uid());
  v_paid_on date;
  v_tx uuid;
  v_members integer;
begin
  -- Nunca automático: sin usuario (cron, service role) no se registra nada.
  if v_owner is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

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

  -- Segunda llamada (doble clic, dos pestañas): no duplica.
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

  if v_item.household_id is not null
     and not public.household_has_member(v_item.household_id, v_owner) then
    raise exception 'payer_not_member' using errcode = 'P0001';
  end if;

  v_amount := coalesce(v_occ.amount_override_minor, v_item.amount_minor);
  v_paid_on := coalesce(p_paid_on, v_occ.due_on);

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
    v_amount, v_item.currency, v_paid_on, v_owner, v_item.id, v_item.debt_id
  )
  returning id into v_tx;

  if v_item.household_id is not null then
    -- Miembros que ya lo eran en la fecha del pago (como save_transaction).
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
      left join public.profiles p on p.id = hm.user_id
      where hm.household_id = v_item.household_id
        and (hm.joined_at at time zone coalesce(p.timezone, 'America/Bogota'))::date <= v_paid_on
    ) m;
    get diagnostics v_members = row_count;

    -- Nadie era miembro en esa fecha: todo para quien paga.
    if v_members = 0 then
      insert into public.transaction_splits (transaction_id, user_id, share_minor)
      values (v_tx, v_owner, v_amount);
    end if;
  end if;

  if v_item.debt_id is not null then
    insert into public.debt_payments (
      debt_id, paid_on, amount_minor, interest_minor, principal_minor, transaction_id
    ) values (
      v_item.debt_id, v_paid_on, v_amount, 0, v_amount, v_tx
    );
  end if;

  update public.recurring_occurrences
  set status = 'paid', transaction_id = v_tx
  where id = v_occ.id;

  return v_tx;
end;
$$;

revoke execute on function public.post_occurrence(uuid, uuid, date) from public, anon, service_role;
grant execute on function public.post_occurrence(uuid, uuid, date) to authenticated;
