-- Found by the production-vs-staging parity diff: on production, EXECUTE on
-- create_company_and_profile was revoked from PUBLIC by hand (no migration recorded it).
-- Explicit grants to postgres, anon, authenticated and service_role remain (Supabase defaults).
-- Mirrors production; tightening anon access is tracked separately as SR-05.
revoke all on function public.create_company_and_profile(text) from public;
