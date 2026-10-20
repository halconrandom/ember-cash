-- =============================================================================
-- Onboarding (0023): cada quien inserta y ve sus eventos, las props están
-- cerradas, el cupo de la tarjeta solo vive en una tarjeta y el paso del
-- perfil se puede guardar. Todo en una transacción con ROLLBACK.
-- Las ayudas llevan el prefijo obn_ para no chocar en test:db:fresh.
-- =============================================================================
begin;

create function pg_temp.obn_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.obn_expect_error(stmt text, expected text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c023-00000000000a', 'authenticated', 'authenticated', 'obn-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c023-00000000000b', 'authenticated', 'authenticated', 'obn-b@test.local', '{}', '{}');

-- El disparador de escrituras y el sello no arman SQL.
do $$
declare
  def text;
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'zz_rate_limit_write'
      and tgrelid = 'public.events'::regclass
      and not tgisinternal
  ) then
    raise exception 'FALLO: events no entra al rate limit de escrituras';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'events_stamp' and tgrelid = 'public.events'::regclass
  ) then
    raise exception 'FALLO: falta events_stamp';
  end if;
  select pg_get_functiondef('public.events_stamp()'::regprocedure) into def;
  if def not like '%search_path%' or def like '%||%' or def ilike '%execute%' then
    raise exception 'FALLO: events_stamp no tiene search_path fijo o arma SQL';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'onboarding_step', 'update')
    or not has_column_privilege('authenticated', 'public.profiles', 'dashboard_hint_dismissed_at', 'update')
    or not has_column_privilege('authenticated', 'public.profiles', 'first_steps_dismissed_at', 'update')
  then
    raise exception 'FALLO: authenticated no puede guardar el paso del wizard';
  end if;
  if not has_column_privilege('authenticated', 'public.events', 'name', 'insert')
    or not has_column_privilege('authenticated', 'public.events', 'props', 'insert')
    or has_column_privilege('authenticated', 'public.events', 'user_id', 'insert')
    or has_table_privilege('authenticated', 'public.events', 'update')
    or has_table_privilege('authenticated', 'public.events', 'delete')
  then
    raise exception 'FALLO: los privilegios de events no son solo insertar name y props';
  end if;
end $$;

select pg_temp.obn_login('00000000-0000-4000-c023-00000000000a');

insert into public.events (name, props) values
  ('onboarding_started', '{}'),
  ('onboarding_step_completed', '{"step": 0}'),
  ('first_item_created', '{"type": "account"}'),
  ('help_opened', '{"page": "dashboard"}');

do $$
declare
  n int;
  uid uuid := '00000000-0000-4000-c023-00000000000a';
begin
  select count(*) into n from public.events
  where user_id = uid and created_at > pg_catalog.now() - interval '1 minute';
  if n <> 4 then
    raise exception 'FALLO: A no guardó sus cuatro eventos (vio %)', n;
  end if;
end $$;

select pg_temp.obn_expect_error(
  $q$insert into public.events (name, props) values ('onboarding_started', '{"step": 0}')$q$,
  '22023',
  'started no lleva props'
);
select pg_temp.obn_expect_error(
  $q$insert into public.events (name, props) values ('onboarding_step_completed', '{"step": 5}')$q$,
  '22023',
  'el paso 5 no existe'
);
select pg_temp.obn_expect_error(
  $q$insert into public.events (name, props) values ('onboarding_step_completed', '{"step": "1"}')$q$,
  '22023',
  'el paso tiene que ser un número'
);
select pg_temp.obn_expect_error(
  $q$insert into public.events (name, props) values ('first_item_created', '{"type": "sample"}')$q$,
  '22023',
  'no hay un tipo sample'
);
select pg_temp.obn_expect_error(
  $q$insert into public.events (name, props) values ('help_opened', '{"page": "admin"}')$q$,
  '22023',
  'la página de ayuda no está en la lista'
);
select pg_temp.obn_expect_error(
  $q$insert into public.events (name, props) values ('page_view', '{}')$q$,
  '22023',
  'un nombre desconocido se rechaza'
);
select pg_temp.obn_expect_error(
  $q$update public.events set name = 'onboarding_completed' where user_id = '00000000-0000-4000-c023-00000000000a'$q$,
  '42501',
  'A no edita sus eventos'
);
select pg_temp.obn_expect_error(
  $q$delete from public.events where user_id = '00000000-0000-4000-c023-00000000000a'$q$,
  '42501',
  'A no borra sus eventos'
);
select pg_temp.obn_expect_error(
  $q$insert into public.events (user_id, name, props) values ('00000000-0000-4000-c023-00000000000b', 'onboarding_started', '{}')$q$,
  '42501',
  'A no elige el user_id'
);

update public.profiles
set onboarding_step = 4,
    dashboard_hint_dismissed_at = pg_catalog.now(),
    first_steps_dismissed_at = pg_catalog.now()
where id = '00000000-0000-4000-c023-00000000000a';

select pg_temp.obn_expect_error(
  $q$update public.profiles set onboarding_step = 5 where id = '00000000-0000-4000-c023-00000000000a'$q$,
  '23514',
  'el paso 5 no cabe en el perfil'
);
select pg_temp.obn_expect_error(
  $q$update public.profiles set created_at = pg_catalog.now() where id = '00000000-0000-4000-c023-00000000000a'$q$,
  '42501',
  'A no cambia created_at'
);

insert into public.accounts (name, type, currency, credit_limit_minor, payment_day)
values ('obn tarjeta', 'credit_card', 'COP', 3000000, 15);
insert into public.accounts (name, type, currency)
values ('obn ahorros', 'savings', 'COP');

select pg_temp.obn_expect_error(
  $q$insert into public.accounts (name, type, currency, credit_limit_minor) values ('obn cupo', 'checking', 'COP', 10)$q$,
  '23514',
  'una cuenta que no es tarjeta no lleva cupo'
);
select pg_temp.obn_expect_error(
  $q$insert into public.accounts (name, type, currency, payment_day) values ('obn dia', 'credit_card', 'COP', 0)$q$,
  '23514',
  'el día 0 no es un día de pago'
);
select pg_temp.obn_expect_error(
  $q$insert into public.accounts (name, type, currency, credit_limit_minor) values ('obn cero', 'credit_card', 'COP', 0)$q$,
  '23514',
  'el cupo cero no se guarda'
);

select pg_temp.obn_login('00000000-0000-4000-c023-00000000000b');

do $$
declare n int;
begin
  select count(*) into n from public.events;
  if n <> 0 then
    raise exception 'FALLO: B lee los eventos de A (% filas)', n;
  end if;
end $$;

insert into public.events (name, props) values ('help_opened', '{"page": "settings"}');

-- El dueño de la tabla tampoco puede firmar por otra persona ni cambiar la hora.
select set_config('role', 'postgres', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-c023-00000000000a', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-c023-00000000000a","role":"authenticated"}',
  true
);

insert into public.events (user_id, name, props, created_at)
values (
  '00000000-0000-4000-c023-00000000000b',
  'help_opened',
  '{"page": "calendar"}',
  '2000-01-01'
);

do $$
declare
  uid uuid;
  at timestamptz;
begin
  select user_id, created_at into uid, at
  from public.events
  where name = 'help_opened' and props ->> 'page' = 'calendar';
  if uid <> '00000000-0000-4000-c023-00000000000a' or at < pg_catalog.now() - interval '1 minute' then
    raise exception 'FALLO: el sello no forzó dueño y hora (user %, at %)', uid, at;
  end if;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

select pg_temp.obn_expect_error(
  $q$insert into public.events (name, props) values ('onboarding_completed', '{}')$q$,
  '28000',
  'sin sesión no se crea un evento'
);

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);

select pg_temp.obn_expect_error(
  $q$select * from public.events$q$,
  '42501',
  'anon no lee eventos'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

delete from auth.users
where id in (
  '00000000-0000-4000-c023-00000000000a',
  '00000000-0000-4000-c023-00000000000b'
);

select 'OK: todas las pruebas de onboarding events pasaron' as resultado;

rollback;
