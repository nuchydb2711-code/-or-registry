// สร้าง Supabase client (ใช้ anon key เท่านั้น สิทธิ์จริงควบคุมโดย RLS ในฐานข้อมูล)
(function () {
  var cfg = window.OR_CONFIG || {};
  window.OR = window.OR || {};
  var url = (cfg.SUPABASE_URL || '').trim();
  var key = (cfg.SUPABASE_ANON_KEY || '').trim();
  // รับ URL ที่วางมาผิดรูปแบบได้ เช่น มี /rest/v1/ ต่อท้าย หรือเป็นลิงก์ Dashboard
  function normalizeUrl(u) {
    var m = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);   // ลิงก์ Dashboard → https://<ref>.supabase.co
    if (m) return 'https://' + m[1].toLowerCase() + '.supabase.co';
    try { var x = new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u); return x.origin; } catch (e) { return u; }
  }
  if (url && !/YOUR_SUPABASE/.test(url)) url = normalizeUrl(url);
  var placeholder = !url || !key || /YOUR_SUPABASE/.test(url + key);
  OR.configError = null;

  function jwtRole(k) {
    try {
      var p = k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).role;
    } catch (e) { return null; }
  }

  if (placeholder) {
    OR.configError = 'ยังไม่ได้ตั้งค่า Supabase — เปิดไฟล์ js/config.js แล้วใส่ SUPABASE_URL และ SUPABASE_ANON_KEY';
  } else if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    OR.configError = 'SUPABASE_URL ต้องขึ้นต้นด้วย https://';
  } else if (/^https:\/\/(www\.|app\.)?supabase\.com/i.test(url)) {
    OR.configError = 'SUPABASE_URL ไม่ถูกต้อง: ต้องเป็น Project URL รูปแบบ https://xxxxxxxx.supabase.co (Project Settings → API) ไม่ใช่ลิงก์หน้า Dashboard';
  } else if (jwtRole(key) === 'service_role' || /service_role|^sb_secret_/.test(key)) {
    OR.configError = 'พบ service_role key ใน config.js — อันตราย! ห้ามใช้ ให้ใช้ anon key แทน แล้วเปลี่ยน key ที่รั่วที่ Supabase ทันที';
  } else if (typeof supabase === 'undefined') {
    OR.configError = 'โหลดไลบรารี Supabase ไม่สำเร็จ (js/vendor/supabase.min.js)';
  }

  OR.db = OR.configError ? null : supabase.createClient(url, key, {
    auth: {
      // เก็บ session ใน sessionStorage: ปิดแท็บ/เบราว์เซอร์แล้วต้อง login ใหม่ (เหมาะกับเครื่องกลาง)
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
})();
