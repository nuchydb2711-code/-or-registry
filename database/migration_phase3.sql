-- =====================================================================
-- OR REGISTRY | database/migration_phase3.sql
-- เพิ่มตาราง or_staff (รายชื่อบุคลากรทีมผ่าตัด) สำหรับเลือกชื่อในฟอร์มลงทะเบียน Case
-- สำหรับผู้ที่ติดตั้งไว้แล้ว: รันครั้งเดียวใน SQL Editor (รันซ้ำได้ปลอดภัย)
-- ติดตั้งใหม่จาก schema.sql / install_all.sql เวอร์ชันล่าสุด ไม่ต้องรันไฟล์นี้
-- =====================================================================
begin;

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
