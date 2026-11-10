// สร้าง Supabase client (ใช้ anon key เท่านั้น สิทธิ์จริงควบคุมโดย RLS ในฐานข้อมูล)
(function () {
  var cfg = window.OR_CONFIG || {};
  window.OR = window.OR || {};
  var url = (cfg.SUPABASE_URL || '').trim();
  var key = (cfg.SUPABASE_ANON_KEY || '').trim();
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
  } else if (jwtRole(key) === 'service_role' || /service_role/.test(key)) {
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
