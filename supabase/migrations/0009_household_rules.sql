-- =============================================================================
-- 0009_household_rules.sql
-- 1. Repartos según la fecha de ingreso (decisión de la fase 10): un gasto
--    compartido se reparte solo entre quienes ya eran miembros del hogar en
--    la fecha del gasto (joined_at ≤ occurred_on, en la zona horaria de cada
--    miembro), aunque se cree o se edite después. Si nadie cumple (gasto con
--    fecha anterior a la creación del hogar), el gasto queda 100 % del
--    pagador. El historial sigue siendo visible para todos los miembros.
-- 2. Presupuestos por mes: budgets.month (primer día del mes) y unicidad por
--    categoría y mes.
-- =============================================================================

create or replace function public.save_transaction(
  p_id uuid,
  p_household_id uuid,
  p_account_id uuid,
  p_kind text,
  p_category_key text,
  p_description text,
  p_note text,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_on date,
  p_paid_by uuid,
  p_transfer_to_account_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_members integer;
begin
  if v_id is null then
    insert into public.transactions (
      household_id, account_id, kind, category_key, description, note,
      amount_minor, currency, occurred_on, paid_by, transfer_to_account_id
    ) values (
      p_household_id, p_account_id, p_kind, p_category_key, p_description, p_note,
      p_amount_minor, p_currency, p_occurred_on, p_paid_by, p_transfer_to_account_id
    )
    returning id into v_id;
  else
    update public.transactions set
      household_id = p_household_id,
      account_id = p_account_id,
      kind = p_kind,
      category_key = p_category_key,
      description = p_description,
      note = p_note,
      amount_minor = p_amount_minor,
      currency = p_currency,
      occurred_on = p_occurred_on,
      paid_by = p_paid_by,
      transfer_to_account_id = p_transfer_to_account_id
    where id = v_id;
    if not found then
      raise exception 'transaction_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.transaction_splits where transaction_id = v_id;

  if p_household_id is not null and p_kind <> 'transfer' then
    -- Miembros que ya lo eran en la fecha del gasto.
    insert into public.transaction_splits (transaction_id, user_id, share_minor)
    select
      v_id,
      m.user_id,
      p_amount_minor / m.n + case when m.rn <= p_amount_minor % m.n then 1 else 0 end
    from (
      select
        hm.user_id,
        row_number() over (order by hm.joined_at, hm.user_id) as rn,
        count(*) over () as n
      from public.household_members hm
      left join public.profiles p on p.id = hm.user_id
      where hm.household_id = p_household_id
        and (hm.joined_at at time zone coalesce(p.timezone, 'America/Bogota'))::date <= p_occurred_on
    ) m;
    get diagnostics v_members = row_count;

    -- Nadie era miembro en esa fecha: el gasto es todo del pagador.
    if v_members = 0 then
      insert into public.transaction_splits (transaction_id, user_id, share_minor)
      values (v_id, coalesce(p_paid_by, (select auth.uid())), p_amount_minor);
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_transaction(
  uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid, uuid
) from public, anon;
grant execute on function public.save_transaction(
  uuid, uuid, uuid, text, text, text, text, bigint, text, date, uuid, uuid
) to authenticated;

-- -----------------------------------------------------------------------------
-- Presupuestos por mes
-- -----------------------------------------------------------------------------
alter table public.budgets
  add column month date not null default (date_trunc('month', current_date))::date
  check (extract(day from month) = 1);

comment on column public.budgets.month is 'Mes del presupuesto (primer día del mes).';

drop index if exists public.budgets_personal_category_uniq;
drop index if exists public.budgets_household_category_uniq;
create unique index budgets_personal_category_month_uniq on public.budgets (owner_id, category_key, month)
  where household_id is null;
create unique index budgets_household_category_month_uniq on public.budgets (household_id, category_key, month)
  where household_id is not null;
