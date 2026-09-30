-- Baseline migration: the complete Fencely database schema as it exists in production on 2026-09-30.
--
-- Generated from the LIVE production catalogs (pg_get_constraintdef / pg_get_functiondef / pg_policies /
-- pg_attribute), read-only, not from the older hand-written migration files (archived in
-- supabase/migrations_legacy/). Running this on an empty Supabase project rebuilds the database.
--
-- It deliberately mirrors production EXACTLY, including two known flaws tracked in SAAS_READINESS.md:
--   SR-04  profiles_update_own has no WITH CHECK, so a user can change their own company_id / role.
--   SR-05  companies_insert_own allows any client to insert companies; create_company_and_profile
--          is executable by anon.
-- Fixes ship as separate later migrations, tested on staging first.
--
-- Table grants (anon / authenticated / service_role) and function execute grants come from Supabase's
-- default privileges for the public schema, so they are not repeated here. Parity is verified by diff.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------- tables

create table public.companies (
  id uuid default gen_random_uuid() not null,
  name text not null,
  config jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.custom_pricing (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  slat_material_cost numeric default 135 not null,
  blade_material_cost numeric default 155 not null,
  post_rail_material_cost numeric default 105 not null,
  slat_labor_cost numeric default 85 not null,
  blade_labor_cost numeric default 85 not null,
  post_rail_labor_cost numeric default 75 not null,
  standard_post_cost numeric default 0 not null,
  corner_post_cost numeric default 65 not null,
  h_post_cost numeric default 95 not null,
  gate_post_cost numeric default 85 not null,
  decorative_post_cost numeric default 145 not null,
  single_gate_cost numeric default 350 not null,
  double_gate_cost numeric default 750 not null,
  updated_at timestamp with time zone default now() not null,
  slat_standard_post_cost integer default 0,
  slat_corner_post_cost integer default 65,
  slat_h_post_cost integer default 95,
  slat_gate_post_cost integer default 85,
  slat_decorative_post_cost integer default 145,
  slat_single_gate_cost integer default 350,
  slat_double_gate_cost integer default 750,
  slat_surcharge_65mm integer default 0,
  slat_surcharge_90mm integer default 18,
  post_rail_standard_post_cost integer default 0,
  post_rail_corner_post_cost integer default 65,
  post_rail_h_post_cost integer default 95,
  post_rail_gate_post_cost integer default 85,
  post_rail_decorative_post_cost integer default 145,
  post_rail_single_gate_cost integer default 350,
  post_rail_double_gate_cost integer default 750,
  post_rail_surcharge_2rail integer default 0,
  post_rail_surcharge_3rail integer default 15,
  post_rail_surcharge_4rail integer default 30,
  post_rail_surcharge_chainwire integer default 12,
  blade_standard_post_cost integer default 0,
  blade_corner_post_cost integer default 65,
  blade_h_post_cost integer default 95,
  blade_gate_post_cost integer default 85,
  blade_decorative_post_cost integer default 145,
  blade_single_gate_cost integer default 350,
  blade_double_gate_cost integer default 750,
  colorbond_standard_post_cost integer default 0,
  colorbond_corner_post_cost integer default 65,
  colorbond_h_post_cost integer default 95,
  colorbond_gate_post_cost integer default 85,
  colorbond_decorative_post_cost integer default 145,
  colorbond_single_gate_cost integer default 350,
  colorbond_double_gate_cost integer default 750,
  perforated_standard_post_cost integer default 0,
  perforated_corner_post_cost integer default 65,
  perforated_h_post_cost integer default 95,
  perforated_gate_post_cost integer default 85,
  perforated_decorative_post_cost integer default 145,
  perforated_single_gate_cost integer default 350,
  perforated_double_gate_cost integer default 750,
  colorbond_panel_material_cost integer default 130,
  colorbond_panel_labor_cost integer default 85,
  perforated_material_cost integer default 185,
  perforated_labor_cost integer default 85
);

create table public.designs (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  quote_id uuid,
  user_id uuid not null,
  name text default 'Untitled Design'::text not null,
  posts jsonb default '[]'::jsonb not null,
  segments jsonb default '[]'::jsonb not null,
  mask jsonb,
  material text,
  height integer,
  color jsonb,
  post_color jsonb,
  rail_count integer,
  slat_profile text,
  property_frontage numeric,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.photos (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  user_id uuid not null,
  design_id uuid,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamp with time zone default now() not null
);

create table public.profiles (
  id uuid not null,
  company_id uuid not null,
  email text not null,
  role text default 'user'::text not null,
  created_at timestamp with time zone default now() not null
);

create table public.quotes (
  id uuid default gen_random_uuid() not null,
  company_id uuid not null,
  user_id uuid not null,
  quote_number text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_address text,
  spec jsonb default '{}'::jsonb not null,
  line_items jsonb default '[]'::jsonb not null,
  total numeric default 0 not null,
  created_at timestamp with time zone default now() not null
);

-- ---------------------------------------------------------------- primary keys, unique, check

alter table public.companies add constraint companies_pkey PRIMARY KEY (id);
alter table public.custom_pricing add constraint custom_pricing_company_id_key UNIQUE (company_id);
alter table public.custom_pricing add constraint custom_pricing_pkey PRIMARY KEY (id);
alter table public.designs add constraint designs_pkey PRIMARY KEY (id);
alter table public.photos add constraint photos_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text])));
alter table public.quotes add constraint quotes_pkey PRIMARY KEY (id);

-- ---------------------------------------------------------------- foreign keys

alter table public.custom_pricing add constraint custom_pricing_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.designs add constraint designs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.designs add constraint designs_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL;
alter table public.designs add constraint designs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.photos add constraint photos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.photos add constraint photos_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.designs(id) ON DELETE SET NULL;
alter table public.photos add constraint photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.quotes add constraint quotes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
alter table public.quotes add constraint quotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------- functions

CREATE OR REPLACE FUNCTION public.create_company_and_profile(company_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id               uuid := auth.uid();
  v_email                 text;
  v_company_id            uuid;
  v_existing_company_id   uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT company_id INTO v_existing_company_id
  FROM profiles WHERE id = v_user_id;

  IF v_existing_company_id IS NOT NULL THEN
    RETURN v_existing_company_id;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  INSERT INTO companies (name) VALUES (company_name)
  RETURNING id INTO v_company_id;

  INSERT INTO profiles (id, company_id, email, role)
  VALUES (v_user_id, v_company_id, v_email, 'admin');

  RETURN v_company_id;
END;
$function$;

-- ---------------------------------------------------------------- row level security

alter table public.companies enable row level security;
alter table public.custom_pricing enable row level security;
alter table public.designs enable row level security;
alter table public.photos enable row level security;
alter table public.profiles enable row level security;
alter table public.quotes enable row level security;

create policy companies_insert_own on public.companies as PERMISSIVE for INSERT to public with check (true);
create policy companies_tenant_isolation on public.companies as PERMISSIVE for ALL to public using ((id IN ( SELECT profiles.company_id FROM public.profiles WHERE (profiles.id = auth.uid()))));
create policy designs_tenant_isolation on public.designs as PERMISSIVE for ALL to public using ((company_id = ( SELECT profiles.company_id FROM public.profiles WHERE (profiles.id = auth.uid()))));
create policy photos_tenant_isolation on public.photos as PERMISSIVE for ALL to public using ((company_id = ( SELECT profiles.company_id FROM public.profiles WHERE (profiles.id = auth.uid()))));
create policy pricing_tenant_isolation on public.custom_pricing as PERMISSIVE for ALL to public using ((company_id = ( SELECT profiles.company_id FROM public.profiles WHERE (profiles.id = auth.uid()))));
create policy profiles_insert_own on public.profiles as PERMISSIVE for INSERT to public with check ((id = auth.uid()));
create policy profiles_read_own_company on public.profiles as PERMISSIVE for SELECT to public using ((id = auth.uid()));
create policy profiles_update_own on public.profiles as PERMISSIVE for UPDATE to public using ((id = auth.uid()));
create policy quotes_tenant_isolation on public.quotes as PERMISSIVE for ALL to public using ((company_id = ( SELECT profiles.company_id FROM public.profiles WHERE (profiles.id = auth.uid()))));

-- ---------------------------------------------------------------- storage: private photo bucket + per-company folder policies

insert into storage.buckets (id, name, public) values ('yard-photos', 'yard-photos', false) on conflict (id) do nothing;

create policy photos_storage_delete on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'yard-photos'::text) AND ((storage.foldername(name))[1] = ( SELECT (profiles.company_id)::text AS company_id FROM public.profiles WHERE (profiles.id = auth.uid())))));
create policy photos_storage_read on storage.objects as PERMISSIVE for SELECT to public using (((bucket_id = 'yard-photos'::text) AND ((storage.foldername(name))[1] = ( SELECT (profiles.company_id)::text AS company_id FROM public.profiles WHERE (profiles.id = auth.uid())))));
create policy photos_storage_upload on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'yard-photos'::text) AND ((storage.foldername(name))[1] = ( SELECT (profiles.company_id)::text AS company_id FROM public.profiles WHERE (profiles.id = auth.uid())))));
