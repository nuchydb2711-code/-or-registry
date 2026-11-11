-- =====================================================================
-- OR REGISTRY | database/cleanup_test.sql
-- ลบข้อมูลสมมติทั้งหมดก่อนนำระบบไปใช้งานจริง
-- รันใน Supabase SQL Editor เท่านั้น (ฝั่งเว็บไม่มีสิทธิ์ลบ)
-- =====================================================================
begin;
set local app.allow_delete = 'on';

delete from public.surgery_cases
 where patient_id in (select id from public.patients where hn like 'TEST%');
delete from public.patients where hn like 'TEST%';
delete from public.doctors  where doctor_name like '[ทดสอบ]%';

-- ล้าง audit log ที่เกิดจากข้อมูลทดสอบ (ทำเฉพาะก่อนเริ่มใช้งานจริง)
delete from public.audit_logs;

commit;
