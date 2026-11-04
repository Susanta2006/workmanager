-- Preserve issued bilateral legal documents. Drafts remain editable; issued documents may
-- only advance their operational status and cannot be rewritten or deleted.
create or replace function public.protect_issued_legal_document()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  legal_types text[] := array['agreement', 'nda', 'sow', 'maintenance', 'certificate', 'handover', 'custom'];
begin
  if old.entity <> 'Document'
     or not coalesce(old.data ->> 'doc_type' = any(legal_types), false)
     or coalesce(old.data ->> 'status', 'draft') = 'draft' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Issued legal documents cannot be deleted. Create a revision to record agreed changes.'
      using errcode = '55000';
  end if;

  if new.data ->> 'status' = 'draft' then
    raise exception 'An issued legal document cannot be reverted to draft.'
      using errcode = '55000';
  end if;

  if (new.data - array['status']) is distinct from (old.data - array['status']) then
    raise exception 'Issued legal document content is immutable. Create a revised document to record agreed changes.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_issued_legal_document on public.records;
create trigger protect_issued_legal_document
before update or delete on public.records
for each row execute function public.protect_issued_legal_document();
