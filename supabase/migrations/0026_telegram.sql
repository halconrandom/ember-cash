-- =============================================================================
-- Bot de Telegram (fase T1). Sin cola ni Redis: el webhook de Vercel habla
-- con Postgres y estas funciones.
--
-- telegram_links: un usuario de Ember, un usuario de Telegram. Cada quien ve
-- y borra solo su fila. No hay política de insert ni de update: vincular lo
-- hace el bot.
-- telegram_link_codes: un código de un solo uso, 10 minutos. El cliente no
-- lo escribe; lo crea create_telegram_link_code() con auth.uid().
-- telegram_drafts: el texto parseado, 15 minutos, hasta que pulsan Guardar.
-- Sin políticas y sin permisos para anon, authenticated ni service_role: ni
-- el navegador ni un .from() del webhook leen o escriben la tabla. Solo las
-- funciones (security definer, dueñas de la tabla) la tocan.
--
-- Esas funciones reciben el telegram_user_id y resuelven dentro el user_id
-- y el hogar de la cuenta. Ninguna acepta un user_id del llamador.
-- consume_rate_limit(text) sigue contando por auth.uid() (0015). El webhook
-- no tiene sesión, así que la sobrecarga (text, bigint) cuenta 30 mensajes
-- cada 10 minutos por telegram_user_id, también si todavía no está vinculado.
-- Solo service_role puede llamarla: authenticated no gasta el cupo de otro.
-- El user_id de rate_limits queda nulo únicamente en esas filas.
-- =============================================================================

alter table public.rate_limits
  alter column user_id drop not null;

alter table public.rate_limits
  add column telegram_user_id bigint;

alter table public.rate_limits
  add constraint rate_limits_actor_check check (
    (user_id is not null and telegram_user_id is null)
    or (user_id is null and telegram_user_id is not null and action = 'telegram')
  );

create index rate_limits_telegram_action_attempted_idx
  on public.rate_limits (telegram_user_id, action, attempted_at desc)
  where telegram_user_id is not null;

-- 30 mensajes cada 10 minutos. Los números viven aquí, no en los argumentos.
create function public.consume_rate_limit(p_action text, p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := 30;
  v_window integer := 600;
  v_count integer;
  v_oldest timestamptz;
  v_retry integer;
begin
  if p_action is distinct from 'telegram' or p_telegram_user_id is null or p_telegram_user_id <= 0 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tg:', p_telegram_user_id::text), 0)
  );

  delete from public.rate_limits
  where telegram_user_id = p_telegram_user_id
    and action = 'telegram'
    and attempted_at < pg_catalog.now() - make_interval(secs => v_window);

  select count(*), min(attempted_at)
    into v_count, v_oldest
  from public.rate_limits
  where telegram_user_id = p_telegram_user_id
    and action = 'telegram';

  if v_count >= v_limit then
    v_retry := greatest(
      1,
      ceil(
        extract(epoch from (v_oldest + make_interval(secs => v_window) - pg_catalog.now()))
      )::integer
    );
    return jsonb_build_object('allowed', false, 'retry_after', v_retry);
  end if;

  insert into public.rate_limits (user_id, telegram_user_id, action)
  values (null, p_telegram_user_id, 'telegram');
  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

revoke all on function public.consume_rate_limit(text, bigint) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, bigint) to service_role;

create table public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_user_id bigint not null,
  chat_id bigint not null,
  linked_at timestamptz not null default pg_catalog.now(),
  constraint telegram_links_telegram_user_id_key unique (telegram_user_id),
  constraint telegram_links_telegram_user_positive check (telegram_user_id > 0)
);

create table public.telegram_link_codes (
  code text primary key check (code ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create index telegram_link_codes_user_idx on public.telegram_link_codes (user_id);

create table public.telegram_drafts (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  chat_id bigint not null,
  -- Lo escribe la función al resolver el vínculo. No lo manda el cliente.
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null references public.currencies (code),
  category_key text not null,
  description text not null check (char_length(trim(description)) between 1 and 200),
  account_id uuid not null references public.accounts (id) on delete cascade,
  occurred_on date not null,
  expires_at timestamptz not null,
  transaction_id uuid references public.transactions (id) on delete set null,
  saved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (category_key, kind) references public.categories (key, kind)
);

create index telegram_drafts_telegram_user_idx
  on public.telegram_drafts (telegram_user_id, created_at desc);

-- Un solo borrador sin guardar por chat de Telegram.
create unique index telegram_drafts_one_pending_idx
  on public.telegram_drafts (telegram_user_id)
  where transaction_id is null;

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_drafts enable row level security;

create policy "telegram_links: ver la mía"
  on public.telegram_links for select to authenticated
  using (user_id = (select auth.uid()));

create policy "telegram_links: desvincular"
  on public.telegram_links for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "telegram_link_codes: ver los míos"
  on public.telegram_link_codes for select to authenticated
  using (user_id = (select auth.uid()));

-- Sin insert ni update para el cliente. Los borradores no tienen políticas.
revoke all on table public.telegram_links from public, anon, authenticated, service_role;
grant select, delete on table public.telegram_links to authenticated;

revoke all on table public.telegram_link_codes from public, anon, authenticated, service_role;
grant select on table public.telegram_link_codes to authenticated;

revoke all on table public.telegram_drafts from public, anon, authenticated, service_role;

create trigger zz_rate_limit_write
  before insert or update or delete on public.telegram_links
  for each row execute function public.enforce_write_rate_limit();

create trigger zz_rate_limit_write
  before insert or update or delete on public.telegram_link_codes
  for each row execute function public.enforce_write_rate_limit();

create trigger zz_rate_limit_write
  before insert or update or delete on public.telegram_drafts
  for each row execute function public.enforce_write_rate_limit();

-- Código de 64 hex (cabe en el parámetro start de Telegram). Sale de auth.uid().
create function public.create_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  delete from public.telegram_link_codes
  where user_id = v_uid and used_at is null;

  v_code := encode(
    sha256(convert_to(concat(gen_random_uuid()::text, pg_catalog.clock_timestamp()::text), 'UTF8')),
    'hex'
  );

  insert into public.telegram_link_codes (code, user_id, expires_at)
  values (v_code, v_uid, pg_catalog.now() + interval '10 minutes');

  return v_code;
end;
$$;

revoke all on function public.create_telegram_link_code() from public, anon;
grant execute on function public.create_telegram_link_code() to authenticated;

-- Vincula y consume el código. No recibe user_id: lo trae el código.
create function public.telegram_link_with_code(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.telegram_link_codes%rowtype;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 or p_chat_id is null or p_code is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select * into v_code
  from public.telegram_link_codes
  where code = p_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_code.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'used');
  end if;
  if v_code.expires_at <= pg_catalog.now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- Este Telegram ya pertenece a otra persona: no se consume el código.
  if exists (
    select 1 from public.telegram_links l
    where l.telegram_user_id = p_telegram_user_id
      and l.user_id <> v_code.user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  delete from public.telegram_links where user_id = v_code.user_id;

  insert into public.telegram_links (user_id, telegram_user_id, chat_id)
  values (v_code.user_id, p_telegram_user_id, p_chat_id);

  update public.telegram_link_codes
  set used_at = pg_catalog.now()
  where code = p_code;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.telegram_link_with_code(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_link_with_code(bigint, bigint, text) to service_role;

-- Idioma, monedas y si hay cuenta personal. Sin saldos ni otros miembros.
create function public.telegram_context(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_locale text;
  v_tz text;
  v_display text;
  v_enabled text[];
  v_last text;
  v_has boolean;
begin
  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('linked', false);
  end if;

  select p.locale, p.timezone, p.display_currency, p.enabled_currencies
    into v_locale, v_tz, v_display, v_enabled
  from public.profiles p
  where p.id = v_uid;

  if v_locale is null then
    return jsonb_build_object('linked', false);
  end if;

  select t.currency into v_last
  from public.transactions t
  where t.owner_id = v_uid
    and t.deleted_at is null
    and t.kind in ('expense', 'income')
    and t.currency = any (v_enabled)
  order by t.created_at desc
  limit 1;

  if v_last is null then
    v_last := v_display;
  end if;

  select exists (
    select 1
    from public.accounts a
    where a.owner_id = v_uid
      and a.household_id is null
      and a.archived_at is null
  ) into v_has;

  return jsonb_build_object(
    'linked', true,
    'locale', v_locale,
    'timezone', v_tz,
    'display_currency', v_display,
    'enabled_currencies', to_jsonb(v_enabled),
    'last_currency', v_last,
    'has_account', v_has
  );
end;
$$;

revoke all on function public.telegram_context(bigint) from public, anon, authenticated;
grant execute on function public.telegram_context(bigint) to service_role;

-- Cuenta usable por ese usuario: personal suya, o de un hogar del que es miembro.
-- Una cuenta de otro hogar, o personal de otra persona, no entra.
create function public.telegram_put_draft(
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_kind text,
  p_amount_minor bigint,
  p_currency text,
  p_category_key text,
  p_description text,
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_tz text;
  v_enabled text[];
  v_description text;
  v_account_id uuid;
  v_account_name text;
  v_today date;
  v_id uuid;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select p.timezone, p.enabled_currencies into v_tz, v_enabled
  from public.profiles p
  where p.id = v_uid;

  if v_tz is null or v_enabled is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  if p_kind not in ('expense', 'income')
     or p_amount_minor is null
     or p_amount_minor <= 0
     or p_currency is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if not (p_currency = any (v_enabled)) then
    return jsonb_build_object('ok', false, 'error', 'currency_disabled');
  end if;

  if not exists (
    select 1 from public.categories c
    where c.key = p_category_key and c.kind = p_kind
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  v_description := pg_catalog.btrim(coalesce(p_description, ''));
  if pg_catalog.char_length(v_description) < 1 or pg_catalog.char_length(v_description) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if p_account_id is null then
    select a.id, a.name into v_account_id, v_account_name
    from public.accounts a
    left join lateral (
      select max(t.created_at) as last_used
      from public.transactions t
      where t.account_id = a.id
        and t.owner_id = v_uid
        and t.deleted_at is null
        and t.kind in ('expense', 'income')
    ) u on true
    where a.owner_id = v_uid
      and a.household_id is null
      and a.archived_at is null
    order by u.last_used desc nulls last, a.name asc
    limit 1;
    if v_account_id is null then
      return jsonb_build_object('ok', false, 'error', 'no_account');
    end if;
  else
    select a.id, a.name into v_account_id, v_account_name
    from public.accounts a
    where a.id = p_account_id
      and a.archived_at is null
      and (
        (a.household_id is null and a.owner_id = v_uid)
        or (
          a.household_id is not null
          and exists (
            select 1 from public.household_members m
            where m.household_id = a.household_id
              and m.user_id = v_uid
          )
        )
      );
    if v_account_id is null then
      return jsonb_build_object('ok', false, 'error', 'account_forbidden');
    end if;
  end if;

  begin
    v_today := (pg_catalog.now() at time zone v_tz)::date;
  exception
    when invalid_parameter_value then
      v_today := (pg_catalog.now() at time zone 'America/Bogota')::date;
  end;

  delete from public.telegram_drafts
  where telegram_user_id = p_telegram_user_id
    and transaction_id is null;

  insert into public.telegram_drafts (
    telegram_user_id, chat_id, user_id, kind, amount_minor, currency,
    category_key, description, account_id, occurred_on, expires_at
  ) values (
    p_telegram_user_id, p_chat_id, v_uid, p_kind, p_amount_minor, p_currency,
    p_category_key, v_description, v_account_id, v_today,
    pg_catalog.now() + interval '15 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'draft_id', v_id,
    'kind', p_kind,
    'amount_minor', p_amount_minor::text,
    'currency', p_currency,
    'category_key', p_category_key,
    'description', v_description,
    'account_name', v_account_name,
    'occurred_on', v_today
  );
end;
$$;

revoke all on function public.telegram_put_draft(bigint, bigint, text, bigint, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.telegram_put_draft(bigint, bigint, text, bigint, text, text, text, uuid)
  to service_role;

-- Guarda el borrador con save_transaction, como la app. El user_id sale del
-- vínculo. La sesión del webhook no trae JWT: se fija aquí, en esta
-- transacción, para que owner_id quede en quien está vinculado.
create function public.telegram_commit_draft(
  p_telegram_user_id bigint,
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_draft public.telegram_drafts%rowtype;
  v_household uuid;
  v_tx uuid;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 or p_draft_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select * into v_draft
  from public.telegram_drafts
  where id = p_draft_id
    and telegram_user_id = p_telegram_user_id
  for update;

  if not found or v_draft.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_draft.transaction_id is not null then
    return jsonb_build_object('ok', true, 'transaction_id', v_draft.transaction_id, 'already', true);
  end if;

  if v_draft.expires_at <= pg_catalog.now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select a.household_id into v_household
  from public.accounts a
  where a.id = v_draft.account_id
    and a.archived_at is null
    and (
      (a.household_id is null and a.owner_id = v_uid)
      or (
        a.household_id is not null
        and exists (
          select 1 from public.household_members m
          where m.household_id = a.household_id
            and m.user_id = v_uid
        )
      )
    );

  if not found then
    return jsonb_build_object('ok', false, 'error', 'account_forbidden');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and v_draft.currency = any (p.enabled_currencies)
  ) then
    return jsonb_build_object('ok', false, 'error', 'currency_disabled');
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_uid::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );

  -- El update del borrador va en el mismo bloque: si el límite de escrituras
  -- lo rechaza, se deshace también el movimiento.
  begin
    v_tx := public.save_transaction(
      null,
      v_household,
      v_draft.account_id,
      v_draft.kind,
      v_draft.category_key,
      v_draft.description,
      null,
      v_draft.amount_minor,
      v_draft.currency,
      v_draft.occurred_on,
      v_uid,
      null
    );
    update public.telegram_drafts
    set transaction_id = v_tx, saved_at = pg_catalog.now()
    where id = v_draft.id;
  exception
    when others then
      if sqlerrm = 'rate_limited' then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
      end if;
      if sqlerrm = 'former_member_locked' then
        return jsonb_build_object('ok', false, 'error', 'account_forbidden');
      end if;
      raise;
  end;

  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'already', false);
end;
$$;

revoke all on function public.telegram_commit_draft(bigint, uuid) from public, anon, authenticated;
grant execute on function public.telegram_commit_draft(bigint, uuid) to service_role;

create function public.telegram_cancel_draft(
  p_telegram_user_id bigint,
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_tx uuid;
begin
  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select d.transaction_id into v_tx
  from public.telegram_drafts d
  where d.id = p_draft_id
    and d.telegram_user_id = p_telegram_user_id
    and d.user_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_tx is not null then
    return jsonb_build_object('ok', false, 'error', 'already_saved');
  end if;

  delete from public.telegram_drafts
  where id = p_draft_id
    and telegram_user_id = p_telegram_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.telegram_cancel_draft(bigint, uuid) from public, anon, authenticated;
grant execute on function public.telegram_cancel_draft(bigint, uuid) to service_role;

-- Borrado suave del último movimiento que creó este bot en los últimos 10 minutos.
-- No toca un movimiento escrito en la app: solo los que tienen borrador guardado.
create function public.telegram_undo(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_tx uuid;
  v_updated integer;
begin
  select l.user_id into v_uid
  from public.telegram_links l
  where l.telegram_user_id = p_telegram_user_id;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('tguser:', p_telegram_user_id::text), 0)
  );

  select d.transaction_id into v_tx
  from public.telegram_drafts d
  join public.transactions t on t.id = d.transaction_id
  where d.telegram_user_id = p_telegram_user_id
    and d.user_id = v_uid
    and d.saved_at >= pg_catalog.now() - interval '10 minutes'
    and t.owner_id = v_uid
    and t.deleted_at is null
  order by d.saved_at desc
  limit 1
  for update of t;

  if v_tx is null then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_uid::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );

  update public.transactions
  set deleted_at = pg_catalog.now()
  where id = v_tx
    and owner_id = v_uid
    and deleted_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.telegram_undo(bigint) from public, anon, authenticated;
grant execute on function public.telegram_undo(bigint) to service_role;
