-- SR-44: deleting a quote must also delete its design and the design's photo rows (no orphans).
--
-- Before: designs.quote_id and photos.design_id were ON DELETE SET NULL, so deleting a quote left its design, the design's
-- photo rows and the stored files behind, invisible to the user and still using Free storage.
-- After: ON DELETE CASCADE. One DELETE on quotes removes the design and photo rows atomically (referential actions run with the
-- table owner's rights, so this works for a signed-in user deleting their own company's quote and for nothing else: the quotes
-- RLS policy still decides which quotes can be deleted).
-- Stored FILES cannot be removed by SQL (Supabase blocks direct deletes on storage tables), so the app removes them through the
-- Storage API BEFORE it deletes the quote, and only deletes the quote if that succeeded.
-- Each table is changed in one ALTER (drop + add together) so there is no moment without the constraint.
--
-- NOTE: the Supabase MCP connector hangs on DROP statements. Run this file in the SQL editor of each project.

alter table public.designs
  drop constraint designs_quote_id_fkey,
  add constraint designs_quote_id_fkey foreign key (quote_id) references public.quotes (id) on delete cascade;

alter table public.photos
  drop constraint photos_design_id_fkey,
  add constraint photos_design_id_fkey foreign key (design_id) references public.designs (id) on delete cascade;
