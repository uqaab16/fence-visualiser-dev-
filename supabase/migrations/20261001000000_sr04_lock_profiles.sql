-- SR-04: stop users changing their own profiles.company_id / role.
--
-- Hole: profiles_update_own had USING (id = auth.uid()) and no WITH CHECK, and UPDATE was granted on every column,
-- so a signed-in user could set their own company_id to another company and read that tenant's data.
-- profiles_insert_own had the same flaw for users who had no profile yet.
--
-- Fix: the app never writes profiles directly. It only reads its own row and calls create_company_and_profile()
-- (SECURITY DEFINER, runs as the owner and ignores these grants). So clients get no write access at all:
-- the policies are dropped and the table privileges revoked. Both layers must fail for the attack to work.
-- profiles_read_own_company (SELECT, own row) is untouched. Nothing else changes.

drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
revoke select on public.profiles from anon;
