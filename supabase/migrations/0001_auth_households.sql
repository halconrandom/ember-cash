-- =============================================================================
-- 0001_auth_households.sql
-- Perfiles de usuario, households (hogares compartidos), miembros e
-- invitaciones. Todo con RLS. Las operaciones que necesitan saltarse RLS de
-- forma controlada (crear household, aceptar invitación, listar miembros) se
-- hacen con funciones SECURITY DEFINER con search_path fijo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Constante: máximo de miembros por household. Para cambiarlo, edita el número
-- en una migración nueva con `create or replace function`.
-- -----------------------------------------------------------------------------
create or replace function public.max_household_members()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 2;
$$;

comment on function public.max_household_members() is
  'Máximo de miembros por household. Cambiar aquí y en ningún otro lugar.';

-- -----------------------------------------------------------------------------
-- profiles: un perfil por usuario de auth.users (mismo id).
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  display_currency text not null default 'COP' check (display_currency in ('COP', 'USD')),
  timezone text not null default 'America/Bogota',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  -- Momento en que el usuario terminó el onboarding. Null = todavía no lo hizo.
  -- Hace falta porque "Usar solo yo" no deja rastro en household_members.
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil y preferencias de cada usuario.';

-- Crea el perfil automáticamente cuando alguien se registra. Toma el nombre y
-- el avatar que entrega el proveedor (Google) o, si no hay, la parte local del
-- correo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        split_part(new.email, '@', 1)
      ),
      80
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- households, household_members, household_invites
-- -----------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Índice para buscar rápido los households de un usuario (lo usan las políticas).
create index household_members_user_id_idx on public.household_members (user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- SHA-256 en hexadecimal del token. El token en claro nunca se guarda.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Una invitación no puede durar más de 7 días.
  constraint household_invites_max_ttl check (expires_at <= created_at + interval '7 days'),
  -- used_by y used_at van juntos: o los dos vacíos o los dos llenos.
  constraint household_invites_used_pair check ((used_by is null) = (used_at is null))
);

create index household_invites_household_id_idx on public.household_invites (household_id);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares para las políticas. SECURITY DEFINER evita la recursión
-- (una política de household_members que consulte household_members).
-- -----------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

-- profiles: cada usuario ve y edita solo su perfil. El insert lo hace el trigger.
create policy "profiles: ver el propio"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: editar el propio"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- households: solo los miembros los ven. Se crean con create_household().
create policy "households: ver si soy miembro"
  on public.households for select to authenticated
  using ((select public.is_household_member(id)));

-- household_members: veo las filas de los households donde soy miembro.
-- Altas solo con create_household() y accept_invite().
create policy "household_members: ver los de mis households"
  on public.household_members for select to authenticated
  using ((select public.is_household_member(household_id)));

-- household_invites: solo el owner las ve y las crea.
create policy "household_invites: el owner las ve"
  on public.household_invites for select to authenticated
  using ((select public.is_household_owner(household_id)));

create policy "household_invites: el owner las crea"
  on public.household_invites for insert to authenticated
  with check (
    (select public.is_household_owner(household_id))
    and created_by = (select auth.uid())
    and used_by is null
    and used_at is null
  );

-- -----------------------------------------------------------------------------
-- Privilegios de columna. Supabase concede todo a anon y authenticated por
-- defecto; se recorta a lo mínimo para que RLS no sea la única barrera.
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.households, public.household_members,
  public.household_invites from anon;

revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, avatar_url, display_currency, timezone, theme, onboarded_at)
  on public.profiles to authenticated;

revoke insert, update, delete on public.households from authenticated;
revoke insert, update, delete on public.household_members from authenticated;

-- En invites el cliente solo puede elegir household y hash; el resto toma sus
-- valores por defecto (expires_at = ahora + 7 días, created_by = auth.uid()).
revoke insert, update, delete on public.household_invites from authenticated;
grant insert (household_id, token_hash) on public.household_invites to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: create_household(name)
-- Crea el household, agrega al usuario como owner y marca el onboarding como
-- terminado, todo en una sola transacción.
-- -----------------------------------------------------------------------------
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.households (name, created_by)
  values (trim(p_name), v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_uid, 'owner');

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now())
  where id = v_uid;

  return v_household_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: accept_invite(token)
-- Valida el token por su hash, comprueba que no esté usado ni vencido y que
-- el household tenga cupo, agrega al usuario como member y marca la
-- invitación como usada. Errores (en el mensaje):
--   not_authenticated, invite_invalid, invite_used, invite_expired,
--   already_member, household_full
-- -----------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.household_invites%rowtype;
  v_members integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Bloquea la fila de la invitación para que dos aceptaciones simultáneas
  -- no puedan usar el mismo token.
  select * into v_invite
  from public.household_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if v_invite.used_at is not null then
    raise exception 'invite_used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  -- Bloquea el household para contar miembros sin carreras.
  perform 1 from public.households where id = v_invite.household_id for update;

  if exists (
    select 1 from public.household_members
    where household_id = v_invite.household_id and user_id = v_uid
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  select count(*) into v_members
  from public.household_members
  where household_id = v_invite.household_id;

  if v_members >= public.max_household_members() then
    raise exception 'household_full' using errcode = 'P0001';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, v_uid, 'member');

  update public.household_invites
  set used_by = v_uid, used_at = now()
  where id = v_invite.id;

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now())
  where id = v_uid;

  return v_invite.household_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: get_household_members(hid)
-- Nombre y avatar de los miembros de un household del que soy parte. Así la
-- tabla profiles sigue mostrando solo el perfil propio.
-- -----------------------------------------------------------------------------
create or replace function public.get_household_members(hid uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.display_name, p.avatar_url, m.role, m.joined_at
  from public.household_members m
  join public.profiles p on p.id = m.user_id
  where m.household_id = hid
    and public.is_household_member(hid)
  order by m.joined_at;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución: nadie anónimo llama a estas funciones.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.handle_new_user(),
  public.is_household_member(uuid),
  public.is_household_owner(uuid),
  public.create_household(text),
  public.accept_invite(text),
  public.get_household_members(uuid)
from public, anon;

grant execute on function
  public.is_household_member(uuid),
  public.is_household_owner(uuid),
  public.create_household(text),
  public.accept_invite(text),
  public.get_household_members(uuid)
to authenticated;
