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
