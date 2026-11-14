(function () {
  var msg = document.getElementById('msg'), form = document.getElementById('f'), go = document.getElementById('go');
  function show(t, c) { msg.innerHTML = '<div class="alert ' + c + '">' + OR.esc(t) + '</div>'; }

  if (OR.configError) { show(OR.configError, 'err'); go.disabled = true; return; }
  if (/[?&]r=idle/.test(location.search)) show('ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน กรุณาเข้าสู่ระบบใหม่', 'warn');

  // ถ้ามี session อยู่แล้วให้เข้าระบบเลย
  OR.db.auth.getSession().then(async function (s) { if (s.data.session) location.replace(await OR.auth.home()); });

  var busy = false;
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (busy) return;                     // กันกดซ้ำ
    var email = form.email.value.trim(), pw = form.password.value;
    if (!email || !pw) { show('กรุณากรอกอีเมลและรหัสผ่าน', 'err'); return; }
    busy = true; OR.busy(go, true, 'กำลังเข้าสู่ระบบ...'); msg.innerHTML = '';
    try {
      await OR.auth.signIn(email, pw);
      location.replace(await OR.auth.home());
    } catch (err) {
      // ไม่บอกว่าอีเมลหรือรหัสผ่านผิดข้อใด
      show(/Invalid login|credentials/i.test(err.message || '') ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : OR.errMsg(err), 'err');
      form.password.value = '';
    } finally { busy = false; OR.busy(go, false); }
  });
})();
