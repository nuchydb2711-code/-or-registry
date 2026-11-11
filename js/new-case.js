// ลงทะเบียน Case ใหม่ 3 ขั้นตอน: ผู้ป่วย (ค้นหา HN) → ข้อมูลผ่าตัด → ห้องผ่าตัด/สถานะ
(async function () {
  var ctx = await OR.init('new-case.html', ['ADMIN', 'STAFF']);
  if (!ctx) return;
  var $ = OR.$, esc = OR.esc;
  var main = document.getElementById('main');
  var lookups;
  try { lookups = await OR.loadLookups(true); } catch (e) { OR.fatal('โหลดข้อมูลหลักไม่สำเร็จ: ' + OR.errMsg(e)); return; }

  var S, form, saving = false;

  function reset() {
    S = { step: 1, patient: null, isNew: false, searched: false, count: null };
    form = OR.caseForm.create(lookups, ctx, null);
    saving = false;
    render();
  }

  function render() {
    main.innerHTML =
      '<div class="pagehead"><div><h1>ลงทะเบียน Case ใหม่</h1><p>กรอกตามลำดับการทำงาน 3 ขั้นตอน</p></div></div>' +
      '<div class="steps" id="steps"></div>' +
      '<div class="card"><div id="err"></div>' +
      '<div id="p1"></div><div id="p2" hidden></div><div id="p3" hidden></div>' +
      '<div class="formfoot" id="foot"></div></div>';
    $('#p2').appendChild(form.s2); $('#p3').appendChild(form.s3);
    renderStep1(); showStep(S.step);
  }

  function showStep(n) {
    S.step = n;
    ['p1', 'p2', 'p3'].forEach(function (id, i) { $('#' + id).hidden = i + 1 !== n; });
    var names = ['ข้อมูลผู้ป่วย', 'ข้อมูลการผ่าตัด', 'ข้อมูลห้องผ่าตัด'];
    $('#steps').innerHTML = names.map(function (t, i) {
      return '<div class="' + (i + 1 === n ? 'on' : i + 1 < n ? 'done' : '') + '"><b>' + (i + 1 < n ? '✓' : i + 1) + '</b><span>' + t + '</span></div>';
    }).join('');
    $('#err').innerHTML = '';
    renderFoot();
    window.scrollTo({ top: 0 });
  }

  function showErr(list) {
    $('#err').innerHTML = '<div class="alert err" role="alert"><b>ตรวจสอบข้อมูลอีกครั้ง</b><ul style="margin:6px 0 0;padding-left:20px">' + list.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>';
    $('#err').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderFoot() {
    var f = $('#foot'), n = S.step;
    var h = '<div class="grp"><button class="btn" id="bCancel" type="button">ยกเลิก</button>' + (n > 1 ? '<button class="btn" id="bBack" type="button">← ย้อนกลับ</button>' : '') + '</div><div class="grp">';
    if (n < 3) h += '<button class="btn pri" id="bNext" type="button"' + (n === 1 && !S.searched ? ' disabled' : '') + '>ถัดไป →</button>';
    else h += '<button class="btn" id="bSaveNew" type="button">บันทึกและลงทะเบียน Case ใหม่</button><button class="btn ok" id="bSave" type="button">บันทึกข้อมูล</button>';
    f.innerHTML = h + '</div>';
    $('#bCancel').onclick = async function () {
      if (await OR.confirm('ยกเลิกการลงทะเบียนนี้? ข้อมูลที่กรอกไว้จะหายไป', { okText: 'ยกเลิกการลงทะเบียน', cancelText: 'กลับไปกรอกต่อ', danger: true })) location.href = 'new-case.html';
    };
    if ($('#bBack')) $('#bBack').onclick = function () { showStep(S.step - 1); };
    if ($('#bNext')) $('#bNext').onclick = next;
    if ($('#bSave')) $('#bSave').onclick = function () { save(false); };
    if ($('#bSaveNew')) $('#bSaveNew').onclick = function () { save(true); };
  }

  /* ---------------- ขั้นตอนที่ 1: ผู้ป่วย ---------------- */
  function renderStep1() {
    $('#p1').innerHTML =
      '<h2>ค้นหาผู้ป่วยด้วย HN</h2>' +
      '<div class="toolbar"><div class="grow"><label for="hn">HN <span class="req">*</span></label><input id="hn" type="text" inputmode="text" maxlength="30" autocomplete="off" placeholder="เช่น 200898"></div>' +
      '<div class="actions"><button class="btn pri" id="bFind" type="button">ค้นหา HN</button></div></div>' +
      '<div id="pres"></div>';
    var hn = $('#hn');
    hn.addEventListener('input', function () { if (S.searched) { S.searched = false; S.patient = null; S.isNew = false; $('#pres').innerHTML = ''; renderFoot(); } });
    hn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); find(); } });
    $('#bFind').onclick = find;
    if (S.patient) { hn.value = S.patient.hn; showPatient(); }
    else hn.focus();
  }

  var finding = false;
  async function find() {
    if (finding) return;
    var hn = $('#hn').value.trim();
    if (!/^[A-Za-z0-9\-\/.]{1,30}$/.test(hn)) { $('#pres').innerHTML = '<div class="alert err">HN ใช้ได้เฉพาะตัวอักษร ตัวเลข และเครื่องหมาย - / . (ไม่เว้นวรรค)</div>'; return; }
    finding = true; OR.busy($('#bFind'), true, 'กำลังค้นหา...'); $('#pres').innerHTML = '';
    try {
      var r = await OR.db.from('patients').select('id,hn,patient_name,birth_date,gender,is_active').eq('hn', hn).maybeSingle();
      if (r.error) throw r.error;
      if (r.data) {
        S.patient = r.data; S.isNew = false;
        var c = await OR.db.from('surgery_cases').select('id', { count: 'exact', head: true }).eq('patient_id', r.data.id).neq('case_status', 'CANCELLED');
        S.count = c.error ? null : c.count;
      } else { S.patient = { hn: hn }; S.isNew = true; S.count = 0; }
      S.searched = true; showPatient(); renderFoot();
    } catch (e) { $('#pres').innerHTML = '<div class="alert err">ค้นหาไม่สำเร็จ: ' + esc(OR.errMsg(e)) + '</div>'; }
    finally { finding = false; OR.busy($('#bFind'), false); }
  }

  function showPatient() {
    var p = S.patient, box = $('#pres');
    if (!S.isNew) {
      box.innerHTML = '<div class="found"><h3>พบผู้ป่วยในระบบ</h3><dl class="kv" style="margin:10px 0 14px">' +
        '<dt>HN</dt><dd><b>' + esc(p.hn) + '</b></dd><dt>ชื่อ-สกุล</dt><dd>' + esc(p.patient_name) + '</dd>' +
        '<dt>วันเกิด / อายุ</dt><dd>' + OR.fmtDate(p.birth_date) + ' · ' + OR.fmtAge(p.birth_date) + '</dd><dt>เพศ</dt><dd>' + esc(OR.lab(OR.L.gender, p.gender)) + '</dd>' +
        '<dt>จำนวนครั้งที่เคยผ่าตัด</dt><dd><b>' + (S.count == null ? '-' : S.count) + ' ครั้ง</b> <span class="note">(ไม่นับ Case ที่ยกเลิก)</span></dd></dl>' +
        (p.is_active === false ? '<div class="alert warn">ผู้ป่วยรายนี้ถูกปิดใช้งาน กรุณาตรวจสอบกับผู้ดูแลระบบก่อนเพิ่ม Case</div>' : '') +
        '<div class="grp" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="bHist" type="button">ดูประวัติการผ่าตัด</button><button class="btn pri" id="bAdd" type="button">เพิ่ม Case ใหม่ →</button></div></div>';
      $('#bHist').onclick = showHistory; $('#bAdd').onclick = next;
    } else {
      box.innerHTML = '<div class="notfound"><h3>ไม่พบ HN ' + esc(p.hn) + ' — เพิ่มผู้ป่วยใหม่</h3><div class="grid" style="margin-top:12px">' +
        '<div class="full"><label for="pname">ชื่อ-สกุล (รวมคำนำหน้า) <span class="req">*</span></label><input id="pname" type="text" maxlength="200" value="' + esc(p.patient_name || '') + '"></div>' +
        '<div><label for="pbirth">วันเกิด</label><input id="pbirth" type="date" max="' + OR.today() + '" value="' + esc(p.birth_date || '') + '"></div>' +
        '<div><label for="page">อายุ (คำนวณอัตโนมัติ)</label><input id="page" type="text" readonly value="' + esc(OR.fmtAge(p.birth_date)) + '"></div>' +
        '<div><label for="pgender">เพศ</label><select id="pgender">' + OR.enumOptions(OR.L.gender, '— เลือก —', p.gender) + '</select></div></div></div>';
      $('#pbirth').addEventListener('input', function () { $('#page').value = OR.fmtAge(this.value); });
      $('#pname').focus();
    }
  }

  async function showHistory() {
    var m = OR.modal({ title: 'ประวัติการผ่าตัด — HN ' + S.patient.hn, body: '<div class="loading"><span class="spin"></span> กำลังโหลด...</div>', buttons: [{ text: 'ปิด' }] });
    try {
      var r = await OR.db.from('v_surgery_cases').select('case_number,surgery_date,operation_name,department_name,case_type,case_status').eq('patient_id', S.patient.id).order('surgery_date', { ascending: false }).limit(100);
      if (r.error) throw r.error;
      m.body.innerHTML = r.data.length ? '<div class="tablewrap"><table><thead><tr><th>วันที่</th><th>เลข Case</th><th>Operation</th><th>แผนก</th><th>ประเภท</th><th>สถานะ</th></tr></thead><tbody>' +
        r.data.map(function (x) { return '<tr><td>' + OR.fmtDate(x.surgery_date) + '</td><td>' + esc(x.case_number) + '</td><td>' + OR.dash(x.operation_name) + '</td><td>' + OR.dash(x.department_name) + '</td><td>' + OR.badge(x.case_type, OR.lab(OR.L.caseType, x.case_type)) + '</td><td>' + OR.badge(x.case_status, OR.lab(OR.L.status, x.case_status)) + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="empty">ยังไม่มีประวัติการผ่าตัด</div>';
    } catch (e) { m.body.innerHTML = '<div class="alert err">โหลดไม่สำเร็จ: ' + esc(OR.errMsg(e)) + '</div>'; }
  }

  function next() {
    if (S.step === 1) {
      if (!S.searched) { showErr(['กรุณาค้นหา HN ก่อน']); return; }
      if (S.isNew) {
        var name = $('#pname').value.trim(), errs = [];
        if (!name) errs.push('กรุณากรอกชื่อ-สกุลผู้ป่วย');
        var b = $('#pbirth').value; if (b && b > OR.today()) errs.push('วันเกิดต้องไม่เป็นวันในอนาคต');
        if (errs.length) { showErr(errs); return; }
        S.patient.patient_name = name; S.patient.birth_date = b || null; S.patient.gender = $('#pgender').value || null;
      }
      showStep(2); form.focusDate();
    } else if (S.step === 2) {
      var e = form.validate(2); if (e.length) { showErr(e); return; }
      showStep(3);
    }
  }

  /* ---------------- บันทึก ---------------- */
  async function save(andNew) {
    if (saving) return;
    var e = form.validate(); if (e.length) { showErr(e); return; }
    var btn = andNew ? $('#bSaveNew') : $('#bSave'), payload = form.get();
    saving = true; $('#err').innerHTML = '';
    $('#bSave').disabled = true; $('#bSaveNew').disabled = true; $('#bBack').disabled = true;
    try {
      // เตือนกรณีมี Case ของผู้ป่วยรายเดิมในวันเดียวกัน
      if (!S.isNew && S.patient.id) {
        var d = await OR.db.from('surgery_cases').select('case_number,operation_name,case_status').eq('patient_id', S.patient.id).eq('surgery_date', payload.surgery_date);
        if (d.error) throw d.error;
        if (d.data.length) {
          var msg = 'ผู้ป่วยรายนี้มี Case ในวันที่ ' + OR.fmtDate(payload.surgery_date) + ' อยู่แล้ว ' + d.data.length + ' รายการ:\n' +
            d.data.map(function (x) { return '• ' + x.case_number + ' — ' + (x.operation_name || '-') + ' (' + OR.lab(OR.L.status, x.case_status) + ')'; }).join('\n') +
            '\n\nตรวจสอบว่าไม่ใช่รายการซ้ำ แล้วต้องการบันทึกเป็น Case ใหม่หรือไม่?';
          if (!(await OR.confirm(msg, { title: 'ตรวจสอบรายการซ้ำ', okText: 'บันทึกเป็น Case ใหม่', cancelText: 'กลับไปตรวจสอบ' }))) { saving = false; unlock(); return; }
        }
      }
      OR.busy(btn, true, 'กำลังบันทึก...');
      var pid = S.patient.id;
      if (S.isNew) {
        var pr = await OR.db.from('patients').insert({ hn: S.patient.hn, patient_name: S.patient.patient_name, birth_date: S.patient.birth_date, gender: S.patient.gender }).select('id,hn,patient_name,birth_date,gender,is_active').single();
        if (pr.error && pr.error.code === '23505') {               // มีคนเพิ่ง HN นี้ไปก่อน → ใช้ผู้ป่วยเดิม ไม่สร้างซ้ำ
          var ex = await OR.db.from('patients').select('id,hn,patient_name,birth_date,gender,is_active').eq('hn', S.patient.hn).single();
          if (ex.error) throw ex.error; pr = ex; OR.toast('HN นี้เพิ่งถูกลงทะเบียนโดยผู้อื่น ใช้ข้อมูลผู้ป่วยเดิมแทน', '');
        }
        if (pr.error) throw pr.error;
        S.patient = pr.data; S.isNew = false; pid = pr.data.id;
      }
      payload.patient_id = pid;
      var cr = await OR.db.from('surgery_cases').insert(payload).select('id,case_number').single();
      if (cr.error) {
        showErr(['บันทึกข้อมูลผู้ป่วยแล้ว แต่บันทึก Case ไม่สำเร็จ: ' + OR.errMsg(cr.error), 'ข้อมูลที่กรอกยังอยู่ครบ แก้ไขแล้วกดบันทึกอีกครั้งได้ (จะไม่สร้างผู้ป่วยซ้ำ)']);
        OR.toast('บันทึก Case ไม่สำเร็จ', 'err'); saving = false; OR.busy(btn, false); unlock(); return;
      }
      OR.toast('บันทึกสำเร็จ เลข Case ' + cr.data.case_number, 'ok');
      if (andNew) { reset(); return; }
      done(cr.data);
    } catch (err) {
      showErr(['บันทึกไม่สำเร็จ: ' + OR.errMsg(err)]); OR.toast('บันทึกไม่สำเร็จ', 'err');
      saving = false; OR.busy(btn, false); unlock();
    }
  }
  function unlock() { ['bSave', 'bSaveNew', 'bBack'].forEach(function (id) { var b = $('#' + id); if (b) b.disabled = false; }); }

  function done(c) {
    main.innerHTML = '<div class="card" style="max-width:560px;margin:30px auto;text-align:center"><div style="font-size:3rem;color:var(--mint)">✓</div><h1>บันทึกสำเร็จ</h1>' +
      '<p style="font-size:1.1rem">เลข Case <b>' + esc(c.case_number) + '</b></p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">' +
      '<button class="btn ok" id="again" type="button">ลงทะเบียน Case ใหม่</button><a class="btn" href="registry.html">ดูทะเบียน</a></div></div>';
    $('#again').onclick = reset;
  }

  // เพิ่ม Case ให้ผู้ป่วยเดิมจากหน้าประวัติผู้ป่วย (?patient=<id>)
  reset();
  var pid = new URLSearchParams(location.search).get('patient');
  if (pid && /^[0-9a-f-]{36}$/i.test(pid)) {
    var r = await OR.db.from('patients').select('id,hn,patient_name,birth_date,gender,is_active').eq('id', pid).maybeSingle();
    if (r.data) {
      var c = await OR.db.from('surgery_cases').select('id', { count: 'exact', head: true }).eq('patient_id', pid).neq('case_status', 'CANCELLED');
      S.patient = r.data; S.isNew = false; S.searched = true; S.count = c.count; render();
    }
  }
})();
