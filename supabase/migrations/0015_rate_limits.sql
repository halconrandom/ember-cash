-- =============================================================================
-- Límites por usuario (auditoría M-04). Sin Redis: una tabla y una función.
--
-- Ventana deslizante. Los topes viven aquí, no en los argumentos, porque
-- authenticated puede llamar la función y no debe poder subirlos:
--   export         3 por hora
--   invite_create  8 por hora
--   invite_accept  8 cada 15 minutos (el mismo tope que 0013)
--   write          120 por minuto
--
-- accept_invite cuenta el intento antes de mirar el token y, si ya no cabe,
-- responde invite_rate_limited sin decir si el enlace existe.
-- El disparador zz_rate_limit_write cubre el resto de escrituras, también las
-- que llegan directo a PostgREST. Crear un enlace usa invite_create; lo demás
-- usa write. Sin JWT (el cron, la service role) no se cuenta.
--
-- Si el disparador rechaza, esa transacción se deshace. Los intentos ya
-- confirmados siguen en la tabla, así que el siguiente también se bloquea.
-- La tabla vieja invite_accept_attempts se deja: ya no se escribe.
-- =============================================================================

create table public.rate_limits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  attempted_at timestamptz not null default now()
);

create index rate_limits_user_action_attempted_idx
  on public.rate_limits (user_id, action, attempted_at desc);

alter table public.rate_limits enable row level security;

revoke all on table public.rate_limits from public, anon, authenticated;

create function public.consume_rate_limit(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer;
  v_window integer;
  v_count integer;
  v_oldest timestamptz;
  v_retry integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Un solo lugar para los números. Una acción desconocida no inserta filas.
  v_limit := case p_action
    when 'export' then 3
    when 'invite_create' then 8
    when 'invite_accept' then 8
    when 'write' then 120
    else null
  end;
  v_window := case p_action
    when 'export' then 3600
    when 'invite_create' then 3600
    when 'invite_accept' then 900
    when 'write' then 60
    else null
  end;
  if v_limit is null or v_window is null then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;

  -- Una sola cola por persona y acción, para que dos peticiones a la vez
  -- no se salten el conteo. Distintas acciones no se esperan entre sí.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':' || p_action, 0)
  );

  delete from public.rate_limits
  where user_id = v_uid
    and action = p_action
    and attempted_at < pg_catalog.now() - make_interval(secs => v_window);

  select count(*), min(attempted_at)
    into v_count, v_oldest
  from public.rate_limits
  where user_id = v_uid
    and action = p_action;

  if v_count >= v_limit then
    v_retry := greatest(
      1,
      ceil(
        extract(epoch from (v_oldest + make_interval(secs => v_window) - pg_catalog.now()))
      )::integer
    );
    return jsonb_build_object('allowed', false, 'retry_after', v_retry);
  end if;

  insert into public.rate_limits (user_id, action) values (v_uid, p_action);
  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;

-- Borra filas de más de un día. Solo el cron (service role) puede llamarla.
create function public.purge_old_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where attempted_at < pg_catalog.now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_old_rate_limits() to service_role;

create function public.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := 'write';
  v_decision jsonb;
begin
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

revoke all on function public.enforce_write_rate_limit() from public, anon;
grant execute on function public.enforce_write_rate_limit() to authenticated;

-- El nombre zz_ va al final: si otro disparador BEFORE ya rechazó la fila,
-- esta no corre y no se gasta un cupo.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'households',
    'household_members',
    'household_invites',
    'household_departures',
    'accounts',
    'goals',
    'debts',
    'recurring_items',
    'transactions',
    'transaction_splits',
    'goal_contributions',
    'debt_payments',
    'recurring_occurrences',
    'budgets',
    'settlements'
  ]
  loop
    execute format(
      'create trigger zz_rate_limit_write before insert or update or delete on public.%I for each row execute function public.enforce_write_rate_limit()',
      t
    );
  end loop;
end $$;

-- accept_invite pasa a usar la tabla común. El tipo de retorno no cambia,
-- así que create or replace alcanza (no hace falta drop).
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.household_invites%rowtype;
  v_members integer;
  v_decision jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- El noveno intento no mira el token: no confirma si el enlace existe.
  v_decision := public.consume_rate_limit('invite_accept');
  if coalesce((v_decision ->> 'allowed')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'invite_rate_limited');
  end if;

  select * into v_invite
  from public.household_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invite_invalid');
  end if;
  if v_invite.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'invite_used');
  end if;
  if v_invite.expires_at <= pg_catalog.now() then
    return jsonb_build_object('ok', false, 'error', 'invite_expired');
  end if;

  perform 1 from public.households where id = v_invite.household_id for update;

  if exists (
    select 1 from public.household_members
    where household_id = v_invite.household_id and user_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

  select count(*) into v_members
  from public.household_members
  where household_id = v_invite.household_id;

  if v_members >= public.max_household_members() then
    return jsonb_build_object('ok', false, 'error', 'household_full');
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, v_uid, 'member');

  update public.household_invites
  set used_by = v_uid, used_at = pg_catalog.now()
  where id = v_invite.id;

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, pg_catalog.now())
  where id = v_uid;

  return jsonb_build_object('ok', true, 'household_id', v_invite.household_id);
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
