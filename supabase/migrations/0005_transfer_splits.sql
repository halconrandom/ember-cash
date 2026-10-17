-- =============================================================================
-- 0005_transfer_splits.sql
-- Las transferencias (kind = 'transfer'), personales o compartidas, no llevan
-- repartos y no se les exige que sumen. Si una transferencia tiene repartos,
-- falla con transfer_has_splits.
--
-- Reemplaza la función de 0004 y vuelve a crear el trigger de transactions
-- para que también se dispare cuando cambia `kind` (por ejemplo, un gasto
-- con repartos que se convierte en transferencia).
-- =============================================================================

-- Errores (SQLSTATE 23514):
--   transfer_has_splits             una transferencia tiene repartos
--   personal_transaction_has_splits una transacción personal tiene repartos
--   splits_sum_mismatch             en una compartida, la suma no coincide con amount_minor
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
    select t.household_id, t.amount_minor, t.kind into tx
    from public.transactions t
    where t.id = tid;

    -- La transacción ya no existe (se borró junto con sus repartos).
    continue when not found;

    select coalesce(sum(s.share_minor), 0), count(*) into total, n
    from public.transaction_splits s
    where s.transaction_id = tid;

    if tx.kind = 'transfer' then
      -- Transferencias: nunca llevan repartos, sean personales o compartidas.
      if n > 0 then
        raise exception 'transfer_has_splits'
          using errcode = '23514',
                detail = format('La transacción %s es una transferencia y tiene %s repartos.', tid, n);
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

-- El trigger de transactions ahora también mira `kind`.
drop trigger transactions_splits_sum_check on public.transactions;
create constraint trigger transactions_splits_sum_check
  after insert or update of amount_minor, household_id, kind on public.transactions
  deferrable initially deferred
  for each row execute function public.validate_transaction_splits();
