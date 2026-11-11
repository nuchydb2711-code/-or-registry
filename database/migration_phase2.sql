-- =====================================================================
-- OR REGISTRY | database/migration_phase2.sql
-- สำหรับผู้ที่รัน schema.sql เวอร์ชัน Phase 1 ไปแล้ว: เพิ่มฟิลด์ตามทะเบียนห้องผ่าตัดเดิม
-- รันครั้งเดียวหลัง schema.sql เก่า แล้วรัน seed.sql (ได้ซ้ำ) และ seed_operation_codes.sql
-- (ถ้าติดตั้งใหม่จาก schema.sql เวอร์ชันล่าสุด ไม่ต้องรันไฟล์นี้)
-- =====================================================================
begin;

-- profiles: อีเมลผู้ใช้ (แสดงในหน้า ตั้งค่า)
alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'VIEWER', false)
  on conflict (id) do nothing;
  return new;
end $$;

-- anesthesia_types: กลุ่มรวมยอด
alter table public.anesthesia_types add column if not exists anesthesia_group text not null default 'OTHER';
alter table public.anesthesia_types drop constraint if exists anesthesia_group_chk;
alter table public.anesthesia_types add constraint anesthesia_group_chk check (anesthesia_group in ('GA','RA','LA','OTHER'));
update public.anesthesia_types set anesthesia_group = 'GA' where anesthesia_code in ('GA','TIVA','IVS');
update public.anesthesia_types set anesthesia_group = 'RA' where anesthesia_code in ('SPINAL','SB','BB','EPIDURAL');
update public.anesthesia_types set anesthesia_group = 'LA' where anesthesia_code in ('LA','MAC','SEDATION');

-- operation_codes
create table if not exists public.operation_codes (
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
create index if not exists operation_codes_department_idx on public.operation_codes(department_id, sort_order);
alter table public.operation_codes enable row level security;
create trigger operation_codes_set_updated_at before update on public.operation_codes for each row execute function public.set_updated_at();
create trigger operation_codes_audit after insert or update or delete on public.operation_codes for each row execute function public.audit_trigger();
create policy operation_codes_select on public.operation_codes for select to authenticated using (public.has_role(array['ADMIN','STAFF','VIEWER']));
create policy operation_codes_insert on public.operation_codes for insert to authenticated with check (public.has_role(array['ADMIN']));
create policy operation_codes_update on public.operation_codes for update to authenticated using (public.has_role(array['ADMIN'])) with check (public.has_role(array['ADMIN']));
revoke all on public.operation_codes from anon;
revoke delete on public.operation_codes from authenticated;

-- surgery_cases: ฟิลด์ใหม่
alter table public.surgery_cases
  add column if not exists urgency text not null default 'ELECTIVE',
  add column if not exists from_er boolean not null default false,
  add column if not exists operation_code_id uuid references public.operation_codes(id) on delete restrict,
  add column if not exists icd9_code text,
  add column if not exists site text,
  add column if not exists fracture_type text,
  add column if not exists wound_class text,
  add column if not exists work_period text,
  add column if not exists ward text,
  add column if not exists team text,
  add column if not exists has_risk boolean not null default false,
  add column if not exists risk_types text[] not null default '{}',
  add column if not exists risk_detail text,
  add column if not exists supplies_checked boolean,
  add column if not exists ods_mis boolean not null default false;

alter table public.surgery_cases
  add constraint surgery_cases_urgency_chk check (urgency in ('ELECTIVE','EMERGENCY')),
  add constraint surgery_cases_site_chk check (site is null or site in ('RIGHT','LEFT','BOTH')),
  add constraint surgery_cases_fracture_chk check (fracture_type is null or fracture_type in ('CLOSED','OPEN_G1','OPEN_G2','OPEN_G3')),
  add constraint surgery_cases_wound_chk check (wound_class is null or wound_class in ('CLEAN','CLEAN_CONTAMINATED','CONTAMINATED','DIRTY')),
  add constraint surgery_cases_period_chk check (work_period is null or work_period in ('IN_HOURS','OUT_HOURS')),
  add constraint surgery_cases_risk_types_chk check (risk_types <@ array['EQUIPMENT','DOCUMENT','COMPLICATION','PATIENT_ID_SITE','POSTPONE_CANCEL']::text[]);
create index if not exists surgery_cases_opcode_idx  on public.surgery_cases (operation_code_id);
create index if not exists surgery_cases_urgency_idx on public.surgery_cases (surgery_date, urgency);

-- view ใหม่ (ต้องสร้างใหม่เพราะเพิ่มคอลัมน์ระหว่างกลาง)
drop view if exists public.v_surgery_cases;
create view public.v_surgery_cases with (security_invoker = true) as
select
  c.id, c.case_number, c.surgery_date,
  p.id as patient_id, p.hn, p.patient_name, p.gender, p.birth_date,
  case when p.birth_date is null then null
       else extract(year from age(c.surgery_date, p.birth_date))::int end as age_years,
  c.case_type,
  d.department_name, d.department_code, c.department_id,
  c.diagnosis, c.operation_name,
  c.operation_code_id, oc.op_code, oc.operation_name as op_code_name,
  s.doctor_name as surgeon_name, c.surgeon_id,
  a.doctor_name as anesthesiologist_name, c.anesthesiologist_id,
  r.room_number, r.room_name, c.room_id,
  t.anesthesia_code, t.anesthesia_name, t.anesthesia_group, c.anesthesia_type_id,
  c.admission_time, c.or_entry_time, c.surgery_start_time, c.surgery_end_time, c.or_exit_time,
  c.case_status, c.result, c.notes, c.cancel_reason,
  c.urgency, c.from_er, c.icd9_code, c.site, c.fracture_type, c.wound_class, c.work_period,
  c.ward, c.team, c.has_risk, c.risk_types, c.risk_detail, c.supplies_checked, c.ods_mis,
  c.created_by, c.created_at, c.updated_at
from public.surgery_cases c
join public.patients p         on p.id = c.patient_id
left join public.departments d on d.id = c.department_id
left join public.operation_codes oc on oc.id = c.operation_code_id
left join public.doctors s     on s.id = c.surgeon_id
left join public.doctors a     on a.id = c.anesthesiologist_id
left join public.or_rooms r    on r.id = c.room_id
left join public.anesthesia_types t on t.id = c.anesthesia_type_id;
-- view ที่สร้างใหม่ได้สิทธิ์ตั้งต้นของ Supabase มาด้วย ต้องเก็บกลับให้เหลือเฉพาะอ่าน
revoke all on public.v_surgery_cases from anon, authenticated;
grant select on public.v_surgery_cases to authenticated;

commit;
