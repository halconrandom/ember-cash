-- =============================================================================
-- Consentimientos (0016): se guarda la versión, cada quien solo ve y crea los
-- suyos, y nadie (ni el dueño de la fila) edita o borra. Dos usuarios.
-- Todo en una transacción con ROLLBACK (pnpm test:rls).
-- Las ayudas llevan el prefijo cns_ para no chocar en test:db:fresh.
-- La versión '2026-10-v1' es la de lib/legal/version.ts.
-- =============================================================================
begin;

create function pg_temp.cns_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

create function pg_temp.cns_expect_error(stmt text, expected text, label text) returns void
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

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c016-00000000000a', 'authenticated', 'authenticated', 'cns-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c016-00000000000b', 'authenticated', 'authenticated', 'cns-b@test.local', '{}', '{}');

select pg_temp.cns_login('00000000-0000-4000-c016-00000000000a');

insert into public.consents (type, version) values
  ('privacy', '2026-10-v1'),
  ('terms', '2026-10-v1');

do $$
declare
  n int;
  uid uuid := '00000000-0000-4000-c016-00000000000a';
begin
  select count(*) into n from public.consents
  where user_id = uid and version = '2026-10-v1' and accepted_at > pg_catalog.now() - interval '1 minute';
  if n <> 2 then
    raise exception 'FALLO: A no guardó las dos filas de la versión vigente (vio %)', n;
  end if;
  if exists (
    select 1 from public.consents
    where user_id = uid and type not in ('privacy', 'terms')
  ) then
    raise exception 'FALLO: se guardó un tipo que no es privacy ni terms';
  end if;
end $$;

select pg_temp.cns_expect_error(
  $q$insert into public.consents (type, version) values ('privacy', '2026-10-v1')$q$,
  '23505',
  'no se duplica el mismo consentimiento'
);
select pg_temp.cns_expect_error(
  $q$insert into public.consents (type, version) values ('cookies', '2026-10-v1')$q$,
  '23514',
  'un tipo distinto de privacy o terms falla'
);
select pg_temp.cns_expect_error(
  $q$update public.consents set version = 'otra' where user_id = '00000000-0000-4000-c016-00000000000a'$q$,
  '42501',
  'A no edita su consentimiento'
);
select pg_temp.cns_expect_error(
  $q$delete from public.consents where user_id = '00000000-0000-4000-c016-00000000000a'$q$,
  '42501',
  'A no borra su consentimiento'
);
select pg_temp.cns_expect_error(
  $q$insert into public.consents (user_id, type, version) values ('00000000-0000-4000-c016-00000000000b', 'privacy', '2026-10-v1')$q$,
  '42501',
  'A no elige el user_id'
);

select pg_temp.cns_login('00000000-0000-4000-c016-00000000000b');

do $$
declare n int;
begin
  select count(*) into n from public.consents;
  if n <> 0 then
    raise exception 'FALLO: B lee el consentimiento de A (% filas)', n;
  end if;
end $$;

select pg_temp.cns_expect_error(
  $q$update public.consents set version = 'otra' where user_id = '00000000-0000-4000-c016-00000000000a'$q$,
  '42501',
  'B no edita el consentimiento de A'
);
select pg_temp.cns_expect_error(
  $q$delete from public.consents where user_id = '00000000-0000-4000-c016-00000000000a'$q$,
  '42501',
  'B no borra el consentimiento de A'
);

insert into public.consents (type, version) values
  ('privacy', '2026-10-v1'),
  ('terms', '2026-10-v1');

do $$
declare n int;
begin
  select count(*) into n from public.consents
  where user_id = '00000000-0000-4000-c016-00000000000b' and version = '2026-10-v1';
  if n <> 2 then
    raise exception 'FALLO: B no guardó su propia versión (vio %)', n;
  end if;
end $$;

select set_config('role', 'postgres', true);
-- auth.uid() lee el JWT aunque el rol sea postgres. Se limpia para probar "sin sesión".
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
declare n int;
begin
  select count(*) into n from public.consents
  where user_id = '00000000-0000-4000-c016-00000000000a' and version = '2026-10-v1';
  if n <> 2 then
    raise exception 'FALLO: las filas de A no quedaron en la versión 2026-10-v1 (hay %)', n;
  end if;
  select count(*) into n from public.consents;
  if n <> 4 then
    raise exception 'FALLO: se esperaban 4 filas y hay %', n;
  end if;
end $$;

select pg_temp.cns_expect_error(
  $q$insert into public.consents (type, version) values ('privacy', '2026-10-v1')$q$,
  '28000',
  'sin sesión no se crea un consentimiento'
);

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);

select pg_temp.cns_expect_error(
  $q$select * from public.consents$q$,
  '42501',
  'anon no lee consentimientos'
);
select pg_temp.cns_expect_error(
  $q$insert into public.consents (type, version) values ('privacy', '2026-10-v1')$q$,
  '42501',
  'anon no crea consentimientos'
);

select set_config('role', 'postgres', true);

select 'OK: todas las pruebas de consents pasaron' as resultado;

rollback;
