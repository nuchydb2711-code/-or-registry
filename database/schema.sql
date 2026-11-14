-- =====================================================================
-- OR REGISTRY  |  PHASE 1  |  database/schema.sql
-- รันใน Supabase: SQL Editor > New query > วางทั้งไฟล์ > Run
-- รันซ้ำได้ปลอดภัยเฉพาะบนฐานข้อมูลใหม่ (ไฟล์นี้ไม่ DROP ข้อมูลใด ๆ)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. ฟังก์ชันพื้นฐาน
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. ตารางข้อมูลหลัก (Master data)
-- ---------------------------------------------------------------------
create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  department_name text not null,
  department_code text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint departments_name_key unique (department_name),
  constraint departments_code_key unique (department_code),
  constraint departments_name_nonblank check (btrim(department_name) <> '')
);

create table public.doctors (
  id            uuid primary key default gen_random_uuid(),
  doctor_name   text not null,
  department_id uuid references public.departments(id) on delete restrict,
  doctor_type   text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint doctors_type_chk check (doctor_type in ('SURGEON','ANESTHESIOLOGIST')),
  constraint doctors_name_nonblank check (btrim(doctor_name) <> '')
);
create index doctors_department_idx on public.doctors(department_id);
create index doctors_type_active_idx on public.doctors(doctor_type) where is_active;

create table public.or_rooms (
  id          uuid primary key default gen_random_uuid(),
  room_number integer not null,
  room_name   text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint or_rooms_number_key unique (room_number),
  -- เริ่มต้นใช้ห้อง 1–7 แต่ไม่ล็อกไว้ที่ 7 เพื่อรองรับการขยายห้องในอนาคต
  constraint or_rooms_number_chk check (room_number > 0)
);

create table public.anesthesia_types (
  id             uuid primary key default gen_random_uuid(),
  anesthesia_code text not null,
  anesthesia_name text not null,
  anesthesia_group text not null default 'OTHER',      -- ใช้รวมยอด: GA(GA+TIVA+IVS) / RA(BB+SB) / LA(LA+MAC)
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint anesthesia_code_key unique (anesthesia_code),
  constraint anesthesia_group_chk check (anesthesia_group in ('GA','RA','LA','OTHER'))
);

-- รายการผ่าตัดมาตรฐานแยกตามแผนก (Code operation เช่น Sx04 = Appendectomy) ใช้นับยอดรายเดือน
create table public.operation_codes (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  op_code       text not null,
  operation_name text not null,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint operation_codes_key unique (department_id, op_code)
);
create index operation_codes_department_idx on public.operation_codes(department_id, sort_order);

-- ---------------------------------------------------------------------
-- 2. ผู้ใช้งาน (เชื่อมกับ Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  email      text,
  role       text not null default 'VIEWER',
  is_active  boolean not null default false,   -- ผู้ใช้ใหม่ต้องรอ ADMIN เปิดใช้งาน
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_chk check (role in ('ADMIN','STAFF','VIEWER'))
);

-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่ใน Supabase Auth
-- (สิทธิ์เริ่มต้น = VIEWER และยังไม่เปิดใช้งาน; ไม่เชื่อค่า role จากฝั่งผู้ใช้เด็ดขาด)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'VIEWER', false)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ฟังก์ชันตรวจสิทธิ์ (security definer เพื่อไม่ให้ RLS ของ profiles วนซ้ำตัวเอง)
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = any(roles), false)
$$;

-- ---------------------------------------------------------------------
-- 3. ผู้ป่วย
-- ---------------------------------------------------------------------
create table public.patients (
  id           uuid primary key default gen_random_uuid(),
  hn           text not null,
  patient_name text not null,
  birth_date   date,
  gender       text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint patients_hn_key unique (hn),                    -- HN ห้ามซ้ำ
  constraint patients_hn_chk check (hn = btrim(hn) and hn <> ''),
  constraint patients_name_nonblank check (btrim(patient_name) <> ''),
  constraint patients_gender_chk check (gender is null or gender in ('MALE','FEMALE','OTHER')),
  constraint patients_birth_chk check (birth_date is null or birth_date <= current_date)
);
create index patients_name_idx on public.patients (lower(patient_name));

-- ---------------------------------------------------------------------
-- 4. Case การผ่าตัด
--    หมายเหตุ: patient_id "ไม่ unique" เพราะผู้ป่วย 1 คนผ่าตัดได้หลายครั้ง
-- ---------------------------------------------------------------------
create sequence public.case_number_seq;

create table public.surgery_cases (
  id                 uuid primary key default gen_random_uuid(),
  case_number        text not null,
  patient_id         uuid not null references public.patients(id) on delete restrict,
  surgery_date       date not null,
  case_type          text not null,
  department_id      uuid references public.departments(id) on delete restrict,
  diagnosis          text,
  operation_name     text,
  surgeon_id         uuid references public.doctors(id) on delete restrict,
  anesthesiologist_id uuid references public.doctors(id) on delete restrict,
  room_id            uuid references public.or_rooms(id) on delete restrict,
  anesthesia_type_id uuid references public.anesthesia_types(id) on delete restrict,
  admission_time     timestamptz,
  or_entry_time      timestamptz,
  surgery_start_time timestamptz,
  surgery_end_time   timestamptz,
  or_exit_time       timestamptz,
  case_status        text not null default 'IN_PROGRESS',
  result             text,
  notes              text,
  cancel_reason      text,
  -- ข้อมูลตามทะเบียนห้องผ่าตัดเดิม
  urgency            text not null default 'ELECTIVE',   -- ความเร่งด่วน
  from_er            boolean not null default false,     -- รับผู้ป่วยจาก ER
  operation_code_id  uuid references public.operation_codes(id) on delete restrict,
  icd9_code          text,                               -- Operation (ICD9)
  site               text,                               -- Right / Left / Both
  fracture_type      text,                               -- Closed / Open Gr.1-3
  wound_class        text,                               -- Class แผล (ประเภท 1-4)
  work_period        text,                               -- ในเวลา / นอกเวลา
  ward               text,
  team               text,                               -- ทีมพยาบาล
  has_risk           boolean not null default false,
  risk_types         text[] not null default '{}',
  risk_detail        text,
  supplies_checked   boolean,                            -- ตรวจเวชภัณฑ์ในระบบครบ
  ods_mis            boolean not null default false,     -- โครงการ ODS / MIS
  created_by         uuid references public.profiles(id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint surgery_cases_number_key unique (case_number),
  constraint surgery_cases_type_chk check (case_type in ('MAJOR','MINOR','LA')),
  constraint surgery_cases_status_chk check (case_status in ('COMPLETED','IN_PROGRESS','CANCELLED','POSTPONED')),
  constraint surgery_cases_urgency_chk check (urgency in ('ELECTIVE','EMERGENCY')),
  constraint surgery_cases_site_chk check (site is null or site in ('RIGHT','LEFT','BOTH')),
  constraint surgery_cases_fracture_chk check (fracture_type is null or fracture_type in ('CLOSED','OPEN_G1','OPEN_G2','OPEN_G3')),
  constraint surgery_cases_wound_chk check (wound_class is null or wound_class in ('CLEAN','CLEAN_CONTAMINATED','CONTAMINATED','DIRTY')),
  constraint surgery_cases_period_chk check (work_period is null or work_period in ('IN_HOURS','OUT_HOURS')),
  constraint surgery_cases_risk_types_chk check (
    risk_types <@ array['EQUIPMENT','DOCUMENT','COMPLICATION','PATIENT_ID_SITE','POSTPONE_CANCEL']::text[]),
  constraint surgery_cases_cancel_reason_chk
    check (case_status <> 'CANCELLED' or btrim(coalesce(cancel_reason,'')) <> ''),
  -- ลำดับเวลาต้องสมเหตุสมผล (ตรวจเฉพาะคู่ที่มีค่าทั้งสองฝั่ง)
  constraint surgery_cases_time_entry_start_chk check (or_entry_time is null or surgery_start_time is null or surgery_start_time >= or_entry_time),
  constraint surgery_cases_time_start_end_chk   check (surgery_start_time is null or surgery_end_time is null or surgery_end_time >= surgery_start_time),
  constraint surgery_cases_time_end_exit_chk    check (surgery_end_time is null or or_exit_time is null or or_exit_time >= surgery_end_time),
  constraint surgery_cases_time_entry_exit_chk  check (or_entry_time is null or or_exit_time is null or or_exit_time >= or_entry_time),
  constraint surgery_cases_time_adm_entry_chk   check (admission_time is null or or_entry_time is null or or_entry_time >= admission_time)
);

create index surgery_cases_patient_idx        on public.surgery_cases (patient_id);
create index surgery_cases_date_idx           on public.surgery_cases (surgery_date desc);
create index surgery_cases_patient_date_idx   on public.surgery_cases (patient_id, surgery_date);  -- ตรวจ Case ซ้ำวันเดียวกัน
create index surgery_cases_department_idx     on public.surgery_cases (department_id);
create index surgery_cases_surgeon_idx        on public.surgery_cases (surgeon_id);
create index surgery_cases_anesth_idx         on public.surgery_cases (anesthesiologist_id);
create index surgery_cases_room_date_idx      on public.surgery_cases (room_id, surgery_date);
create index surgery_cases_type_status_idx    on public.surgery_cases (case_type, case_status);
create index surgery_cases_created_by_idx     on public.surgery_cases (created_by);
create index surgery_cases_opcode_idx         on public.surgery_cases (operation_code_id);
create index surgery_cases_urgency_idx        on public.surgery_cases (surgery_date, urgency);

-- สร้างเลข Case อัตโนมัติ เช่น OR-2026-000001 และกันการแก้ฟิลด์ที่ห้ามเปลี่ยน
create or replace function public.surgery_cases_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.case_number is null or btrim(new.case_number) = '' then
      new.case_number := 'OR-' || to_char(new.surgery_date, 'YYYY') || '-'
                         || lpad(nextval('public.case_number_seq')::text, 6, '0');
    end if;
    if v_uid is not null then
      new.created_by := v_uid;       -- บังคับเป็นผู้ใช้ที่ login จริง ไม่เชื่อค่าจาก client
    end if;
  else
    -- ฟิลด์ที่ห้ามเปลี่ยนหลังสร้าง
    new.case_number := old.case_number;
    new.created_by  := old.created_by;
    new.created_at  := old.created_at;
    -- เฉพาะ ADMIN เท่านั้นที่ยกเลิก / ยกเลิกการยกเลิก Case ได้
    if v_uid is not null and not public.has_role(array['ADMIN']) then
      if (new.case_status = 'CANCELLED') is distinct from (old.case_status = 'CANCELLED') then
        raise exception 'เฉพาะ ADMIN เท่านั้นที่ยกเลิก Case ได้' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger surgery_cases_before_write
  before insert or update on public.surgery_cases
  for each row execute function public.surgery_cases_before_write();

-- ---------------------------------------------------------------------
-- 5. Audit log (เขียนได้จาก trigger เท่านั้น)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx  on public.audit_logs (table_name, record_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_user_idx    on public.audit_logs (user_id);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
    values (auth.uid(), 'INSERT', tg_table_name, (to_jsonb(new)->>'id')::uuid, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
      insert into public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
      values (auth.uid(), 'UPDATE', tg_table_name, (to_jsonb(new)->>'id')::uuid, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    insert into public.audit_logs (user_id, action, table_name, record_id, old_data)
    values (auth.uid(), 'DELETE', tg_table_name, (to_jsonb(old)->>'id')::uuid, to_jsonb(old));
    return old;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. ห้ามลบข้อมูลผู้ป่วยและ Case แบบถาวรจากเว็บ
--    (ลบได้เฉพาะผู้ดูแลฐานข้อมูลผ่าน SQL Editor พร้อมตั้ง app.allow_delete = 'on')
-- ---------------------------------------------------------------------
create or replace function public.block_hard_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null and current_setting('app.allow_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'ไม่อนุญาตให้ลบข้อมูล % แบบถาวร ให้ใช้การยกเลิก/ปิดใช้งานแทน', tg_table_name
    using errcode = '42501';
end $$;

create trigger patients_block_delete
  before delete on public.patients for each row execute function public.block_hard_delete();
create trigger surgery_cases_block_delete
  before delete on public.surgery_cases for each row execute function public.block_hard_delete();
create trigger audit_logs_block_modify
  before update or delete on public.audit_logs for each row execute function public.block_hard_delete();

-- ---------------------------------------------------------------------
-- 7. ผูก updated_at และ audit ให้ทุกตาราง
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['departments','doctors','or_rooms','anesthesia_types','operation_codes',
                           'profiles','patients','surgery_cases']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()',
                   t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. View สำหรับหน้าทะเบียน/รายงาน (security_invoker = ใช้สิทธิ์ RLS ของผู้เรียก)
-- ---------------------------------------------------------------------
create view public.v_surgery_cases with (security_invoker = true) as
select
  c.id,
  c.case_number,
  c.surgery_date,
  p.id            as patient_id,
  p.hn,
  p.patient_name,
  p.gender,
  p.birth_date,
  case when p.birth_date is null then null
       else extract(year from age(c.surgery_date, p.birth_date))::int end as age_years,
  c.case_type,
  d.department_name,
  d.department_code,
  c.department_id,
  c.diagnosis,
  c.operation_name,
  c.operation_code_id,
  oc.op_code,
  oc.operation_name as op_code_name,
  s.doctor_name   as surgeon_name,
  c.surgeon_id,
  a.doctor_name   as anesthesiologist_name,
  c.anesthesiologist_id,
  r.room_number,
  r.room_name,
  c.room_id,
  t.anesthesia_code,
  t.anesthesia_name,
  t.anesthesia_group,
  c.anesthesia_type_id,
  c.admission_time, c.or_entry_time, c.surgery_start_time, c.surgery_end_time, c.or_exit_time,
  c.case_status,
  c.result,
  c.notes,
  c.cancel_reason,
  c.urgency, c.from_er, c.icd9_code, c.site, c.fracture_type, c.wound_class, c.work_period,
  c.ward, c.team, c.has_risk, c.risk_types, c.risk_detail, c.supplies_checked, c.ods_mis,
  c.created_by,
  c.created_at,
  c.updated_at
from public.surgery_cases c
join public.patients p         on p.id = c.patient_id
left join public.departments d on d.id = c.department_id
left join public.operation_codes oc on oc.id = c.operation_code_id
left join public.doctors s     on s.id = c.surgeon_id
left join public.doctors a     on a.id = c.anesthesiologist_id
left join public.or_rooms r    on r.id = c.room_id
left join public.anesthesia_types t on t.id = c.anesthesia_type_id;

-- ---------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------
alter table public.departments      enable row level security;
alter table public.doctors          enable row level security;
alter table public.or_rooms         enable row level security;
alter table public.anesthesia_types enable row level security;
alter table public.operation_codes  enable row level security;
alter table public.profiles         enable row level security;
alter table public.patients         enable row level security;
alter table public.surgery_cases    enable row level security;
alter table public.audit_logs       enable row level security;

-- profiles: เห็นของตัวเอง / ADMIN เห็นและจัดการทั้งหมด
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(array['ADMIN']));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.has_role(array['ADMIN']));
create policy profiles_update on public.profiles for update to authenticated
  using (public.has_role(array['ADMIN'])) with check (public.has_role(array['ADMIN']));

-- ข้อมูลหลัก: ผู้ใช้ที่เปิดใช้งานทุกระดับอ่านได้ / ADMIN แก้ไข (ไม่มี policy ลบ)
do $$
declare t text;
begin
  foreach t in array array['departments','doctors','or_rooms','anesthesia_types','operation_codes']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(array[''ADMIN'',''STAFF'',''VIEWER'']))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(array[''ADMIN'']))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(array[''ADMIN''])) with check (public.has_role(array[''ADMIN'']))', t||'_update', t);
  end loop;
end $$;

-- patients และ surgery_cases: ทุกบทบาทอ่านได้ / ADMIN+STAFF เพิ่ม-แก้ไข / ไม่มี policy ลบ
create policy patients_select on public.patients for select to authenticated
  using (public.has_role(array['ADMIN','STAFF','VIEWER']));
create policy patients_insert on public.patients for insert to authenticated
  with check (public.has_role(array['ADMIN','STAFF']));
create policy patients_update on public.patients for update to authenticated
  using (public.has_role(array['ADMIN','STAFF'])) with check (public.has_role(array['ADMIN','STAFF']));

create policy surgery_cases_select on public.surgery_cases for select to authenticated
  using (public.has_role(array['ADMIN','STAFF','VIEWER']));
create policy surgery_cases_insert on public.surgery_cases for insert to authenticated
  with check (public.has_role(array['ADMIN','STAFF']));
create policy surgery_cases_update on public.surgery_cases for update to authenticated
  using (public.has_role(array['ADMIN','STAFF'])) with check (public.has_role(array['ADMIN','STAFF']));

-- audit_logs: ADMIN อ่านได้อย่างเดียว (เขียนผ่าน trigger เท่านั้น)
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_role(array['ADMIN']));

-- ---------------------------------------------------------------------
-- 10. สิทธิ์ระดับตาราง (ชั้นป้องกันที่สองนอกเหนือจาก RLS)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;

revoke delete on all tables in schema public from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke usage on sequence public.case_number_seq from authenticated;

grant execute on function public.app_role()          to authenticated;
grant execute on function public.has_role(text[])    to authenticated;

-- ตารางที่สร้างใหม่ในอนาคตจะไม่เปิดให้ anon โดยอัตโนมัติ
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------
-- รายชื่อบุคลากรทีมผ่าตัด (ให้เลือกในฟอร์มลงทะเบียน Case)
-- STAFF เพิ่มชื่อใหม่ได้เอง · ปิดใช้งาน/แก้ไขชื่อ: ADMIN · ไม่มีสิทธิ์ลบ
-- ---------------------------------------------------------------------
create table if not exists public.or_staff (
  id         uuid primary key default gen_random_uuid(),
  staff_name text not null,
  staff_role text not null default 'OTHER',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint or_staff_name_key unique (staff_name),
  constraint or_staff_name_nonblank check (btrim(staff_name) <> ''),
  constraint or_staff_role_chk check (staff_role in ('SURGICAL_ASSISTANT','SCRUB_NURSE','CIRCULATING_NURSE','NA','ANESTHESIOLOGIST','ANESTHESIA_NURSE','OTHER'))
);
alter table public.or_staff enable row level security;

drop policy if exists or_staff_select on public.or_staff;
create policy or_staff_select on public.or_staff for select to authenticated
  using (public.has_role(array['ADMIN','STAFF','VIEWER']));
drop policy if exists or_staff_insert on public.or_staff;
create policy or_staff_insert on public.or_staff for insert to authenticated
  with check (public.has_role(array['ADMIN','STAFF']));
drop policy if exists or_staff_update on public.or_staff;
create policy or_staff_update on public.or_staff for update to authenticated
  using (public.has_role(array['ADMIN'])) with check (public.has_role(array['ADMIN']));

drop trigger if exists or_staff_set_updated_at on public.or_staff;
create trigger or_staff_set_updated_at before update on public.or_staff
  for each row execute function public.set_updated_at();
drop trigger if exists or_staff_audit on public.or_staff;
create trigger or_staff_audit after insert or update or delete on public.or_staff
  for each row execute function public.audit_trigger();

revoke all on public.or_staff from anon;
revoke delete on public.or_staff from authenticated;

commit;
