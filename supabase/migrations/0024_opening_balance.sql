-- =============================================================================
-- 0024_opening_balance.sql
-- El saldo inicial de una cuenta no es un ingreso ni un gasto del mes.
--
-- 0003 dice que las cuentas no guardan saldo: se calcula con las
-- transacciones. Las transferencias ya quedan fuera de los totales porque
-- dashboard_totals, los presupuestos y el balance entre miembros solo suman
-- kind in ('expense', 'income'). Un saldo inicial es lo mismo: un movimiento
-- de la cuenta que no es ingreso ni gasto.
--
-- kind = 'opening':
--   * sin categoría, sin cuenta destino, sin pagador, sin meta ni deuda;
--   * no se reparte (igual que una transferencia), aunque la cuenta sea del hogar;
--   * en una tarjeta suma a la deuda que ya existía; en el resto, al dinero;
--   * no se edita como un ingreso: solo se puede marcar deleted_at.
--
-- account_balance es esa suma. Positivo = dinero en la cuenta, salvo en
-- credit_card, donde positivo = lo que se debe.
--
-- Esta migración no reescribe filas. En el proyecto real 0023 no corrió, así
-- que no hay saldos del wizard que convertir, y emparejar la descripción con
-- el nombre de la cuenta podría tomar un ingreso real.
-- =============================================================================

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('expense', 'income', 'transfer', 'opening'));

alter table public.transactions drop constraint transactions_kind_shape;
alter table public.transactions add constraint transactions_kind_shape check (
  (kind in ('expense', 'income') and category_key is not null and transfer_to_account_id is null)
  or (kind = 'transfer' and category_key is null and transfer_to_account_id is not null
      and transfer_to_account_id <> account_id)
  or (kind = 'opening' and category_key is null and transfer_to_account_id is null
      and paid_by is null and goal_id is null and debt_id is null
      and recurring_item_id is null)
);

comment on constraint transactions_kind_shape on public.transactions is
  'Ingreso y gasto llevan categoría. Transferencia lleva destino. Saldo inicial no lleva ni categoría, ni destino, ni pagador.';

-- Una sola fila viva por cuenta. Borrarla (deleted_at) permite crear otra.
create unique index transactions_one_opening_idx
  on public.transactions (account_id)
  where kind = 'opening' and deleted_at is null;

-- Un saldo inicial no se convierte en ingreso ni se le cambia el monto.
-- deleted_at sí: es el mismo borrado suave del resto de movimientos.
create function public.guard_opening_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.kind = 'opening' then
    if new.kind is distinct from old.kind
      or new.category_key is distinct from old.category_key
      or new.paid_by is distinct from old.paid_by
      or new.transfer_to_account_id is distinct from old.transfer_to_account_id
      or new.household_id is distinct from old.household_id
      or new.account_id is distinct from old.account_id
      or new.owner_id is distinct from old.owner_id
      or new.amount_minor is distinct from old.amount_minor
      or new.currency is distinct from old.currency
      or new.description is distinct from old.description
      or new.note is distinct from old.note
      or new.occurred_on is distinct from old.occurred_on
      or new.goal_id is distinct from old.goal_id
      or new.debt_id is distinct from old.debt_id
      or new.recurring_item_id is distinct from old.recurring_item_id
    then
      raise exception 'opening_not_editable' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.guard_opening_balance() is
  'Un saldo inicial no se edita como ingreso o gasto. Solo cambia deleted_at.';

revoke all on function public.guard_opening_balance() from public, anon;
grant execute on function public.guard_opening_balance() to authenticated;

-- Antes de zz_rate_limit_write (el nombre va primero en el alfabeto).
create trigger transactions_opening_guard
  before update on public.transactions
  for each row execute function public.guard_opening_balance();

-- Saldo de la cuenta. security invoker: RLS decide qué movimientos se ven.
-- Null si la cuenta no existe o no es visible. 0 si existe y no tiene movimientos.
create function public.account_balance(p_account_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.accounts a where a.id = p_account_id) then null
    else coalesce((
      select sum(
        case
          when a.type = 'credit_card' then
            case
              when t.kind = 'opening' then t.amount_minor
              when t.kind = 'expense' then t.amount_minor
              when t.kind = 'income' then -t.amount_minor
              when t.kind = 'transfer' and t.account_id = a.id then t.amount_minor
              when t.kind = 'transfer' and t.transfer_to_account_id = a.id then -t.amount_minor
              else 0
            end
          else
            case
              when t.kind = 'opening' then t.amount_minor
              when t.kind = 'income' then t.amount_minor
              when t.kind = 'expense' then -t.amount_minor
              when t.kind = 'transfer' and t.account_id = a.id then -t.amount_minor
              when t.kind = 'transfer' and t.transfer_to_account_id = a.id then t.amount_minor
              else 0
            end
        end
      )::bigint
      from public.accounts a
      join public.transactions t
        on t.deleted_at is null
       and t.currency = a.currency
       and (t.account_id = a.id or t.transfer_to_account_id = a.id)
      where a.id = p_account_id
    ), 0)
  end;
$$;

comment on function public.account_balance(uuid) is
  'Dinero en la cuenta, o deuda si es tarjeta. El saldo inicial entra aquí y no en los totales del mes.';

revoke all on function public.account_balance(uuid) from public, anon;
grant execute on function public.account_balance(uuid) to authenticated;

-- Repartos: un saldo inicial no lleva partes, igual que una transferencia.
create or replace function public.validate_transaction_splits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := '{}';
  tid uuid;
  tx record;
  total bigint;
  n integer;
begin
  if tg_table_name = 'transactions' then
    ids := array[new.id];
  else
    if tg_op in ('UPDATE', 'DELETE') then
      ids := pg_catalog.array_append(ids, old.transaction_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      ids := pg_catalog.array_append(ids, new.transaction_id);
    end if;
  end if;

  foreach tid in array ids loop
    select t.household_id, t.amount_minor, t.kind into tx
    from public.transactions t
    where t.id = tid;

    continue when not found;

    select coalesce(sum(s.share_minor), 0), count(*) into total, n
    from public.transaction_splits s
    where s.transaction_id = tid;

    if tx.kind = 'transfer' then
      if n > 0 then
        raise exception 'transfer_has_splits'
          using errcode = '23514',
                detail = format('La transacción %s es una transferencia y tiene %s repartos.', tid, n);
      end if;
    elsif tx.kind = 'opening' then
      if n > 0 then
        raise exception 'opening_has_splits'
          using errcode = '23514',
                detail = format('La transacción %s es un saldo inicial y tiene %s repartos.', tid, n);
      end if;
    elsif tx.household_id is null then
      if n > 0 then
        raise exception 'personal_transaction_has_splits'
          using errcode = '23514',
                detail = format('La transacción %s es personal y tiene %s repartos.', tid, n);
      end if;
    elsif total <> tx.amount_minor then
      raise exception 'splits_sum_mismatch'
        using errcode = '23514',
              detail = format('Transacción %s: repartos suman %s, monto %s.', tid, total, tx.amount_minor);
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.validate_transaction_splits() from public, anon, authenticated;

-- save_transaction no crea ni edita un saldo inicial: el formulario de
-- ingresos no sirve para eso. Los repartos siguen solo en gasto e ingreso.
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
  v_locked boolean := false;
begin
  if p_kind = 'opening' or (
    v_id is not null and exists (
      select 1 from public.transactions where id = v_id and kind = 'opening'
    )
  ) then
    raise exception 'opening_not_editable' using errcode = '22023';
  end if;

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
    v_locked := public.transaction_has_former_member(v_id);
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
    if v_locked then
      return v_id;
    end if;
  end if;

  delete from public.transaction_splits where transaction_id = v_id;

  if p_household_id is not null and p_kind in ('expense', 'income') then
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
