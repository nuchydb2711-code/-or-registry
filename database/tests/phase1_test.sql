-- ทดสอบ Phase 1 (รันบน PostgreSQL ที่โหลด supabase_stub.sql + schema.sql + seed.sql + seed_test.sql)
-- ผลลัพธ์: ตาราง PASS/FAIL ท้ายไฟล์
create temp table results (name text, ok boolean, detail text);
grant all on results to public;

create function pg_temp.try_as(p_role text, p_uid uuid, p_sql text, out ok boolean, out msg text, out n bigint)
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text,''), true);
  execute 'set local role ' || p_role;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    ok := true; msg := null;
  exception when others then
    ok := false; msg := sqlerrm; n := 0;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare
  u_admin uuid := gen_random_uuid(); u_staff uuid := gen_random_uuid();
  u_view  uuid := gen_random_uuid(); u_new   uuid := gen_random_uuid();
  r record; v_case uuid; v_pat uuid; v_dept uuid; cnt bigint;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (u_admin,'a@t','{"full_name":"Admin T","role":"ADMIN"}'),
    (u_staff,'s@t','{"full_name":"Staff T"}'),
    (u_view ,'v@t','{"full_name":"Viewer T"}'),
    (u_new  ,'n@t','{"full_name":"New T","role":"ADMIN"}');
  -- ผู้ใช้ใหม่ต้องเป็น VIEWER + inactive แม้พยายามส่ง role=ADMIN มาใน metadata
  select * into r from public.profiles where id = u_new;
  insert into results values ('signup ไม่เชื่อ role จาก metadata', r.role='VIEWER' and not r.is_active, r.role||'/'||r.is_active);
  update public.profiles set role='ADMIN', is_active=true where id=u_admin;
  update public.profiles set role='STAFF', is_active=true where id=u_staff;
  update public.profiles set role='VIEWER', is_active=true where id=u_view;

  select id into v_pat from public.patients where hn='TEST00001';
  select id into v_dept from public.departments limit 1;

  -- anon
  r := pg_temp.try_as('anon', null, 'select * from public.patients');
  insert into results values ('anon อ่าน patients ไม่ได้', not r.ok, r.msg);
  -- inactive user
  select count(*) into cnt from (select * from pg_temp.try_as('authenticated', u_new, 'select 1 from public.patients limit 1')) x;
  perform set_config('request.jwt.claim.sub', u_new::text, true); set local role authenticated;
  select count(*) into cnt from public.patients; reset role;
  insert into results values ('ผู้ใช้ที่ยังไม่ถูกเปิดใช้งาน เห็น patients = 0 แถว', cnt=0, cnt::text);
  -- viewer
  perform set_config('request.jwt.claim.sub', u_view::text, true); set local role authenticated;
  select count(*) into cnt from public.patients; reset role;
  insert into results values ('VIEWER อ่าน patients ได้', cnt=20, cnt::text);
  r := pg_temp.try_as('authenticated', u_view, format($q$insert into public.patients(hn,patient_name) values('TESTV1','x')$q$));
  insert into results values ('VIEWER เพิ่ม patient ไม่ได้', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_view, format($q$update public.patients set patient_name='hack' where id='%s'$q$, v_pat));
  insert into results values ('VIEWER แก้ patient ไม่ได้ (0 แถวหรือ error)', not r.ok or r.n=0, coalesce(r.msg,'rows='||r.n));
  perform set_config('request.jwt.claim.sub', u_view::text, true); set local role authenticated;
  select count(*) into cnt from public.audit_logs; reset role;
  insert into results values ('VIEWER อ่าน audit_logs ไม่ได้', cnt=0, cnt::text);
  -- staff
  r := pg_temp.try_as('authenticated', u_staff, format($q$insert into public.patients(hn,patient_name,gender) values('TESTS1','ผู้ป่วยใหม่','MALE')$q$));
  insert into results values ('STAFF เพิ่ม patient ได้', r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_staff, format($q$insert into public.surgery_cases(patient_id,surgery_date,case_type,case_status,created_by) values('%s',current_date,'MAJOR','IN_PROGRESS','%s')$q$, v_pat, u_admin));
  insert into results values ('STAFF เพิ่ม case ได้', r.ok, r.msg);
  select id into v_case from public.surgery_cases where created_by = u_staff order by created_at desc limit 1;
  insert into results values ('created_by ถูกบังคับเป็นผู้ login จริง (ไม่ใช่ค่าที่ client ส่ง)', v_case is not null, v_case::text);
  select case_number into r from public.surgery_cases where id=v_case;
  insert into results values ('เลข Case สร้างอัตโนมัติ รูปแบบ OR-YYYY-NNNNNN', r.case_number ~ '^OR-\d{4}-\d{6}$', r.case_number);
  r := pg_temp.try_as('authenticated', u_staff, format($q$update public.surgery_cases set case_status='CANCELLED', cancel_reason='x' where id='%s'$q$, v_case));
  insert into results values ('STAFF ยกเลิก case ไม่ได้', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_staff, format($q$update public.surgery_cases set case_status='POSTPONED', notes='เลื่อน' where id='%s'$q$, v_case));
  insert into results values ('STAFF แก้ไข/เลื่อน case ได้', r.ok and r.n=1, coalesce(r.msg,'rows='||r.n));
  r := pg_temp.try_as('authenticated', u_staff, format($q$update public.surgery_cases set case_number='HACK' where id='%s'$q$, v_case));
  select case_number into r.msg from public.surgery_cases where id=v_case;
  insert into results values ('แก้ case_number ไม่ได้', r.msg ~ '^OR-', r.msg);
  r := pg_temp.try_as('authenticated', u_staff, format($q$delete from public.surgery_cases where id='%s'$q$, v_case));
  insert into results values ('STAFF ลบ case ไม่ได้', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_staff, format($q$delete from public.patients where id='%s'$q$, v_pat));
  insert into results values ('STAFF ลบ patient ไม่ได้', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_staff, $q$insert into public.departments(department_name,department_code) values('x','X')$q$);
  insert into results values ('STAFF เพิ่มแผนกไม่ได้ (ADMIN เท่านั้น)', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_staff, format($q$update public.profiles set role='ADMIN' where id='%s'$q$, u_staff));
  select role into r.msg from public.profiles where id=u_staff;
  insert into results values ('STAFF ยกระดับสิทธิ์ตัวเองไม่ได้', r.msg='STAFF', r.msg);
  r := pg_temp.try_as('authenticated', u_staff, format($q$insert into public.surgery_cases(patient_id,surgery_date,case_type) values('%s',current_date,'XX')$q$, v_pat));
  insert into results values ('case_type ผิดค่าถูกปฏิเสธ', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_staff, format($q$insert into public.surgery_cases(patient_id,surgery_date,case_type,or_entry_time,surgery_start_time) values('%s',current_date,'MAJOR',now(),now()-interval '1 hour')$q$, v_pat));
  insert into results values ('เวลาเริ่มผ่าตัดก่อนเวลาเข้าห้องถูกปฏิเสธ', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_staff, $q$insert into public.patients(hn,patient_name) values('TEST00001','ซ้ำ')$q$);
  insert into results values ('HN ซ้ำถูกปฏิเสธ', not r.ok, r.msg);
  -- ผู้ป่วย 1 คนหลาย case ในวันเดียวกัน
  r := pg_temp.try_as('authenticated', u_staff, format($q$insert into public.surgery_cases(patient_id,surgery_date,case_type) values('%1$s',current_date,'MINOR'),('%1$s',current_date,'LA')$q$, v_pat));
  insert into results values ('ผู้ป่วยเดิมมีหลาย case วันเดียวกันได้', r.ok and r.n=2, coalesce(r.msg,'rows='||r.n));
  -- admin
  r := pg_temp.try_as('authenticated', u_admin, format($q$update public.surgery_cases set case_status='CANCELLED' where id='%s'$q$, v_case));
  insert into results values ('ยกเลิกต้องระบุเหตุผล', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_admin, format($q$update public.surgery_cases set case_status='CANCELLED', cancel_reason='ผู้ป่วยงดผ่าตัด' where id='%s'$q$, v_case));
  insert into results values ('ADMIN ยกเลิก case ได้', r.ok and r.n=1, coalesce(r.msg,'rows='||r.n));
  r := pg_temp.try_as('authenticated', u_staff, format($q$update public.surgery_cases set case_status='IN_PROGRESS' where id='%s'$q$, v_case));
  insert into results values ('STAFF ยกเลิกการยกเลิกไม่ได้', not r.ok, r.msg);
  perform set_config('request.jwt.claim.sub', u_admin::text, true); set local role authenticated;
  select count(*) into cnt from public.audit_logs where table_name='surgery_cases' and record_id=v_case; reset role;
  insert into results values ('ADMIN เห็น audit ของ case (INSERT+UPDATE ≥ 3)', cnt>=3, cnt::text);
  r := pg_temp.try_as('authenticated', u_admin, $q$delete from public.audit_logs$q$);
  insert into results values ('audit_logs ลบไม่ได้แม้เป็น ADMIN', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_admin, $q$update public.audit_logs set action='x'$q$);
  insert into results values ('audit_logs แก้ไม่ได้แม้เป็น ADMIN', not r.ok, r.msg);
  r := pg_temp.try_as('authenticated', u_admin, $q$insert into public.audit_logs(action,table_name) values('FAKE','x')$q$);
  insert into results values ('audit_logs เขียนตรงจากเว็บไม่ได้', not r.ok, r.msg);
  -- view ใช้ RLS ของผู้เรียก
  r := pg_temp.try_as('anon', null, 'select * from public.v_surgery_cases');
  insert into results values ('anon อ่าน v_surgery_cases ไม่ได้', not r.ok, r.msg);
  perform set_config('request.jwt.claim.sub', u_view::text, true); set local role authenticated;
  select count(*) into cnt from public.v_surgery_cases; reset role;
  insert into results values ('VIEWER อ่าน v_surgery_cases ได้', cnt>=40, cnt::text);
  perform set_config('request.jwt.claim.sub', u_new::text, true); set local role authenticated;
  select count(*) into cnt from public.v_surgery_cases; reset role;
  insert into results values ('ผู้ใช้ inactive อ่าน view ได้ 0 แถว', cnt=0, cnt::text);
  -- ลบด้วยสิทธิ์ DBA ต้องใช้ app.allow_delete เท่านั้น
  begin delete from public.surgery_cases where id=v_case; insert into results values ('DBA ลบโดยไม่ตั้ง flag ถูกบล็อก', false, 'deleted');
  exception when others then insert into results values ('DBA ลบโดยไม่ตั้ง flag ถูกบล็อก', true, sqlerrm); end;
  -- RLS เปิดครบ
  select count(*) into cnt from pg_tables where schemaname='public' and not rowsecurity;
  insert into results values ('ทุกตารางใน public เปิด RLS', cnt=0, cnt::text);
  select count(*) into cnt from information_schema.role_table_grants where table_schema='public' and grantee='anon';
  insert into results values ('anon ไม่มี grant ใดบนตาราง public', cnt=0, cnt::text);
  select count(*) into cnt from information_schema.role_table_grants where table_schema='public' and grantee='authenticated' and privilege_type='DELETE';
  insert into results values ('authenticated ไม่มีสิทธิ์ DELETE บนตารางใด', cnt=0, cnt::text);
end $$;

select case when ok then 'PASS' else 'FAIL' end as result, name, left(coalesce(detail,''),90) as detail from results;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from results;
