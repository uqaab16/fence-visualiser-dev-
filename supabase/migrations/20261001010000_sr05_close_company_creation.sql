-- SR-05: stop anyone creating companies directly.
--
-- Hole: companies_insert_own was FOR INSERT TO public WITH CHECK (true), so even a signed-out (anon) request could insert
-- unlimited rows into companies (could fill the 500 MB Free database). create_company_and_profile() was also executable by anon.
--
-- Fix: the app creates companies only through create_company_and_profile() (SECURITY DEFINER, owner privileges, unaffected by
-- RLS), so the open policy is dropped. With no INSERT policy left, companies_tenant_isolation's check (id must already belong
-- to the caller's company) rejects any new row. The function needs a signed-in user, so anon loses EXECUTE.
-- authenticated keeps EXECUTE: onboarding calls it from the browser.
-- Note: a signed-in user can still call the function repeatedly, but it is idempotent (returns the existing company).

drop policy if exists companies_insert_own on public.companies;
revoke execute on function public.create_company_and_profile(text) from anon;
