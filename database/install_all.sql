-- OR REGISTRY | install_all.sql = schema.sql + seed.sql + seed_operation_codes.sql (รันไฟล์เดียวจบ บนโปรเจกต์ Supabase ใหม่)

-- ===== schema.sql =====
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

-- ===== seed.sql =====
-- =====================================================================
-- OR REGISTRY | database/seed.sql
-- ข้อมูลหลักเริ่มต้น (ไม่ใช่ข้อมูลผู้ป่วย) รันหลัง schema.sql
-- แผนกและรายการผ่าตัดอ้างอิงจากทะเบียนห้องผ่าตัดเดิม แก้ไขได้ภายหลังที่หน้า ตั้งค่า
-- =====================================================================

insert into public.departments (department_name, department_code) values
  ('ศัลยกรรม (GEN SX)',             'SURG'),
  ('ศัลยกรรมกระดูกและข้อ (ORTHO)',  'ORTHO'),
  ('สูติ-นรีเวชกรรม (OB/GYN)',      'OBGYN'),
  ('จักษุ (EYE)',                   'EYE'),
  ('หู คอ จมูก (ENT)',              'ENT'),
  ('กุมารเวชกรรม (PED)',            'PED'),
  ('Maxillofacial',                 'MAXILLO')
on conflict (department_code) do nothing;

insert into public.or_rooms (room_number, room_name) values
  (1,'ห้องผ่าตัด 1'), (2,'ห้องผ่าตัด 2'), (3,'ห้องผ่าตัด 3'), (4,'ห้องผ่าตัด 4'),
  (5,'ห้องผ่าตัด 5'), (6,'ห้องผ่าตัด 6'), (7,'ห้องผ่าตัด 7')
on conflict (room_number) do nothing;

-- กลุ่มสำหรับรวมยอด: GA = GA+TIVA+IVS · RA = BB+SB · LA = LA+MAC
insert into public.anesthesia_types (anesthesia_code, anesthesia_name, anesthesia_group) values
  ('GA',       'General Anesthesia (GA)',      'GA'),
  ('TIVA',     'TIVA',                         'GA'),
  ('IVS',      'IV Sedation (IVS)',            'GA'),
  ('SB',       'Spinal Block (SB)',            'RA'),
  ('BB',       'Brachial Block (BB)',          'RA'),
  ('EPIDURAL', 'Epidural Block',               'RA'),
  ('LA',       'Local Anesthesia (LA)',        'LA'),
  ('MAC',      'Monitored Anesthesia Care (MAC)', 'LA'),
  ('OTHER',    'อื่น ๆ',                        'OTHER')
on conflict (anesthesia_code) do nothing;

-- ===== seed_operation_codes.sql =====
-- =====================================================================
-- OR REGISTRY | database/seed_operation_codes.sql
-- รายการผ่าตัดมาตรฐาน (Code operation) 364 รายการ จากทะเบียนเดิม รันหลัง seed.sql
-- เป็นข้อมูลอ้างอิง ไม่มีข้อมูลผู้ป่วย
-- =====================================================================
insert into public.operation_codes (department_id, op_code, operation_name, sort_order)
select d.id, v.op_code, v.operation_name, v.ord from (values
  ('SURG','Sx01','Excision',1),
  ('SURG','Sx02','CNBx',2),
  ('SURG','Sx03','Excision breast mass',3),
  ('SURG','Sx04','Appendectomy',4),
  ('SURG','Sx05','Lap Appendectomy',5),
  ('SURG','Sx06','Interval appendectomy',6),
  ('SURG','Sx07','I&D',7),
  ('SURG','Sx08','O&D',8),
  ('SURG','Sx09','Nail extraction',9),
  ('SURG','Sx10','Suture wound',10),
  ('SURG','Sx11','Debridement',11),
  ('SURG','Sx12','Repair umbilicalhernia',12),
  ('SURG','Sx13','Hernioplasty',13),
  ('SURG','Sx14','Herniotomy',14),
  ('SURG','Sx15','Circumcision',15),
  ('SURG','Sx16','EGD c EL',16),
  ('SURG','Sx17','EGD',17),
  ('SURG','Sx18','EGD c polypectomy',18),
  ('SURG','Sx19','Colonoscopy',19),
  ('SURG','Sx20','Colonoscopy c polypectomy',20),
  ('SURG','Sx21','EGD+Colonoscopy c polypectomy',21),
  ('SURG','Sx22','EGD+Colonoscopy',22),
  ('SURG','Sx23','Rigid sigmoidoscopy',23),
  ('SURG','Sx24','Resuture',24),
  ('SURG','Sx25','Reconstruction penis',25),
  ('SURG','Sx26','Excision parafinoma',26),
  ('SURG','Sx27','Excision hemorrhoid',27),
  ('SURG','Sx28','STSG',28),
  ('SURG','Sx29','Drop colostomy',29),
  ('SURG','Sx30','Reduce hemorrhoid',30),
  ('SURG','Sx31','Open Cholecystectomy',31),
  ('SURG','Sx32','Partial Cholecystectomy',32),
  ('SURG','Sx33','Exploratory c Bypass ilium to transvers colon',33),
  ('SURG','Sx34','Remove foreign body',34),
  ('SURG','Sx35','Exploratory Laparotomy',35),
  ('SURG','Sx36','Exploratory sigmoidectomy',36),
  ('SURG','Sx37','Exploratory Gastojejunostomy',37),
  ('SURG','Sx38','Exploratory Laparotomy c lysis adhesion',38),
  ('SURG','Sx39','Total gastectomy',39),
  ('SURG','Sx40','Suture Duodenal ulcer perforate',40),
  ('SURG','Sx41','Tenck off catheter',41),
  ('SURG','Sx42','Frenulotomy',42),
  ('SURG','Sx43','Fasciotomy',43),
  ('SURG','Sx44','Fistulectomy',44),
  ('SURG','Sx45','EL c Hemicolectomy',45),
  ('SURG','Sx46','Colostomy',46),
  ('SURG','Sx47','Below knee Amputation',47),
  ('SURG','Sx48','Above knee Amputation',48),
  ('SURG','Sx49','Amputation',49),
  ('SURG','Sx50','High ligation with venous strpping',50),
  ('SURG','Sx51','Intraperitoneal drainage',51),
  ('SURG','Sx52','Incisional Biopsy',52),
  ('SURG','Sx53','Excisional biopsy',53),
  ('SURG','Sx54','Biopsy',54),
  ('SURG','Sx55','Repair Hernia',55),
  ('SURG','Sx56','Stitch off',56),
  ('SURG','Sx57','Repair bladder',57),
  ('SURG','Sx58','Orchidectomy',58),
  ('SURG','Sx59','LC',59),
  ('SURG','Sx60','Tracheostomy',60),
  ('SURG','Sx61','Abdominal tapping',61),
  ('SURG','Sx62','EL c drainage',62),
  ('SURG','Sx63','Suture stump appendix',63),
  ('SURG','Sx64','Retained Radivac drain',64),
  ('SURG','Sx65','Aspiration abscess',65),
  ('SURG','Sx66','Modified Radical Mastectomy',66),
  ('SURG','Sx67','EL c Repair small bowel',67),
  ('SURG','Sx68','EL c Small bowel resection',68),
  ('SURG','Sx69','Large bowel resection',69),
  ('SURG','Sx70','EL c Repair stomatch',70),
  ('SURG','Sx71','EL c Total colectomy',71),
  ('SURG','Sx72','EL c Subtotal colectomy',72),
  ('SURG','Sx73','Ileocolectomy',73),
  ('SURG','Sx74','EL c APR',74),
  ('SURG','Sx75','Suture colon',75),
  ('SURG','Sx76','EL c Simple closure Gastic ulcer',76),
  ('SURG','Sx77','EL C Low Anterior resection',77),
  ('SURG','Sx78','Simple closure duodenum',78),
  ('SURG','Sx79','EL c Gastrostomy',79),
  ('SURG','Sx80','Chang FJ',80),
  ('SURG','Sx81','Lysis toung tie',81),
  ('SURG','Sx82','Injection',82),
  ('SURG','Sx83','Venous stripping',83),
  ('SURG','Sx84','Vacuum Dressing',84),
  ('SURG','Sx85','Exploration wound',85),
  ('SURG','Sx86','Scrub burn',86),
  ('SURG','Sx87','Prepuce extraction',87),
  ('SURG','Sx88','Nail excision',88),
  ('SURG','Sx89','wide excision',89),
  ('SURG','Sx90','Hydrocelectomy',90),
  ('SURG','Sx91','Ishmectomy of thyroid gland',91),
  ('SURG','Sx92','Total thyroidectomy',92),
  ('SURG','Sx93','Lobectomy of thyroid grand',93),
  ('SURG','Sx94','Sistrunk operation',94),
  ('SURG','Sx95','Mastectomy',95),
  ('SURG','Sx96','Stop bleeding by cauterization',96),
  ('SURG','Sx97','Core needdle biopsy',97),
  ('SURG','Sx98','Fine needle aspiration',98),
  ('SURG','Sx99','Electrical cauterization',99),
  ('SURG','Sx100','Repair muscle',100),
  ('SURG','Sx101','Repair artery',101),
  ('SURG','Sx102','Evacuate blood clot',102),
  ('SURG','Sx103','Closure wound',103),
  ('SURG','Sx104','Remove FB',104),
  ('SURG','Sx105','Ureterostomy',105),
  ('SURG','Sx106','จี้หูด',106),
  ('SURG','Sx107','Chang ST',107),
  ('SURG','Sx108','Lap TEP',108),
  ('SURG','Sx109','Rubber band',109),
  ('SURG','Sx110','Fistulotomy',110),
  ('SURG','Sx111','EL with Feedingjejunostomy',111),
  ('SURG','Sx112','Retain Foley catheter',112),
  ('SURG','Sx113','Laparoscopic Dx.',113),
  ('SURG','Sx114','Laparoscopic colectomy',114),
  ('SURG','Sx115','EL c Hernioplasty',115),
  ('SURG','Sx116','Breast augmentation',116),
  ('ORTHO','Ort01','Debridement',117),
  ('ORTHO','Ort02','DB open Fx.',118),
  ('ORTHO','Ort03','DB with PAS',119),
  ('ORTHO','Ort04','DB with K-wire',120),
  ('ORTHO','Ort05','DB with repair tendon',121),
  ('ORTHO','Ort06','CRIF with .....',122),
  ('ORTHO','Ort07','CRIF with PAS',123),
  ('ORTHO','Ort08','CRIF with K-wire',124),
  ('ORTHO','Ort09','CRIF with Screw',125),
  ('ORTHO','Ort10','CRIF with TBW',126),
  ('ORTHO','Ort11','CRIF with IM nailing',127),
  ('ORTHO','Ort12','CRIF with multiple screw',128),
  ('ORTHO','Ort13','CRIF with Hook plate',129),
  ('ORTHO','Ort14','CRIF withProximal femoral nailing',130),
  ('ORTHO','Ort15','CRIF with Intramedullary pinning',131),
  ('ORTHO','Ort16','CRIF with DHS',132),
  ('ORTHO','Ort17','ORIF with .....',133),
  ('ORTHO','Ort18','ORIF with PAS',134),
  ('ORTHO','Ort19','ORIF with K-wire',135),
  ('ORTHO','Ort20','ORIF with Screw',136),
  ('ORTHO','Ort21','ORIF with DHS hip screw',137),
  ('ORTHO','Ort22','ORIF with multiple screw',138),
  ('ORTHO','Ort23','ORIF with Proximal femoral nailing',139),
  ('ORTHO','Ort24','ORIF with IM nailing',140),
  ('ORTHO','Ort25','ORIF with Tibial nail',141),
  ('ORTHO','Ort26','ORIF with ILN',142),
  ('ORTHO','Ort27','OREF',143),
  ('ORTHO','Ort28','CREF',144),
  ('ORTHO','Ort29','Percutaneous pedicular screw',145),
  ('ORTHO','Ort30','External fixation spanning',146),
  ('ORTHO','Ort31','Skeletal traction',147),
  ('ORTHO','Ort32','removal of internal fixation device',148),
  ('ORTHO','Ort33','removal of external fixation device',149),
  ('ORTHO','Ort34','Repair tendon',150),
  ('ORTHO','Ort35','Release carpal tunnel',151),
  ('ORTHO','Ort36','Release dequervain',152),
  ('ORTHO','Ort37','Release Pulley',153),
  ('ORTHO','Ort38','Release cubital tunnel',154),
  ('ORTHO','Ort39','Release muscle',155),
  ('ORTHO','Ort40','Compartment release',156),
  ('ORTHO','Ort41','Trigger finger',157),
  ('ORTHO','Ort42','Anchor suture',158),
  ('ORTHO','Ort43','Repair nail bed',159),
  ('ORTHO','Ort44','Biopsy',160),
  ('ORTHO','Ort45','Excision',161),
  ('ORTHO','Ort46','Tenolysis',162),
  ('ORTHO','Ort47','I&D',163),
  ('ORTHO','Ort48','O&D',164),
  ('ORTHO','Ort49','BKA',165),
  ('ORTHO','Ort50','AKA',166),
  ('ORTHO','Ort51','Ray''s Amputation',167),
  ('ORTHO','Ort52','Amputation toe',168),
  ('ORTHO','Ort53','Amputation finger',169),
  ('ORTHO','Ort54','Close reduction',170),
  ('ORTHO','Ort55','Open reduction',171),
  ('ORTHO','Ort56','Close stump',172),
  ('ORTHO','Ort57','Suture wound',173),
  ('ORTHO','Ort58','Arthrotomy',174),
  ('ORTHO','Ort59','Osteotomy',175),
  ('ORTHO','Ort60','Remove foreign body',176),
  ('ORTHO','Ort61','STSG',177),
  ('ORTHO','Ort62','FTSG',178),
  ('ORTHO','Ort63','V-Y flab',179),
  ('ORTHO','Ort64','Decompression of ulna nerve',180),
  ('ORTHO','Ort65','Vacuum dressing',181),
  ('ORTHO','Ort66','Hip spica cast',182),
  ('ORTHO','Ort67','Repair nerve',183),
  ('ORTHO','Ort68','Remove ATB cement',184),
  ('ORTHO','Ort69','Repair joint capsule',185),
  ('ORTHO','Ort70','Repair ligament',186),
  ('ORTHO','Ort71','Repair muscle',187),
  ('ORTHO','Ort72','Repair artery',188),
  ('ORTHO','Ort73','Repair Nail bed',189),
  ('ORTHO','Ort74','Reverse cross finger flap',190),
  ('ORTHO','Ort75','Resuture',191),
  ('ORTHO','Ort76','Aspiration',192),
  ('ORTHO','Ort77','Excisional Biopsy',193),
  ('ORTHO','Ort78','Fasciotomy',194),
  ('ORTHO','Ort79','Total hip arthoplasty',195),
  ('ORTHO','Ort80','Cementless total Hip arthoplasty',196),
  ('ORTHO','Ort81','Cemented bipolar Hemiarthoplasty Hip',197),
  ('ORTHO','Ort82','Bipolar Hemiarthoplasty',198),
  ('ORTHO','Ort83','Cementless bipolar Hemiarthoplasty Hip',199),
  ('ORTHO','Ort84','Revision acetabularcap',200),
  ('ORTHO','Ort85','Revise total hip arthroplasty',201),
  ('ORTHO','Ort86','Revision PAS',202),
  ('ORTHO','Ort87','Revision screw',203),
  ('ORTHO','Ort88','Revision TBW',204),
  ('ORTHO','Ort89','Total knee arthroplasty',205),
  ('ORTHO','Ort90','Knee manipulation',206),
  ('ORTHO','Ort91','Shoulder manipulation',207),
  ('ORTHO','Ort92','wide excision',208),
  ('ORTHO','Ort93','Echarectomy',209),
  ('ORTHO','Ort94','Extensor compartment release',210),
  ('ORTHO','Ort95','Transeverse carpal big release',211),
  ('ORTHO','Ort96','Soft tissue release',212),
  ('ORTHO','Ort97','Flap separetion',213),
  ('ORTHO','Ort98','Injection',214),
  ('ORTHO','Ort99','ตัดไหม',215),
  ('ORTHO','Ort100','Corrective osteotomy',216),
  ('ORTHO','Ort101','Change screw',217),
  ('ORTHO','Ort102','Electrical cautery wound',218),
  ('ORTHO','Ort103','Sequestrectomy',219),
  ('ORTHO','Ort104','Synovectomy',220),
  ('ORTHO','Ort105','Change cast',221),
  ('ORTHO','Ort106','Vacuum dressing wound',222),
  ('ORTHO','Ort107','Explore wound',223),
  ('ORTHO','Ort108','Release hematoma',224),
  ('ORTHO','Ort109','Nail plate extraction',225),
  ('ORTHO','Ort110','Intraartricular lidocan inj.',226),
  ('ORTHO','Ort111','Remove hematoma',227),
  ('ORTHO','Ort112','Long arm cast',228),
  ('ORTHO','Ort113','DRUJ reconstruction',229),
  ('ORTHO','Ort114','Blepharoplasty',230),
  ('ORTHO','Ort115','Revision internal fixation',231),
  ('ORTHO','Ort116','Incision biopsy',232),
  ('ORTHO','Ort117','Slab',233),
  ('ORTHO','Ort118','Arthrocentesis',234),
  ('ORTHO','Ort119','Repair nail bed',235),
  ('ORTHO','Ort120','Skin traction',236),
  ('ORTHO','Ort121','Tendon transfer',237),
  ('ORTHO','Ort122','Core needdle biopsy',238),
  ('ORTHO','Ort123','IBG',239),
  ('ORTHO','Ort124','Fluoroscope',240),
  ('OBGYN','OBG01','LTc/s',241),
  ('OBGYN','OBG02','PPTR',242),
  ('OBGYN','OBG03','D&C',243),
  ('OBGYN','OBG04','F&C',244),
  ('OBGYN','OBG05','TAH',245),
  ('OBGYN','OBG06','Subtotal hysterectomy',246),
  ('OBGYN','OBG07','Cystectomy',247),
  ('OBGYN','OBG08','Salphingo-oophorectomy',248),
  ('OBGYN','OBG09','Marsupiazation',249),
  ('OBGYN','OBG10','Vaginal mastectomy',250),
  ('OBGYN','OBG11','Vaginal myomectomy',251),
  ('OBGYN','OBG12','Myomectomy',252),
  ('OBGYN','OBG13','Currettage',253),
  ('OBGYN','OBG14','SPTR',254),
  ('OBGYN','OBG15','A-P Repair',255),
  ('OBGYN','OBG16','V-hysterectomy',256),
  ('OBGYN','OBG17','Explor lap',257),
  ('OBGYN','OBG18','Enucleation of endometrium',258),
  ('OBGYN','OBG19','TVH c A-P Repair',259),
  ('OBGYN','OBG20','I&D',260),
  ('OBGYN','OBG21','Lysis adhesion',261),
  ('OBGYN','OBG22','Salphingectomy',262),
  ('OBGYN','OBG23','Ovarian wedge resection',263),
  ('OBGYN','OBG24','Vaginal pack',264),
  ('OBGYN','OBG25','Resuture',265),
  ('OBGYN','OBG26','Off vaginal pack',266),
  ('OBGYN','OBG27','Remove blood clot',267),
  ('OBGYN','OBG28','Remove IUD',268),
  ('OBGYN','OBG29','Remove implant',269),
  ('OBGYN','OBG30','Remove FB',270),
  ('OBGYN','OBG31','Colposcopy',271),
  ('OBGYN','OBG32','LEEP',272),
  ('OBGYN','OBG33','Colposcopy c LEEP',273),
  ('OBGYN','OBG34','Suction & Currettage',274),
  ('OBGYN','OBG35','MVA',275),
  ('OBGYN','OBG36','Excision',276),
  ('OBGYN','OBG37','Incision',277),
  ('OBGYN','OBG38','Suture Episiotomy',278),
  ('OBGYN','OBG39','Suture labia',279),
  ('OBGYN','OBG40','Suture wound',280),
  ('OBGYN','OBG41','Resuture',281),
  ('OBGYN','OBG42','จี้ปากช่องคลอด',282),
  ('OBGYN','OBG43','Placenta removal',283),
  ('OBGYN','OBG44','Evacuate hematoma',284),
  ('OBGYN','OBG45','Evacuate incision',285),
  ('OBGYN','OBG46','biopsy',286),
  ('OBGYN','OBG47','Appendectomy',287),
  ('OBGYN','OBG48','Repair vagina',288),
  ('OBGYN','OBG49','Repair Uterine',289),
  ('OBGYN','OBG50','Repair fourchette',290),
  ('OBGYN','OBG51','Speculum exam',291),
  ('OBGYN','OBG52','Repair corpus luteal',292),
  ('OBGYN','OBG53','Repair of ovary',293),
  ('OBGYN','OBG54','Intrauterine drainage',294),
  ('OBGYN','OBG55','Fistula tract excision',295),
  ('OBGYN','OBG56','PV',296),
  ('OBGYN','OBG57','Polypectomy',297),
  ('OBGYN','OBG58','Debridement',298),
  ('EYE','EYE01','>>> Phaco c IOL',299),
  ('EYE','EYE02','>>> Phaco',300),
  ('EYE','EYE03','>>> ECCE',301),
  ('EYE','EYE04','>>> ECCE c IOL',302),
  ('EYE','EYE05','>>> ECCE c SF-IOL',303),
  ('EYE','EYE06','>>> ECCE c SF',304),
  ('EYE','EYE07','>>> ECCE c Vitrectomy',305),
  ('EYE','EYE08','>>> SIIE c IOL',306),
  ('EYE','EYE09','>>> ICCE c SF-IOL',307),
  ('EYE','EYE10','>>>PEX',308),
  ('EYE','EYE11','>>>PEX c Conjungtival graft',309),
  ('EYE','EYE12','>>>PEX c AMG',310),
  ('EYE','EYE13','ตัดไหมตา',311),
  ('EYE','EYE14','Excision',312),
  ('EYE','EYE15','I+C',313),
  ('EYE','EYE16','IOL removal',314),
  ('EYE','EYE17','Nuclear fragment removal',315),
  ('EYE','EYE18','Vitrectomy',316),
  ('EYE','EYE19','Vitrectomy c SF IOL',317),
  ('EYE','EYE20','Scleral fixation',318),
  ('EYE','EYE21','Permanent tarsorrhaphy',319),
  ('EYE','EYE22','Iris reposition',320),
  ('EYE','EYE23','Lid reconstruction',321),
  ('EYE','EYE24','Excision brown eyelid',322),
  ('EYE','EYE25','Blepharoplasty',323),
  ('EYE','EYE26','Revision blepharoplasty',324),
  ('EYE','EYE27','Resuture',325),
  ('EYE','EYE28','aspilate epilation',326),
  ('EYE','EYE29','Remove small lens',327),
  ('EYE','EYE30','Remove foreign body',328),
  ('EYE','EYE31','Excision biopsy',329),
  ('EYE','EYE32','I&D',330),
  ('EYE','EYE33','Repair lid',331),
  ('EYE','EYE34','Resuture',332),
  ('EYE','EYE35','Ptosis correction',333),
  ('EYE','EYE36','Suture',334),
  ('ENT','ENT01','Excision',335),
  ('ENT','ENT02','I&D',336),
  ('ENT','ENT03','Tonsillectomy',337),
  ('ENT','ENT04','Tonsillectomy c adenoidectomy',338),
  ('ENT','ENT05','Lobectomy',339),
  ('ENT','ENT06','ToTal Thyroidectomy',340),
  ('ENT','ENT07','FOL c punch biopsy',341),
  ('ENT','ENT08','FOL evaluation',342),
  ('ENT','ENT09','Biopsy',343),
  ('ENT','ENT10','Incision biopsy',344),
  ('ENT','ENT11','Stopbleed',345),
  ('ENT','ENT12','Revision tracheostomy',346),
  ('ENT','ENT13','Tracheostomy',347),
  ('ENT','ENT14','Remove FB',348),
  ('ENT','ENT15','laryngoscopy',349),
  ('ENT','ENT16','Incision biopsy',350),
  ('ENT','ENT17','Suture wound',351),
  ('ENT','ENT18','Lysis tongue tie',352),
  ('ENT','ENT19','DL c mapping',353),
  ('ENT','ENT20','Explor wound',354),
  ('ENT','ENT21','Debridement',355),
  ('PED','PED01','Partial blood exchange',356),
  ('PED','PED02','UVC insertion',357),
  ('PED','PED03','Fail UVC insertion',358),
  ('PED','PED04','Lysis toung tie',359),
  ('MAXILLO','Maxillo01','I&D',360),
  ('MAXILLO','Maxillo02','O&D',361),
  ('MAXILLO','Maxillo03','ORIF c Miniplate screw zygoma',362),
  ('MAXILLO','Maxillo04','Nasal bone reduction',363),
  ('MAXILLO','Maxillo05','Enucleation at maxilla',364)
) as v(dept_code, op_code, operation_name, ord)
join public.departments d on d.department_code = v.dept_code
on conflict (department_id, op_code) do nothing;
