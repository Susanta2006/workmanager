-- WorkManager: Supabase schema, row-level security, storage and the sign-up trigger.
-- Run the whole file once: Supabase Dashboard -> SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

-- Companies share this Supabase project but own separate rows through organization_id.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.shared_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
revoke all on public.shared_schema_migrations from public, anon, authenticated;

-- 1. Profiles: one row per auth user. Holds role and approval state.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'member' check (role in ('admin', 'leader', 'member')),
  account_status text not null default 'pending' check (account_status in ('pending', 'approved')),
  team_status text not null default 'active' check (team_status in ('active', 'inactive')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles
  add column if not exists is_available boolean not null default true;
alter table public.profiles
  add column if not exists registration_completed_at timestamptz;
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations (id) on delete restrict;

create table if not exists public.login_passcodes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  passcode_hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.auth_passcode_sessions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id text not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, session_id)
);
create table if not exists public.login_passcode_attempts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table public.login_passcodes enable row level security;
alter table public.auth_passcode_sessions enable row level security;
alter table public.login_passcode_attempts enable row level security;
revoke all on public.login_passcodes, public.auth_passcode_sessions, public.login_passcode_attempts
  from public, anon, authenticated;

create or replace function public.is_passcode_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.auth_passcode_sessions s
        where s.user_id = auth.uid()
          and s.session_id = (auth.jwt() ->> 'session_id')
          and s.expires_at > now()
     )
$$;
revoke all on function public.is_passcode_verified() from public, anon;
grant execute on function public.is_passcode_verified() to authenticated, service_role;

create or replace function public.set_login_passcode(
  p_user_id uuid,
  p_session_id text,
  p_passcode text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  inserted_count integer;
begin
  delete from public.auth_passcode_sessions where expires_at <= now();
  if p_passcode is null or length(p_passcode) > 128
     or p_passcode !~ '^[A-Za-z0-9]{6,}$'
     or p_passcode !~ '[A-Za-z]'
     or p_passcode !~ '[0-9]' then
    raise exception 'Passcode must contain at least six letters and digits.' using errcode = '22023';
  end if;
  insert into public.login_passcodes (user_id, passcode_hash)
  values (p_user_id, crypt(p_passcode, gen_salt('bf', 12)))
  on conflict (user_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return jsonb_build_object('ok', false); end if;

  insert into public.auth_passcode_sessions (user_id, session_id, expires_at)
  values (p_user_id, p_session_id, now() + interval '12 hours')
  on conflict (user_id, session_id) do update
    set verified_at = now(), expires_at = excluded.expires_at;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.verify_login_passcode(
  p_user_id uuid,
  p_session_id text,
  p_passcode text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  stored_hash text;
  attempt_count integer;
  started_at timestamptz;
  lock_until timestamptz;
begin
  delete from public.auth_passcode_sessions where expires_at <= now();
  select passcode_hash into stored_hash
    from public.login_passcodes where user_id = p_user_id;
  if stored_hash is null then
    return jsonb_build_object('verified', false);
  end if;

  insert into public.login_passcode_attempts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  select failure_count, window_started_at, locked_until
    into attempt_count, started_at, lock_until
    from public.login_passcode_attempts
   where user_id = p_user_id
   for update;
  if lock_until > now() then
    return jsonb_build_object('verified', false, 'locked_until', lock_until);
  end if;
  if started_at < now() - interval '15 minutes' then
    attempt_count := 0;
  end if;

  if p_passcode is not null and crypt(p_passcode, stored_hash) = stored_hash then
    update public.login_passcode_attempts
       set failure_count = 0, window_started_at = now(), locked_until = null
     where user_id = p_user_id;
    insert into public.auth_passcode_sessions (user_id, session_id, expires_at)
    values (p_user_id, p_session_id, now() + interval '12 hours')
    on conflict (user_id, session_id) do update
      set verified_at = now(), expires_at = excluded.expires_at;
    return jsonb_build_object('verified', true);
  end if;

  attempt_count := attempt_count + 1;
  lock_until := case when attempt_count >= 5 then now() + interval '15 minutes' else null end;
  update public.login_passcode_attempts
     set failure_count = attempt_count,
         window_started_at = case when started_at < now() - interval '15 minutes' then now() else started_at end,
         locked_until = lock_until
   where user_id = p_user_id;
  return jsonb_build_object('verified', false, 'locked_until', lock_until);
end $$;

create or replace function public.change_login_passcode(
  p_user_id uuid,
  p_session_id text,
  p_current_passcode text,
  p_new_passcode text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  result jsonb;
begin
  result := public.verify_login_passcode(p_user_id, p_session_id, p_current_passcode);
  if not coalesce((result ->> 'verified')::boolean, false) then return result; end if;
  if p_new_passcode is null or length(p_new_passcode) > 128
     or p_new_passcode !~ '^[A-Za-z0-9]{6,}$'
     or p_new_passcode !~ '[A-Za-z]'
     or p_new_passcode !~ '[0-9]' then
    raise exception 'Passcode must contain at least six letters and digits.' using errcode = '22023';
  end if;
  update public.login_passcodes
     set passcode_hash = crypt(p_new_passcode, gen_salt('bf', 12)), updated_at = now()
   where user_id = p_user_id;
  delete from public.auth_passcode_sessions where user_id = p_user_id;
  insert into public.auth_passcode_sessions (user_id, session_id, expires_at)
  values (p_user_id, p_session_id, now() + interval '12 hours');
  return jsonb_build_object('verified', true);
end $$;

create or replace function public.reset_login_passcode(
  p_user_id uuid,
  p_session_id text,
  p_new_passcode text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.auth_passcode_sessions where expires_at <= now();
  if p_new_passcode is null or length(p_new_passcode) > 128
     or p_new_passcode !~ '^[A-Za-z0-9]{6,}$'
     or p_new_passcode !~ '[A-Za-z]'
     or p_new_passcode !~ '[0-9]' then
    raise exception 'Passcode must contain at least six letters and digits.' using errcode = '22023';
  end if;
  insert into public.login_passcodes (user_id, passcode_hash)
  values (p_user_id, crypt(p_new_passcode, gen_salt('bf', 12)))
  on conflict (user_id) do update
    set passcode_hash = excluded.passcode_hash, updated_at = now();
  delete from public.login_passcode_attempts where user_id = p_user_id;
  delete from public.auth_passcode_sessions where user_id = p_user_id;
  insert into public.auth_passcode_sessions (user_id, session_id, expires_at)
  values (p_user_id, p_session_id, now() + interval '12 hours')
  on conflict (user_id, session_id) do update
    set verified_at = now(), expires_at = excluded.expires_at;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.set_login_passcode(uuid, text, text) from public, anon, authenticated;
revoke all on function public.verify_login_passcode(uuid, text, text) from public, anon, authenticated;
revoke all on function public.change_login_passcode(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reset_login_passcode(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_login_passcode(uuid, text, text) to service_role;
grant execute on function public.verify_login_passcode(uuid, text, text) to service_role;
grant execute on function public.change_login_passcode(uuid, text, text, text) to service_role;
grant execute on function public.reset_login_passcode(uuid, text, text) to service_role;

-- One Supabase project represents one company. The original admin is the immutable
-- authority for changes to later admin accounts.
create table if not exists public.workspace_control (
  workspace_key text primary key default 'default' check (workspace_key = 'default'),
  founding_admin_id uuid references public.profiles (id) on delete restrict,
  google_auth_migrated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.workspace_control
  add column if not exists organization_id uuid references public.organizations (id) on delete restrict;
alter table public.workspace_control
  add column if not exists google_auth_migrated_at timestamptz;
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'workspace_control'
       and column_name = 'organization_id' and is_nullable = 'YES'
  ) then
    insert into public.workspace_control (workspace_key)
    values ('default')
    on conflict (workspace_key) do nothing;
  end if;
end $$;
do $$
begin
  if exists (
    select 1 from public.workspace_control
     where workspace_key = 'default' and google_auth_migrated_at is null
  ) then
    update public.profiles
       set registration_completed_at = created_at
     where registration_completed_at is null;
    update public.workspace_control
       set google_auth_migrated_at = now()
     where workspace_key = 'default';
  end if;
end $$;
alter table public.workspace_control enable row level security;
revoke all on public.workspace_control from public, anon, authenticated;

-- 2. Records: every other entity (clients, projects, tasks, documents, payments, expenses,
--    notifications, activity logs, invitations, org settings) stored as entity name + jsonb.
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.records
  add column if not exists organization_id uuid references public.organizations (id) on delete restrict;
-- For databases created before this column existed:
alter table public.profiles add column if not exists must_change_password boolean not null default false;

create index if not exists records_entity_created_idx on public.records (entity, created_at desc);
create index if not exists records_data_idx on public.records using gin (data jsonb_path_ops);
create unique index if not exists records_notification_dedupe_idx
  on public.records ((data ->> 'dedupe_key'))
  where entity = 'Notification' and data ? 'dedupe_key';

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records
  for each row execute function public.touch_updated_at();

-- 3. Access helpers. Security definer so policies can read profiles without recursion.
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select account_status = 'approved' and team_status = 'active'
            and public.is_passcode_verified()
       from public.profiles where id = auth.uid()),
    false)
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('admin', 'leader') and account_status = 'approved' and team_status = 'active'
       from public.profiles where id = auth.uid()),
    false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' and account_status = 'approved' and team_status = 'active'
            and public.is_passcode_verified()
       from public.profiles where id = auth.uid()),
    false)
$$;

create or replace function public.is_leader_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.organization_id is not null
       and p.role in ('admin', 'leader')
       and p.account_status = 'approved'
       and p.team_status = 'active'
       and public.is_passcode_verified()
      from public.profiles p
     where p.id = auth.uid()
  ), false)
$$;

create or replace function public.is_founding_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.workspace_control c
        where c.workspace_key = 'default'
          and c.founding_admin_id = auth.uid()
     )
     and public.is_admin()
$$;
revoke all on function public.is_founding_admin() from public, anon, authenticated;

-- 4. Sign-up. Registrants may request admin or member; all accounts stay pending until
--    an existing admin approves them. Invitations never grant role or approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, account_status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'member', 'pending')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members cannot change their own role or approval state. Only admins can.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Trusted paths skip this check: server code (no user token, service role) and the
  -- complete_password_change() function below, which sets the internal flag.
  if auth.uid() is not null
     and not public.is_admin()
     and current_setting('app.profile_internal_update', true) is distinct from 'on'
     and (
       new.role is distinct from old.role
    or new.account_status is distinct from old.account_status
    or new.team_status is distinct from old.team_status
    or new.must_change_password is distinct from old.must_change_password
    or new.email is distinct from old.email) then
    raise exception 'Only an admin can change roles, approval or password requirements.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- A member clears their own "must change password" flag after choosing a new password.
create or replace function public.complete_password_change() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.profile_internal_update', 'on', true);
  update public.profiles set must_change_password = false where id = auth.uid();
end $$;
grant execute on function public.complete_password_change() to authenticated;

-- 5. Row-level security
alter table public.profiles enable row level security;
alter table public.records enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_approved());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

-- Admins and admins see everything. Members see clients, projects, tasks, documents, notifications and
-- org settings. Payments, expenses, invitations and the activity log are for admins and leaders.
-- Notifications are private to the address they name (blank means everyone on the team).
drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (
  public.is_manager()
  or (
    public.is_approved()
    and entity not in ('Invitation', 'Payment', 'Expense', 'ActivityLog')
    and (
      entity <> 'Notification'
      or coalesce(data ->> 'user_email', '') = ''
      or lower(data ->> 'user_email') = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (
  public.is_manager()
  or (public.is_approved() and entity in ('Client', 'Project', 'Task', 'Document', 'ActivityLog', 'Notification'))
);

drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (
    public.is_manager()
    or (public.is_approved() and entity in ('Client', 'Project', 'Task', 'Document', 'ActivityLog', 'Notification') and (
          entity <> 'Notification'
          or coalesce(data ->> 'user_email', '') = ''
          or lower(data ->> 'user_email') = lower(coalesce(auth.jwt() ->> 'email', ''))))
  )
  with check (
    public.is_manager()
    or (public.is_approved() and entity in ('Client', 'Project', 'Task', 'Document', 'ActivityLog', 'Notification'))
  );

drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using (
  public.is_manager()
  or (public.is_approved() and entity = 'Notification'
      and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
);

-- Atomic partial update used by the app (row-level security still applies): merges a JSON patch into one record's data.
create or replace function public.records_patch(p_id uuid, p_entity text, p_patch jsonb)
returns public.records
language sql security invoker set search_path = public as $$
  update public.records
     set data = data || coalesce(p_patch, '{}'::jsonb)
   where id = p_id and entity = p_entity
  returning *
$$;

-- Live updates for the in-app notification bell.
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object or undefined_object then
  null;
end $$;

-- 6. Storage buckets: private receipts and images, public logos and signatures.
insert into storage.buckets (id, name, public) values ('private-files', 'private-files', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('public-files', 'public-files', true)
  on conflict (id) do nothing;

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects for select to authenticated
  using (bucket_id = 'private-files' and public.is_approved());

drop policy if exists private_files_write on storage.objects;
create policy private_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'private-files' and public.is_approved());

drop policy if exists public_files_write on storage.objects;
create policy public_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'public-files' and public.is_manager());

-- 7. Activity log retention: each month's log is cleared on the 1st (UTC), keeping the current month.
--    Uses pg_cron, which Supabase provides. If it isn't enabled, the schedule is skipped with a notice;
--    enable it under Database → Extensions, then run this block again.
do $$
begin
  create extension if not exists pg_cron;
  delete from cron.job where jobname = 'purge-activity-logs';
  perform cron.schedule(
    'purge-activity-logs',
    '0 2 1 * *',
    $cmd$ delete from public.records
            where entity = 'ActivityLog'
              and created_at < date_trunc('month', now()) $cmd$
  );
exception when others then
  raise notice 'Activity log monthly clearing not scheduled: %', sqlerrm;
end $$;


-- ===== Roles: admin, leader, member =====
-- Existing workspaces: the old owner becomes admin. Safe to re-run.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'admin' where role = 'owner';
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'leader', 'member'));
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'workspace_control'
       and column_name = 'organization_id' and is_nullable = 'YES'
  ) then
    insert into public.workspace_control (workspace_key, founding_admin_id)
    select 'default', p.id
      from public.profiles p
     where p.role = 'admin'
       and p.account_status = 'approved'
       and p.team_status = 'active'
     order by p.created_at, p.id
     limit 1
    on conflict (workspace_key) do update
      set founding_admin_id = excluded.founding_admin_id
      where public.workspace_control.founding_admin_id is null;
  end if;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' and account_status = 'approved' and team_status = 'active'
            and public.is_passcode_verified()
       from public.profiles where id = auth.uid()),
    false)
$$;

create or replace function public.is_leader_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('admin', 'leader') and account_status = 'approved' and team_status = 'active'
            and public.is_passcode_verified()
       from public.profiles where id = auth.uid()),
    false)
$$;

-- Kept for existing policies and functions; means admin or leader.
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_leader_or_admin()
$$;

-- Members cannot change their own role or approval state. Only admins can.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  founding_id uuid;
  approved_admin_count bigint;
begin
  if auth.uid() is null
     or current_setting('app.profile_internal_update', true) = 'on' then
    return new;
  end if;

  if new.email is distinct from old.email then
    raise exception 'Update account email through the authentication provider.';
  end if;

  if auth.uid() is not null
     and new.is_available is distinct from old.is_available
     and old.id <> auth.uid() then
    raise exception 'Team members manage their own availability.';
  end if;

  if new.must_change_password is distinct from old.must_change_password then
    if not public.is_admin() then
      raise exception 'Only an admin can change password requirements.';
    end if;
    if old.role = 'admin' and not public.is_founding_admin() then
      raise exception 'Only the founding admin can change another admin password requirement.';
    end if;
  end if;

  if not public.is_admin() then
    if (to_jsonb(new) - array['full_name', 'is_available', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['full_name', 'is_available', 'updated_at'])
       or new.role is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.team_status is distinct from old.team_status then
      raise exception 'Members can update only their name and availability.';
    end if;
    return new;
  end if;

  select c.founding_admin_id into founding_id
    from public.workspace_control c
   where c.workspace_key = 'default';

  if old.account_status = 'pending'
     and new.account_status = 'approved'
     and not public.is_founding_admin() then
    raise exception 'Only the founding admin can approve pending registrations.';
  end if;
  if old.account_status = 'pending'
     and new.account_status = 'approved'
     and new.registration_completed_at is null then
    raise exception 'The user must complete Google registration before approval.';
  end if;

  if old.id = founding_id
     and (new.role is distinct from 'admin'
       or new.account_status is distinct from 'approved'
       or new.team_status is distinct from 'active') then
    raise exception 'The founding admin cannot be demoted, suspended, or deactivated.';
  end if;

  if new.role is distinct from old.role
     and (old.role = 'admin' or new.role = 'admin')
     and not public.is_founding_admin() then
    raise exception 'Only the founding admin can grant or revoke an existing admin role.';
  end if;

  if old.role = 'admin'
     and (new.account_status is distinct from old.account_status
       or new.team_status is distinct from old.team_status)
     and not public.is_founding_admin() then
    raise exception 'Only the founding admin can revoke or deactivate an admin.';
  end if;

  if new.role = 'admin'
     and new.account_status = 'approved'
     and (old.role is distinct from 'admin' or old.account_status is distinct from 'approved') then
    perform pg_advisory_xact_lock(hashtext('workmanager-admin-capacity'));
    perform 1
      from public.workspace_control c
     where c.workspace_key = 'default'
     for update;
    select count(*) into approved_admin_count
      from public.profiles p
     where p.role = 'admin'
       and p.account_status = 'approved'
       and p.id <> old.id;
    if approved_admin_count >= 3 then
      raise exception 'This workspace already has the maximum of three approved admins.';
    end if;
  end if;

  return new;
end $$;

-- All new accounts await approval. Registration role selection only records a request;
-- approval authority and the admin cap are enforced by the profile trigger.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, account_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    'member',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Profiles: everyone updates their own name; admins update any member. Deletes go through the server.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- A member or leader can read only their own profile; only admins can view the team.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Records. Admin: everything. Leader: clients, projects, tasks, documents, payments and expenses (no deletes).
-- Member: clients, projects, tasks and documents (no deletes, no payments or expenses).
-- Notifications stay private to the address they name (blank means the whole team).
drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (
  public.is_admin()
  or (
    public.is_approved()
    and (
      entity <> 'Notification'
      or coalesce(data ->> 'user_email', '') = ''
      or lower(data ->> 'user_email') = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and (
      entity not in ('Invitation', 'Payment', 'Expense', 'ActivityLog')
      or (public.is_leader_or_admin() and entity in ('Payment', 'Expense'))
    )
  )
);

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (
  public.is_admin()
  or (
    public.is_approved()
    and (
      entity in ('Client', 'Project', 'Task', 'Document', 'ActivityLog', 'Notification')
      or (public.is_leader_or_admin() and entity in ('Payment', 'Expense'))
    )
  )
);

drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (
    public.is_admin()
    or (
      public.is_approved()
      and (
        entity <> 'Notification'
        or coalesce(data ->> 'user_email', '') = ''
        or lower(data ->> 'user_email') = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      and (
        entity in ('Client', 'Project', 'Task', 'Document', 'Notification')
        or (public.is_leader_or_admin() and entity in ('Payment', 'Expense'))
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_approved()
      and (
        entity in ('Client', 'Project', 'Task', 'Document', 'Notification')
        or (public.is_leader_or_admin() and entity in ('Payment', 'Expense'))
      )
    )
  );

-- Only admins delete business records. Anyone can clear their own notifications.
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using (
  public.is_admin()
  or (
    public.is_approved()
    and entity = 'Notification'
    and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

-- Delete a business record and its known dependents in one transaction. Activity logs are
-- deliberately excluded so deletion history remains available for audit.
create or replace function public.records_delete_cascade(p_id uuid, p_entity text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete business records.' using errcode = '42501';
  end if;

  if p_entity in ('ActivityLog', 'Notification') then
    raise exception 'This record type cannot be deleted with the business-record cascade.';
  end if;

  with recursive delete_tree(id, entity, organization_id) as (
    select r.id, r.entity, r.organization_id
      from public.records r
     where r.id = p_id
       and r.entity = p_entity
       and r.entity <> 'ActivityLog'
       and r.organization_id = public.current_organization_id()

    union

    select child.id, child.entity, child.organization_id
      from public.records child
      join delete_tree parent
        on child.organization_id = parent.organization_id
        and (
          (
            parent.entity = 'Client'
            and child.entity = 'Project'
            and child.data @> jsonb_build_object('client_id', parent.id::text)
          )
          or (
            parent.entity = 'Client'
            and child.entity in ('Task', 'Document', 'Payment', 'Expense')
            and child.data @> jsonb_build_object('client_id', parent.id::text)
          )
          or (
            parent.entity = 'Project'
            and child.entity in ('Milestone', 'Task', 'Document', 'Payment', 'Expense')
            and child.data @> jsonb_build_object('project_id', parent.id::text)
          )
          or (
            parent.entity = 'Document'
            and child.entity = 'Payment'
            and child.data @> jsonb_build_object('document_id', parent.id::text)
          )
          or (
            parent.entity = 'Document'
            and child.entity = 'Document'
            and child.data @> jsonb_build_object('source_document_id', parent.id::text)
          )
        )
     where child.entity <> 'ActivityLog'
  )
  delete from public.records r
   using delete_tree d
   where r.id = d.id
     and r.entity = d.entity
     and r.organization_id = d.organization_id
     and r.entity <> 'ActivityLog';

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'This record is not visible to you or no longer exists.';
  end if;

  return deleted_count;
end $$;

revoke all on function public.records_delete_cascade(uuid, text) from public, anon;
grant execute on function public.records_delete_cascade(uuid, text) to authenticated;

-- ===== Workforce workspace features and tighter task boundaries =====

create or replace function public.cleanup_related_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.entity not in ('Notification', 'ActivityLog') then
    delete from public.records
     where entity = 'Notification'
       and organization_id = old.organization_id
       and data ->> 'related_record_id' = old.id::text;
  end if;
  return old;
end $$;

drop trigger if exists records_cleanup_related_notifications on public.records;
create trigger records_cleanup_related_notifications after delete on public.records
  for each row execute function public.cleanup_related_notifications();

create or replace function public.cleanup_profile_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.division_members where member_id = old.id;
  if old.email is not null then
    delete from public.records
     where entity = 'Notification'
       and organization_id = old.organization_id
       and lower(coalesce(data ->> 'user_email', '')) = lower(old.email);
  end if;
  return old;
end $$;

drop trigger if exists profiles_cleanup_notifications on public.profiles;
create trigger profiles_cleanup_notifications after delete on public.profiles
  for each row execute function public.cleanup_profile_notifications();

create table if not exists public.work_divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_divisions_name_nonempty check (length(trim(name)) between 1 and 80)
);
alter table public.work_divisions
  add column if not exists organization_id uuid references public.organizations (id) on delete restrict;

create table if not exists public.division_members (
  division_id uuid not null references public.work_divisions (id) on delete restrict,
  member_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (division_id, member_id)
);

create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references auth.users (id) on delete set null,
  member_email text not null,
  member_name text not null default '',
  period_start date not null,
  period_end date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'due' check (status in ('due', 'paid')),
  paid_at date,
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_payments_period_valid check (period_end >= period_start),
  constraint salary_payments_paid_date_valid check (
    (status = 'paid' and paid_at is not null)
    or (status = 'due' and paid_at is null)
  )
);
alter table public.salary_payments
  add column if not exists organization_id uuid references public.organizations (id) on delete restrict;

create index if not exists division_members_member_idx on public.division_members (member_id);
create index if not exists salary_payments_period_idx on public.salary_payments (period_end desc);
create unique index if not exists salary_payments_member_period_unique
  on public.salary_payments (member_id, period_start, period_end)
  where member_id is not null;

alter table public.work_divisions enable row level security;
alter table public.division_members enable row level security;
alter table public.salary_payments enable row level security;

create or replace function public.can_manage_member(p_member_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (
      public.is_leader_or_admin()
      and exists (
        select 1 from public.profiles p
         where p.id = p_member_id
           and p.role = 'member'
           and p.account_status = 'approved'
           and p.team_status = 'active'
      )
    )
$$;
revoke all on function public.can_manage_member(uuid) from public, anon;
grant execute on function public.can_manage_member(uuid) to authenticated;

drop policy if exists work_divisions_select on public.work_divisions;
create policy work_divisions_select on public.work_divisions for select to authenticated
  using (public.is_approved());
drop policy if exists work_divisions_admin_write on public.work_divisions;
create policy work_divisions_admin_write on public.work_divisions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists division_members_select on public.division_members;
create policy division_members_select on public.division_members for select to authenticated
  using (public.is_approved() and (member_id = auth.uid() or public.is_leader_or_admin()));
drop policy if exists division_members_manager_write on public.division_members;
create policy division_members_manager_write on public.division_members for all to authenticated
  using (public.can_manage_member(member_id))
  with check (public.can_manage_member(member_id));

drop policy if exists salary_payments_admin_all on public.salary_payments;
create policy salary_payments_admin_all on public.salary_payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.work_divisions to authenticated;
grant select, insert, update, delete on public.division_members to authenticated;
grant select, insert, update, delete on public.salary_payments to authenticated;

-- The directory function returns only fields needed for assignment, never auth flags or
-- password-change state. Members can see their own entry; leaders can see active members;
-- admins can see the full team including pending accounts.
drop function if exists public.list_team_directory();
create or replace function public.list_team_directory()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  account_status text,
  team_status text,
  is_available boolean,
  division_ids uuid[],
  is_founding_admin boolean,
  can_manage_admins boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.full_name, p.role, p.account_status, p.team_status,
         p.is_available,
         coalesce(array_agg(dm.division_id) filter (where dm.division_id is not null), '{}'::uuid[]),
         coalesce(p.id = (
           select c.founding_admin_id
             from public.workspace_control c
            where c.workspace_key = 'default'
         ), false),
         public.is_founding_admin()
    from public.profiles p
    left join public.division_members dm on dm.member_id = p.id
   where public.is_approved()
     and (
       public.is_admin()
       or (public.is_leader_or_admin() and p.role = 'member'
           and p.account_status = 'approved' and p.team_status = 'active')
       or p.id = auth.uid()
     )
   group by p.id
   order by p.full_name, p.email
$$;
revoke all on function public.list_team_directory() from public, anon;
grant execute on function public.list_team_directory() to authenticated;

-- Restrict task reads/writes by assignment. Leaders/admins manage tasks; a member may
-- see and update only progress on tasks assigned to their authenticated email.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (
  public.is_admin()
  or (
    public.is_approved()
    and (
      (entity = 'Notification'
       and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
      or (
        entity <> 'Notification'
        and entity not in ('Invitation', 'Payment', 'Expense', 'ActivityLog', 'SalaryPayment')
        and (entity <> 'Task'
             or public.is_leader_or_admin()
             or lower(coalesce(data ->> 'assigned_to', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
      )
      or (public.is_leader_or_admin() and entity in ('Payment', 'Expense'))
    )
  )
);

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (
  public.is_admin()
  or (
    public.is_approved()
    and (
      (public.is_leader_or_admin() and entity in ('Task', 'Milestone', 'Payment', 'Expense'))
      or (
        entity in ('Client', 'Project', 'Document', 'ActivityLog', 'Notification')
        and (
          entity <> 'Notification'
          or public.is_leader_or_admin()
          or lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
    )
  )
);

drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (
    public.is_admin()
    or (
      public.is_approved()
      and (
        (public.is_leader_or_admin()
         and entity in ('Client', 'Project', 'Task', 'Milestone', 'Document', 'Payment', 'Expense'))
        or (
          entity in ('Client', 'Project', 'Document')
          and not public.is_leader_or_admin()
        )
        or (
          entity = 'Task'
          and lower(coalesce(data ->> 'assigned_to', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or (
          entity = 'Notification'
          and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_approved()
      and (
        (public.is_leader_or_admin()
         and entity in ('Client', 'Project', 'Task', 'Milestone', 'Document', 'Payment', 'Expense'))
        or (
          entity in ('Client', 'Project', 'Document')
          and not public.is_leader_or_admin()
        )
        or (
          entity = 'Task'
          and lower(coalesce(data ->> 'assigned_to', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        or (
          entity = 'Notification'
          and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
    )
  );

drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using (
  public.is_admin()
  or (
    public.is_approved()
    and entity = 'Notification'
    and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

update public.records
   set data = jsonb_set(
     data,
     '{progress}',
     to_jsonb(case when data ->> 'status' = 'completed' then 100 else 0 end),
     true
   )
 where entity = 'Task'
   and not (data ? 'progress');

create or replace function public.protect_record_identity() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.created_by is not null and new.created_by <> auth.uid() then
        raise exception 'Records must be created by the signed-in user.' using errcode = '42501';
      end if;
      new.created_by := auth.uid();
    elsif new.id is distinct from old.id
       or new.entity is distinct from old.entity
       or new.created_at is distinct from old.created_at
       or new.created_by is distinct from old.created_by then
      raise exception 'Record identity and creation metadata cannot be changed.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists records_protect_identity on public.records;
create trigger records_protect_identity before insert or update on public.records
  for each row execute function public.protect_record_identity();

create or replace function public.protect_task_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_email text;
  target record;
  progress_text text;
  assignment_changed boolean;
begin
  if new.entity <> 'Task' then return new; end if;

  if not (new.data ? 'progress') then
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{progress}', '0'::jsonb, true);
  end if;

  progress_text := coalesce(new.data ->> 'progress', '0');
  if progress_text !~ '^[0-9]{1,3}$' or progress_text::integer > 100 then
    raise exception 'Task progress must be a whole number from 0 to 100.' using errcode = '22023';
  end if;

  if new.data ->> 'status' = 'completed' and progress_text::integer <> 100 then
    raise exception 'A task can be marked done only at 100%% progress.' using errcode = '22023';
  end if;
  if new.data ? 'task_kind' and new.data ->> 'task_kind' not in ('task', 'work_package') then
    raise exception 'Choose a valid task or work package type.' using errcode = '22023';
  end if;
  if nullif(trim(new.data ->> 'division_id'), '') is not null then
    if new.data ->> 'division_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (
         select 1 from public.work_divisions d
          where d.id = (new.data ->> 'division_id')::uuid and d.active
       ) then
      raise exception 'Choose an active work division.' using errcode = '22023';
    end if;
  end if;

  if auth.uid() is null then return new; end if;

  select p.role, lower(p.email) into caller_role, caller_email
    from public.profiles p
   where p.id = auth.uid()
     and p.account_status = 'approved'
     and p.team_status = 'active';
  if caller_role is null then
    raise exception 'An approved active account is required.' using errcode = '42501';
  end if;

  if caller_role = 'member' and tg_op = 'UPDATE' then
    if lower(coalesce(old.data ->> 'assigned_to', '')) <> caller_email then
      raise exception 'Members can update progress only on tasks assigned to them.' using errcode = '42501';
    end if;
    if (old.data - array['progress', 'status', 'completed_date', 'progress_updated_at'])
       is distinct from
       (new.data - array['progress', 'status', 'completed_date', 'progress_updated_at']) then
      raise exception 'Members can change only task progress and completion.' using errcode = '42501';
    end if;
    if old.data ->> 'status' = 'completed'
       and new.data ->> 'status' is distinct from 'completed' then
      raise exception 'Only a manager can reopen a completed task.' using errcode = '42501';
    end if;
  elsif caller_role not in ('admin', 'leader') then
    raise exception 'Only managers can create or assign tasks.' using errcode = '42501';
  end if;

  assignment_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    assignment_changed :=
      lower(coalesce(old.data ->> 'assigned_to', '')) <> lower(coalesce(new.data ->> 'assigned_to', ''))
      or coalesce(old.data ->> 'division_id', '') <> coalesce(new.data ->> 'division_id', '');
  end if;

  if caller_role in ('admin', 'leader')
     and nullif(trim(new.data ->> 'assigned_to'), '') is not null
     and assignment_changed then
    select p.id, p.role, p.is_available, p.account_status, p.team_status
      into target
      from public.profiles p
     where lower(p.email) = lower(trim(new.data ->> 'assigned_to'))
      limit 1
      for update;
    if target.id is null or target.account_status <> 'approved'
       or target.team_status <> 'active' or not target.is_available then
      raise exception 'Choose an active, available team member.' using errcode = '22023';
    end if;
    if caller_role = 'leader' and target.role <> 'member' then
      raise exception 'Leaders can assign work only to members.' using errcode = '42501';
    end if;
    if nullif(trim(new.data ->> 'division_id'), '') is not null
       and not exists (
         select 1 from public.division_members dm
          where dm.member_id = target.id
            and dm.division_id = (new.data ->> 'division_id')::uuid
       ) then
      raise exception 'The assignee must belong to the selected division.' using errcode = '22023';
    end if;
  end if;

  if caller_role = 'member'
     and progress_text::integer > 0
     and coalesce(new.data ->> 'status', 'todo') = 'todo' then
    new.data := jsonb_set(new.data, '{status}', '"in_progress"'::jsonb, true);
  end if;

  if tg_op = 'INSERT' then
    new.data := jsonb_set(new.data, '{progress_updated_at}', to_jsonb(now()::text), true);
  elsif old.data ->> 'progress' is distinct from new.data ->> 'progress' then
    new.data := jsonb_set(new.data, '{progress_updated_at}', to_jsonb(now()::text), true);
  end if;

  if new.data ->> 'status' = 'completed'
     and nullif(new.data ->> 'completed_date', '') is null then
    new.data := jsonb_set(new.data, '{completed_date}', to_jsonb(current_date::text), true);
  elsif tg_op = 'UPDATE' then
    if old.data ->> 'status' = 'completed'
       and new.data ->> 'status' is distinct from 'completed' then
      new.data := jsonb_set(new.data, '{completed_date}', '""'::jsonb, true);
    end if;
  end if;

  if caller_role = 'member' and new.data ->> 'status' = 'completed' then
    new.data := jsonb_set(new.data, '{completed_date}', to_jsonb(current_date::text), true);
  end if;

  return new;
end $$;

-- Only the server can claim the operator-designated founder for a new tenant.
create or replace function public.claim_workspace_founder(p_user_id uuid, p_founder_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  actual_email text;
  founder_id uuid;
begin
  select lower(trim(u.email))
    into actual_email
    from auth.users u
   where u.id = p_user_id
     and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;
  if actual_email is null or actual_email <> lower(trim(p_founder_email)) then
    return false;
  end if;

  select c.founding_admin_id
    into founder_id
    from public.workspace_control c
   where c.workspace_key = 'default'
   for update;
  if founder_id = p_user_id then return true; end if;
  if founder_id is not null then return false; end if;

  update public.profiles
     set role = 'admin',
         account_status = 'approved',
         team_status = 'active',
         registration_completed_at = coalesce(registration_completed_at, now())
   where id = p_user_id
     and lower(trim(email)) = actual_email
     and account_status = 'pending';
  if not found then return false; end if;

  update public.workspace_control
     set founding_admin_id = p_user_id
   where workspace_key = 'default'
     and founding_admin_id is null;
  if not found then return false; end if;
  return true;
end $$;
revoke all on function public.claim_workspace_founder(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_workspace_founder(uuid, text) to service_role;

drop trigger if exists records_protect_task on public.records;
create trigger records_protect_task before insert or update on public.records
  for each row execute function public.protect_task_record();

-- Task assignment and progress changes create private, in-app notifications and an audit
-- event in the same transaction, rather than relying on a best-effort browser request.
create or replace function public.caller_role_is_member(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'member' from public.profiles where id = p_user_id), false)
$$;
revoke all on function public.caller_role_is_member(uuid) from public, anon, authenticated;

create or replace function public.record_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changed_progress boolean := false;
  changed_assignment boolean := false;
  actor_email text;
  actor_name text;
  task_title text;
  task_due text;
  recipient record;
  action_label text;
begin
  if new.entity <> 'Task' then return new; end if;
  select p.email, p.full_name into actor_email, actor_name
    from public.profiles p where p.id = auth.uid();
  task_title := coalesce(new.data ->> 'title', 'Task');
  task_due := nullif(new.data ->> 'due_date', '');

  if tg_op = 'INSERT' then
    changed_assignment := nullif(new.data ->> 'assigned_to', '') is not null;
    changed_progress := true;
    action_label := 'Task created';
  else
    changed_assignment := lower(coalesce(old.data ->> 'assigned_to', ''))
                          <> lower(coalesce(new.data ->> 'assigned_to', ''));
    changed_progress := old.data ->> 'progress' is distinct from new.data ->> 'progress'
                         or old.data ->> 'status' is distinct from new.data ->> 'status';
    action_label := case
      when old.data ->> 'status' is distinct from new.data ->> 'status' then 'Task status changed'
      else 'Task progress updated'
    end;
  end if;

  if tg_op = 'INSERT' or changed_progress or changed_assignment then
    insert into public.records (entity, data, created_by)
    values (
      'ActivityLog',
      jsonb_build_object(
        'actor_name', coalesce(actor_name, actor_email, 'Workspace'),
        'actor_email', coalesce(actor_email, ''),
        'action', action_label,
        'entity_type', 'Task',
        'entity_id', new.id::text,
        'entity_label', task_title,
        'details', case when changed_progress
          then format('%s%% complete', coalesce(new.data ->> 'progress', '0'))
          else '' end
      ),
      auth.uid()
    );
  end if;

  if changed_assignment
     and nullif(trim(new.data ->> 'assigned_to'), '') is not null
     and coalesce(new.data ->> 'status', 'todo') not in ('completed', 'cancelled') then
    if tg_op = 'UPDATE'
       and nullif(trim(old.data ->> 'assigned_to'), '') is not null
       and lower(trim(old.data ->> 'assigned_to')) <> lower(trim(new.data ->> 'assigned_to')) then
      delete from public.records
       where entity = 'Notification'
         and organization_id = new.organization_id
         and data ->> 'related_record_id' = new.id::text
         and lower(coalesce(data ->> 'user_email', '')) = lower(trim(old.data ->> 'assigned_to'));
    end if;

    insert into public.records (entity, data, created_by)
    select 'Notification',
      jsonb_build_object(
        'title', 'New task assigned',
        'message', task_title || case when task_due is null then '' else ' · due ' || task_due end,
        'type', 'task',
        'link', '/tasks',
        'related_record_id', new.id::text,
        'user_email', p.email,
        'read', false
      ),
      auth.uid()
      from public.profiles p
     where lower(p.email) = lower(new.data ->> 'assigned_to')
       and p.organization_id = new.organization_id
       and p.account_status = 'approved'
       and p.team_status = 'active';
    for recipient in
      select p.email from public.profiles p
       where p.role = 'admin'
         and p.organization_id = new.organization_id
         and p.account_status = 'approved'
         and p.team_status = 'active'
         and lower(p.email) <> lower(new.data ->> 'assigned_to')
    loop
      insert into public.records (entity, data, created_by)
      values (
        'Notification',
        jsonb_build_object(
          'title', 'Pending task assigned',
          'message', task_title || case when task_due is null then '' else ' · due ' || task_due end,
          'type', 'task',
          'link', '/tasks',
          'related_record_id', new.id::text,
          'user_email', recipient.email,
          'read', false,
          'dedupe_key', 'task-assigned:' || new.id::text || ':' || lower(new.data ->> 'assigned_to')
                       || ':' || extract(epoch from clock_timestamp())::text
        ),
        auth.uid()
      )
      on conflict do nothing;
    end loop;
  elsif changed_progress and caller_role_is_member(auth.uid()) then
    for recipient in
      select p.email from public.profiles p
       where p.role = 'admin'
         and p.organization_id = new.organization_id
         and p.account_status = 'approved'
         and p.team_status = 'active'
         and p.id <> auth.uid()
    loop
      insert into public.records (entity, data, created_by)
      values (
        'Notification',
        jsonb_build_object(
          'title', case when new.data ->> 'status' = 'completed' then 'Task completed' else 'Task progress updated' end,
          'message', coalesce(actor_name, actor_email, 'A member') || ' · ' || task_title
                     || ' · ' || coalesce(new.data ->> 'progress', '0') || '%',
          'type', 'task',
          'link', '/tasks',
          'related_record_id', new.id::text,
          'user_email', recipient.email,
          'read', false
        ),
        auth.uid()
      );
    end loop;
  end if;

  return new;
end $$;

drop trigger if exists records_task_change on public.records;
create trigger records_task_change after insert or update on public.records
  for each row execute function public.record_task_change();

create or replace function public.notify_division_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  division_name text;
  member_email text;
  message_text text;
  affected_division_id uuid;
  affected_member_id uuid;
begin
  if tg_op = 'DELETE' then
    affected_division_id := old.division_id;
    affected_member_id := old.member_id;
  else
    affected_division_id := new.division_id;
    affected_member_id := new.member_id;
  end if;
  select d.name into division_name from public.work_divisions d where d.id = affected_division_id;
  select p.email into member_email from public.profiles p where p.id = affected_member_id;
  message_text := case when tg_op = 'INSERT'
    then 'You were added to the ' || coalesce(division_name, 'work') || ' division.'
    else 'You were removed from the ' || coalesce(division_name, 'work') || ' division.' end;
  if member_email is not null then
    insert into public.records (entity, data, created_by)
    values (
      'Notification',
      jsonb_build_object(
        'title', 'Work division updated',
        'message', message_text,
        'type', 'team',
        'link', '/team',
        'user_email', member_email,
        'read', false
      ),
      auth.uid()
    );
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists division_members_notify on public.division_members;
create trigger division_members_notify after insert or delete on public.division_members
  for each row execute function public.notify_division_assignment();

create or replace function public.safe_task_due_date(p_value text) returns date
language plpgsql immutable strict set search_path = pg_catalog as $$
begin
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return p_value::date;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return null;
end $$;
revoke all on function public.safe_task_due_date(text) from public, anon, authenticated;

create or replace function public.create_task_deadline_reminders() returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  reminder_date date := (now() at time zone 'Asia/Kolkata')::date;
  inserted_count integer;
begin
  with pending_tasks as materialized (
    select r.id,
           r.organization_id,
           left(coalesce(nullif(trim(r.data ->> 'title'), ''), 'Task'), 160) as task_title,
           lower(trim(r.data ->> 'assigned_to')) as assigned_email,
           public.safe_task_due_date(r.data ->> 'due_date') as due_date,
           coalesce(nullif(r.data ->> 'progress', ''), '0') as progress
      from public.records r
     where r.entity = 'Task'
       and coalesce(r.data ->> 'status', 'todo') not in ('completed', 'cancelled')
       and nullif(trim(r.data ->> 'assigned_to'), '') is not null
  ),
  eligible_tasks as materialized (
    select * from pending_tasks
     where due_date is not null
       and due_date <= reminder_date + 3
  ),
  recipients as (
    select t.id, t.organization_id, t.task_title, t.due_date, t.progress, p.email as recipient_email
      from eligible_tasks t
      join public.profiles p on lower(p.email) = t.assigned_email
     where p.role in ('member', 'leader')
       and p.organization_id = t.organization_id
       and p.account_status = 'approved'
       and p.team_status = 'active'
    union
    select t.id, t.organization_id, t.task_title, t.due_date, t.progress, p.email as recipient_email
      from eligible_tasks t
      cross join public.profiles p
     where p.role = 'admin'
       and p.organization_id = t.organization_id
       and p.account_status = 'approved'
       and p.team_status = 'active'
  )
  insert into public.records (organization_id, entity, data, created_by)
  select r.organization_id,
         'Notification',
         jsonb_build_object(
           'title', case
             when r.due_date < reminder_date
               then 'Task overdue by ' || (reminder_date - r.due_date)::text || ' day(s)'
             when r.due_date = reminder_date then 'Task deadline today'
             else 'Task deadline in ' || (r.due_date - reminder_date)::text || ' day(s)'
           end,
           'message', r.task_title || ' · due ' || r.due_date::text || ' · '
                      || r.progress || '% complete',
           'type', 'task',
           'link', '/tasks',
           'related_record_id', r.id::text,
           'user_email', r.recipient_email,
           'read', false,
           'dedupe_key', 'task-deadline:' || r.id::text || ':' || reminder_date::text
                        || ':' || lower(r.recipient_email)
         ),
         null
    from recipients r
   where not exists (
     select 1
       from public.records existing
      where existing.entity = 'Notification'
         and existing.organization_id = r.organization_id
         and existing.data ->> 'dedupe_key' =
            'task-deadline:' || r.id::text || ':' || reminder_date::text
            || ':' || lower(r.recipient_email)
   )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;
revoke all on function public.create_task_deadline_reminders() from public, anon, authenticated;

-- Daily at 09:00 Asia/Kolkata. Creates one private reminder per pending task/recipient
-- from three days before the deadline and every day thereafter until completion.
do $$
begin
  create extension if not exists pg_cron;
  delete from cron.job where jobname = 'task-deadline-reminders';
  perform cron.schedule(
    'task-deadline-reminders',
    '30 3 * * *',
    $cmd$ select public.create_task_deadline_reminders(); $cmd$
  );
exception when others then
  raise notice 'Task deadline reminders not scheduled: %', sqlerrm;
end $$;

-- ===== Shared database organization isolation =====
-- The original one-company data is migrated into a legacy organization. New users
-- receive an organization only through the verified registration RPC below.
-- Fresh installs have no legacy data: mark the migration as done so it never seeds a phantom company.
do $$
begin
  if not exists (
    select 1 from public.shared_schema_migrations where version = 'organization-isolation-v1'
  ) and not exists (select 1 from public.profiles) and not exists (select 1 from public.records) then
    insert into public.shared_schema_migrations (version) values ('organization-isolation-v1');
  end if;
end $$;

do $$
declare
  legacy_name text;
  legacy_normalized text;
  legacy_id uuid;
begin
  if not exists (
    select 1 from public.shared_schema_migrations
     where version = 'organization-isolation-v1'
  ) then
  select nullif(trim(r.data ->> 'company_name'), '')
    into legacy_name
    from public.records r
   where r.entity = 'OrgSettings'
     and nullif(trim(r.data ->> 'company_name'), '') is not null
   order by r.created_at
   limit 1;
  legacy_name := coalesce(legacy_name, 'Existing WorkManager Workspace');
  legacy_normalized := lower(regexp_replace(trim(legacy_name), '\s+', ' ', 'g'));

  insert into public.organizations (name, normalized_name)
  values (legacy_name, legacy_normalized)
  on conflict (normalized_name) do nothing;
  select id into legacy_id
    from public.organizations
   where normalized_name = legacy_normalized;

  update public.profiles set organization_id = legacy_id where organization_id is null;
  update public.records set organization_id = legacy_id where organization_id is null;
  update public.work_divisions set organization_id = legacy_id where organization_id is null;
  update public.salary_payments set organization_id = legacy_id where organization_id is null;
  update public.workspace_control set organization_id = legacy_id where organization_id is null;

  update public.workspace_control
     set founding_admin_id = (
       select p.id from public.profiles p
        where p.organization_id = legacy_id
          and p.role = 'admin'
          and p.account_status = 'approved'
          and p.team_status = 'active'
        order by p.created_at, p.id
        limit 1
     )
   where organization_id = legacy_id
     and founding_admin_id is null;
  insert into public.shared_schema_migrations (version)
  values ('organization-isolation-v1');
  end if;
end $$;

-- Remove the placeholder control row on fresh installs (it is created per company at registration).
delete from public.workspace_control where organization_id is null;
alter table public.workspace_control drop constraint if exists workspace_control_workspace_key_check;
alter table public.workspace_control alter column organization_id set not null;
create unique index if not exists workspace_control_organization_unique
  on public.workspace_control (organization_id);
create unique index if not exists organizations_normalized_name_unique
  on public.organizations (normalized_name);

alter table public.records alter column organization_id set not null;
alter table public.work_divisions alter column organization_id set not null;
alter table public.salary_payments alter column organization_id set not null;
alter table public.work_divisions drop constraint if exists work_divisions_name_key;
create unique index if not exists work_divisions_org_name_unique
  on public.work_divisions (organization_id, name);
create index if not exists profiles_organization_idx
  on public.profiles (organization_id, account_status, role);
create index if not exists records_organization_entity_created_idx
  on public.records (organization_id, entity, created_at desc);
create index if not exists work_divisions_organization_idx
  on public.work_divisions (organization_id, active);
create index if not exists salary_payments_organization_period_idx
  on public.salary_payments (organization_id, period_end desc);

create or replace function public.current_organization_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select p.organization_id from public.profiles p where p.id = auth.uid()
$$;
revoke all on function public.current_organization_id() from public, anon;
grant execute on function public.current_organization_id() to authenticated;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.organization_id is not null
       and p.account_status = 'approved'
       and p.team_status = 'active'
       and public.is_passcode_verified()
      from public.profiles p
     where p.id = auth.uid()
  ), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.organization_id is not null
       and p.role = 'admin'
       and p.account_status = 'approved'
       and p.team_status = 'active'
       and public.is_passcode_verified()
      from public.profiles p
     where p.id = auth.uid()
  ), false)
$$;

create or replace function public.is_leader_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.organization_id is not null
       and p.role in ('admin', 'leader')
       and p.account_status = 'approved'
       and p.team_status = 'active'
       and public.is_passcode_verified()
      from public.profiles p
     where p.id = auth.uid()
  ), false)
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_leader_or_admin()
$$;

create or replace function public.is_founding_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.workspace_control c
         join public.profiles p on p.organization_id = c.organization_id
        where p.id = auth.uid()
          and c.founding_admin_id = auth.uid()
     )
     and public.is_admin()
$$;
revoke all on function public.is_founding_admin() from public, anon, authenticated;

create or replace function public.register_company(
  p_user_id uuid,
  p_company_name text,
  p_requested_role text
) returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  verified_email text;
  requested_name text;
  target_normalized_name text;
  org_id uuid;
  org_name text;
  current_org_id uuid;
  profile_status text;
  member_role text;
  is_founder boolean := false;
begin
  if p_requested_role not in ('admin', 'member') then
    raise exception 'Choose Admin or Member.';
  end if;

  select lower(trim(u.email))
    into verified_email
    from auth.users u
   where u.id = p_user_id
     and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;
  if verified_email is null then
    raise exception 'A verified Google account is required to register.';
  end if;

  select p.organization_id, p.account_status, p.role
    into current_org_id, profile_status, member_role
    from public.profiles p
   where p.id = p_user_id
     and lower(trim(p.email)) = verified_email
   for update;
  if not found then
    raise exception 'Your account profile is still being created. Try again shortly.';
  end if;

  requested_name := trim(regexp_replace(coalesce(p_company_name, ''), '\s+', ' ', 'g'));
  if current_org_id is not null and requested_name = '' then
    select o.name, o.normalized_name
      into org_name, target_normalized_name
      from public.organizations o
     where o.id = current_org_id;
  else
    if length(requested_name) < 2 or length(requested_name) > 120 then
      raise exception 'Enter a company name between 2 and 120 characters.';
    end if;
    org_name := requested_name;
    target_normalized_name := lower(requested_name);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_normalized_name, 0));
  select o.id, o.name
    into org_id, org_name
    from public.organizations o
   where o.normalized_name = target_normalized_name
   for update;

  if current_org_id is not null then
    if current_org_id is distinct from org_id then
      raise exception 'This Google account already belongs to a different company workspace.';
    end if;
    if profile_status <> 'pending' then
      return jsonb_build_object(
        'organization_id', org_id,
        'company_name', org_name,
        'role', member_role,
        'founding_admin', false,
        'already_registered', true
      );
    end if;
    update public.profiles
       set role = p_requested_role,
           registration_completed_at = coalesce(registration_completed_at, now())
     where id = p_user_id
     returning role into member_role;
    return jsonb_build_object(
      'organization_id', org_id,
      'company_name', org_name,
      'role', member_role,
      'founding_admin', false,
      'already_registered', false
    );
  end if;

  if org_id is null then
    insert into public.organizations (name, normalized_name)
    values (requested_name, target_normalized_name)
    returning id, name into org_id, org_name;
    is_founder := true;
    insert into public.workspace_control (workspace_key, organization_id, founding_admin_id)
    values ('org:' || org_id::text, org_id, p_user_id);

    update public.profiles
       set organization_id = org_id,
           role = 'admin',
           account_status = 'approved',
           team_status = 'active',
           registration_completed_at = coalesce(registration_completed_at, now())
     where id = p_user_id;
    member_role := 'admin';
  else
    if profile_status <> 'pending' then
      raise exception 'This account cannot request access to another company.';
    end if;
    update public.profiles
       set organization_id = org_id,
           role = p_requested_role,
           registration_completed_at = coalesce(registration_completed_at, now())
     where id = p_user_id
     returning role into member_role;
  end if;

  return jsonb_build_object(
    'organization_id', org_id,
    'company_name', org_name,
    'role', member_role,
    'founding_admin', is_founder,
    'already_registered', false
  );
end $$;
revoke all on function public.register_company(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_company(uuid, text, text) to service_role;

create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  founding_id uuid;
  approved_admin_count bigint;
begin
  if auth.uid() is null or current_setting('app.profile_internal_update', true) = 'on' then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Company membership cannot be changed from a profile update.';
  end if;
  if new.email is distinct from old.email then
    raise exception 'Update account email through the authentication provider.';
  end if;
  if new.is_available is distinct from old.is_available and old.id <> auth.uid() then
    raise exception 'Team members manage their own availability.';
  end if;
  if new.must_change_password is distinct from old.must_change_password then
    if not public.is_admin() then
      raise exception 'Only an admin can change password requirements.';
    end if;
    if old.role = 'admin' and not public.is_founding_admin() then
      raise exception 'Only the founding admin can change another admin password requirement.';
    end if;
  end if;
  if not public.is_admin() then
    if (to_jsonb(new) - array['full_name', 'is_available', 'updated_at'])
       is distinct from (to_jsonb(old) - array['full_name', 'is_available', 'updated_at'])
       or new.role is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.team_status is distinct from old.team_status then
      raise exception 'Members can update only their name and availability.';
    end if;
    return new;
  end if;

  select c.founding_admin_id into founding_id
    from public.workspace_control c
   where c.organization_id = old.organization_id;
  if old.account_status = 'pending'
     and new.account_status = 'approved'
     and not public.is_founding_admin() then
    raise exception 'Only the founding admin can approve pending registrations.';
  end if;
  if old.account_status = 'pending'
     and new.account_status = 'approved'
     and new.registration_completed_at is null then
    raise exception 'The user must complete Google registration before approval.';
  end if;
  if old.id = founding_id
     and (new.role is distinct from 'admin'
       or new.account_status is distinct from 'approved'
       or new.team_status is distinct from 'active') then
    raise exception 'The founding admin cannot be demoted, suspended, or deactivated.';
  end if;
  if new.role is distinct from old.role
     and (old.role = 'admin' or new.role = 'admin')
     and not public.is_founding_admin() then
    raise exception 'Only the founding admin can grant or revoke an existing admin role.';
  end if;
  if old.role = 'admin'
     and (new.account_status is distinct from old.account_status
       or new.team_status is distinct from old.team_status)
     and not public.is_founding_admin() then
    raise exception 'Only the founding admin can revoke or deactivate an admin.';
  end if;
  if new.role = 'admin'
     and new.account_status = 'approved'
     and (old.role is distinct from 'admin' or old.account_status is distinct from 'approved') then
    perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text, 1));
    select count(*) into approved_admin_count
      from public.profiles p
     where p.organization_id = old.organization_id
       and p.role = 'admin'
       and p.account_status = 'approved'
       and p.id <> old.id;
    if approved_admin_count >= 3 then
      raise exception 'This workspace already has the maximum of three approved admins.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.can_manage_member(p_member_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (
      public.is_leader_or_admin()
      and exists (
        select 1 from public.profiles p
         where p.id = p_member_id
           and p.organization_id = public.current_organization_id()
           and p.role = 'member'
           and p.account_status = 'approved'
           and p.team_status = 'active'
      )
    )
$$;

create or replace function public.list_team_directory()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  account_status text,
  team_status text,
  is_available boolean,
  division_ids uuid[],
  is_founding_admin boolean,
  can_manage_admins boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.full_name, p.role, p.account_status, p.team_status,
         p.is_available,
         coalesce(array_agg(dm.division_id) filter (where dm.division_id is not null), '{}'::uuid[]),
         coalesce(p.id = (
           select c.founding_admin_id from public.workspace_control c
            where c.organization_id = p.organization_id
         ), false),
         public.is_founding_admin()
    from public.profiles p
    left join public.division_members dm on dm.member_id = p.id
   where p.organization_id = public.current_organization_id()
     and public.is_approved()
     and (
       public.is_admin()
       or (public.is_leader_or_admin() and p.role = 'member'
           and p.account_status = 'approved' and p.team_status = 'active')
       or p.id = auth.uid()
     )
   group by p.id
   order by p.full_name, p.email
$$;
revoke all on function public.list_team_directory() from public, anon;
grant execute on function public.list_team_directory() to authenticated;

create or replace function public.scope_record_organization() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller_org uuid;
begin
  if auth.uid() is not null then
    caller_org := public.current_organization_id();
    if caller_org is null then
      raise exception 'Complete company registration before accessing workspace data.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.organization_id is distinct from caller_org then
      raise exception 'Company data cannot be moved between organizations.' using errcode = '42501';
    end if;
    new.organization_id := caller_org;
  elsif new.organization_id is null and new.entity = 'Notification'
      and coalesce(new.data ->> 'related_record_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select r.organization_id into new.organization_id
      from public.records r
     where r.id = (new.data ->> 'related_record_id')::uuid;
  end if;
  if new.organization_id is null then
    raise exception 'An organization is required for every business record.' using errcode = '23502';
  end if;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'Company data cannot be moved between organizations.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists records_organization_scope on public.records;
create trigger records_organization_scope before insert or update on public.records
  for each row execute function public.scope_record_organization();

create or replace function public.scope_workforce_organization() returns trigger
language plpgsql security definer set search_path = public as $$
declare caller_org uuid;
begin
  caller_org := public.current_organization_id();
  if caller_org is null then
    raise exception 'A company workspace is required.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.organization_id is distinct from caller_org then
    raise exception 'Company workforce data cannot be moved between organizations.' using errcode = '42501';
  end if;
  new.organization_id := caller_org;
  return new;
end $$;
drop trigger if exists work_divisions_organization_scope on public.work_divisions;
create trigger work_divisions_organization_scope before insert or update on public.work_divisions
  for each row execute function public.scope_workforce_organization();
drop trigger if exists salary_payments_organization_scope on public.salary_payments;
create trigger salary_payments_organization_scope before insert or update on public.salary_payments
  for each row execute function public.scope_workforce_organization();

create or replace function public.protect_task_organization() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.entity = 'Task' and nullif(trim(new.data ->> 'assigned_to'), '') is not null
     and not exists (
       select 1 from public.profiles p
        where lower(p.email) = lower(trim(new.data ->> 'assigned_to'))
          and p.organization_id = new.organization_id
          and p.account_status = 'approved'
          and p.team_status = 'active'
     ) then
    raise exception 'Choose an active team member from this company.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists records_task_organization_guard on public.records;
create trigger records_task_organization_guard before insert or update on public.records
  for each row execute function public.protect_task_organization();

alter table public.organizations enable row level security;
revoke all on public.organizations from public, anon, authenticated;
grant select on public.organizations to authenticated;
drop policy if exists organizations_select_current on public.organizations;
create policy organizations_select_current on public.organizations for select to authenticated
  using (id = public.current_organization_id());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (organization_id = public.current_organization_id() and public.is_admin()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (organization_id is not distinct from public.current_organization_id()
         and (id = auth.uid() or public.is_admin()))
  with check (organization_id is not distinct from public.current_organization_id()
              and (id = auth.uid() or public.is_admin()));

drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (
  organization_id = public.current_organization_id()
  and (
    public.is_admin()
    or (
      public.is_approved()
      and (
        (entity = 'Notification'
         and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
        or (
          entity <> 'Notification'
          and entity not in ('Invitation', 'Payment', 'Expense', 'ActivityLog', 'SalaryPayment')
          and (entity <> 'Task'
               or public.is_leader_or_admin()
               or lower(coalesce(data ->> 'assigned_to', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
        )
        or (public.is_leader_or_admin() and entity in ('Payment', 'Expense'))
      )
    )
  )
);
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (
  organization_id = public.current_organization_id()
  and (
    public.is_admin()
    or (
      public.is_approved()
      and (
        (public.is_leader_or_admin() and entity in ('Task', 'Milestone', 'Payment', 'Expense'))
        or (
          entity in ('Client', 'Project', 'Document', 'ActivityLog', 'Notification')
          and (
            entity <> 'Notification'
            or public.is_leader_or_admin()
            or lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
      )
    )
  )
);
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and (
      public.is_admin()
      or (
        public.is_approved()
        and (
          (public.is_leader_or_admin()
           and entity in ('Client', 'Project', 'Task', 'Milestone', 'Document', 'Payment', 'Expense'))
          or (
            entity in ('Client', 'Project', 'Document')
            and not public.is_leader_or_admin()
          )
          or (
            entity = 'Task'
            and lower(coalesce(data ->> 'assigned_to', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
          or (
            entity = 'Notification'
            and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
      )
    )
  )
  with check (
    organization_id = public.current_organization_id()
    and (
      public.is_admin()
      or (
        public.is_approved()
        and (
          (public.is_leader_or_admin()
           and entity in ('Client', 'Project', 'Task', 'Milestone', 'Document', 'Payment', 'Expense'))
          or (
            entity in ('Client', 'Project', 'Document')
            and not public.is_leader_or_admin()
          )
          or (
            entity = 'Task'
            and lower(coalesce(data ->> 'assigned_to', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
          or (
            entity = 'Notification'
            and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
      )
    )
  );
drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using (
  organization_id = public.current_organization_id()
  and (
    public.is_admin()
    or (
      public.is_approved()
      and entity = 'Notification'
      and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);

drop policy if exists work_divisions_select on public.work_divisions;
create policy work_divisions_select on public.work_divisions for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());
drop policy if exists work_divisions_admin_write on public.work_divisions;
create policy work_divisions_admin_write on public.work_divisions for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_admin())
  with check (organization_id = public.current_organization_id() and public.is_admin());

drop policy if exists division_members_select on public.division_members;
create policy division_members_select on public.division_members for select to authenticated
  using (
    public.is_approved()
    and exists (
      select 1 from public.work_divisions d
       where d.id = division_id
         and d.organization_id = public.current_organization_id()
    )
    and (member_id = auth.uid() or public.is_leader_or_admin())
  );
drop policy if exists division_members_manager_write on public.division_members;
create policy division_members_manager_write on public.division_members for all to authenticated
  using (
    public.can_manage_member(member_id)
    and exists (
      select 1 from public.work_divisions d
       where d.id = division_id
         and d.organization_id = public.current_organization_id()
    )
  )
  with check (
    public.can_manage_member(member_id)
    and exists (
      select 1 from public.work_divisions d
       join public.profiles p on p.id = member_id
       where d.id = division_id
         and d.organization_id = public.current_organization_id()
         and p.organization_id = d.organization_id
    )
  );

drop policy if exists salary_payments_admin_all on public.salary_payments;
create policy salary_payments_admin_all on public.salary_payments for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_admin())
  with check (organization_id = public.current_organization_id() and public.is_admin());

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'private-files'
    and public.is_approved()
    and (
      (storage.foldername(name))[1] = public.current_organization_id()::text
      or exists (
        select 1 from public.profiles p
         where p.id::text = (storage.foldername(name))[1]
           and p.organization_id = public.current_organization_id()
      )
    )
  );
drop policy if exists private_files_write on storage.objects;
create policy private_files_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'private-files'
    and public.is_approved()
    and (storage.foldername(name))[1] = public.current_organization_id()::text
  );
drop policy if exists public_files_write on storage.objects;
create policy public_files_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-files'
    and public.is_manager()
    and (storage.foldername(name))[1] = public.current_organization_id()::text
  );

drop function if exists public.claim_workspace_founder(uuid, text);

create or replace function public.register_company_v2(
  p_user_id uuid,
  p_company_name text,
  p_requested_role text,
  p_create_company boolean
) returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  verified_email text;
  requested_name text;
  target_normalized_name text;
  org_id uuid;
  org_name text;
  current_org_id uuid;
  profile_status text;
  member_role text;
  is_founder boolean := false;
begin
  if p_requested_role not in ('admin', 'member') then
    raise exception 'Choose Admin or Member.';
  end if;

  select lower(trim(u.email))
    into verified_email
    from auth.users u
   where u.id = p_user_id
     and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;
  if verified_email is null then
    raise exception 'A verified Google account is required to register.';
  end if;

  select p.organization_id, p.account_status, p.role
    into current_org_id, profile_status, member_role
    from public.profiles p
   where p.id = p_user_id
     and lower(trim(p.email)) = verified_email
   for update;
  if not found then
    raise exception 'Your account profile is still being created. Try again shortly.';
  end if;

  requested_name := trim(regexp_replace(coalesce(p_company_name, ''), '\s+', ' ', 'g'));
  if requested_name = '' and current_org_id is not null then
    select o.name, o.normalized_name
      into requested_name, target_normalized_name
      from public.organizations o
     where o.id = current_org_id;
  else
    if length(requested_name) < 2 or length(requested_name) > 120 then
      raise exception 'Enter a company name between 2 and 120 characters.';
    end if;
    target_normalized_name := lower(requested_name);
  end if;
  if target_normalized_name is null then
    raise exception 'Enter a valid company name.';
  end if;

  -- One company per installation: serialise registrations so two first-time sign-ups cannot both create it.
  perform pg_advisory_xact_lock(hashtextextended('workmanager-single-company', 0));

  select o.id, o.name
    into org_id, org_name
    from public.organizations o
   where o.normalized_name = target_normalized_name;

  if current_org_id is not null then
    if current_org_id is distinct from org_id then
      raise exception 'This Google account already belongs to a different company.';
    end if;
    if profile_status <> 'pending' then
      return jsonb_build_object(
        'organization_id', current_org_id,
        'company_name', org_name,
        'role', member_role,
        'founding_admin', false,
        'already_registered', true
      );
    end if;
    update public.profiles
       set role = p_requested_role,
           registration_completed_at = coalesce(registration_completed_at, now())
     where id = p_user_id
     returning role into member_role;
    delete from public.records
     where entity = 'Invitation'
       and organization_id = current_org_id
       and lower(trim(data ->> 'email')) = verified_email;
    return jsonb_build_object(
      'organization_id', current_org_id,
      'company_name', org_name,
      'role', member_role,
      'founding_admin', false,
      'already_registered', false
    );
  end if;

  if p_create_company then
    if exists (select 1 from public.organizations) then
      raise exception 'This WorkManager installation already has its company. Ask its administrator to add you.';
    end if;
    insert into public.organizations (name, normalized_name)
    values (requested_name, target_normalized_name)
    returning id, name into org_id, org_name;

    insert into public.workspace_control (workspace_key, organization_id, founding_admin_id)
    values ('org:' || org_id::text, org_id, p_user_id);
    is_founder := true;
    member_role := 'admin';

    update public.profiles
       set organization_id = org_id,
           role = 'admin',
           account_status = 'approved',
           team_status = 'active',
           registration_completed_at = coalesce(registration_completed_at, now())
     where id = p_user_id;
  else
    if org_id is null then
      raise exception 'We could not find that company workspace. Check the name or register a new company.';
    end if;
    update public.profiles
       set organization_id = org_id,
           role = p_requested_role,
           account_status = 'pending',
           registration_completed_at = coalesce(registration_completed_at, now())
     where id = p_user_id
     returning role into member_role;
  end if;

  delete from public.records
   where entity = 'Invitation'
     and organization_id = org_id
     and lower(trim(data ->> 'email')) = verified_email;

  return jsonb_build_object(
    'organization_id', org_id,
    'company_name', org_name,
    'role', member_role,
    'founding_admin', is_founder,
    'already_registered', false
  );
end $$;
revoke all on function public.register_company_v2(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.register_company_v2(uuid, text, text, boolean)
  to service_role;
drop function if exists public.register_company_v2(uuid, text, text, boolean, boolean, text, boolean);
drop function if exists public.register_company(uuid, text, text);

drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (
  organization_id = public.current_organization_id()
  and (
    public.is_admin()
    or (
      public.is_approved()
      and (
        (entity = 'Notification'
         and lower(coalesce(data ->> 'user_email', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
        or (
          entity <> 'Notification'
          and entity not in ('Invitation', 'Payment', 'Expense', 'ActivityLog', 'SalaryPayment')
          and (entity <> 'Task'
               or public.is_leader_or_admin()
               or lower(coalesce(data ->> 'assigned_to', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
        )
        or (public.is_leader_or_admin() and entity in ('Payment', 'Expense'))
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- Atomic numbering. Client codes (CL-0001) and document numbers (INV-2026-0001) come from
-- here, so two people creating records at the same moment can never get the same number.
-- Rerunning this file is safe.
-- ---------------------------------------------------------------------------
create table if not exists public.counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  counter_key text not null check (length(counter_key) between 1 and 200),
  value bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, counter_key)
);
alter table public.counters enable row level security;
revoke all on public.counters from public, anon, authenticated;

create or replace function public.next_counter(p_key text, p_seed bigint default 0)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.current_organization_id();
  v_next bigint;
begin
  if v_org is null then
    raise exception 'Complete company registration before creating records.' using errcode = '42501';
  end if;
  if p_key is null or length(trim(p_key)) = 0 or length(p_key) > 200 then
    raise exception 'Invalid counter key.' using errcode = '22023';
  end if;
  if p_seed is null or p_seed < 0 then
    raise exception 'Invalid counter seed.' using errcode = '22023';
  end if;
  insert into public.counters (organization_id, counter_key, value)
  values (v_org, p_key, p_seed + 1)
  on conflict (organization_id, counter_key) do update
    set value = greatest(public.counters.value, p_seed) + 1,
        updated_at = now()
  returning value into v_next;
  return v_next;
end;
$$;

revoke all on function public.next_counter(text, bigint) from public, anon;
grant execute on function public.next_counter(text, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Unique identifiers inside each organisation. The database refuses a second client with the
-- same code, or a second document with the same number. If an existing installation already has
-- duplicates, the index is skipped with a notice so the rest of the schema still applies; fix
-- the duplicates first, then run this file again.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.records
     where entity = 'Client' and data ? 'client_code'
     group by organization_id, data ->> 'client_code' having count(*) > 1
  ) then
    raise notice 'Duplicate client codes found; records_client_code_unique was not created.';
  else
    create unique index if not exists records_client_code_unique
      on public.records (organization_id, (data ->> 'client_code'))
      where entity = 'Client' and data ? 'client_code';
  end if;

  if exists (
    select 1 from public.records
     where entity = 'Document' and data ? 'doc_number'
     group by organization_id, data ->> 'doc_number' having count(*) > 1
  ) then
    raise notice 'Duplicate document numbers found; records_document_number_unique was not created.';
  else
    create unique index if not exists records_document_number_unique
      on public.records (organization_id, (data ->> 'doc_number'))
      where entity = 'Document' and data ? 'doc_number';
  end if;
end
$$;
