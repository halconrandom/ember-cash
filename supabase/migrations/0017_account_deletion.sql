-- =============================================================================
-- 0017_account_deletion.sql
-- Eliminar cuenta y datos (beta, B3). Decisión ya tomada (docs/PROMPT_BETA.md):
-- se borran los datos personales; los gastos y liquidaciones del hogar donde
-- la persona participó se conservan, pero anonimizados (sin su nombre ni su
-- correo: aparece como "Usuario eliminado").
--
-- Validación previa (todo o nada, se revisa ANTES de tocar nada):
--   - Si en algún hogar con más de un miembro el saldo de la persona no está
--     en cero: balance_not_settled.
--   - Si administra (role = 'owner') un hogar con más de un miembro:
--     owns_household_with_members. Tiene que liquidar y quitar al otro
--     miembro (o que el otro miembro se vaya) antes de poder borrar su cuenta.
-- Si pasa la validación:
--   - Hogar donde es el único miembro: se borra el hogar entero (en cascada).
--   - Hogar con otro miembro (siempre como 'member', nunca 'owner': eso ya lo
--     bloqueó la validación): lo compartido (cuentas, metas, recurrentes,
--     presupuestos, transacciones, repartos, liquidaciones, aportes) se
--     reasigna a un usuario fantasma fijo ("Usuario eliminado"), igual que
--     household_detach_member hace con la salida normal, pero sin guardar el
--     nombre real.
--
-- Por qué hace falta un usuario fantasma: owner_id es inmutable (trigger
-- forbid_column_change) y transaction_splits.user_id es parte de su llave
-- primaria, así que las filas compartidas no pueden quedar "sin dueño": se
-- reasignan a una cuenta fantasma real (auth.users), creada una sola vez
-- desde el servidor con la Admin API (lib/auth/deleted-user-sentinel.ts;
-- nunca con SQL directo sobre auth.users). public.deleted_account_sentinel
-- guarda su id (una sola fila, truco de tabla singleton).
--
-- Por qué hace falta un escape para tres candados: la reasignación anterior
-- choca con tres protecciones ya existentes, cada una correcta para el resto
-- de la app:
--   - forbid_column_change: owner_id/created_by inmutables.
--   - lock_former_member_transaction/splits/settlement (0010): una fila con
--     un ex miembro queda bloqueada.
--   - enforce_write_rate_limit (0015): 120 escrituras por minuto; borrar una
--     cuenta con mucho historial fácilmente las supera.
-- Las tres funciones ahora revisan primero el ajuste de sesión
-- ember.account_deletion: si está en 'on', dejan pasar. Solo
-- delete_account_data lo enciende (set_config con local=true: dura lo que
-- dura esa transacción, nunca se filtra a otra petición), así que ninguna
-- otra vía (PostgREST, otra función) puede activarlo.
--
-- delete_account_data es SECURITY DEFINER, exige auth.uid() y es idempotente
-- en el sentido de que solo actúa sobre los hogares de quien la llama; no
-- borra auth.users (una ruta de servidor lo hace después con la Admin API,
-- solo si esta función devuelve ok:true: ver lib/auth/delete-account.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Marca de una salida anonimizada por borrado de cuenta.
-- -----------------------------------------------------------------------------
alter table public.household_departures
  add column deleted_account boolean not null default false;

comment on column public.household_departures.deleted_account is
  'true cuando la salida es por haber borrado la cuenta: se muestra como "Usuario eliminado", sin nombre.';

-- -----------------------------------------------------------------------------
-- Usuario fantasma ("Usuario eliminado"): una sola fila, creada por el
-- servidor con la Admin API (no por esta migración). singleton=true y es la
-- llave primaria, así que nunca puede haber una segunda fila.
-- -----------------------------------------------------------------------------
create table public.deleted_account_sentinel (
  singleton boolean primary key default true,
  user_id uuid not null unique references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (singleton)
);

comment on table public.deleted_account_sentinel is
  'Id del usuario fantasma al que se reasignan los datos compartidos al borrar una cuenta. Una sola fila.';

alter table public.deleted_account_sentinel enable row level security;

-- Sin políticas: nadie autenticado lo lee ni lo escribe directo. Lo usa el
-- servidor con la service role (crea la fila la primera vez que hace falta)
-- y delete_account_data, que lo lee como SECURITY DEFINER.
revoke all on table public.deleted_account_sentinel from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Escape para la reasignación: tres candados que ya existían ahora revisan
-- primero este ajuste de sesión, local a la transacción.
-- -----------------------------------------------------------------------------
create or replace function public.forbid_column_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('ember.account_deletion', true), '') = 'on' then
    return new;
  end if;
  if to_jsonb(new) -> tg_argv[0] is distinct from to_jsonb(old) -> tg_argv[0] then
    raise exception '%_immutable', tg_argv[0] using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.lock_former_member_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ember.account_deletion', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if old.household_id is null or not public.transaction_has_former_member(old.id) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.deleted_at is not null then
      return old;
    end if;
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  if (new.amount_minor, new.currency, new.occurred_on, new.paid_by, new.account_id, new.kind,
      new.description, new.household_id, new.deleted_at, new.transfer_to_account_id)
     is distinct from
     (old.amount_minor, old.currency, old.occurred_on, old.paid_by, old.account_id, old.kind,
      old.description, old.household_id, old.deleted_at, old.transfer_to_account_id) then
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.lock_former_member_splits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ember.account_deletion', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if public.transaction_has_former_member(coalesce(new.transaction_id, old.transaction_id)) then
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.lock_former_member_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ember.account_deletion', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.households where id = old.household_id)
     and (not public.household_has_member(old.household_id, old.from_user)
          or not public.household_has_member(old.household_id, old.to_user)) then
    raise exception 'former_member_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := 'write';
  v_decision jsonb;
begin
  if coalesce(current_setting('ember.account_deletion', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Sin sesión no hay a quién contarle (cron, service role, alta del perfil).
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_table_name = 'household_invites' and tg_op = 'INSERT' then
    v_action := 'invite_create';
  end if;

  v_decision := public.consume_rate_limit(v_action);
  if coalesce((v_decision ->> 'allowed')::boolean, false) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'rate_limited' using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- La RPC. Sin parámetros: lee el usuario fantasma de
-- deleted_account_sentinel (lo crea antes el servidor, con la Admin API).
-- -----------------------------------------------------------------------------
create or replace function public.delete_account_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sentinel uuid;
  v_decision jsonb;
  -- Los hogares se leen UNA sola vez, antes de tocar nada, y quedan en estos
  -- dos arreglos fijos. El recorrido de la fase 2 NUNCA vuelve a consultar
  -- household_members en vivo: esa misma tabla cambia dentro del propio
  -- recorrido (se borra la fila del hogar que se reasigna, o el hogar entero
  -- en cascada), y un cursor sobre una tabla que se modifica mientras se
  -- recorre puede saltarse o repetir filas.
  v_detach_ids uuid[];
  v_delete_ids uuid[];
  v_hh record;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select user_id into v_sentinel from public.deleted_account_sentinel limit 1;
  if v_sentinel is null then
    raise exception 'sentinel_missing' using errcode = 'P0001';
  end if;
  if v_sentinel = v_uid then
    -- No debería pasar nunca (el fantasma no inicia sesión como persona
    -- real), pero si pasara, reasignar a sí mismo sería un error silencioso.
    raise exception 'invalid_sentinel' using errcode = '22023';
  end if;

  -- Cuenta como una escritura (igual que cualquier otra acción que borra o
  -- cambia datos), antes de dejar pasar el resto de este borrado.
  v_decision := public.consume_rate_limit('write');
  if coalesce((v_decision ->> 'allowed')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- 1. Foto fija de los hogares y validación: ningún hogar puede quedar
  -- bloqueado. Nada se toca todavía; si algo falla, se sale sin haber
  -- escrito nada.
  for v_hh in
    select hm.household_id, hm.role, h.name,
      (select count(*) from public.household_members hm2
       where hm2.household_id = hm.household_id) as member_count
    from public.household_members hm
    join public.households h on h.id = hm.household_id
    where hm.user_id = v_uid
  loop
    if v_hh.member_count > 1 then
      if v_hh.role = 'owner' then
        return jsonb_build_object('ok', false, 'error', 'owns_household_with_members', 'household', v_hh.name);
      end if;
      if not public.household_member_settled(v_hh.household_id, v_uid) then
        return jsonb_build_object('ok', false, 'error', 'balance_not_settled', 'household', v_hh.name);
      end if;
      v_detach_ids := array_append(v_detach_ids, v_hh.household_id);
    else
      v_delete_ids := array_append(v_delete_ids, v_hh.household_id);
    end if;
  end loop;

  -- 2. Nada bloquea: a partir de aquí se anonimiza y se borra. El ajuste deja
  -- pasar la reasignación (owner_id, created_by), los candados de ex miembro
  -- y el límite de escrituras por el resto de esta transacción.
  perform set_config('ember.account_deletion', 'on', true);

  -- 2a. Hogares con otro miembro (siempre 'member': la validación ya
  -- bloqueó a cualquier 'owner' con más gente). Reasigna lo compartido al
  -- usuario fantasma y sale del hogar.
  foreach v_id in array coalesce(v_detach_ids, '{}') loop
    update public.accounts set owner_id = v_sentinel
      where owner_id = v_uid and household_id = v_id;
    update public.goals set owner_id = v_sentinel
      where owner_id = v_uid and household_id = v_id;
    update public.recurring_items set owner_id = v_sentinel
      where owner_id = v_uid and household_id = v_id;
    update public.budgets set owner_id = v_sentinel
      where owner_id = v_uid and household_id = v_id;
    update public.transactions set
        owner_id = case when owner_id = v_uid then v_sentinel else owner_id end,
        paid_by = case when paid_by = v_uid then v_sentinel else paid_by end
      where household_id = v_id and (owner_id = v_uid or paid_by = v_uid);
    update public.transaction_splits s set user_id = v_sentinel
      from public.transactions t
      where t.id = s.transaction_id and t.household_id = v_id and s.user_id = v_uid;
    update public.settlements set
        from_user = case when from_user = v_uid then v_sentinel else from_user end,
        to_user = case when to_user = v_uid then v_sentinel else to_user end,
        created_by = case when created_by = v_uid then v_sentinel else created_by end
      where household_id = v_id
        and (from_user = v_uid or to_user = v_uid or created_by = v_uid);
    update public.goal_contributions gc set user_id = v_sentinel
      from public.goals g
      where g.id = gc.goal_id and g.household_id = v_id and gc.user_id = v_uid;

    -- Sin nombre: "Usuario eliminado" lo pone la pantalla, no la base.
    insert into public.household_departures
        (household_id, user_id, display_name, removed_by, deleted_account)
      values (v_id, v_sentinel, null, null, true);

    delete from public.household_members
      where household_id = v_id and user_id = v_uid;
  end loop;

  -- 2b. Hogares donde era el único miembro (y por lo tanto dueño): el hogar
  -- entero se borra, en cascada (miembros, invitaciones, cuentas, metas,
  -- recurrentes, transacciones, repartos, presupuestos, liquidaciones y
  -- salidas).
  foreach v_id in array coalesce(v_delete_ids, '{}') loop
    delete from public.households where id = v_id;
  end loop;

  -- 3. Lo personal (transacciones, metas, deudas, cuentas, presupuestos,
  -- recurrentes, consentimientos, perfil) no se toca aquí: se borra solo,
  -- en cascada, cuando el servidor borra auth.users después de que esta
  -- función devuelve ok:true.

  -- El ajuste es local a la transacción (dura hasta el COMMIT o ROLLBACK de
  -- quien llama), así que se apaga aquí mismo en vez de confiar en que la
  -- transacción termine enseguida: si alguna vez una misma transacción
  -- encadenara más de una llamada, la siguiente no hereda el permiso.
  perform set_config('ember.account_deletion', 'off', true);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.delete_account_data() from public, anon;
grant execute on function public.delete_account_data() to authenticated;

-- El disparador de límite de escrituras también cubre la tabla nueva.
create trigger zz_rate_limit_write before insert or update or delete on public.deleted_account_sentinel
  for each row execute function public.enforce_write_rate_limit();
