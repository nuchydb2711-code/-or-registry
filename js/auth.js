// การยืนยันตัวตน: login / logout / ตรวจสิทธิ์ / ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน
(function () {
  OR.auth = {};
  var idleTimer = null;

  function startIdle() {
    var min = (window.OR_CONFIG && OR_CONFIG.IDLE_MINUTES) || 30;
    function reset() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { OR.auth.signOut('ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน'); }, min * 60000);
    }
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(function (e) { window.addEventListener(e, reset, { passive: true }); });
    reset();
  }

  OR.auth.signIn = async function (email, password) {
    var r = await OR.db.auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw r.error;
    return r.data;
  };

  OR.auth.signOut = async function (reason) {
    try { await OR.db.auth.signOut(); } catch (e) { /* ออกจากหน้าอยู่แล้ว */ }
    OR.lookups = null;
    location.href = 'login.html' + (reason ? '?r=idle' : '');
  };

  // คืน {user, profile, role} หรือ null (และพาไปหน้า login / แสดงข้อความ)
  OR.auth.require = async function (roles) {
    var s = await OR.db.auth.getSession();
    if (!s.data.session) { location.replace('login.html'); return null; }
    var user = s.data.session.user;
    var p = await OR.db.from('profiles').select('id,full_name,email,role,is_active').eq('id', user.id).maybeSingle();
    var box = document.getElementById('main');
    if (p.error) { OR.fatal('โหลดข้อมูลผู้ใช้ไม่สำเร็จ: ' + OR.errMsg(p.error)); return null; }
    if (!p.data || !p.data.is_active) {
      box.innerHTML = '<div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h2>บัญชียังไม่เปิดใช้งาน</h2><p>บัญชีของคุณยังไม่ได้รับอนุญาตให้เข้าใช้ระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งานและกำหนดสิทธิ์</p><button class="btn pri" id="lo" type="button">ออกจากระบบ</button></div>';
      document.getElementById('lo').onclick = function () { OR.auth.signOut(); };
      return null;
    }
    if (roles && roles.indexOf(p.data.role) < 0) {
      box.innerHTML = '<div class="card" style="max-width:520px;margin:40px auto;text-align:center"><h2>ไม่มีสิทธิ์เข้าหน้านี้</h2><p>หน้านี้สำหรับ ' + OR.esc(roles.map(function (r) { return OR.L.role[r]; }).join(' / ')) + ' เท่านั้น</p><a class="btn pri" href="dashboard.html">กลับหน้าภาพรวม</a></div>';
      var t = document.getElementById('topbar'); if (t) { t.className = 'topbar'; t.innerHTML = '<div class="topbar-in"><a class="brand" href="dashboard.html"><i>✚</i>OR Registry</a></div>'; }
      return null;
    }
    startIdle();
    OR.db.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') location.replace('login.html'); });
    return { user: user, profile: p.data, role: p.data.role };
  };
})();
