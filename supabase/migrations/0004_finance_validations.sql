-- =============================================================================
-- 0004_finance_validations.sql
-- Dos validaciones de integridad sobre el modelo de 0003:
-- 1. debt_payments: interés + capital = monto del pago.
-- 2. transaction_splits: en una transacción compartida, la suma de los
--    repartos debe ser igual al monto; una transacción personal no lleva
--    repartos. Se comprueba al final de la transacción de base de datos
--    (constraint trigger diferido), para poder insertar la transacción y sus
--    repartos en varias sentencias.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. debt_payments
-- -----------------------------------------------------------------------------
alter table public.debt_payments
  add constraint debt_payments_amount_breakdown
  check (interest_minor + principal_minor = amount_minor);

-- -----------------------------------------------------------------------------
-- 2. Repartos de transacciones
-- -----------------------------------------------------------------------------

-- Valida los repartos de las transacciones afectadas por la fila que disparó
-- el trigger. SECURITY DEFINER para sumar todos los repartos aunque RLS
-- ocultara alguno al usuario actual. Errores (SQLSTATE 23514):
--   splits_sum_mismatch            la suma no coincide con amount_minor
--   personal_transaction_has_splits una transacción personal tiene repartos
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
  -- Qué transacciones revisar según la tabla y la operación.
  if tg_table_name = 'transactions' then
    ids := array[new.id];
  else
    if tg_op in ('UPDATE', 'DELETE') then
      ids := ids || old.transaction_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      ids := ids || new.transaction_id;
    end if;
  end if;

  foreach tid in array ids loop
    select t.household_id, t.amount_minor into tx
    from public.transactions t
    where t.id = tid;

    -- La transacción ya no existe (se borró junto con sus repartos).
    continue when not found;

    select coalesce(sum(s.share_minor), 0), count(*) into total, n
    from public.transaction_splits s
    where s.transaction_id = tid;

    if tx.household_id is null then
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

-- Cambios en los repartos.
create constraint trigger transaction_splits_sum_check
  after insert or update or delete on public.transaction_splits
  deferrable initially deferred
  for each row execute function public.validate_transaction_splits();

-- Cambios en la transacción que afectan la regla: nueva, otro monto, o pasa
-- de personal a compartida (o al revés).
create constraint trigger transactions_splits_sum_check
  after insert or update of amount_minor, household_id on public.transactions
  deferrable initially deferred
  for each row execute function public.validate_transaction_splits();

revoke execute on function public.validate_transaction_splits() from public, anon, authenticated;
