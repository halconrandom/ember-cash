-- =============================================================================
-- dashboard_totals (0022): un literal malicioso no se ejecuta.
--
-- La moneda que no está en currencies falla con unknown_display_currency
-- (22023) antes del EXECUTE. Una fecha inválida falla al castear el
-- argumento (22007 / 22008) y el cuerpo no corre. En los dos casos la tabla
-- temporal x sigue existiendo: el ejemplo "drop table x" no se ejecutó.
--
-- Se llama como el dueño de la sesión (security invoker). Si el drop hubiera
-- corrido con un nombre calificado, x desaparecería. 22023 (y no 42601 de
-- "varios comandos") distingue el rechazo del catálogo de un error de sintaxis
-- del SQL armado.
--
-- Todo en una transacción con ROLLBACK (pnpm test:rls). Prefijo dtg_.
-- =============================================================================
begin;

reset role;
-- Sin sesión previa: en test:db:fresh el JWT de otro archivo seguiría activo.
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- Canario. Temporal para no dejar una tabla en public sin RLS.
create temp table x (id integer primary key);
insert into x (id) values (1);

-- Si el texto de la moneda se concatenara dentro del WHERE, esta función
-- correría como parte de la misma sentencia y marcaría el canario.
create function pg_temp.dtg_touched() returns boolean
language plpgsql as $$
begin
  update x set id = 2 where id = 1;
  return true;
end $$;

create function pg_temp.dtg_expect(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FALLO: %', label;
  end if;
end $$;

-- Falla si la sentencia no da el sqlstate esperado, o si además se exigió
-- un mensaje y no coincide (los mensajes propios no dependen del idioma del
-- servidor; los de Postgres se comparan solo por sqlstate).
create function pg_temp.dtg_expect_error(stmt text, expected text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected and sqlerrm <> expected then
      raise exception 'FALLO: % (esperaba %, obtuvo % "%")', label, expected, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$;

-- La función viva: invoker, search_path vacío, sin parámetro de usuario.
do $$
declare
  fn record;
  n integer;
begin
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'dashboard_totals';
  if n <> 1 then
    raise exception 'FALLO: se esperaba una sola dashboard_totals y hay %', n;
  end if;

  select p.prosecdef, p.proconfig, p.prosrc,
    pg_get_function_identity_arguments(p.oid) as identity_args
    into fn
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'dashboard_totals';

  if fn.prosecdef then
    raise exception 'FALLO: dashboard_totals es security definer';
  end if;
  if not exists (
    select 1 from unnest(fn.proconfig) cfg
    where cfg like 'search_path=%'
      and cfg not like '%public%'
      and cfg not like '%pg_catalog%'
  ) then
    raise exception 'FALLO: search_path no está fijo y vacío (%)', fn.proconfig;
  end if;
  -- proargnames también trae las columnas de returns table. La identidad
  -- son solo las entradas: no hay un id de usuario.
  if fn.identity_args is distinct from
    'p_household_id uuid, p_from date, p_to date, p_display_currency text'
  then
    raise exception 'FALLO: la firma no es la esperada (%)', fn.identity_args;
  end if;
  if position('auth.uid()' in fn.prosrc) = 0 then
    raise exception 'FALLO: el usuario no sale de auth.uid()';
  end if;
  if position('||' in fn.prosrc) > 0 then
    raise exception 'FALLO: el cuerpo concatena SQL';
  end if;
  if position('format(' in fn.prosrc) = 0 or position('%L' in fn.prosrc) = 0 then
    raise exception 'FALLO: los literales no pasan por format y por ciento L';
  end if;
  if position('public.currencies' in fn.prosrc) = 0 then
    raise exception 'FALLO: la moneda no se contrasta con el catálogo';
  end if;
  if position('::date' in fn.prosrc) = 0 then
    raise exception 'FALLO: las fechas no se castean a date';
  end if;
end $$;

-- Moneda: el ejemplo de inyección y un payload de una sola sentencia.
select pg_temp.dtg_expect_error(
  $q$select * from public.dashboard_totals(null, '2026-10-01', '2026-10-31', $c$USD'); drop table x;--$c$)$q$,
  'unknown_display_currency',
  'moneda con drop table no se ejecuta');
select pg_temp.dtg_expect(
  (select id from x) = 1,
  'x sigue después de USD''); drop table x');

select pg_temp.dtg_expect_error(
  $q$select * from public.dashboard_totals(null, '2026-10-01', '2026-10-31', $c$USD'); drop table pg_temp.x;--$c$)$q$,
  '22023',
  'moneda con drop calificado no se ejecuta');
select pg_temp.dtg_expect(to_regclass('pg_temp.x') is not null, 'pg_temp.x sigue');

select pg_temp.dtg_expect_error(
  $q$select * from public.dashboard_totals(null, '2026-10-01', '2026-10-31', $c$X' OR pg_temp.dtg_touched() OR '$c$)$q$,
  '22023',
  'moneda que invocaría dtg_touched no se ejecuta');
select pg_temp.dtg_expect((select id from x) = 1, 'dtg_touched no marcó el canario');

-- Fechas: el cast del argumento falla y el cuerpo no corre.
select pg_temp.dtg_expect_error(
  $q$select * from public.dashboard_totals(null, '2026-13-40', '2026-10-31', 'COP')$q$,
  '22008',
  'fecha imposible');
select pg_temp.dtg_expect_error(
  $q$select * from public.dashboard_totals(null, 'no-es-fecha', '2026-10-31', 'COP')$q$,
  '22007',
  'fecha que no es fecha');
select pg_temp.dtg_expect_error(
  $q$select * from public.dashboard_totals(null, $d$2026-10-01'); drop table x;--$d$, '2026-10-31', 'COP')$q$,
  '22007',
  'fecha con drop table no se ejecuta');
select pg_temp.dtg_expect((select id from x) = 1, 'x sigue después de la fecha maliciosa');

-- El hogar también es un tipo: un texto no es un uuid y no entra al cuerpo.
select pg_temp.dtg_expect_error(
  $q$select * from public.dashboard_totals($u$no-es-uuid'); drop table x;--$u$, '2026-10-01', '2026-10-31', 'COP')$q$,
  '22P02',
  'hogar con drop table no se ejecuta');
select pg_temp.dtg_expect((select id from x) = 1, 'x sigue después del hogar malicioso');

-- Una moneda del catálogo sigue respondiendo (sin filas: este archivo no carga movimientos).
select pg_temp.dtg_expect(
  (select count(*) from public.dashboard_totals(null, '2026-10-01', '2026-10-31', 'COP')) = 0,
  'COP del catálogo sigue respondiendo');
select pg_temp.dtg_expect((select id from x) = 1, 'la llamada válida no tocó el canario');

drop table x;

reset role;

select 'OK: dashboard_totals rechaza moneda y fechas maliciosas sin ejecutarlas' as resultado;

rollback;
