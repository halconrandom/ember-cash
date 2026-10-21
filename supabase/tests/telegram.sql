-- =============================================================================
-- Bot de Telegram (0026). Códigos de un solo uso, límite por telegram_user_id
-- y aislamiento: un chat no escribe en el hogar de otra persona.
-- Todo en una transacción con ROLLBACK. Ayudas con prefijo tlg_.
-- =============================================================================
begin;

create function pg_temp.tlg_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end $$;

-- El webhook entra como service_role y sin JWT.
create function pg_temp.tlg_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.tlg_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.tlg_expect_error(stmt text, expected text, label text) returns void
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

create function pg_temp.tlg_expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLO: %', label; end if;
end $$;

select pg_temp.tlg_postgres();

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c026-00000000000a', 'authenticated', 'authenticated', 'tlg-a@test.local', '{}', '{}'),
  ('00000000-0000-4000-c026-00000000000b', 'authenticated', 'authenticated', 'tlg-b@test.local', '{}', '{}'),
  ('00000000-0000-4000-c026-00000000000c', 'authenticated', 'authenticated', 'tlg-c@test.local', '{}', '{}');

select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000a');
select set_config('test.tlg_h', public.create_household('Casa TLG')::text, true);
insert into public.accounts (id, name, type, currency) values
  ('00000000-0000-4000-c026-0000000000a1', 'Ahorros', 'savings', 'COP');
insert into public.accounts (id, household_id, name, type, currency) values
  ('00000000-0000-4000-c026-0000000000a2', current_setting('test.tlg_h')::uuid, 'Casa', 'checking', 'COP');

select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000b');
insert into public.accounts (id, name, type, currency) values
  ('00000000-0000-4000-c026-0000000000b1', 'Bolsillo', 'cash', 'COP');

-- C comparte el hogar de A. El bot no debe devolver su id.
select pg_temp.tlg_postgres();
insert into public.household_members (household_id, user_id, role)
values (current_setting('test.tlg_h')::uuid, '00000000-0000-4000-c026-00000000000c', 'member');

-- -----------------------------------------------------------------------------
-- El cliente no escribe vínculos, códigos ni borradores
-- -----------------------------------------------------------------------------
select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000a');
select pg_temp.tlg_expect_error($q$
  insert into public.telegram_links (user_id, telegram_user_id, chat_id)
  values ('00000000-0000-4000-c026-00000000000a', 1001, 1001)
$q$, '42501', 'el cliente no inserta un vínculo');

select pg_temp.tlg_expect_error($q$
  insert into public.telegram_link_codes (code, user_id, expires_at)
  values (encode(sha256(convert_to('tlg', 'UTF8')), 'hex'), '00000000-0000-4000-c026-00000000000a', now())
$q$, '42501', 'el cliente no inserta un código');

select pg_temp.tlg_expect_error(
  'select * from public.telegram_drafts',
  '42501',
  'el cliente no lee borradores'
);

select pg_temp.tlg_expect_error(
  'update public.telegram_links set chat_id = 1',
  '42501',
  'el cliente no edita un vínculo'
);

select set_config('role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select pg_temp.tlg_expect_error(
  'select public.create_telegram_link_code()',
  '42501',
  'anon no genera códigos'
);

-- -----------------------------------------------------------------------------
-- Código vencido, reusado y de otra persona
-- -----------------------------------------------------------------------------
select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000a');
select set_config('test.tlg_code', public.create_telegram_link_code(), true);

select pg_temp.tlg_postgres();
update public.telegram_link_codes
set expires_at = pg_catalog.now() - interval '1 minute'
where code = current_setting('test.tlg_code');

select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_link_with_code(3003, 3003, current_setting('test.tlg_code'))::text,
  true
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'error') = 'expired',
  'un código vencido no vincula'
);
select pg_temp.tlg_expect(
  (select count(*) = 0 from public.telegram_links where telegram_user_id = 3003),
  'un código vencido no crea fila'
);
select pg_temp.tlg_expect(
  (select used_at is null from public.telegram_link_codes where code = current_setting('test.tlg_code')),
  'un código vencido sigue sin consumirse'
);

select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000a');
select set_config('test.tlg_code', public.create_telegram_link_code(), true);
select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_link_with_code(1001, 1001, current_setting('test.tlg_code'))::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'ok')::boolean,
  'el primer /start vincula'
);
select set_config(
  'test.tlg_res',
  public.telegram_link_with_code(1001, 1001, current_setting('test.tlg_code'))::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'error') = 'used',
  'el mismo código no vincula dos veces'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select count(*) = 1 from public.telegram_links where user_id = '00000000-0000-4000-c026-00000000000a'),
  'A queda con un solo vínculo'
);

select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000b');
select set_config('test.tlg_code_b', public.create_telegram_link_code(), true);
select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_link_with_code(1001, 1001, current_setting('test.tlg_code_b'))::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'error') = 'taken',
  'un Telegram ya vinculado no se lleva el código de otra persona'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select used_at is null from public.telegram_link_codes where code = current_setting('test.tlg_code_b')),
  'el intento ajeno no consume el código'
);
select pg_temp.tlg_expect(
  (select user_id = '00000000-0000-4000-c026-00000000000a' from public.telegram_links where telegram_user_id = 1001),
  'el vínculo de A sigue igual'
);

select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_link_with_code(2002, 2002, current_setting('test.tlg_code_b'))::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'ok')::boolean,
  'B vincula su propio código'
);

-- B no ve el vínculo ni los códigos de A, y no los borra.
select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000b');
select pg_temp.tlg_expect(
  (select count(*) = 1 and bool_and(user_id = '00000000-0000-4000-c026-00000000000b') from public.telegram_links),
  'B solo ve su vínculo'
);
select pg_temp.tlg_expect(
  (select count(*) = 0 from public.telegram_link_codes
   where user_id = '00000000-0000-4000-c026-00000000000a'),
  'B no ve los códigos de A'
);
delete from public.telegram_links where user_id = '00000000-0000-4000-c026-00000000000a';
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select count(*) = 1 from public.telegram_links where user_id = '00000000-0000-4000-c026-00000000000a'),
  'B no borra el vínculo de A'
);

-- -----------------------------------------------------------------------------
-- 30 mensajes cada 10 minutos, por telegram_user_id, sin sesión
-- -----------------------------------------------------------------------------
select pg_temp.tlg_service();
select pg_temp.tlg_expect_error(
  $q$select public.consume_rate_limit('write', 9001)$q$,
  '22023',
  'la sobrecarga no acepta la acción write'
);

do $do$
declare
  i integer;
  v jsonb;
begin
  for i in 1..30 loop
    v := public.consume_rate_limit('telegram', 9001);
    if coalesce((v ->> 'allowed')::boolean, false) is not true then
      raise exception 'FALLO: el mensaje % debía entrar', i;
    end if;
  end loop;
  v := public.consume_rate_limit('telegram', 9001);
  if coalesce((v ->> 'allowed')::boolean, false) then
    raise exception 'FALLO: el mensaje 31 debía bloquearse';
  end if;
  if coalesce((v ->> 'retry_after')::integer, 0) < 1 then
    raise exception 'FALLO: el bloqueo no dice cuándo reintentar';
  end if;
  v := public.consume_rate_limit('telegram', 9002);
  if coalesce((v ->> 'allowed')::boolean, false) is not true then
    raise exception 'FALLO: otro telegram_user_id no comparte el cupo';
  end if;
end
$do$;

select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000a');
select pg_temp.tlg_expect_error(
  $q$select public.consume_rate_limit('telegram', 9001)$q$,
  '42501',
  'authenticated no cuenta el límite de Telegram'
);
select pg_temp.tlg_expect(
  (public.consume_rate_limit('write') ->> 'allowed')::boolean,
  'el límite de la app sigue contando por usuario'
);

-- -----------------------------------------------------------------------------
-- Contexto sin saldos ni otros miembros. Aislamiento del hogar.
-- -----------------------------------------------------------------------------
select pg_temp.tlg_service();
select pg_temp.tlg_expect(
  (public.telegram_context(424242) ->> 'linked') = 'false',
  'un telegram sin vínculo no recibe datos'
);
select set_config('test.tlg_ctx', public.telegram_context(1001)::text, true);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  position('00000000-0000-4000-c026-00000000000c' in current_setting('test.tlg_ctx')) = 0
    and position('balance' in current_setting('test.tlg_ctx')) = 0
    and position('tlg-c@test.local' in current_setting('test.tlg_ctx')) = 0
    and (current_setting('test.tlg_ctx')::jsonb ->> 'linked') = 'true'
    and (current_setting('test.tlg_ctx')::jsonb ->> 'has_account') = 'true'
    and (current_setting('test.tlg_ctx')::jsonb ->> 'last_currency') = 'COP',
  'el contexto no trae saldos ni datos de otros miembros'
);

select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_put_draft(2002, 2002, 'expense', 5000, 'COP', 'food', 'Ajeno',
    '00000000-0000-4000-c026-0000000000a2')::text,
  true
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'error') = 'account_forbidden',
  'B no prepara un gasto en la cuenta del hogar de A'
);
select pg_temp.tlg_expect(
  (select count(*) = 0 from public.transactions where description = 'Ajeno'),
  'ese rechazo no escribe movimiento'
);

select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_put_draft(2002, 2002, 'expense', 5000, 'COP', 'food', 'Ajeno',
    '00000000-0000-4000-c026-0000000000a1')::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'error') = 'account_forbidden',
  'B no prepara un gasto en la cuenta personal de A'
);

select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_put_draft(2002, 2002, 'expense', 100, 'ARS', 'food', 'peso', null)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'error') = 'currency_disabled',
  'una moneda que B no tiene activa no se guarda'
);

-- Aunque alguien inserte el borrador a mano, guardarlo no cruza de hogar.
select pg_temp.tlg_postgres();
insert into public.telegram_drafts (
  id, telegram_user_id, chat_id, user_id, kind, amount_minor, currency,
  category_key, description, account_id, occurred_on, expires_at
) values (
  '00000000-0000-4000-c026-0000000000d1',
  2002, 2002, '00000000-0000-4000-c026-00000000000b',
  'expense', 1000, 'COP', 'food', 'Forzado',
  '00000000-0000-4000-c026-0000000000a2',
  (pg_catalog.now() at time zone 'America/Bogota')::date,
  pg_catalog.now() + interval '15 minutes'
);
select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_commit_draft(2002, '00000000-0000-4000-c026-0000000000d1')::text,
  true
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'error') = 'account_forbidden',
  'guardar un borrador ajeno no escribe en el hogar de A'
);
select pg_temp.tlg_expect(
  (select count(*) = 0 from public.transactions where description = 'Forzado'),
  'el hogar de A sigue sin ese movimiento'
);

-- La cuenta por defecto de A es la personal. La del hogar solo si la pide.
select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_put_draft(1001, 1001, 'expense', 100, 'COP', 'other', 'mio', null)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'account_name') = 'Ahorros',
  'la cuenta por defecto es la personal'
);
select public.telegram_cancel_draft(1001, (current_setting('test.tlg_res')::jsonb ->> 'draft_id')::uuid);

select set_config(
  'test.tlg_res',
  public.telegram_put_draft(1001, 1001, 'expense', 1000, 'COP', 'food', 'Casa',
    '00000000-0000-4000-c026-0000000000a2')::text,
  true
);
select set_config(
  'test.tlg_commit',
  public.telegram_commit_draft(1001, (current_setting('test.tlg_res')::jsonb ->> 'draft_id')::uuid)::text,
  true
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (current_setting('test.tlg_commit')::jsonb ->> 'ok')::boolean
    and position('00000000-0000-4000-c026-00000000000c' in current_setting('test.tlg_commit')) = 0,
  'guardar en el hogar propio no devuelve al otro miembro'
);
select pg_temp.tlg_expect(
  (select household_id = current_setting('test.tlg_h')::uuid and owner_id = '00000000-0000-4000-c026-00000000000a'
   from public.transactions where description = 'Casa' and deleted_at is null),
  'el movimiento del hogar queda en el hogar de A y a su nombre'
);
select pg_temp.tlg_expect(
  (select count(*) = 2 and sum(share_minor) = 1000
   from public.transaction_splits s
   join public.transactions t on t.id = s.transaction_id
   where t.description = 'Casa' and t.deleted_at is null),
  'el reparto del hogar lo hace save_transaction'
);

-- B guarda en su cuenta personal, dos veces el mismo borrador, y deshace solo eso.
select pg_temp.tlg_service();
select set_config(
  'test.tlg_res',
  public.telegram_put_draft(2002, 2002, 'expense', 25000, 'COP', 'food', 'mercado', null)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_res')::jsonb ->> 'account_name') = 'Bolsillo'
    and (current_setting('test.tlg_res')::jsonb ->> 'amount_minor') = '25000',
  'el borrador de B usa su cuenta y el monto'
);
select set_config('test.tlg_draft', current_setting('test.tlg_res')::jsonb ->> 'draft_id', true);
select public.telegram_commit_draft(2002, current_setting('test.tlg_draft')::uuid);
select set_config(
  'test.tlg_commit',
  public.telegram_commit_draft(2002, current_setting('test.tlg_draft')::uuid)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_commit')::jsonb ->> 'already')::boolean,
  'guardar otra vez no duplica'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select count(*) = 1
     and bool_and(owner_id = '00000000-0000-4000-c026-00000000000b')
     and bool_and(household_id is null)
     and bool_and(amount_minor = 25000)
     and bool_and(category_key = 'food')
   from public.transactions
   where description = 'mercado' and deleted_at is null),
  'el movimiento personal queda solo a nombre de B'
);

select pg_temp.tlg_service();
select pg_temp.tlg_expect(
  (public.telegram_undo(2002) ->> 'ok')::boolean,
  'deshacer borra el último del bot'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select deleted_at is not null from public.transactions where description = 'mercado'),
  'el movimiento de B queda en borrado suave'
);
select pg_temp.tlg_expect(
  (select count(*) = 0 from public.transactions
   where owner_id = '00000000-0000-4000-c026-00000000000a' and deleted_at is not null),
  'deshacer no toca los movimientos de A'
);
select pg_temp.tlg_service();
select pg_temp.tlg_expect(
  (public.telegram_undo(2002) ->> 'error') = 'nothing',
  'un segundo deshacer no encuentra nada en la ventana'
);

-- Borrador vencido: no se guarda.
select set_config(
  'test.tlg_res',
  public.telegram_put_draft(2002, 2002, 'income', 3000, 'COP', 'salary', 'salario', null)::text,
  true
);
select pg_temp.tlg_postgres();
update public.telegram_drafts
set expires_at = pg_catalog.now() - interval '1 minute'
where id = (current_setting('test.tlg_res')::jsonb ->> 'draft_id')::uuid;
select pg_temp.tlg_service();
select set_config(
  'test.tlg_commit',
  public.telegram_commit_draft(2002, (current_setting('test.tlg_res')::jsonb ->> 'draft_id')::uuid)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_commit')::jsonb ->> 'error') = 'expired',
  'un borrador vencido no se guarda'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select count(*) = 0 from public.transactions where description = 'salario'),
  'el ingreso vencido no existe'
);

-- -----------------------------------------------------------------------------
-- Permisos: definer, search_path, sin user_id, authenticated no ejecuta
-- -----------------------------------------------------------------------------
select pg_temp.tlg_expect(
  (
    select count(*) = 12
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
      and (
        p.proname in (
          'create_telegram_link_code',
          'telegram_link_with_code',
          'telegram_context',
          'telegram_put_draft',
          'telegram_commit_draft',
          'telegram_cancel_draft',
          'telegram_undo',
          'telegram_put_subscription_draft',
          'telegram_create_subscription',
          'telegram_due_occurrences',
          'telegram_put_occurrence_draft'
        )
        or (
          p.proname = 'consume_rate_limit'
          and pg_get_function_identity_arguments(p.oid) like '%telegram_user_id%'
        )
      )
  ),
  'las funciones del bot son security definer con search_path fijo'
);
-- p_telegram_user_id sí entra: es el id de Telegram, no el user_id de Ember.
-- telegram_create_subscription recibe p_owner (ya resuelto por el commit, no
-- el user_id del llamador), así que no cuenta como excepción a esta regla.
select pg_temp.tlg_expect(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proargnames, array[]::text[])) as arg(name)
    where n.nspname = 'public'
      and p.proname like 'telegram%'
      and arg.name in ('user_id', 'p_user_id')
  ),
  'ninguna función del bot recibe user_id'
);
select pg_temp.tlg_expect(
  has_function_privilege('authenticated', 'public.create_telegram_link_code()', 'execute')
    and not has_function_privilege('authenticated', 'public.telegram_commit_draft(bigint, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.telegram_put_draft(bigint, bigint, text, bigint, text, text, text, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.consume_rate_limit(text, bigint)', 'execute')
    and not has_function_privilege(
      'authenticated',
      'public.telegram_put_subscription_draft(bigint, bigint, text, bigint, text, text, integer)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated', 'public.telegram_create_subscription(uuid, text, bigint, text, text, date)', 'execute'
    )
    and not has_function_privilege('authenticated', 'public.telegram_due_occurrences(bigint)', 'execute')
    and not has_function_privilege(
      'authenticated', 'public.telegram_put_occurrence_draft(bigint, bigint, uuid)', 'execute'
    ),
  'authenticated solo puede pedir su código'
);

-- -----------------------------------------------------------------------------
-- Fase T3: comandos. Suscripción, "Marcar como pagado" y /deshacer de cada
-- uno. A comparte el hogar con C; D es ajeno a ambos.
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-c026-00000000000d', 'authenticated', 'authenticated', 'tlg-d@test.local', '{}', '{}');

select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000d');
insert into public.accounts (id, name, type, currency) values
  ('00000000-0000-4000-c026-0000000000d9', 'Cuenta D', 'savings', 'COP');
select set_config('test.tlg_code_d', public.create_telegram_link_code(), true);
select pg_temp.tlg_service();
select public.telegram_link_with_code(4004, 4004, current_setting('test.tlg_code_d'));

-- Suscripción: se crea con telegram_put_subscription_draft + commit, con la
-- categoría Suscripciones y sin cuenta ni hogar.
select pg_temp.tlg_service();
select set_config(
  'test.tlg_sub',
  public.telegram_put_subscription_draft(1001, 1001, 'Netflix', 44900, 'COP', 'monthly', 15)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_sub')::jsonb ->> 'name') = 'Netflix',
  'el borrador de suscripción guarda el nombre'
);
select set_config('test.tlg_sub_draft', current_setting('test.tlg_sub')::jsonb ->> 'draft_id', true);
select set_config(
  'test.tlg_sub_commit',
  public.telegram_commit_draft(1001, current_setting('test.tlg_sub_draft')::uuid)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_sub_commit')::jsonb ->> 'ok')::boolean,
  'confirmar la suscripción crea el recurrente'
);
select set_config(
  'test.tlg_sub_id', current_setting('test.tlg_sub_commit')::jsonb ->> 'created_id', true
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (
    select owner_id = '00000000-0000-4000-c026-00000000000a'
      and household_id is null
      and category_key = 'subscriptions'
      and amount_minor = 44900
      and frequency = 'monthly'
    from public.recurring_items
    where id = current_setting('test.tlg_sub_id')::uuid
  ),
  'la suscripción del bot es personal, con la categoría y el monto del borrador'
);

-- El día solo aplica a mensual: con anual, ni borrador.
select pg_temp.tlg_service();
select pg_temp.tlg_expect(
  (public.telegram_put_subscription_draft(1001, 1001, 'Revista', 10000, 'COP', 'yearly', 15) ->> 'error')
    = 'day_only_monthly',
  'un día con una frecuencia que no es mensual no deja borrador'
);

-- /deshacer de la suscripción recién creada: la borra entera.
select pg_temp.tlg_service();
select pg_temp.tlg_expect(
  (public.telegram_undo(1001) ->> 'ok')::boolean,
  'deshacer borra la suscripción recién creada'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  not exists (select 1 from public.recurring_items where id = current_setting('test.tlg_sub_id')::uuid),
  'la suscripción deshecha ya no existe'
);

-- Un vencimiento del hogar de A: C (su compañero de hogar) lo paga con
-- telegram_put_occurrence_draft + commit; D (ajeno) no lo ve.
select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000a');
with ins as (
  insert into public.recurring_items (
    owner_id, household_id, kind, name, category_key, amount_minor, currency,
    frequency, "interval", anchor_date, account_id, status
  ) values (
    '00000000-0000-4000-c026-00000000000a',
    current_setting('test.tlg_h')::uuid,
    'bill', 'Internet', 'subscriptions', 80000, 'COP',
    'monthly', 1, current_date, '00000000-0000-4000-c026-0000000000a2', 'active'
  ) returning id
)
select set_config('test.tlg_item', (select id::text from ins), true);
select pg_temp.tlg_postgres();
with ins as (
  insert into public.recurring_occurrences (recurring_item_id, due_on, status)
  values (current_setting('test.tlg_item')::uuid, current_date, 'overdue')
  returning id
)
select set_config('test.tlg_occ', (select id::text from ins), true);

-- D no ve ni paga un cobro de un hogar ajeno.
select pg_temp.tlg_service();
select pg_temp.tlg_expect(
  (public.telegram_due_occurrences(4004) ->> 'items') = '[]',
  'D no ve cobros del hogar de A'
);
select pg_temp.tlg_expect(
  (public.telegram_put_occurrence_draft(4004, 4004, current_setting('test.tlg_occ')::uuid) ->> 'error')
    = 'not_found',
  'D no prepara el pago de un cobro ajeno'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select status from public.recurring_occurrences where id = current_setting('test.tlg_occ')::uuid) = 'overdue',
  'el intento ajeno no cambia el estado del vencimiento'
);

-- C, que comparte el hogar, sí lo ve y lo paga (con su propio vínculo,
-- distinto del de B).
select pg_temp.tlg_login('00000000-0000-4000-c026-00000000000c');
select set_config('test.tlg_code_c', public.create_telegram_link_code(), true);
select pg_temp.tlg_service();
select public.telegram_link_with_code(6006, 6006, current_setting('test.tlg_code_c'));
select pg_temp.tlg_expect(
  jsonb_array_length((public.telegram_due_occurrences(6006) ->> 'items')::jsonb) = 1,
  'C ve el cobro del hogar que comparte con A'
);
select set_config(
  'test.tlg_occ_draft',
  (
    public.telegram_put_occurrence_draft(6006, 6006, current_setting('test.tlg_occ')::uuid) ->> 'draft_id'
  ),
  true
);
select set_config(
  'test.tlg_occ_commit',
  public.telegram_commit_draft(6006, current_setting('test.tlg_occ_draft')::uuid)::text,
  true
);
select pg_temp.tlg_expect(
  (current_setting('test.tlg_occ_commit')::jsonb ->> 'ok')::boolean,
  'C marca como pagado el cobro del hogar'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select status = 'paid' from public.recurring_occurrences where id = current_setting('test.tlg_occ')::uuid),
  'el vencimiento queda pagado'
);
select pg_temp.tlg_expect(
  (
    select count(*) = 1 and bool_and(household_id = current_setting('test.tlg_h')::uuid)
    from public.transactions
    where description = 'Internet' and deleted_at is null
  ),
  'el pago queda en el hogar, no solo a nombre de C'
);

-- /deshacer de C revierte el vencimiento a vencida y borra la transacción.
select pg_temp.tlg_service();
select pg_temp.tlg_expect(
  (public.telegram_undo(6006) ->> 'ok')::boolean,
  'C deshace el pago que acaba de hacer'
);
select pg_temp.tlg_postgres();
select pg_temp.tlg_expect(
  (select status from public.recurring_occurrences where id = current_setting('test.tlg_occ')::uuid) = 'overdue',
  'el vencimiento vuelve a vencida'
);
select pg_temp.tlg_expect(
  (
    select deleted_at is not null from public.transactions
    where description = 'Internet' and household_id = current_setting('test.tlg_h')::uuid
  ),
  'la transacción del pago deshecho queda en borrado suave'
);

delete from public.recurring_items where id = current_setting('test.tlg_item')::uuid;
delete from public.accounts where id = '00000000-0000-4000-c026-0000000000d9';
delete from auth.users where id = '00000000-0000-4000-c026-00000000000d';

select pg_temp.tlg_postgres();
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

delete from public.telegram_drafts
where user_id in (
  '00000000-0000-4000-c026-00000000000a',
  '00000000-0000-4000-c026-00000000000b',
  '00000000-0000-4000-c026-00000000000c'
);
delete from public.transaction_splits
where transaction_id in (
  select id from public.transactions
  where owner_id in (
    '00000000-0000-4000-c026-00000000000a',
    '00000000-0000-4000-c026-00000000000b',
    '00000000-0000-4000-c026-00000000000c'
  )
);
delete from public.transactions
where owner_id in (
  '00000000-0000-4000-c026-00000000000a',
  '00000000-0000-4000-c026-00000000000b',
  '00000000-0000-4000-c026-00000000000c'
);
delete from public.accounts
where owner_id in (
  '00000000-0000-4000-c026-00000000000a',
  '00000000-0000-4000-c026-00000000000b',
  '00000000-0000-4000-c026-00000000000c'
);
delete from public.rate_limits
where user_id in (
  '00000000-0000-4000-c026-00000000000a',
  '00000000-0000-4000-c026-00000000000b',
  '00000000-0000-4000-c026-00000000000c'
) or telegram_user_id in (1001, 2002, 3003, 4004, 6006, 9001, 9002);
delete from public.households
where created_by = '00000000-0000-4000-c026-00000000000a';
delete from auth.users
where id in (
  '00000000-0000-4000-c026-00000000000a',
  '00000000-0000-4000-c026-00000000000b',
  '00000000-0000-4000-c026-00000000000c'
);

select 'OK: el bot vincula con código, limita y no escribe en otro hogar' as resultado;

rollback;
