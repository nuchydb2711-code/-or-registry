# เริ่มใช้งานใน 15 นาที

ต้องมี: อีเมลสำหรับสมัคร Supabase และบัญชี GitHub (ฟรีทั้งคู่) · ใช้ข้อมูลสมมติก่อนจนกว่าโรงพยาบาลอนุมัติ

## 1) สร้างฐานข้อมูล (Supabase)
1. เข้า supabase.com → Sign up → **New project** → ตั้งชื่อ → ตั้ง Database Password (จดไว้) → Region **Singapore** → Create
2. รอประมาณ 2 นาที → เมนูซ้าย **SQL Editor → New query**
3. เปิดไฟล์ `database/install_all.sql` คัดลอกทั้งหมดไปวาง → **Run** → ต้องขึ้น *Success*
4. (ถ้าอยากลองก่อน) วาง `database/seed_test.sql` → Run  เพื่อได้ข้อมูลสมมติ

## 2) สร้างบัญชีผู้ดูแลระบบ
1. เมนูซ้าย **Authentication → Users → Add user → Create new user** ใส่อีเมล+รหัสผ่าน ติ๊ก **Auto Confirm User**
2. กลับ SQL Editor รัน (แก้อีเมลและชื่อ):
```sql
update public.profiles set role = 'ADMIN', is_active = true, full_name = 'ชื่อ-นามสกุล'
 where email = 'อีเมลที่เพิ่งสร้าง';
```

## 3) ใส่ค่าเชื่อมต่อ
**Project Settings → API** คัดลอก 2 ค่า ใส่ในไฟล์ `js/config.js`
- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = **anon public** (ห้ามใช้ service_role)

## 4) ขึ้นเว็บ (GitHub Pages)
1. github.com → New repository (ตั้งเป็น Private ถ้าแผนรองรับ) → **uploading an existing file** → ลากไฟล์ทั้งหมดยกเว้นโฟลเดอร์ `database/` และ `tools/` → Commit
2. **Settings → Pages → Deploy from a branch → main / (root)** → Save → รอ 1–2 นาที ได้ลิงก์ `https://ชื่อ.github.io/ชื่อrepo/login.html`
3. Supabase → **Authentication → URL Configuration** ใส่ลิงก์เว็บเป็น Site URL

## 5) ลองใช้
เปิดลิงก์ → เข้าสู่ระบบด้วยบัญชีข้อ 2 → ลงทะเบียน Case แรก → ดูรายงาน
เพิ่มเจ้าหน้าที่: สร้างผู้ใช้ที่ Supabase (ข้อ 2.1) แล้วไป **ตั้งค่า → ผู้ใช้งาน** เลือกสิทธิ์และเปิดใช้งาน
แก้รายชื่อแพทย์/แผนก/ห้อง: **ตั้งค่า** (เฉพาะ ADMIN) — ต้องเพิ่มรายชื่อศัลยแพทย์ก่อนจึงเลือกในฟอร์มได้

## ก่อนใช้ข้อมูลจริง (ต้องทำ)
- ได้รับอนุมัติ PDPA จากโรงพยาบาล
- รัน `database/cleanup_test.sql` (ถ้าเคยใส่ข้อมูลสมมติ)
- ปิด Allow new users to sign up (Authentication → Sign In / Providers) และเปิด MFA ให้บัญชี Supabase
- ใช้แผน Supabase ที่มี Daily Backup (แผนฟรีไม่มี backup)

---
## อัปเดตเวอร์ชัน 5 (ประหยัดเวลา)
1. **รันครั้งเดียว** ใน Supabase → SQL Editor: วางเนื้อหาไฟล์ `database/migration_phase3.sql` แล้วกด Run (สร้างตารางรายชื่อบุคลากรทีมผ่าตัด `or_staff`) — ไม่รันก็ใช้งานได้ แต่จะเพิ่ม/เลือกรายชื่อจากรายการไม่ได้
2. อัปโหลดไฟล์ในโฟลเดอร์ css, js, database ทับของเดิม (ห้ามทับ `js/config.js`) รอ 1–2 นาที แล้วกด Ctrl+Shift+R
3. สิ่งที่เปลี่ยน
   - หน้าลงทะเบียนเป็น **หน้าเดียว**: พิมพ์ HN → Enter → กรอกต่อทันที → **Ctrl+Enter** เพื่อบันทึก
   - **ทีมผ่าตัด**: คลิกเลือกชื่อจากรายชื่อ หรือพิมพ์ชื่อใหม่แล้วกด "＋ เพิ่ม ... เป็นรายชื่อใหม่" (เก็บไว้ใช้ครั้งต่อไป) · ปุ่ม "ใช้ทีมเดิม" คัดลอกทีมจาก Case ก่อนหน้า · จัดการรายชื่อได้ที่ ตั้งค่า → บุคลากรทีมผ่าตัด (ADMIN)
   - ศัลยแพทย์ / วิสัญญี / Code operation พิมพ์ค้นหาได้
   - ปุ่ม **ตอนนี้** ข้างช่องเวลา · ใส่เวลาสิ้นสุดแล้วสถานะเปลี่ยนเป็น "เสร็จสิ้น" อัตโนมัติ
   - "บันทึกและลงทะเบียน Case ใหม่" จะจำ วันที่ ห้อง แผนก ศัลยแพทย์ วิสัญญี ทีม ให้ Case ถัดไป

---
## อัปเดตล่าสุด (พิมพ์อายุเองได้ + จำชื่อบุคลากรอัตโนมัติ)
1. ไม่ต้องรัน SQL ใหม่ (ต้องเคยรัน `database/migration_phase3.sql` แล้ว)
2. อัปโหลดโฟลเดอร์ `css`, `js` ทับของเดิม (ห้ามทับ `js/config.js`) แล้วกด Ctrl+Shift+R
3. สิ่งที่เปลี่ยน: ช่องอายุพิมพ์เองได้เมื่อไม่ทราบวันเกิด · ชื่อบุคลากรที่พิมพ์ในทีม ระบบจำไว้ให้เลือกครั้งหน้าเมื่อบันทึก Case

