-- SR-04 exploit test. Run on STAGING only (it writes, then rolls everything back by raising at the end).
-- Picks two real profiles in different companies: ATTACKER and VICTIM, then tries the attacks as the attacker
-- through the same role/JWT the app uses. Result is returned in the error text: every attack should be BLOCKED.
do $t$
declare
  a uuid; a_co uuid; v uuid; v_co uuid; v_quote uuid;
  out text := ''; n int; r text;
begin
  select p1.id, p1.company_id, p2.id, p2.company_id into a, a_co, v, v_co
  from profiles p1 join profiles p2 on p1.company_id <> p2.company_id
  order by (select count(*) from quotes q where q.company_id = p2.company_id) desc limit 1;
  if a is null then raise exception 'need two profiles in different companies'; end if;
  select id into v_quote from quotes where company_id = v_co limit 1;
  if v_quote is null then
    insert into quotes (company_id, user_id, quote_number, customer_name) values (v_co, v, 'SR04-CANARY', 'canary') returning id into v_quote; -- victim canary quote
  end if;
  out := out || format(E'attacker %s (co %s) vs victim co %s\n', a, a_co, v_co);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- controls first: legit paths still work
  select count(*) into n from profiles where id = a;
  out := out || format(E'8 control: read own profile             : %s row(s) (expect 1)\n', n);
  select create_company_and_profile('x')::text into r;
  out := out || format(E'9 control: onboarding RPC returns own co : %s\n', case when r = a_co::text then 'OK (idempotent)' else 'WRONG '||r end);

  -- 5. other tables: write a row into the victim tenant
  begin
    insert into quotes (company_id, user_id, quote_number, customer_name) values (v_co, a, 'SR04-X', 'x');
    out := out || E'5 INSERT quote into victim company         : ALLOWED\n';
  exception when others then out := out || format(E'5 INSERT quote into victim company         : BLOCKED (%s)\n', sqlerrm); end;
  begin
    insert into quotes (company_id, user_id, quote_number, customer_name) values (a_co, a, 'SR04-OWN', 'own');
    update quotes set company_id = v_co where quote_number = 'SR04-OWN';
    out := out || E'5b REPOINT own quote at victim company      : ALLOWED\n';
  exception when others then out := out || format(E'5b REPOINT own quote at victim company      : BLOCKED (%s)\n', sqlerrm); end;
  begin
    update quotes set company_id = a_co where id = v_quote;
    get diagnostics n = row_count;
    out := out || format(E'6 UPDATE victim quote (hijack)           : %s\n', case when n > 0 then 'ALLOWED' else 'BLOCKED (0 rows visible)' end);
  exception when others then out := out || format(E'6 UPDATE victim quote (hijack)           : BLOCKED (%s)\n', sqlerrm); end;
  begin
    update custom_pricing set company_id = v_co where company_id = a_co;
    get diagnostics n = row_count;
    out := out || format(E'7 UPDATE own pricing row -> victim co    : %s\n', case when n > 0 then 'ALLOWED' else 'BLOCKED (0 rows)' end);
  exception when others then out := out || format(E'7 UPDATE own pricing row -> victim co    : BLOCKED (%s)\n', sqlerrm); end;

  -- 1. the exact attack: point own profile at the victim company
  begin
    update profiles set company_id = v_co where id = a;
    get diagnostics n = row_count;
    out := out || format(E'1 UPDATE own profile company_id -> victim : %s\n', case when n > 0 then 'ALLOWED (rows='||n||')' else 'BLOCKED (0 rows)' end);
  exception when others then out := out || format(E'1 UPDATE own profile company_id -> victim : BLOCKED (%s)\n', sqlerrm); end;

  -- 2. can the attacker now read the victim's quotes?
  select count(*) into n from quotes where company_id = v_co;
  out := out || format(E'2 attacker can read victim quotes        : %s (victim has quotes: yes)\n', case when n > 0 then 'YES, LEAKED '||n else 'no' end);

  -- 3. promote own role
  begin
    update profiles set role = 'admin' where id = a;
    get diagnostics n = row_count;
    out := out || format(E'3 UPDATE own role                       : %s\n', case when n > 0 then 'ALLOWED (rows='||n||')' else 'BLOCKED (0 rows)' end);
  exception when others then out := out || format(E'3 UPDATE own role                       : BLOCKED (%s)\n', sqlerrm); end;

  -- 4. insert a profile row straight into the victim company (a signed-in user who never onboarded)
  begin
    insert into profiles (id, company_id, email) values (a, v_co, 'x@x');
    out := out || E'4 INSERT profile into victim company       : ALLOWED\n';
  exception when unique_violation then out := out || E'4 INSERT profile into victim company       : (primary key hit, policy not tested; see 4b)\n';
            when others then out := out || format(E'4 INSERT profile into victim company       : BLOCKED (%s)\n', sqlerrm); end;
  out := out || format(E'4b table privileges for authenticated    : insert=%s update=%s delete=%s\n',
    has_table_privilege('authenticated','public.profiles','INSERT'), has_table_privilege('authenticated','public.profiles','UPDATE'), has_table_privilege('authenticated','public.profiles','DELETE'));

  reset role;
  raise exception E'SR04 RESULTS\n%', out; -- rolls back everything this test did
end $t$;
