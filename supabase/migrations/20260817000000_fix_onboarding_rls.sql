-- Migration: fix_onboarding_rls
-- Created: 2026-08-17
--
-- Problem: the FOR ALL policy `companies_tenant_isolation` uses a USING clause
-- that references profiles.company_id. PostgreSQL applies this USING clause to
-- the RETURNING output of INSERT as well as to SELECT. On a first-time login no
-- profile row exists yet, so the USING subquery returns nothing and the chained
-- `.insert().select('id').single()` call receives zero rows — company_id comes
-- back null and onboarding crashes with a 500 error.
--
-- Fix: move company + profile creation into a SECURITY DEFINER function that
-- runs as the postgres superuser, bypassing RLS for its internal statements.
-- auth.uid() still correctly identifies the calling user, so data isolation is
-- maintained via explicit WHERE clauses inside the function rather than RLS.
-- The existing RLS policies continue to protect all normal (post-onboarding)
-- client-side reads and writes.
--
-- The function is idempotent: if a profile already exists it returns the
-- existing company_id without inserting anything.
--
-- Note: profiles.email is NOT NULL — we read the value from auth.users inside
-- the function (SECURITY DEFINER can access auth schema) and write it explicitly.

CREATE OR REPLACE FUNCTION public.create_company_and_profile(company_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id               uuid := auth.uid();
  v_email                 text;
  v_company_id            uuid;
  v_existing_company_id   uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency guard: if this user already has a profile, return its company.
  SELECT company_id INTO v_existing_company_id
  FROM profiles
  WHERE id = v_user_id;

  IF v_existing_company_id IS NOT NULL THEN
    RETURN v_existing_company_id;
  END IF;

  -- Read the user's email from auth.users (accessible because SECURITY DEFINER
  -- runs as postgres superuser; auth schema is otherwise off-limits to anon/authenticated).
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- Create the company. RETURNING works here because SECURITY DEFINER bypasses
  -- the USING visibility check on companies_tenant_isolation.
  INSERT INTO companies (name)
  VALUES (company_name)
  RETURNING id INTO v_company_id;

  -- Link the user to the new company as admin.
  -- email is NOT NULL on profiles, so we populate it from auth.users.
  INSERT INTO profiles (id, company_id, email, role)
  VALUES (v_user_id, v_company_id, v_email, 'admin');

  RETURN v_company_id;
END;
$$;

-- Revoke default public access; grant only to authenticated users.
REVOKE ALL ON FUNCTION public.create_company_and_profile(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_company_and_profile(text) TO authenticated;
