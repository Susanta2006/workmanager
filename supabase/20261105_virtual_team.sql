-- Virtual Team: persistent AI workforce for Shristi AI Web Creations.
-- Run after supabase/schema.sql. Safe to re-run.
--
-- Requires these Supabase extensions (enable in Dashboard > Database > Extensions):
--   pg_cron, pg_net, supabase_vault
--
-- Background execution: pg_cron calls public.virtual_team_dispatch_worker() every minute.
-- That function posts to your app's /api/virtual-team/worker route using two Vault secrets:
--   select vault.create_secret('https://YOUR-APP-URL/api/virtual-team/worker', 'virtual_team_worker_url');
--   select vault.create_secret('LONG-RANDOM-SECRET', 'virtual_team_worker_secret');
-- Set the same LONG-RANDOM-SECRET as VIRTUAL_TEAM_WORKER_SECRET in the app's environment.

-- ===== Extensions (no-op when already enabled) =====
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- ===== Tables =====

create table if not exists public.virtual_team_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  operating_mode text not null default 'team' check (operating_mode in ('solo', 'team')),
  background_enabled boolean not null default true,
  max_concurrent_missions integer not null default 3 check (max_concurrent_missions between 1 and 10),
  mission_token_budget integer not null default 8000 check (mission_token_budget between 500 and 200000),
  daily_token_limit integer not null default 200000 check (daily_token_limit between 1000 and 5000000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.virtual_team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_key text not null check (member_key ~ '^[a-z0-9-]{2,40}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  job_title text not null default '' check (length(job_title) <= 120),
  role_description text not null default '' check (length(role_description) <= 2000),
  gender text not null default 'neutral' check (gender in ('male', 'female', 'neutral')),
  personality text not null default '' check (length(personality) <= 2000),
  communication_style text not null default '' check (length(communication_style) <= 500),
  skills text[] not null default '{}',
  is_manager boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_key)
);
create unique index if not exists virtual_team_one_manager
  on public.virtual_team_members (organization_id) where is_manager;

create table if not exists public.virtual_team_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('group', 'direct')),
  member_id uuid references public.virtual_team_members (id) on delete cascade,
  title text not null default '' check (length(title) <= 120),
  created_at timestamptz not null default now(),
  check ((kind = 'group' and member_id is null) or (kind = 'direct' and member_id is not null))
);
create unique index if not exists virtual_team_one_group
  on public.virtual_team_conversations (organization_id) where kind = 'group';
create unique index if not exists virtual_team_one_direct
  on public.virtual_team_conversations (organization_id, member_id) where kind = 'direct';

create table if not exists public.virtual_team_missions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.virtual_team_conversations (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  request text not null check (length(request) <= 8000),
  status text not null default 'queued' check (
    status in ('awaiting_approval', 'queued', 'running', 'reviewing', 'completed', 'failed', 'cancelled', 'paused')
  ),
  origin text not null default 'admin' check (origin in ('admin', 'scheduled')),
  summary text not null default '',
  error text not null default '',
  token_budget integer not null default 8000,
  tokens_used integer not null default 0,
  requested_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists virtual_team_missions_org_status
  on public.virtual_team_missions (organization_id, status);

create table if not exists public.virtual_team_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mission_id uuid not null references public.virtual_team_missions (id) on delete cascade,
  member_id uuid references public.virtual_team_members (id) on delete set null,
  position integer not null check (position >= 1),
  instruction text not null check (length(trim(instruction)) between 1 and 4000),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  output text not null default '',
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  next_run_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists virtual_team_tasks_queue
  on public.virtual_team_tasks (status, next_run_at);

create table if not exists public.virtual_team_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.virtual_team_conversations (id) on delete cascade,
  sender_kind text not null check (sender_kind in ('admin', 'member', 'manager', 'system')),
  sender_member_id uuid references public.virtual_team_members (id) on delete set null,
  sender_user_id uuid references auth.users (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 8000),
  mission_id uuid references public.virtual_team_missions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists virtual_team_messages_conversation
  on public.virtual_team_messages (conversation_id, created_at);

create table if not exists public.virtual_team_deliverables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mission_id uuid not null references public.virtual_team_missions (id) on delete cascade,
  member_id uuid references public.virtual_team_members (id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  format text not null default 'md' check (format in ('md', 'txt', 'csv')),
  content text not null check (length(content) <= 200000),
  created_at timestamptz not null default now()
);

create table if not exists public.virtual_team_prompts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  niche text not null check (length(trim(niche)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 120),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(body) <= 50000),
  intended_use text not null default '' check (length(intended_use) <= 1000),
  variables text[] not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  version integer not null default 1 check (version >= 1),
  mission_id uuid references public.virtual_team_missions (id) on delete set null,
  created_by_member_id uuid references public.virtual_team_members (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists virtual_team_prompts_niche
  on public.virtual_team_prompts (organization_id, niche, category);

create table if not exists public.virtual_team_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  prompt_id uuid not null references public.virtual_team_prompts (id) on delete cascade,
  version integer not null check (version >= 1),
  title text not null,
  body text not null,
  change_reason text not null default '' check (length(change_reason) <= 500),
  changed_by_user uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (prompt_id, version)
);

create table if not exists public.virtual_team_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null default '',
  target_id text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists virtual_team_audit_org_created
  on public.virtual_team_audit_logs (organization_id, created_at desc);

create table if not exists public.virtual_team_usage (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  usage_day date not null default current_date,
  tokens integer not null default 0 check (tokens >= 0),
  primary key (organization_id, usage_day)
);

-- ===== Organisation scoping (same rule as the rest of the app) =====
-- Signed-in users always get their own organisation. Background jobs (service role, no auth.uid())
-- must supply organization_id themselves.
create or replace function public.vt_scope_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller_org uuid := public.current_organization_id();
begin
  if auth.uid() is not null then
    if caller_org is null then
      raise exception 'A company workspace is required.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.organization_id is distinct from caller_org then
      raise exception 'Virtual Team data cannot be moved between organizations.' using errcode = '42501';
    end if;
    new.organization_id := caller_org;
  elsif new.organization_id is null then
    raise exception 'organization_id is required.' using errcode = '23502';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'virtual_team_settings', 'virtual_team_members', 'virtual_team_conversations',
    'virtual_team_missions', 'virtual_team_tasks', 'virtual_team_messages',
    'virtual_team_deliverables', 'virtual_team_prompts', 'virtual_team_prompt_versions',
    'virtual_team_audit_logs', 'virtual_team_usage'
  ] loop
    execute format('drop trigger if exists %I_org_scope on public.%I', t, t);
    execute format(
      'create trigger %I_org_scope before insert or update on public.%I
       for each row execute function public.vt_scope_org()', t, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- The manager identity is permanent: it cannot be deleted or renamed by key.
create or replace function public.vt_protect_manager() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.is_manager then
    raise exception 'Manager cannot be removed.' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.is_manager and (
       new.is_manager is distinct from old.is_manager
    or new.member_key is distinct from old.member_key) then
    raise exception 'Manager identity is fixed.' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists virtual_team_members_protect_manager on public.virtual_team_members;
create trigger virtual_team_members_protect_manager before update or delete on public.virtual_team_members
  for each row execute function public.vt_protect_manager();

-- ===== Row-level security =====
-- Everyone approved in the organisation can read. Writes go through admin-checked policies,
-- security-definer functions below, or the backend (service role) only.

drop policy if exists vt_settings_read on public.virtual_team_settings;
create policy vt_settings_read on public.virtual_team_settings for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());
drop policy if exists vt_settings_admin_write on public.virtual_team_settings;
create policy vt_settings_admin_write on public.virtual_team_settings for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_admin())
  with check (organization_id = public.current_organization_id() and public.is_admin());

drop policy if exists vt_members_read on public.virtual_team_members;
create policy vt_members_read on public.virtual_team_members for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());
drop policy if exists vt_members_admin_write on public.virtual_team_members;
create policy vt_members_admin_write on public.virtual_team_members for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_admin())
  with check (organization_id = public.current_organization_id() and public.is_admin());

drop policy if exists vt_conversations_read on public.virtual_team_conversations;
create policy vt_conversations_read on public.virtual_team_conversations for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());

drop policy if exists vt_messages_read on public.virtual_team_messages;
create policy vt_messages_read on public.virtual_team_messages for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());

drop policy if exists vt_missions_read on public.virtual_team_missions;
create policy vt_missions_read on public.virtual_team_missions for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());

drop policy if exists vt_tasks_read on public.virtual_team_tasks;
create policy vt_tasks_read on public.virtual_team_tasks for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());

drop policy if exists vt_deliverables_read on public.virtual_team_deliverables;
create policy vt_deliverables_read on public.virtual_team_deliverables for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());

drop policy if exists vt_prompts_read on public.virtual_team_prompts;
create policy vt_prompts_read on public.virtual_team_prompts for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());
drop policy if exists vt_prompts_leader_insert on public.virtual_team_prompts;
create policy vt_prompts_leader_insert on public.virtual_team_prompts for insert to authenticated
  with check (organization_id = public.current_organization_id() and public.is_leader_or_admin());

drop policy if exists vt_prompt_versions_read on public.virtual_team_prompt_versions;
create policy vt_prompt_versions_read on public.virtual_team_prompt_versions for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_approved());

drop policy if exists vt_audit_admin_read on public.virtual_team_audit_logs;
create policy vt_audit_admin_read on public.virtual_team_audit_logs for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_admin());

drop policy if exists vt_usage_admin_read on public.virtual_team_usage;
create policy vt_usage_admin_read on public.virtual_team_usage for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_admin());

-- Table privileges: clients may read these tables. Writes are granted only where a policy allows them.
revoke all on public.virtual_team_settings, public.virtual_team_members, public.virtual_team_conversations,
  public.virtual_team_messages, public.virtual_team_missions, public.virtual_team_tasks,
  public.virtual_team_deliverables, public.virtual_team_prompts, public.virtual_team_prompt_versions,
  public.virtual_team_audit_logs, public.virtual_team_usage from anon;
grant select on public.virtual_team_settings, public.virtual_team_members, public.virtual_team_conversations,
  public.virtual_team_messages, public.virtual_team_missions, public.virtual_team_tasks,
  public.virtual_team_deliverables, public.virtual_team_prompts, public.virtual_team_prompt_versions,
  public.virtual_team_audit_logs, public.virtual_team_usage to authenticated;
grant insert, update, delete on public.virtual_team_settings, public.virtual_team_members to authenticated;
grant insert on public.virtual_team_prompts to authenticated;

-- ===== Audit helper =====
create or replace function public.vt_audit(
  p_org uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.virtual_team_audit_logs (organization_id, actor_user_id, action, target_type, target_id, detail)
  values (p_org, auth.uid(), p_action, coalesce(p_target_type, ''), coalesce(p_target_id, ''), coalesce(p_detail, '{}'::jsonb))
$$;
revoke all on function public.vt_audit(uuid, text, text, text, jsonb) from public, anon;

-- ===== Bootstrap: settings, six employees, Manager and the team chat (idempotent) =====
create or replace function public.virtual_team_bootstrap() returns void
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
begin
  if org is null or not public.is_approved() then
    raise exception 'Approved company access is required.' using errcode = '42501';
  end if;

  insert into public.virtual_team_settings (organization_id, updated_by)
  values (org, auth.uid())
  on conflict (organization_id) do nothing;

  insert into public.virtual_team_members
    (organization_id, member_key, display_name, job_title, role_description, gender,
     personality, communication_style, skills, is_manager, created_by)
  values
    (org, 'manager', 'Manager', 'Virtual CEO',
     'Understands the Admin''s instructions, plans missions, delegates to the right employees, reviews their work and reports back.',
     'neutral',
     'Calm, decisive and organised. Asks for clarity before committing the team to expensive work.',
     'Clear, brief and structured. Summarises the decision and the next step.',
     array['planning', 'delegation', 'review'], true, auth.uid()),
    (org, 'local-scout', 'Arjun', 'Local Scout & Business Researcher',
     'Finds potential businesses and markets, records official websites and public contact details with source URLs, and labels every lead as verified, unverified, inferred or missing.',
     'male',
     'Energetic and curious. Enjoys finding opportunities, but insists on sources before getting excited.',
     'Friendly and quick. Lists findings clearly with sources.',
     array['market research', 'lead discovery', 'source tracking'], false, auth.uid()),
    (org, 'technical-auditor', 'Vikram', 'Technical Auditor',
     'Reviews publicly accessible websites for responsiveness, accessibility, SEO structure and visible usability issues. Never claims to have tested something it could not access.',
     'male',
     'Precise and sceptical. Prefers measured evidence to opinions and says so when something was not checked.',
     'Direct and technical. Uses checklists and severity levels.',
     array['web audit', 'accessibility', 'SEO', 'usability'], false, auth.uid()),
    (org, 'data-analyst', 'Rohan', 'Data Analyst & Data Quality Specialist',
     'Cleans datasets, detects duplicates, validates records and prepares structured outputs. Flags data quality problems before they reach reports.',
     'male',
     'Methodical and patient. Challenges any figure that cannot be traced to a source.',
     'Concise. Reports counts, exceptions and assumptions.',
     array['data cleaning', 'validation', 'deduplication', 'reporting'], false, auth.uid()),
    (org, 'sales-strategist', 'Karan', 'Sales & Business Development Strategist',
     'Analyses prospects, prioritises leads, suggests service packages and proposal outlines, and plans follow-ups. Drafts only; never sends anything externally.',
     'male',
     'Confident and persuasive, but willing to disagree with the team when the evidence points elsewhere.',
     'Persuasive and practical. Gives options with trade-offs.',
     array['prospect analysis', 'proposals', 'outreach planning'], false, auth.uid()),
    (org, 'business-analyst', 'Priya', 'Business Analyst & Operations Controller',
     'Monitors the company''s actual revenue, expenses, payments and overdue work. Prepares summaries from real records only and states clearly when data is missing.',
     'female',
     'Careful and measured. Raises budget and cash concerns early and politely.',
     'Clear and numerical. Separates facts from estimates.',
     array['finance review', 'operations', 'reporting', 'budget tracking'], false, auth.uid()),
    (org, 'prompt-engineer', 'Meera', 'Prompt Engineer & AI Workflow Specialist',
     'Creates structured, reusable prompts for niches and workflows, reviews them for ambiguity and hallucination risk, and records them in the permanent Prompt Library.',
     'female',
     'Thoughtful and thorough. Asks what the output will be used for before writing.',
     'Structured. Uses headings, variables and clear quality criteria.',
     array['prompt design', 'workflow design', 'quality review'], false, auth.uid())
  on conflict (organization_id, member_key) do nothing;

  insert into public.virtual_team_conversations (organization_id, kind, title)
  values (org, 'group', 'Team chat')
  on conflict (organization_id) where kind = 'group' do nothing;
end $$;
grant execute on function public.virtual_team_bootstrap() to authenticated;

-- ===== Operating mode (Solo or Team) =====
create or replace function public.virtual_team_set_mode(p_mode text) returns text
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
  active_count integer;
  previous text;
begin
  if not public.is_admin() then
    raise exception 'Only the Admin can change the operating mode.' using errcode = '42501';
  end if;
  if p_mode not in ('solo', 'team') then
    raise exception 'Mode must be solo or team.' using errcode = '22023';
  end if;
  perform public.virtual_team_bootstrap();

  select operating_mode into previous from public.virtual_team_settings where organization_id = org;
  select count(*) into active_count from public.virtual_team_missions
   where organization_id = org and status in ('awaiting_approval', 'queued', 'running', 'reviewing', 'paused');

  update public.virtual_team_settings
     set operating_mode = p_mode, updated_by = auth.uid(), updated_at = now()
   where organization_id = org;

  perform public.vt_audit(org, 'mode.changed', 'settings', org::text,
    jsonb_build_object('from', previous, 'to', p_mode, 'active_missions', active_count));
  return p_mode;
end $$;
grant execute on function public.virtual_team_set_mode(text) to authenticated;

-- ===== Admin deletion (WhatsApp-style: removes the rows from the database) =====
create or replace function public.virtual_team_delete_message(p_message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
  conv uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the Admin can delete messages.' using errcode = '42501';
  end if;
  delete from public.virtual_team_messages
   where id = p_message_id and organization_id = org
  returning conversation_id into conv;
  if conv is null then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  perform public.vt_audit(org, 'message.deleted', 'message', p_message_id::text,
    jsonb_build_object('conversation_id', conv));
end $$;
grant execute on function public.virtual_team_delete_message(uuid) to authenticated;

-- Deleting a chat removes its messages, its missions, their tasks and their deliverables.
create or replace function public.virtual_team_delete_conversation(p_conversation_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
  conv_kind text;
  message_count integer;
  mission_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only the Admin can delete chats.' using errcode = '42501';
  end if;
  select kind into conv_kind from public.virtual_team_conversations
   where id = p_conversation_id and organization_id = org;
  if conv_kind is null then
    raise exception 'Chat not found.' using errcode = 'P0002';
  end if;
  select count(*) into message_count from public.virtual_team_messages
   where conversation_id = p_conversation_id and organization_id = org;
  select count(*) into mission_count from public.virtual_team_missions
   where conversation_id = p_conversation_id and organization_id = org;

  delete from public.virtual_team_conversations
   where id = p_conversation_id and organization_id = org;

  perform public.vt_audit(org, 'conversation.deleted', 'conversation', p_conversation_id::text,
    jsonb_build_object('kind', conv_kind, 'messages', message_count, 'missions', mission_count));
  return message_count;
end $$;
grant execute on function public.virtual_team_delete_conversation(uuid) to authenticated;

-- ===== Mission approval, pause, resume and cancel (Admin) =====
create or replace function public.virtual_team_review_mission(p_mission_id uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
  current_status text;
  next_status text;
begin
  if not public.is_admin() then
    raise exception 'Only the Admin can approve or change missions.' using errcode = '42501';
  end if;
  select status into current_status from public.virtual_team_missions
   where id = p_mission_id and organization_id = org for update;
  if current_status is null then
    raise exception 'Mission not found.' using errcode = 'P0002';
  end if;

  next_status := case
    when p_action = 'approve' and current_status = 'awaiting_approval' then 'queued'
    when p_action = 'pause' and current_status in ('queued', 'running') then 'paused'
    when p_action = 'resume' and current_status = 'paused' then 'queued'
    when p_action = 'cancel' and current_status in ('awaiting_approval', 'queued', 'running', 'paused') then 'cancelled'
    else null
  end;
  if next_status is null then
    raise exception 'That action is not allowed while the mission is %.', current_status using errcode = '55000';
  end if;

  update public.virtual_team_missions
     set status = next_status,
         approved_by = case when p_action = 'approve' then auth.uid() else approved_by end,
         updated_at = now()
   where id = p_mission_id;
  if next_status = 'cancelled' then
    update public.virtual_team_tasks set status = 'cancelled', updated_at = now()
     where mission_id = p_mission_id and status in ('queued', 'running');
  end if;

  perform public.vt_audit(org, 'mission.' || p_action, 'mission', p_mission_id::text,
    jsonb_build_object('from', current_status, 'to', next_status));
  return next_status;
end $$;
grant execute on function public.virtual_team_review_mission(uuid, text) to authenticated;

-- ===== Prompt Library: every change creates a version; approved prompts drop back to draft on edit =====
create or replace function public.virtual_team_save_prompt(
  p_prompt_id uuid, p_title text, p_body text, p_reason text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
  r public.virtual_team_prompts%rowtype;
  clean_title text := left(trim(coalesce(p_title, '')), 200);
begin
  if not public.is_leader_or_admin() then
    raise exception 'Only Admins and Leaders can edit prompts.' using errcode = '42501';
  end if;
  if length(clean_title) < 1 or length(coalesce(p_body, '')) < 1 then
    raise exception 'A prompt needs a title and a body.' using errcode = '22023';
  end if;
  select * into r from public.virtual_team_prompts
   where id = p_prompt_id and organization_id = org for update;
  if not found then
    raise exception 'Prompt not found.' using errcode = 'P0002';
  end if;
  if r.title = clean_title and r.body = p_body then
    return r.version;
  end if;

  insert into public.virtual_team_prompt_versions
    (organization_id, prompt_id, version, title, body, change_reason, changed_by_user)
  values (org, r.id, r.version, r.title, r.body, left(coalesce(p_reason, ''), 500), auth.uid());

  update public.virtual_team_prompts
     set title = clean_title,
         body = p_body,
         version = r.version + 1,
         status = case when r.status = 'approved' then 'draft' else r.status end,
         approved_by = case when r.status = 'approved' then null else r.approved_by end,
         approved_at = case when r.status = 'approved' then null else r.approved_at end,
         updated_at = now()
   where id = r.id;

  perform public.vt_audit(org, 'prompt.versioned', 'prompt', r.id::text,
    jsonb_build_object('from_version', r.version, 'to_version', r.version + 1));
  return r.version + 1;
end $$;
grant execute on function public.virtual_team_save_prompt(uuid, text, text, text) to authenticated;

create or replace function public.virtual_team_set_prompt_status(p_prompt_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
begin
  if not public.is_admin() then
    raise exception 'Only the Admin can approve or archive prompts.' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'approved', 'archived') then
    raise exception 'Unknown prompt status.' using errcode = '22023';
  end if;
  update public.virtual_team_prompts
     set status = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() else null end,
         approved_at = case when p_status = 'approved' then now() else null end,
         updated_at = now()
   where id = p_prompt_id and organization_id = org;
  if not found then
    raise exception 'Prompt not found.' using errcode = 'P0002';
  end if;
  perform public.vt_audit(org, 'prompt.status', 'prompt', p_prompt_id::text, jsonb_build_object('status', p_status));
  return p_status;
end $$;
grant execute on function public.virtual_team_set_prompt_status(uuid, text) to authenticated;

-- ===== Background execution (service role only) =====
create or replace function public.virtual_team_recover_stuck() returns integer
language sql security definer set search_path = public as $$
  with recovered as (
    update public.virtual_team_tasks
       set status = 'queued', next_run_at = now(), claimed_at = null,
           last_error = 'Recovered after an interrupted run.', updated_at = now()
     where status = 'running' and claimed_at < now() - interval '10 minutes'
    returning id
  )
  select count(*)::integer from recovered
$$;

-- Claims queued tasks in mission order. A task is only claimable when every earlier task in its
-- mission is done, which gives employees a sequence in which later colleagues build on earlier work.
create or replace function public.virtual_team_claim_tasks(p_limit integer)
returns setof public.virtual_team_tasks
language sql security definer set search_path = public as $$
  update public.virtual_team_tasks t
     set status = 'running', attempts = t.attempts + 1, claimed_at = now(), updated_at = now()
   where t.id in (
     select task.id
       from public.virtual_team_tasks task
       join public.virtual_team_missions m on m.id = task.mission_id
      where task.status = 'queued'
        and task.next_run_at <= now()
        and m.status in ('queued', 'running')
        and not exists (
          select 1 from public.virtual_team_tasks earlier
           where earlier.mission_id = task.mission_id
             and earlier.position < task.position
             and earlier.status <> 'done')
      order by m.created_at, task.position
      for update of task skip locked
      limit greatest(p_limit, 0)
   )
  returning t.*
$$;

-- Scheduled briefing: only in Solo mode, once per organisation per day, using real records.
create or replace function public.virtual_team_enqueue_briefings() returns integer
language plpgsql security definer set search_path = public as $$
declare
  s record;
  group_id uuid;
  mission_id uuid;
  created_count integer := 0;
begin
  for s in
    select * from public.virtual_team_settings
     where operating_mode = 'solo' and background_enabled
  loop
    continue when exists (
      select 1 from public.virtual_team_missions
       where organization_id = s.organization_id and origin = 'scheduled'
         and created_at::date = current_date);
    continue when not exists (
      select 1 from public.virtual_team_members
       where organization_id = s.organization_id and member_key = 'business-analyst' and active);
    select id into group_id from public.virtual_team_conversations
     where organization_id = s.organization_id and kind = 'group';
    continue when group_id is null;

    insert into public.virtual_team_missions
      (organization_id, conversation_id, title, request, status, origin, token_budget)
    values (s.organization_id, group_id, 'Daily business briefing',
            'Prepare today''s business briefing from the company records: money received, expenses, net position and overdue work. Use only the figures supplied.',
            'queued', 'scheduled', s.mission_token_budget)
    returning id into mission_id;

    insert into public.virtual_team_tasks
      (organization_id, mission_id, member_id, position, instruction)
    select s.organization_id, mission_id, id, 1,
           'Prepare the daily financial and operational briefing from the figures supplied. Separate facts from estimates and state any missing data.'
      from public.virtual_team_members
     where organization_id = s.organization_id and member_key = 'business-analyst' and active;

    created_count := created_count + 1;
  end loop;
  return created_count;
end $$;

-- Called by pg_cron every minute. Does nothing until the Vault secrets exist.
create or replace function public.virtual_team_dispatch_worker() returns void
language plpgsql security definer set search_path = public as $$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name = 'virtual_team_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'virtual_team_worker_secret';
  if worker_url is null or worker_secret is null then
    return;
  end if;
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', worker_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end $$;

-- Only the scheduler and the service role run background functions.
revoke all on function public.virtual_team_recover_stuck() from public, anon, authenticated;
revoke all on function public.virtual_team_claim_tasks(integer) from public, anon, authenticated;
revoke all on function public.virtual_team_enqueue_briefings() from public, anon, authenticated;
revoke all on function public.virtual_team_dispatch_worker() from public, anon, authenticated;

-- ===== Schedules (pg_cron) =====
do $$
begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from cron.job where jobname = 'virtual-team-worker') then
      perform cron.unschedule('virtual-team-worker');
    end if;
    if exists (select 1 from cron.job where jobname = 'virtual-team-briefings') then
      perform cron.unschedule('virtual-team-briefings');
    end if;
    perform cron.schedule('virtual-team-worker', '* * * * *', 'select public.virtual_team_dispatch_worker()');
    perform cron.schedule('virtual-team-briefings', '30 2 * * *', 'select public.virtual_team_enqueue_briefings()');
  end if;
end $$;
