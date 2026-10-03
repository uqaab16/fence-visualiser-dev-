-- SR-08 exploit test. STAGING ONLY: it writes, then rolls everything back by raising at the end.
-- ATTACKER and VICTIM are two real profiles in different companies. A victim design, photo row and storage object are created,
-- then the attacker (same role/JWT the app uses) tries to read, write, repoint and delete them. Every attack should be BLOCKED
-- and every control OK. Storage SIZE/TYPE limits are enforced by the Storage API, not SQL, so this test only prints the bucket settings.
do $t$
declare
  a uuid; a_co uuid; v uuid; v_co uuid; v_design uuid; v_photo uuid; v_obj text; d_own uuid; p_own uuid;
  out text := '';
begin
  select p1.id, p1.company_id, p2.id, p2.company_id into a, a_co, v, v_co
  from profiles p1 join profiles p2 on p1.company_id <> p2.company_id order by p1.created_at limit 1;
  if a is null then raise exception 'need two profiles in different companies'; end if;

  execute $f$create function public.sr08_try(kind text, stmt text) returns text language plpgsql as $b$
    declare n bigint; begin
      if kind = 'r' then execute 'select count(*) from (' || stmt || ') s' into n; return case when n > 0 then 'VISIBLE rows=' || n else 'none' end;
      else execute stmt; get diagnostics n = row_count; return case when n > 0 then 'ALLOWED rows=' || n else 'BLOCKED (0 rows)' end; end if;
    exception when others then return 'BLOCKED (' || sqlerrm || ')'; end $b$$f$;
  grant execute on function public.sr08_try(text, text) to authenticated, anon;

  v_obj := v_co || '/' || v || '/victim.jpg';
  insert into designs (company_id, user_id, name) values (v_co, v, 'victim design') returning id into v_design;
  insert into photos (company_id, user_id, design_id, storage_path, file_name) values (v_co, v, v_design, v_obj, 'victim.jpg') returning id into v_photo;
  insert into storage.objects (bucket_id, name, owner) values ('yard-photos', v_obj, v);
  out := out || format(E'attacker %s (co %s) vs victim co %s\n', a, a_co, v_co);
  out := out || format(E'bucket settings: %s\n', (select row_to_json(b)::text from (select file_size_limit, allowed_mime_types from storage.buckets where id = 'yard-photos') b));

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- controls
  insert into designs (company_id, user_id, name) values (a_co, a, 'attacker own design') returning id into d_own;
  out := out || E'C1 control: insert own design               : OK\n';
  out := out || format(E'C2 control: read own design                 : %s\n', public.sr08_try('r', format('select 1 from designs where id = %L', d_own)));
  out := out || format(E'C3 control: own photo row, own design+path  : %s\n', public.sr08_try('w', format('insert into photos (company_id,user_id,design_id,storage_path,file_name) values (%L,%L,%L,%L,%L)', a_co, a, d_own, a_co || '/' || a || '/own.jpg', 'own.jpg')));
  out := out || format(E'C4 control: upload to own company folder   : %s\n', public.sr08_try('w', format('insert into storage.objects (bucket_id,name,owner) values (%L,%L,%L)', 'yard-photos', a_co || '/' || a || '/own.jpg', a)));

  -- reads
  out := out || format(E'R1 read victim design                    : %s\n', public.sr08_try('r', format('select 1 from designs where id = %L', v_design)));
  out := out || format(E'R2 read victim photo row                 : %s\n', public.sr08_try('r', format('select 1 from photos where id = %L', v_photo)));
  out := out || format(E'R3 read victim storage object            : %s\n', public.sr08_try('r', format('select 1 from storage.objects where bucket_id = %L and name = %L', 'yard-photos', v_obj)));
  -- designs writes
  out := out || format(E'W1 insert design into victim company      : %s\n', public.sr08_try('w', format('insert into designs (company_id,user_id,name) values (%L,%L,%L)', v_co, a, 'x')));
  out := out || format(E'W2 insert own-company design as victim    : %s\n', public.sr08_try('w', format('insert into designs (company_id,user_id,name) values (%L,%L,%L)', a_co, v, 'x')));
  out := out || format(E'W3 repoint own design to victim company   : %s\n', public.sr08_try('w', format('update designs set company_id = %L where id = %L', v_co, d_own)));
  out := out || format(E'W4 update victim design                   : %s\n', public.sr08_try('w', format('update designs set name = %L where id = %L', 'pwned', v_design)));
  out := out || format(E'W5 delete victim design                   : %s\n', public.sr08_try('w', format('delete from designs where id = %L', v_design)));
  -- photos writes
  out := out || format(E'W6 insert photo row into victim company   : %s\n', public.sr08_try('w', format('insert into photos (company_id,user_id,storage_path,file_name) values (%L,%L,%L,%L)', v_co, a, v_co || '/x.jpg', 'x')));
  out := out || format(E'W7 insert photo row as victim user        : %s\n', public.sr08_try('w', format('insert into photos (company_id,user_id,storage_path,file_name) values (%L,%L,%L,%L)', a_co, v, a_co || '/x.jpg', 'x')));
  out := out || format(E'W8 own photo row -> victim design_id      : %s\n', public.sr08_try('w', format('insert into photos (company_id,user_id,design_id,storage_path,file_name) values (%L,%L,%L,%L,%L)', a_co, a, v_design, a_co || '/x.jpg', 'x')));
  out := out || format(E'W9 own photo row -> victim storage path   : %s\n', public.sr08_try('w', format('insert into photos (company_id,user_id,storage_path,file_name) values (%L,%L,%L,%L)', a_co, a, v_obj, 'x')));
  out := out || format(E'W10 update victim photo row               : %s\n', public.sr08_try('w', format('update photos set file_name = %L where id = %L', 'pwned', v_photo)));
  out := out || format(E'W11 delete victim photo row               : %s\n', public.sr08_try('w', format('delete from photos where id = %L', v_photo)));
  -- storage writes
  out := out || format(E'S1 upload into victim company folder      : %s\n', public.sr08_try('w', format('insert into storage.objects (bucket_id,name,owner) values (%L,%L,%L)', 'yard-photos', v_co || '/atk.jpg', a)));
  out := out || format(E'S2 delete victim storage object           : %s\n', public.sr08_try('w', format('delete from storage.objects where bucket_id = %L and name = %L', 'yard-photos', v_obj)));
  out := out || format(E'S3 overwrite victim storage object        : %s\n', public.sr08_try('w', format('update storage.objects set name = name where bucket_id = %L and name = %L', 'yard-photos', v_obj)));
  reset role;

  set local role anon;
  out := out || format(E'A1 signed-out read designs                : %s\n', public.sr08_try('r', 'select 1 from designs'));
  out := out || format(E'A2 signed-out insert design               : %s\n', public.sr08_try('w', format('insert into designs (company_id,user_id,name) values (%L,%L,%L)', v_co, v, 'x')));
  out := out || format(E'A3 signed-out read photos                 : %s\n', public.sr08_try('r', 'select 1 from photos'));
  reset role;

  raise exception E'SR08 RESULTS\n%', out;
end $t$;
