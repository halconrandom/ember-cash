-- =============================================================================
-- Límite al aceptar una invitación: 8 intentos por usuario cada 15 minutos.
--
-- accept_invite pasa a devolver jsonb. Si el token no sirve, la función NO
-- lanza una excepción: PostgREST haría rollback y el insert del intento
-- desaparecería, así que el límite no sobreviviría a la petición. El intento
-- queda guardado y la respuesta es { ok: false, error: "..." }.
-- Sin sesión sigue lanzando not_authenticated (no hay usuario que contar).
--
-- La tabla no tiene políticas ni grants para anon/authenticated. Con RLS
-- activo no pueden leerla. La función es security definer y escribe como dueña.
-- =============================================================================

create table public.invite_accept_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index invite_accept_attempts_user_attempted_idx
  on public.invite_accept_attempts (user_id, attempted_at desc);

alter table public.invite_accept_attempts enable row level security;

revoke all on table public.invite_accept_attempts from public, anon, authenticated;

-- Cambiar el tipo de retorno exige drop: create or replace no lo permite.
drop function public.accept_invite(text);

create function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.household_invites%rowtype;
  v_members integer;
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Serializa los intentos de esta persona para que dos peticiones a la vez
  -- no se salten el conteo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));

  delete from public.invite_accept_attempts
  where user_id = v_uid
    and attempted_at < now() - interval '1 day';

  select count(*) into v_recent
  from public.invite_accept_attempts
  where user_id = v_uid
    and attempted_at > now() - interval '15 minutes';

  -- El noveno intento no mira el token: no confirma si el enlace existe.
  if v_recent >= 8 then
    return jsonb_build_object('ok', false, 'error', 'invite_rate_limited');
  end if;

  insert into public.invite_accept_attempts (user_id) values (v_uid);

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
  if v_invite.expires_at <= now() then
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
  set used_by = v_uid, used_at = now()
  where id = v_invite.id;

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now())
  where id = v_uid;

  return jsonb_build_object('ok', true, 'household_id', v_invite.household_id);
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
