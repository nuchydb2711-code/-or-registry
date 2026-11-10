// ประวัติผู้ป่วย: ข้อมูลผู้ป่วย จำนวนครั้งที่ผ่าตัด รายการ Case ทั้งหมด
// URL ใช้รหัสภายใน (UUID) เท่านั้น ไม่มี HN หรือชื่อผู้ป่วยใน URL
(async function () {
  var ctx = await OR.init('registry.html', ['ADMIN', 'STAFF', 'VIEWER']);
  if (!ctx) return;
  var $ = OR.$, esc = OR.esc, main = document.getElementById('main');
  var id = new URLSearchParams(location.search).get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { OR.fatal('ไม่พบรหัสผู้ป่วย กรุณาเปิดจากหน้าทะเบียน'); return; }

  async function load() {
    main.innerHTML = '<div class="loading"><span class="spin"></span> กำลังโหลด...</div>';
    try {
      var p = await OR.db.from('patients').select('*').eq('id', id).maybeSingle();
      if (p.error) throw p.error;
      if (!p.data) { OR.fatal('ไม่พบผู้ป่วย หรือคุณไม่มีสิทธิ์ดูข้อมูลนี้'); return; }
      var c = await OR.db.from('v_surgery_cases').select('id,case_number,surgery_date,department_name,operation_name,diagnosis,case_type,case_status,urgency,surgeon_name,room_number').eq('patient_id', id).order('surgery_date', { ascending: false }).order('case_number', { ascending: false });
      if (c.error) throw c.error;
      draw(p.data, c.data);
    } catch (e) { OR.fatal('โหลดข้อมูลไม่สำเร็จ: ' + OR.errMsg(e)); }
  }

  function draw(p, cases) {
    var done = cases.filter(function (x) { return x.case_status === 'COMPLETED'; }).length;
    var valid = cases.filter(function (x) { return x.case_status !== 'CANCELLED'; }).length;
    main.innerHTML =
      '<div class="pagehead"><div><h1>' + esc(p.patient_name) + ' ' + (p.is_active ? '' : OR.badge('off', 'ปิดใช้งาน')) + '</h1><p>HN ' + esc(p.hn) + '</p></div><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (ctx.canEdit && p.is_active ? '<a class="btn ok" href="new-case.html?patient=' + esc(p.id) + '">+ เพิ่ม Case ใหม่</a>' : '') +
      (ctx.canEdit ? '<button class="btn" id="bEdit" type="button">แก้ไขข้อมูลผู้ป่วย</button>' : '') +
      (ctx.isAdmin ? '<button class="btn ' + (p.is_active ? 'danger' : '') + '" id="bToggle" type="button">' + (p.is_active ? 'ปิดใช้งานผู้ป่วย' : 'เปิดใช้งานผู้ป่วย') + '</button>' : '') + '</div></div>' +
      '<div class="kpis"><div class="kpi"><span>จำนวนครั้งที่เคยผ่าตัด</span><b>' + valid + '</b></div><div class="kpi g"><span>เสร็จสิ้น</span><b>' + done + '</b></div><div class="kpi"><span>Case ทั้งหมดในระบบ</span><b>' + cases.length + '</b></div></div>' +
      '<div class="card"><h2>ข้อมูลผู้ป่วย</h2><dl class="kv"><dt>ชื่อ-สกุล</dt><dd>' + esc(p.patient_name) + '</dd><dt>วันเกิด / อายุ</dt><dd>' + OR.fmtDate(p.birth_date) + ' · ' + OR.fmtAge(p.birth_date) + '</dd><dt>เพศ</dt><dd>' + esc(OR.lab(OR.L.gender, p.gender)) + '</dd><dt>ลงทะเบียนเมื่อ</dt><dd>' + OR.fmtDateTime(p.created_at) + '</dd></dl></div>' +
      '<div class="card"><h2>ประวัติการผ่าตัด</h2>' + (cases.length ? '<div class="tablewrap"><table><thead><tr><th>วันที่</th><th>เลข Case</th><th>แผนก</th><th>Diagnosis</th><th>Operation</th><th>ศัลยแพทย์</th><th>ห้อง</th><th>ประเภท</th><th>สถานะ</th></tr></thead><tbody>' +
        cases.map(function (x) { return '<tr><td>' + OR.fmtDate(x.surgery_date) + '</td><td>' + esc(x.case_number) + '</td><td>' + OR.dash(x.department_name) + '</td><td>' + OR.dash(x.diagnosis) + '</td><td>' + OR.dash(x.operation_name) + '</td><td>' + OR.dash(x.surgeon_name) + '</td><td>' + (x.room_number == null ? '-' : x.room_number) + '</td><td>' + OR.badge(x.case_type, OR.lab(OR.L.caseType, x.case_type)) + (x.urgency === 'EMERGENCY' ? ' ' + OR.badge('EMERGENCY', 'ฉุกเฉิน') : '') + '</td><td>' + OR.badge(x.case_status, OR.lab(OR.L.status, x.case_status)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มี Case</div>') + '</div>';
    if ($('#bEdit')) $('#bEdit').onclick = function () { editPatient(p); };
    if ($('#bToggle')) $('#bToggle').onclick = async function () {
      var to = !p.is_active;
      if (!(await OR.confirm(to ? 'เปิดใช้งานผู้ป่วยรายนี้อีกครั้ง?' : 'ปิดใช้งานผู้ป่วยรายนี้? (ข้อมูลและประวัติ Case ยังอยู่ครบ ไม่ได้ลบ)', { danger: !to }))) return;
      var r = await OR.db.from('patients').update({ is_active: to }).eq('id', p.id).select('id');
      if (r.error || !r.data.length) { OR.toast(r.error ? OR.errMsg(r.error) : 'ไม่สามารถบันทึกได้', 'err'); return; }
      OR.toast('บันทึกแล้ว', 'ok'); load();
    };
  }

  function editPatient(p) {
    var saving = false;
    var m = OR.modal({
      title: 'แก้ไขข้อมูลผู้ป่วย', size: 'sm',
      body: '<div id="perr"></div><div class="grid" style="grid-template-columns:1fr"><div><label>HN (แก้ไม่ได้)</label><input type="text" readonly value="' + esc(p.hn) + '"></div>' +
        '<div><label for="en">ชื่อ-สกุล <span class="req">*</span></label><input id="en" type="text" maxlength="200" value="' + esc(p.patient_name) + '"></div>' +
        '<div><label for="eb">วันเกิด</label><input id="eb" type="date" max="' + OR.today() + '" value="' + esc(p.birth_date || '') + '"></div>' +
        '<div><label for="eg">เพศ</label><select id="eg">' + OR.enumOptions(OR.L.gender, '— เลือก —', p.gender) + '</select></div></div>',
      buttons: [{ text: 'ยกเลิก' }, {
        text: 'บันทึก', cls: 'ok', onClick: async function (api, btn) {
          if (saving) return;
          var name = $('#en').value.trim(); if (!name) { $('#perr').innerHTML = '<div class="alert err">กรุณากรอกชื่อ-สกุล</div>'; return; }
          saving = true; OR.busy(btn, true);
          try {
            var r = await OR.db.from('patients').update({ patient_name: name, birth_date: $('#eb').value || null, gender: $('#eg').value || null }).eq('id', p.id).eq('updated_at', p.updated_at).select('id');
            if (r.error) throw r.error;
            if (!r.data.length) throw new Error('ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว หรือไม่มีสิทธิ์ กรุณาโหลดหน้าใหม่');
            OR.toast('บันทึกสำเร็จ', 'ok'); m.close(); load();
          } catch (e) { $('#perr').innerHTML = '<div class="alert err">' + esc(OR.errMsg(e)) + '</div>'; saving = false; OR.busy(btn, false); }
        }
      }]
    });
  }
  load();
})();
