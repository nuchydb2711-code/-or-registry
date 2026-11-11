// =====================================================================
// ตั้งค่าการเชื่อมต่อ Supabase  (แก้ 2 ค่านี้ค่าเดียว)
// หาได้ที่ Supabase > Project Settings > API
//   SUPABASE_URL      = Project URL
//   SUPABASE_ANON_KEY = anon public key   (ปลอดภัยที่จะอยู่ในไฟล์นี้ เพราะมี RLS)
// ห้ามใส่ service_role key เด็ดขาด — ระบบจะปฏิเสธการทำงานถ้าพบ
// =====================================================================
window.OR_CONFIG = {
  SUPABASE_URL: 'https://necbvecmxdahzisdiekg.supabase.co/rest/v1/',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lY2J2ZWNteGRhaHppc2RpZWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMDE4MzQsImV4cCI6MjEwOTg3NzgzNH0.tMFWTR8B0j-2GlDpaJ911KSI5s27Gy8Ht_LZgFQAu7M',

  // ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน (นาที) — เครื่องกลางในห้องผ่าตัดควรตั้งไว้
  IDLE_MINUTES: 30,

  // เวลาราชการ ใช้แนะนำค่า "ในเวลา/นอกเวลา" ให้อัตโนมัติ (ผู้ใช้แก้เองได้)
  OFFICE_HOURS: { start: '08:00', end: '16:00', weekdaysOnly: true }
};
