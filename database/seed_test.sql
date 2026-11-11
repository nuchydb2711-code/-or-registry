-- =====================================================================
-- OR REGISTRY | database/seed_test.sql
-- *** ข้อมูลสมมติสำหรับทดสอบเท่านั้น *** ไม่มีข้อมูลผู้ป่วยจริง
-- ผู้ป่วยทดสอบใช้ HN ขึ้นต้นด้วย TEST  แพทย์ทดสอบชื่อขึ้นต้นด้วย [ทดสอบ]
-- ต้องรัน seed.sql ก่อน  และลบทิ้งก่อนใช้งานจริงด้วย database/cleanup_test.sql
-- =====================================================================

-- แพทย์สมมติ: ศัลยแพทย์ 2 คนต่อแผนก + วิสัญญีแพทย์ 3 คน
insert into public.doctors (doctor_name, department_id, doctor_type)
select '[ทดสอบ] ศัลยแพทย์ ' || d.department_code || ' ' || n, d.id, 'SURGEON'
from public.departments d, generate_series(1,2) n
where not exists (select 1 from public.doctors x where x.doctor_name = '[ทดสอบ] ศัลยแพทย์ ' || d.department_code || ' ' || n);

insert into public.doctors (doctor_name, doctor_type)
select '[ทดสอบ] วิสัญญีแพทย์ ' || n, 'ANESTHESIOLOGIST'
from generate_series(1,3) n
where not exists (select 1 from public.doctors x where x.doctor_name = '[ทดสอบ] วิสัญญีแพทย์ ' || n);

-- ผู้ป่วยสมมติ 20 คน
insert into public.patients (hn, patient_name, birth_date, gender)
select 'TEST' || lpad(g::text, 5, '0'),
       'ผู้ป่วยทดสอบ ' || g,
       date '1950-01-01' + (random() * 25000)::int,
       case when g % 2 = 0 then 'MALE' else 'FEMALE' end
from generate_series(1,20) g
on conflict (hn) do nothing;

-- Case สมมติ 40 รายการ (3 รายการแรกเป็นของวันนี้และกำลังดำเนินการ)
do $$
declare
  i int; r float;
  v_patient uuid; v_dept uuid; v_surg uuid; v_anes uuid; v_room uuid; v_at uuid;
  v_date date; v_type text; v_status text; v_code text;
  v_entry timestamptz; v_ss timestamptz; v_se timestamptz; v_exit timestamptz; v_op uuid; v_urg text;
begin
  for i in 1..40 loop
    select id into v_patient from public.patients where hn like 'TEST%' order by random() limit 1;
    select id into v_dept    from public.departments where is_active order by random() limit 1;
    select id into v_surg    from public.doctors where doctor_type='SURGEON' and department_id=v_dept order by random() limit 1;
    select id into v_anes    from public.doctors where doctor_type='ANESTHESIOLOGIST' order by random() limit 1;
    select id into v_room    from public.or_rooms where is_active order by random() limit 1;

    v_type := (array['MAJOR','MINOR','LA'])[1 + floor(random()*3)::int];
    v_code := case when v_type = 'LA' then 'LA'
                   else (array['GA','SB','TIVA','MAC'])[1 + floor(random()*4)::int] end;
    select id into v_at from public.anesthesia_types where anesthesia_code = v_code;

    select id into v_op from public.operation_codes where department_id = v_dept order by random() limit 1;
    v_urg := case when random() < 0.25 then 'EMERGENCY' else 'ELECTIVE' end;
    r := random();
    if i <= 3 then
      v_date := current_date; v_status := 'IN_PROGRESS';
    else
      v_date := current_date - floor(random()*60)::int;
      v_status := case when r < 0.80 then 'COMPLETED' when r < 0.90 then 'CANCELLED' else 'POSTPONED' end;
    end if;

    v_entry := (v_date + time '08:00'
                + make_interval(hours => floor(random()*8)::int, mins => floor(random()*4)::int * 15))
               at time zone 'Asia/Bangkok';
    v_ss   := v_entry + make_interval(mins => 15);
    v_se   := v_ss    + make_interval(mins => 30 + floor(random()*150)::int);
    v_exit := v_se    + make_interval(mins => 15);

    insert into public.surgery_cases (
      patient_id, surgery_date, case_type, department_id, diagnosis, operation_name,
      surgeon_id, anesthesiologist_id, room_id, anesthesia_type_id,
      or_entry_time, surgery_start_time, surgery_end_time, or_exit_time,
      case_status, result, notes, cancel_reason,
      operation_code_id, urgency, from_er, wound_class, work_period
    ) values (
      v_patient, v_date, v_type, v_dept, 'Diagnosis ทดสอบ ' || i, 'Operation ทดสอบ ' || i,
      v_surg, v_anes, case when v_status in ('COMPLETED','IN_PROGRESS') then v_room end, v_at,
      case when v_status in ('COMPLETED','IN_PROGRESS') then v_entry end,
      case when v_status in ('COMPLETED','IN_PROGRESS') then v_ss end,
      case when v_status = 'COMPLETED' then v_se end,
      case when v_status = 'COMPLETED' then v_exit end,
      v_status,
      case when v_status = 'COMPLETED' then 'ผ่าตัดสำเร็จ (ข้อมูลทดสอบ)' end,
      '[ข้อมูลทดสอบ]',
      case when v_status = 'CANCELLED' then 'ผู้ป่วยงดผ่าตัด (ข้อมูลทดสอบ)' end,
      v_op, v_urg, (v_urg = 'EMERGENCY' and random() < 0.5),
      (array['CLEAN','CLEAN_CONTAMINATED','CONTAMINATED','DIRTY'])[1 + floor(random()*3)::int],
      case when v_urg = 'EMERGENCY' then 'OUT_HOURS' else 'IN_HOURS' end
    );
  end loop;
end $$;
