-- Virtual Team: Clear Chat, and Settings as the single controller of the operating mode.
-- Run after supabase/schema.sql and supabase/20261105_virtual_team.sql. Safe to re-run.

-- ===== 1. Settings → operating mode (single source of truth) =====

-- The Business type in Settings is stored in public.records (entity 'OrgSettings').
-- Solo is the app default when no value has been saved, matching the Settings form.
create or replace function public.vt_mode_from_settings(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when lower(coalesce((
      select r.data ->> 'business_type'
        from public.records r
       where r.entity = 'OrgSettings' and r.organization_id = p_org
       order by r.updated_at desc
       limit 1
    ), 'solo')) = 'team' then 'team'
    else 'solo'
  end
$$;
revoke all on function public.vt_mode_from_settings(uuid) from public, anon;

-- Mirror every saved Settings change into virtual_team_settings, so Virtual Team, the
-- background worker and the briefing scheduler all read the mode that Settings saved.
create or replace function public.vt_sync_mode_from_settings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_mode text;
  old_mode text;
begin
  if new.organization_id is null then
    return new;
  end if;
  new_mode := public.vt_mode_from_settings(new.organization_id);

  select operating_mode into old_mode
    from public.virtual_team_settings
   where organization_id = new.organization_id;

  insert into public.virtual_team_settings (organization_id, operating_mode, updated_by, updated_at)
  values (new.organization_id, new_mode, auth.uid(), now())
  on conflict (organization_id) do update
    set operating_mode = excluded.operating_mode,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  if old_mode is distinct from new_mode then
    insert into public.virtual_team_audit_logs
      (organization_id, actor_user_id, action, target_type, target_id, detail)
    values (new.organization_id, auth.uid(), 'mode.changed', 'settings', new.organization_id::text,
      jsonb_build_object('from', coalesce(old_mode, 'none'), 'to', new_mode, 'source', 'settings'));
  end if;
  return new;
end $$;

drop trigger if exists records_sync_virtual_team_mode on public.records;
create trigger records_sync_virtual_team_mode
  after insert or update of data on public.records
  for each row when (new.entity = 'OrgSettings')
  execute function public.vt_sync_mode_from_settings();

-- New workspaces default to Solo, matching the Settings default.
alter table public.virtual_team_settings alter column operating_mode set default 'solo';

-- Backfill from the saved Settings for every organisation that has one.
insert into public.virtual_team_settings (organization_id, operating_mode)
select distinct on (r.organization_id) r.organization_id, public.vt_mode_from_settings(r.organization_id)
  from public.records r
 where r.entity = 'OrgSettings' and r.organization_id is not null
 order by r.organization_id, r.updated_at desc
on conflict (organization_id) do update set operating_mode = excluded.operating_mode;

-- Organisations with no saved Settings show Solo in Settings, so they are set to Solo here too.
update public.virtual_team_settings s
   set operating_mode = 'solo'
 where not exists (
   select 1 from public.records r
    where r.entity = 'OrgSettings' and r.organization_id = s.organization_id);

-- The mode is no longer changed from Virtual Team. Settings is the only control.
create or replace function public.virtual_team_set_mode(p_mode text) returns text
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'The operating mode is set in Settings (Business type). Change it there.'
    using errcode = '42501';
end $$;

-- ===== 2. Clear Chat: delete every message in one chat, keep the chat =====

create or replace function public.virtual_team_clear_conversation(p_conversation_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  org uuid := public.current_organization_id();
  removed integer;
begin
  if not public.is_admin() then
    raise exception 'Only the Admin can clear chats.' using errcode = '42501';
  end if;

  -- Lock the chat row so two clears cannot interleave.
  perform 1 from public.virtual_team_conversations
   where id = p_conversation_id and organization_id = org
   for update;
  if not found then
    raise exception 'Chat not found.' using errcode = 'P0002';
  end if;

  delete from public.virtual_team_messages
   where conversation_id = p_conversation_id and organization_id = org;
  get diagnostics removed = row_count;

  -- Audit: counts only. Message bodies are never written to the audit log.
  perform public.vt_audit(org, 'conversation.cleared', 'conversation', p_conversation_id::text,
    jsonb_build_object('messages', removed));
  return removed;
end $$;
revoke all on function public.virtual_team_clear_conversation(uuid) from public, anon;
grant execute on function public.virtual_team_clear_conversation(uuid) to authenticated;

-- ===== 3. Manager display name =====
-- Only the display name changes. is_manager and member_key stay fixed, as before.
update public.virtual_team_members
   set display_name = 'Manager'
 where is_manager and display_name = 'Manager AI';
