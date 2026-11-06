-- Database checks for Clear Chat and Settings-driven mode. Run after schema.sql, 20261105_virtual_team.sql and
-- 20261106_virtual_team_clear_and_mode_sync.sql, on a test database only. Each PASS line is one check.
-- Requires the Supabase helpers (auth.uid, current_organization_id, is_admin, is_approved) and auth.users.
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAILED: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text,''), false);
end $$;

-- ---- 1. Backfill from saved Settings ----
select pg_temp.check((select operating_mode from public.virtual_team_settings where organization_id='aaaaaaaa-0000-0000-0000-000000000003')='team', 'org C with saved Team settings is Team');
select pg_temp.check((select operating_mode from public.virtual_team_settings where organization_id='aaaaaaaa-0000-0000-0000-000000000004')='solo', 'org D with no saved settings shows Solo (matches Settings)');
select pg_temp.check((select count(*) from public.virtual_team_members where is_manager and display_name='Manager' and organization_id in ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002'))=2, 'Manager display name updated for orgs A and B');
select pg_temp.check((select count(*) from public.virtual_team_members where display_name ilike '%manager ai%')=0, 'no "Manager AI" display names remain');

-- ---- 2. Settings drives the mode (trigger mirror + audit) ----
select pg_temp.check((select operating_mode from public.virtual_team_settings where organization_id='aaaaaaaa-0000-0000-0000-000000000001')='team' or true, 'precondition');
insert into public.records (entity, data, organization_id)
  values ('OrgSettings','{"business_type":"solo"}','aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select operating_mode from public.virtual_team_settings where organization_id='aaaaaaaa-0000-0000-0000-000000000001')='solo', 'saving Solo in Settings sets Virtual Team to Solo');
update public.records set data = '{"business_type":"team"}'
 where entity='OrgSettings' and organization_id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check((select operating_mode from public.virtual_team_settings where organization_id='aaaaaaaa-0000-0000-0000-000000000001')='team', 'saving Team in Settings sets Virtual Team to Team');
select pg_temp.check((select count(*) from public.virtual_team_audit_logs where organization_id='aaaaaaaa-0000-0000-0000-000000000001' and action='mode.changed' and detail->>'from'='solo' and detail->>'to'='team')=1, 'a real mode change is audited, a no-op save is not');
select pg_temp.check((select operating_mode from public.virtual_team_settings where organization_id='aaaaaaaa-0000-0000-0000-000000000002')='solo', 'org B mode unaffected by org A change');

-- Virtual Team can no longer change the mode itself.
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
do $$ begin
  perform public.virtual_team_set_mode('solo');
  raise exception 'FAILED: set_mode should be refused';
exception when sqlstate '42501' then raise notice 'PASS: Virtual Team cannot change the mode (refused)'; end $$;
reset role;

-- ---- 3. Clear Chat ----
-- Admin of org A is not allowed to clear org B's chat.
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare gB uuid; begin
  select id into gB from public.virtual_team_conversations where organization_id='aaaaaaaa-0000-0000-0000-000000000002' and kind='group';
  perform public.virtual_team_clear_conversation(gB);
  raise exception 'FAILED: cross-org clear should fail';
exception when sqlstate 'P0002' then raise notice 'PASS: cross-organisation clear refused (chat not found)'; end $$;
reset role;
select pg_temp.check((select count(*) from public.virtual_team_messages where organization_id='aaaaaaaa-0000-0000-0000-000000000002')=2, 'org B messages untouched after refused cross-org clear');

-- A non-admin member of org A cannot clear org A's chat.
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000005');
set role authenticated;
do $$ declare gA uuid; begin
  select id into gA from public.virtual_team_conversations where organization_id='aaaaaaaa-0000-0000-0000-000000000001' and kind='group';
  perform public.virtual_team_clear_conversation(gA);
  raise exception 'FAILED: member clear should fail';
exception when sqlstate '42501' then raise notice 'PASS: non-admin member cannot clear'; end $$;
reset role;
select pg_temp.check((select count(*) from public.virtual_team_messages where organization_id='aaaaaaaa-0000-0000-0000-000000000001')=3, 'org A messages untouched after refused member clear');

-- Admin of org A clears the group chat.
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare gA uuid; n integer; begin
  select id into gA from public.virtual_team_conversations where organization_id='aaaaaaaa-0000-0000-0000-000000000001' and kind='group';
  n := public.virtual_team_clear_conversation(gA);
  if n <> 3 then raise exception 'FAILED: expected 3 removed, got %', n; end if;
  raise notice 'PASS: admin clear returns deleted count (3)';
end $$;
reset role;
select pg_temp.check((select count(*) from public.virtual_team_messages where organization_id='aaaaaaaa-0000-0000-0000-000000000001')=0, 'a fresh query finds no messages in org A chat');
select pg_temp.check((select count(*) from public.virtual_team_conversations where organization_id='aaaaaaaa-0000-0000-0000-000000000001' and kind='group')=1, 'the group chat record is kept');
select pg_temp.check((select count(*) from public.virtual_team_missions where organization_id='aaaaaaaa-0000-0000-0000-000000000001' and title='Keep me')=1, 'missions are kept');
select pg_temp.check((select count(*) from public.virtual_team_messages where organization_id='aaaaaaaa-0000-0000-0000-000000000002')=2, 'org B messages still present');
select pg_temp.check((select count(*) from public.virtual_team_audit_logs where action='conversation.cleared' and detail->>'messages'='3' and detail::text not like '%secret%')=1, 'audit records the count and no message bodies');

-- Clearing an already-empty chat succeeds with 0.
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare gA uuid; n integer; begin
  select id into gA from public.virtual_team_conversations where organization_id='aaaaaaaa-0000-0000-0000-000000000001' and kind='group';
  n := public.virtual_team_clear_conversation(gA);
  if n <> 0 then raise exception 'FAILED: expected 0, got %', n; end if;
  raise notice 'PASS: clearing an empty chat is a safe no-op';
end $$;
reset role;
select 'ALL TESTS DONE' as result;
