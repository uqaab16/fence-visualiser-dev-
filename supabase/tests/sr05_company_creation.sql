-- SR-05 exploit test. STAGING ONLY: it writes, then rolls everything back by raising at the end.
-- Tries to create companies without going through the onboarding function, as anon and as a signed-in user, then checks
-- that a brand-new signup still onboards. Result is returned in the error text. Expected after the fix: every attack BLOCKED,
-- both controls OK.
do $t$
declare
  a uuid; a_co uuid; u uuid := gen_random_uuid(); n int; r text; c int; out text := '';
begin
  select id, company_id into a, a_co from profiles limit 1;
  select count(*) into c from companies;
  out := out || format(E'companies before: %s\n', c);

  -- anon (signed out)
  set local role anon;
  begin
    insert into companies (name) values ('SR05 anon attack');
    out := out || E'1 anon INSERT into companies                 : ALLOWED\n';
  exception when others then out := out || format(E'1 anon INSERT into companies                 : BLOCKED (%s)\n', sqlerrm); end;
  begin
    insert into companies (name) select 'SR05 anon flood '||g from generate_series(1,50) g;
    out := out || E'2 anon INSERT 50 companies in one request    : ALLOWED\n';
  exception when others then out := out || format(E'2 anon INSERT 50 companies in one request    : BLOCKED (%s)\n', sqlerrm); end;
  out := out || format(E'3 anon has EXECUTE on onboarding function : %s\n', has_function_privilege('anon','public.create_company_and_profile(text)','EXECUTE'));
  reset role;

  -- signed-in user with a profile
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    insert into companies (name) values ('SR05 user attack');
    out := out || E'4 signed-in INSERT into companies            : ALLOWED\n';
  exception when others then out := out || format(E'4 signed-in INSERT into companies            : BLOCKED (%s)\n', sqlerrm); end;
  select create_company_and_profile('x')::text into r;
  out := out || format(E'5 control: existing user RPC is idempotent : %s\n', case when r = a_co::text then 'OK' else 'WRONG '||coalesce(r,'null') end);
  reset role;

  select count(*) into n from companies;
  out := out || format(E'companies after attacks: %s (added by attacks: %s)\n', n, n - c);

  -- brand-new signup, end to end
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sr05-newuser@example.test', now(), now());
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  declare co uuid; pr text; vis int; own int; begin
    co := create_company_and_profile('SR05 New Co');
    select count(*), max(role) into vis, pr from profiles where id = u and company_id = co;
    select count(*) into own from companies where id = co;
    out := out || format(E'6 control: new signup creates company    : %s, profile rows=%s, role=%s, can read own company=%s (expect t,1,admin,1)\n', co is not null, vis, pr, own);
  end;
  reset role;

  raise exception E'SR05 RESULTS\n%', out;
end $t$;
