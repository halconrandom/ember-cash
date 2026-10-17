-- =============================================================================
-- 0007_save_transaction.sql
-- RPC save_transaction: crea o edita una transacción y, si es compartida y no
-- es transferencia, rehace sus repartos en partes iguales entre los miembros
-- del hogar. Todo ocurre en una sola transacción de base de datos, así el
-- trigger diferido de repartos (0004/0005) ve la suma correcta al confirmar.
--
-- SECURITY INVOKER: corre con los permisos del usuario, así que RLS y los
-- triggers de 0003 (owner inmutable, referencias visibles, paid_by válido)
-- aplican igual que en un insert/update normal.
--
-- Reparto equitativo: cada miembro recibe amount / n (división entera) y el
-- residuo se reparte de a 1 unidad menor entre los primeros miembros (por
-- fecha de ingreso), para que la suma sea exacta.
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
    -- RLS oculta las filas ajenas: para el usuario, no existen.
    if not found then
      raise exception 'transaction_not_found' using errcode = 'P0002';
    end if;
  end if;

  -- Los repartos se rehacen siempre (cambian con el monto o el hogar).
  delete from public.transaction_splits where transaction_id = v_id;

  if p_household_id is not null and p_kind <> 'transfer' then
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
      where hm.household_id = p_household_id
    ) m;
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
