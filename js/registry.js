// ทะเบียน Case ทั้งหมด: ค้นหา กรอง ดูรายละเอียด แก้ไข ยกเลิก (ไม่มีการลบถาวร)
(async function () {
  var ctx = await OR.init('registry.html', ['ADMIN', 'STAFF', 'VIEWER']);
  if (!ctx) return;
  var $ = OR.$, esc = OR.esc, PAGE = 25;
  var lookups;
  try { lookups = await OR.loadLookups(true); } catch (e) { OR.fatal('โหลดข้อมูลหลักไม่สำเร็จ: ' + OR.errMsg(e)); return; }

  var st = { page: 0, total: 0, rows: [], seq: 0 };

  document.getElementById('main').innerHTML =
    '<div class="pagehead"><div><h1>ทะเบียน Case</h1><p>คลิกแถวเพื่อดูรายละเอียด</p></div>' + (ctx.canEdit ? '<a class="btn ok" href="new-case.html">+ ลงทะเบียน Case ใหม่</a>' : '') + '</div>' +
    '<div class="card"><div class="toolbar">' +
    '<div class="grow"><label for="q">ค้นหา (HN / ชื่อ / เลข Case / Diagnosis / Operation)</label><input id="q" type="search" maxlength="80" autocomplete="off"></div>' +
    '<div><label for="fFrom">ตั้งแต่วันที่</label><input id="fFrom" type="date"></div><div><label for="fTo">ถึงวันที่</label><input id="fTo" type="date"></div>' +
    '<div><label for="fType">ประเภท</label><select id="fType">' + OR.enumOptions(OR.L.caseType, 'ทั้งหมด') + '</select></div>' +
    '<div><label for="fStatus">สถานะ</label><select id="fStatus">' + OR.enumOptions(OR.L.status, 'ทั้งหมด') + '</select></div>' +
    '<div><label for="fUrg">ความเร่งด่วน</label><select id="fUrg">' + OR.enumOptions(OR.L.urgency, 'ทั้งหมด') + '</select></div>' +
    '<div><label for="fDept">แผนก</label><select id="fDept">' + OR.options(lookups.departments, function (d) { return d.id; }, function (d) { return d.department_name; }, 'ทั้งหมด') + '</select></div>' +
    '<div><label for="fRoom">ห้องผ่าตัด</label><select id="fRoom">' + OR.options(lookups.rooms, function (r) { return r.id; }, function (r) { return r.room_name; }, 'ทั้งหมด') + '</select></div>' +
    '<div class="actions"><button class="btn" id="bClear" type="button">ล้างตัวกรอง</button></div></div>' +
    '<div id="list"></div><div class="pager" id="pager"></div></div>';

  var ids = ['q', 'fFrom', 'fTo', 'fType', 'fStatus', 'fUrg', 'fDept', 'fRoom'];
  var reload = function () { st.page = 0; load(); };
  ids.forEach(function (id) { $('#' + id).addEventListener(id === 'q' ? 'input' : 'change', id === 'q' ? OR.debounce(reload, 350) : reload); });
  $('#bClear').onclick = function () { ids.forEach(function (id) { $('#' + id).value = ''; }); reload(); };

  async function load() {
    var mySeq = ++st.seq, list = $('#list');
    list.innerHTML = '<div class="loading"><span class="spin"></span> กำลังโหลด...</div>';
    try {
      var q = OR.db.from('v_surgery_cases').select('*', { count: 'exact' });
      var v = function (id) { return $('#' + id).value; };
      if (v('fFrom')) q = q.gte('surgery_date', v('fFrom'));
      if (v('fTo')) q = q.lte('surgery_date', v('fTo'));
      if (v('fType')) q = q.eq('case_type', v('fType'));
      if (v('fStatus')) q = q.eq('case_status', v('fStatus'));
      if (v('fUrg')) q = q.eq('urgency', v('fUrg'));
      if (v('fDept')) q = q.eq('department_id', v('fDept'));
      if (v('fRoom')) q = q.eq('room_id', v('fRoom'));
      var s = OR.cleanSearch(v('q'));
      if (s) { var p = '%' + s + '%'; q = q.or('hn.ilike.' + p + ',patient_name.ilike.' + p + ',case_number.ilike.' + p + ',diagnosis.ilike.' + p + ',operation_name.ilike.' + p); }
      var r = await q.order('surgery_date', { ascending: false }).order('case_number', { ascending: false }).range(st.page * PAGE, st.page * PAGE + PAGE - 1);
      if (mySeq !== st.seq) return;               // มีการค้นหาใหม่กว่า ทิ้งผลเก่า
      if (r.error) throw r.error;
      st.rows = r.data; st.total = r.count || 0; draw();
    } catch (e) {
      if (mySeq === st.seq) list.innerHTML = '<div class="alert err">โหลดข้อมูลไม่สำเร็จ: ' + esc(OR.errMsg(e)) + ' <button class="btn sm" id="retry" type="button">ลองใหม่</button></div>';
      var b = $('#retry'); if (b) b.onclick = load;
    }
  }

  function draw() {
    var list = $('#list');
    if (!st.rows.length) { list.innerHTML = '<div class="empty">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>'; $('#pager').innerHTML = ''; return; }
    list.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Case Number</th><th>วันที่ผ่าตัด</th><th>HN</th><th>ชื่อผู้ป่วย</th><th>อายุ</th><th>ประเภท</th><th>แผนก</th><th>Diagnosis</th><th>Operation</th><th>ศัลยแพทย์</th><th>วิสัญญี</th><th>ห้อง</th><th>ยาระงับ</th><th>สถานะ</th></tr></thead><tbody>' +
      st.rows.map(function (x, i) {
        return '<tr class="click" data-i="' + i + '" tabindex="0"><td>' + esc(x.case_number) + '</td><td>' + OR.fmtDate(x.surgery_date) + '</td><td>' + esc(x.hn) + '</td>' +
          '<td><a href="patient.html?id=' + esc(x.patient_id) + '" class="plink">' + esc(x.patient_name) + '</a></td><td>' + (x.age_years == null ? '-' : x.age_years) + '</td>' +
          '<td>' + OR.badge(x.case_type, OR.lab(OR.L.caseType, x.case_type)) + (x.urgency === 'EMERGENCY' ? ' ' + OR.badge('EMERGENCY', 'ฉุกเฉิน') : '') + '</td>' +
          '<td>' + OR.dash(x.department_name) + '</td><td>' + OR.dash(x.diagnosis) + '</td><td>' + OR.dash(x.operation_name) + '</td><td>' + OR.dash(x.surgeon_name) + '</td><td>' + OR.dash(x.anesthesiologist_name) + '</td>' +
          '<td>' + (x.room_number == null ? '-' : x.room_number) + '</td><td>' + OR.dash(x.anesthesia_code) + '</td><td>' + OR.badge(x.case_status, OR.lab(OR.L.status, x.case_status)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    OR.$$('tbody tr', list).forEach(function (tr) {
      var open = function () { showDetail(st.rows[+tr.dataset.i]); };
      tr.onclick = function (e) { if (e.target.closest('a')) return; open(); };
      tr.onkeydown = function (e) { if (e.key === 'Enter') open(); };
    });
    var pages = Math.ceil(st.total / PAGE), from = st.page * PAGE + 1, to = Math.min(st.total, from + PAGE - 1);
    $('#pager').innerHTML = '<span>แสดง ' + from + '–' + to + ' จาก ' + st.total.toLocaleString('th-TH') + ' Case</span><span style="display:flex;gap:8px;align-items:center"><button class="btn sm" id="pPrev" type="button"' + (st.page === 0 ? ' disabled' : '') + '>← ก่อนหน้า</button> หน้า ' + (st.page + 1) + ' / ' + pages + ' <button class="btn sm" id="pNext" type="button"' + (st.page + 1 >= pages ? ' disabled' : '') + '>ถัดไป →</button></span>';
    $('#pPrev').onclick = function () { st.page--; load(); window.scrollTo({ top: 0 }); };
    $('#pNext').onclick = function () { st.page++; load(); window.scrollTo({ top: 0 }); };
  }

  /* ---------------- รายละเอียด ---------------- */
  function detailHtml(x) {
    var t = OR.fmtTime;
    var kv = function (k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; };
    return '<dl class="kv">' +
      kv('เลข Case', '<b>' + esc(x.case_number) + '</b> ' + OR.badge(x.case_status, OR.lab(OR.L.status, x.case_status))) +
      (x.case_status === 'CANCELLED' ? kv('เหตุผลที่ยกเลิก', OR.dash(x.cancel_reason)) : '') +
      kv('ผู้ป่วย', '<a href="patient.html?id=' + esc(x.patient_id) + '">' + esc(x.patient_name) + '</a> · HN ' + esc(x.hn)) +
      kv('อายุ / เพศ', OR.fmtAge(x.birth_date, x.surgery_date) + ' · ' + esc(OR.lab(OR.L.gender, x.gender))) +
      kv('วันที่ผ่าตัด', OR.fmtDate(x.surgery_date) + ' · ' + OR.badge(x.case_type, OR.lab(OR.L.caseType, x.case_type)) + ' ' + OR.badge(x.urgency, OR.lab(OR.L.urgency, x.urgency)) + (x.from_er ? ' ' + OR.badge('EMERGENCY', 'รับจาก ER') : '')) +
      kv('แผนก', OR.dash(x.department_name)) +
      kv('Diagnosis', OR.dash(x.diagnosis)) + kv('Operation', OR.dash(x.operation_name)) +
      kv('Code operation', x.op_code ? esc(x.op_code + ' — ' + x.op_code_name) : '-') + kv('ICD-9', OR.dash(x.icd9_code)) +
      kv('Site / Fracture', OR.dash(x.site ? OR.L.site[x.site] : '') + ' / ' + OR.dash(x.fracture_type ? OR.L.fracture[x.fracture_type] : '')) +
      kv('ศัลยแพทย์', OR.dash(x.surgeon_name)) + kv('วิสัญญี', OR.dash(x.anesthesiologist_name)) +
      kv('ห้องผ่าตัด', OR.dash(x.room_name)) + kv('ระงับความรู้สึก', x.anesthesia_name ? esc(x.anesthesia_name) : '-') +
      kv('เวลา', 'ถึง OR ' + t(x.or_entry_time) + ' · เริ่ม ' + t(x.surgery_start_time) + ' · สิ้นสุด ' + t(x.surgery_end_time) + ' · ออก OR ' + t(x.or_exit_time) + (x.admission_time ? ' · รับจาก ER ' + t(x.admission_time) : '')) +
      kv('Class แผล / เวลา', OR.dash(x.wound_class ? OR.L.wound[x.wound_class] : '') + ' / ' + OR.dash(x.work_period ? OR.L.period[x.work_period] : '')) +
      kv('Ward / Team', OR.dash(x.ward) + ' / ' + OR.dash(x.team)) +
      kv('ความเสี่ยง', x.has_risk ? 'มีความเสี่ยง: ' + esc((x.risk_types || []).map(function (k) { return OR.L.risk[k] || k; }).join(', ') || '-') + (x.risk_detail ? '<br>' + esc(x.risk_detail) : '') : 'ไม่มีความเสี่ยง') +
      kv('ผลการผ่าตัด', OR.dash(x.result)) + kv('หมายเหตุ', OR.dash(x.notes)) +
      kv('ODS/MIS · ตรวจเวชภัณฑ์', (x.ods_mis ? 'ใช่' : 'ไม่') + ' · ' + (x.supplies_checked == null ? '-' : x.supplies_checked ? 'ครบ' : 'ไม่ครบ')) +
      kv('บันทึกเมื่อ', OR.fmtDateTime(x.created_at) + ' · แก้ไขล่าสุด ' + OR.fmtDateTime(x.updated_at)) + '</dl>' +
      (ctx.isAdmin ? '<h3 style="margin:18px 0 8px">ประวัติการเปลี่ยนแปลง (Audit)</h3><div id="audit" class="note">กำลังโหลด...</div>' : '');
  }

  async function loadAudit(id) {
    var box = $('#audit'); if (!box) return;
    try {
      var r = await OR.db.from('audit_logs').select('action,created_at,user_id,old_data,new_data').eq('table_name', 'surgery_cases').eq('record_id', id).order('created_at', { ascending: false }).limit(50);
      if (r.error) throw r.error;
      var us = {}, uids = r.data.map(function (a) { return a.user_id; }).filter(function (u, i, a) { return u && a.indexOf(u) === i; });
      if (uids.length) { var p = await OR.db.from('profiles').select('id,full_name,email').in('id', uids); (p.data || []).forEach(function (u) { us[u.id] = u.full_name || u.email; }); }
      box.innerHTML = r.data.length ? '<div class="tablewrap"><table><thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th><th>สิ่งที่เปลี่ยน</th></tr></thead><tbody>' +
        r.data.map(function (a) { return '<tr><td>' + OR.fmtDateTime(a.created_at) + '</td><td>' + OR.dash(us[a.user_id]) + '</td><td>' + esc(a.action) + '</td><td>' + esc(OR.auditChanges(a).join(', ')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : 'ไม่มีประวัติ';
    } catch (e) { box.textContent = 'โหลดประวัติไม่สำเร็จ: ' + OR.errMsg(e); }
  }

  function showDetail(x) {
    var btns = [{ text: 'ปิด' }];
    if (ctx.canEdit) btns.unshift({ text: 'แก้ไข', cls: 'pri', onClick: function (m) { m.close(); edit(x); } });
    if (ctx.isAdmin && x.case_status !== 'CANCELLED') btns.unshift({ text: 'ยกเลิก Case', cls: 'danger', onClick: function (m) { m.close(); cancelCase(x); } });
    OR.modal({ title: 'รายละเอียด Case', body: detailHtml(x), buttons: btns, noFocus: true });
    loadAudit(x.id);
  }

  /* ---------------- แก้ไข ---------------- */
  function edit(x) {
    var form = OR.caseForm.create(lookups, ctx, x), saving = false;
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div id="eerr"></div><p class="note" style="margin-top:0">ผู้ป่วย: <b>' + esc(x.patient_name) + '</b> · HN ' + esc(x.hn) + ' (แก้ข้อมูลผู้ป่วยได้ที่หน้าประวัติผู้ป่วย)</p>';
    wrap.appendChild(form.s2);
    var h = document.createElement('div'); h.className = 'sect'; h.style.margin = '18px 0 10px'; h.textContent = 'ข้อมูลห้องผ่าตัด'; wrap.appendChild(h);
    wrap.appendChild(form.s3);
    var m = OR.modal({
      title: 'แก้ไข Case ' + x.case_number, body: wrap, noFocus: true,
      buttons: [{ text: 'ยกเลิก' }, {
        text: 'บันทึกการแก้ไข', cls: 'ok', id: 'sv', onClick: async function (api, btn) {
          if (saving) return;
          var errs = form.validate(), box = wrap.querySelector('#eerr');
          if (errs.length) { box.innerHTML = '<div class="alert err" role="alert"><ul style="margin:0;padding-left:20px">' + errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>'; box.scrollIntoView({ block: 'nearest' }); return; }
          saving = true; OR.busy(btn, true); box.innerHTML = '';
          try {
            // ป้องกันเขียนทับกัน: ยอมให้แก้เฉพาะเมื่อข้อมูลยังไม่ถูกคนอื่นแก้หลังจากที่เปิดหน้านี้
            var r = await OR.db.from('surgery_cases').update(form.get()).eq('id', x.id).eq('updated_at', x.updated_at).select('id');
            if (r.error) throw r.error;
            if (!r.data || !r.data.length) throw new Error('ไม่สามารถบันทึกได้: ข้อมูลนี้ถูกแก้ไขโดยผู้อื่นแล้ว หรือคุณไม่มีสิทธิ์ กรุณาปิดหน้าต่างนี้แล้วเปิดใหม่');
            OR.toast('บันทึกการแก้ไขสำเร็จ', 'ok'); m.close(); load();
          } catch (e) { box.innerHTML = '<div class="alert err" role="alert">' + esc(OR.errMsg(e)) + '</div>'; OR.toast('บันทึกไม่สำเร็จ', 'err'); saving = false; OR.busy(btn, false); }
        }
      }]
    });
  }

  /* ---------------- ยกเลิก (ADMIN) ---------------- */
  function cancelCase(x) {
    var saving = false;
    var m = OR.modal({
      title: 'ยกเลิก Case ' + x.case_number, size: 'sm',
      body: '<div id="cerr"></div><p>การยกเลิกจะไม่ลบข้อมูล Case และเก็บประวัติไว้ครบ Case ที่ยกเลิกจะไม่ถูกนับเป็นผ่าตัดสำเร็จ</p><label for="creason">เหตุผลการยกเลิก <span class="req">*</span></label><input id="creason" type="text" maxlength="300">',
      buttons: [{ text: 'ปิด' }, {
        text: 'ยืนยันยกเลิก Case', cls: 'danger', onClick: async function (api, btn) {
          if (saving) return;
          var reason = $('#creason').value.trim();
          if (!reason) { $('#cerr').innerHTML = '<div class="alert err">กรุณาระบุเหตุผล</div>'; return; }
          saving = true; OR.busy(btn, true, 'กำลังบันทึก...');
          try {
            var r = await OR.db.from('surgery_cases').update({ case_status: 'CANCELLED', cancel_reason: reason }).eq('id', x.id).eq('updated_at', x.updated_at).select('id');
            if (r.error) throw r.error;
            if (!r.data.length) throw new Error('ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว กรุณาเปิดรายการใหม่');
            OR.toast('ยกเลิก Case แล้ว', 'ok'); m.close(); load();
          } catch (e) { $('#cerr').innerHTML = '<div class="alert err">' + esc(OR.errMsg(e)) + '</div>'; saving = false; OR.busy(btn, false); }
        }
      }]
    });
  }

  // ตั้งค่าเริ่มต้น: เดือนปัจจุบัน
  $('#fFrom').value = OR.firstOfMonth();
  load();
})();
