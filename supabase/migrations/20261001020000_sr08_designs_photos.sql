-- SR-08 Part 1: make `designs`, `photos` and the `yard-photos` bucket safe and fit for saving a contractor's draft design.
--
-- 1. designs gets a versioned JSON `state` (the whole canvas state), `schema_version`, and `is_draft`.
--    One draft per user (partial unique index): the draft is replaced on each autosave; finalised designs are is_draft = false.
-- 2. RLS rewritten per command, for signed-in users only. Reads: own company. Writes: own company AND user_id = auth.uid(),
--    plus the cross-references (quote_id, design_id, storage_path) must point inside the caller's own company.
--    Before this, the single ALL policy had no user_id check and let a row point at another company's design or file path.
-- 3. anon loses all access to both tables.
-- 4. Bucket gets a 5 MB file limit and JPEG/PNG/WebP only. (The app shrinks photos to ~300 KB before upload.)
-- The storage.objects policies (folder name must equal the caller's company_id) are unchanged and re-tested.

alter table public.designs
  add column schema_version integer not null default 1,
  add column state jsonb,
  add column is_draft boolean not null default false,
  add constraint designs_state_size check (state is null or pg_column_size(state) < 1000000);

create unique index designs_one_draft_per_user on public.designs (user_id) where is_draft;
create index designs_company_id_idx on public.designs (company_id);
create index photos_company_id_idx on public.photos (company_id);
create index photos_design_id_idx on public.photos (design_id);

drop policy if exists designs_tenant_isolation on public.designs;
drop policy if exists photos_tenant_isolation on public.photos;

create policy designs_select on public.designs for select to authenticated
  using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()));
create policy designs_insert on public.designs for insert to authenticated
  with check (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and user_id = auth.uid()
    and (quote_id is null or quote_id in (select q.id from public.quotes q))
  );
create policy designs_update on public.designs for update to authenticated
  using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()) and user_id = auth.uid())
  with check (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and user_id = auth.uid()
    and (quote_id is null or quote_id in (select q.id from public.quotes q))
  );
create policy designs_delete on public.designs for delete to authenticated
  using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()) and user_id = auth.uid());

create policy photos_select on public.photos for select to authenticated
  using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()));
create policy photos_insert on public.photos for insert to authenticated
  with check (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and user_id = auth.uid()
    and storage_path like company_id::text || '/%'
    and (design_id is null or design_id in (select d.id from public.designs d))
  );
create policy photos_update on public.photos for update to authenticated
  using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()) and user_id = auth.uid())
  with check (
    company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    and user_id = auth.uid()
    and storage_path like company_id::text || '/%'
    and (design_id is null or design_id in (select d.id from public.designs d))
  );
create policy photos_delete on public.photos for delete to authenticated
  using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()) and user_id = auth.uid());

revoke all on public.designs, public.photos from anon;
revoke truncate, references, trigger on public.designs, public.photos from authenticated;

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'yard-photos';
