-- =============================================================================
-- Límites de 0015: se bloquea al pasar el tope, se libera al salir de la
-- ventana, y un usuario no gasta el cupo de otro. Corre en Postgres local.
-- =============================================================================
begin;

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values
  ('00000000-0000-4000-c150-00000000000a', 'authenticated', 'authenticated',
   'rl-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c150-00000000000b', 'authenticated', 'authenticated',
   'rl-b@test.local', '{}', '{}');

-- Las funciones quedan fijas: security definer y search_path vacío.
do $$
declare
  fn record;
begin
  for fn in
    select p.proname, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('consume_rate_limit', 'enforce_write_rate_limit', 'purge_old_rate_limits')
  loop
    if not fn.prosecdef then
      raise exception 'FALLO: % no es security definer', fn.proname;
    end if;
    if not exists (
      select 1 from unnest(fn.proconfig) cfg where cfg like 'search_path=%'
    ) then
      raise exception 'FALLO: % no tiene search_path fijo', fn.proname;
    end if;
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c150-00000000000a","role":"authenticated"}', true);

-- Exportación: 3 caben, la cuarta no. B no hereda el bloqueo de A.
do $$
declare
  i integer;
  r jsonb;
begin
  for i in 1..3 loop
    r := public.consume_rate_limit('export');
    if (r ->> 'allowed')::boolean is not true then
      raise exception 'FALLO: la exportación % no cupo (%)', i, r;
    end if;
  end loop;
  r := public.consume_rate_limit('export');
  if (r ->> 'allowed')::boolean is not false or (r ->> 'retry_after')::integer < 1 then
    raise exception 'FALLO: la cuarta exportación no se bloqueó (%)', r;
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c150-00000000000b","role":"authenticated"}', true);

do $$
declare
  r jsonb := public.consume_rate_limit('export');
begin
  if (r ->> 'allowed')::boolean is not true then
    raise exception 'FALLO: la exportación de B quedó bloqueada por A (%)', r;
  end if;
end $$;

-- Al salir de la ventana, A puede exportar otra vez.
reset role;
update public.rate_limits
set attempted_at = pg_catalog.now() - interval '2 hours'
where user_id = '00000000-0000-4000-c150-00000000000a'
  and action = 'export';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c150-00000000000a","role":"authenticated"}', true);

do $$
declare
  r jsonb := public.consume_rate_limit('export');
begin
  if (r ->> 'allowed')::boolean is not true then
    raise exception 'FALLO: la exportación no se liberó al pasar la ventana (%)', r;
  end if;
end $$;

-- Enlaces: 8 por hora en el disparador. El noveno no se guarda.
select set_config('test.rl_h', public.create_household('Casa A')::text, true);

do $$
declare
  i integer;
begin
  for i in 1..8 loop
    insert into public.household_invites (household_id, token_hash)
    values (
      current_setting('test.rl_h')::uuid,
      encode(sha256(convert_to('rl-a-' || i::text, 'UTF8')), 'hex')
    );
  end loop;
  begin
    insert into public.household_invites (household_id, token_hash)
    values (
      current_setting('test.rl_h')::uuid,
      encode(sha256(convert_to('rl-a-9', 'UTF8')), 'hex')
    );
    raise exception 'FALLO: el noveno enlace se guardó';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rate_limited' then
      raise exception 'FALLO: el noveno enlace dio %', sqlerrm;
    end if;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c150-00000000000b","role":"authenticated"}', true);
select set_config('test.rl_hb', public.create_household('Casa B')::text, true);
insert into public.household_invites (household_id, token_hash)
values (
  current_setting('test.rl_hb')::uuid,
  encode(sha256(convert_to('rl-b-1', 'UTF8')), 'hex')
);

-- Escrituras: 120 caben, la 121 no, y el disparador rechaza la fila.
-- Crear el hogar ya gastó unos cupos de escritura: se descartan para probar
-- el tope desde cero.
reset role;
delete from public.rate_limits
where user_id = '00000000-0000-4000-c150-00000000000a'
  and action = 'write';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c150-00000000000a","role":"authenticated"}', true);

do $$
declare
  i integer;
  r jsonb;
begin
  for i in 1..120 loop
    r := public.consume_rate_limit('write');
    if (r ->> 'allowed')::boolean is not true then
      raise exception 'FALLO: la escritura % no cupo', i;
    end if;
  end loop;
  r := public.consume_rate_limit('write');
  if (r ->> 'allowed')::boolean is not false then
    raise exception 'FALLO: la escritura 121 cupo (%)', r;
  end if;
  begin
    insert into public.accounts (name, type, currency) values ('De más', 'cash', 'COP');
    raise exception 'FALLO: se guardó una cuenta por encima del límite';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rate_limited' then
      raise exception 'FALLO: la cuenta dio %', sqlerrm;
    end if;
  end;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c150-00000000000b","role":"authenticated"}', true);
insert into public.accounts (name, type, currency) values ('Cuenta B', 'cash', 'COP');

reset role;
update public.rate_limits
set attempted_at = pg_catalog.now() - interval '2 minutes'
where user_id = '00000000-0000-4000-c150-00000000000a'
  and action = 'write';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c150-00000000000a","role":"authenticated"}', true);
insert into public.accounts (name, type, currency) values ('Cuenta A', 'cash', 'COP');

-- Acción desconocida no inserta filas.
do $$
begin
  perform public.consume_rate_limit('otra');
  raise exception 'FALLO: una acción desconocida no falló';
exception when sqlstate '22023' then
  null;
end $$;

-- authenticated no lee la tabla ni purga. anon no consume.
do $$
begin
  begin
    perform 1 from public.rate_limits;
    raise exception 'FALLO: authenticated leyó rate_limits';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.purge_old_rate_limits();
    raise exception 'FALLO: authenticated purgó';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

insert into public.rate_limits (user_id, action, attempted_at) values
  ('00000000-0000-4000-c150-00000000000a', 'export', pg_catalog.now() - interval '2 days'),
  ('00000000-0000-4000-c150-00000000000a', 'export', pg_catalog.now());

set local role service_role;
do $$
declare
  n integer := public.purge_old_rate_limits();
begin
  if n < 1 then
    raise exception 'FALLO: la purga no borró la fila vieja (devolvió %)', n;
  end if;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from public.rate_limits
    where user_id = '00000000-0000-4000-c150-00000000000a'
      and action = 'export'
      and attempted_at < pg_catalog.now() - interval '1 day'
  ) then
    raise exception 'FALLO: quedó una fila de más de un día';
  end if;
  if not exists (
    select 1 from public.rate_limits
    where user_id = '00000000-0000-4000-c150-00000000000a'
      and action = 'export'
      and attempted_at > pg_catalog.now() - interval '1 hour'
  ) then
    raise exception 'FALLO: la purga borró una fila reciente';
  end if;
end $$;

set local role anon;
do $$
begin
  perform public.consume_rate_limit('export');
  raise exception 'FALLO: anon consumió un límite';
exception when insufficient_privilege then
  null;
end $$;

reset role;

select 'OK: límites por usuario' as resultado;

rollback;
