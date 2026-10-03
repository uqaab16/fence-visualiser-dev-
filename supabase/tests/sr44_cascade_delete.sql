-- SR-44 cascade test. STAGING ONLY: writes, then rolls everything back by raising at the end.
-- A user deletes their own quote / draft design through the same role and JWT the app uses. Expected AFTER the migration:
-- the quote's design and photo rows are gone, a design's photo rows are gone, and another company's rows are untouched.
do $t$
declare
  a uuid; a_co uuid; b uuid; b_co uuid; qa uuid; da uuid; pa uuid; qb uuid; db uuid; pb uuid; d2 uuid; p2 uuid; n int; out text := '';
begin
  execute $f$create function public.sr44_try(stmt text) returns text language plpgsql as $b$
    declare n bigint; begin execute stmt; get diagnostics n = row_count; return case when n > 0 then 'rows=' || n else 'rows=0' end;
    exception when others then return 'ERROR (' || sqlerrm || ')'; end $b$$f$;
  grant execute on function public.sr44_try(text) to authenticated;
  select p1.id, p1.company_id, p2.id, p2.company_id into a, a_co, b, b_co
  from profiles p1 join profiles p2 on p1.company_id <> p2.company_id order by p1.created_at limit 1;
  insert into quotes (company_id, user_id, quote_number, customer_name) values (a_co, a, 'SR44-A', 'a') returning id into qa;
  insert into designs (company_id, user_id, quote_id, name) values (a_co, a, qa, 'design of quote A') returning id into da;
  insert into photos (company_id, user_id, design_id, storage_path, file_name) values (a_co, a, da, a_co || '/' || a || '/a.jpg', 'a.jpg') returning id into pa;
  insert into quotes (company_id, user_id, quote_number, customer_name) values (b_co, b, 'SR44-B', 'b') returning id into qb;
  insert into designs (company_id, user_id, quote_id, name) values (b_co, b, qb, 'design of quote B') returning id into db;
  insert into photos (company_id, user_id, design_id, storage_path, file_name) values (b_co, b, db, b_co || '/' || b || '/b.jpg', 'b.jpg') returning id into pb;
  insert into designs (company_id, user_id, name) values (a_co, a, 'standalone design') returning id into d2;
  insert into photos (company_id, user_id, design_id, storage_path, file_name) values (a_co, a, d2, a_co || '/' || a || '/d2.jpg', 'd2.jpg') returning id into p2;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  out := out || format(E'1 user deletes ANOTHER company''s quote            : %s (expect rows=0)\n', public.sr44_try(format('delete from quotes where id = %L', qb)));
  out := out || format(E'2 user deletes own quote                          : %s (expect rows=1)\n', public.sr44_try(format('delete from quotes where id = %L', qa)));
  out := out || format(E'3 user deletes own standalone design        : %s (expect rows=1)\n', public.sr44_try(format('delete from designs where id = %L', d2)));
  reset role;

  out := out || format(E'4 own quote''s design row still exists              : %s\n', case when exists (select 1 from designs where id = da) then 'YES (orphan)' else 'no (cascaded)' end);
  out := out || format(E'5 own quote''s photo row still exists               : %s\n', case when exists (select 1 from photos where id = pa) then 'YES (orphan)' else 'no (cascaded)' end);
  out := out || format(E'6 deleted design''s photo row still exists    : %s\n', case when exists (select 1 from photos where id = p2) then 'YES (orphan)' else 'no (cascaded)' end);
  out := out || format(E'7 other company''s quote/design/photo untouched     : %s\n', case when exists (select 1 from quotes where id = qb) and exists (select 1 from designs where id = db) and exists (select 1 from photos where id = pb) then 'yes' else 'NO (BAD)' end);
  out := out || format(E'   FK actions now: %s\n', (select string_agg(conname || '=' || case confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' else confdeltype::text end, ', ') from pg_constraint where conname in ('designs_quote_id_fkey','photos_design_id_fkey')));
  raise exception E'SR44 RESULTS\n%', out;
end $t$;
