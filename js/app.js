// ฟังก์ชันกลางที่ใช้ทุกหน้า: ป้ายชื่อภาษาไทย, วันที่, ข้อความ error, modal, toast, โหลดข้อมูลหลัก
(function () {
  // กันถูกฝังในเฟรมของเว็บอื่น (GitHub Pages ตั้ง header กัน clickjacking เองไม่ได้)
  if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location; } catch (e) { /* ถูกบล็อก: ซ่อนหน้าไว้ */ } }
  window.OR = window.OR || {};

  /* ---------- ป้ายชื่อ ---------- */
  OR.L = {
    caseType: { MAJOR: 'Major', MINOR: 'Minor', LA: 'LA' },
    status: { COMPLETED: 'เสร็จสิ้น', IN_PROGRESS: 'กำลังดำเนินการ', CANCELLED: 'ยกเลิก', POSTPONED: 'เลื่อน' },
    urgency: { ELECTIVE: 'Elective', EMERGENCY: 'Emergency' },
    gender: { MALE: 'ชาย', FEMALE: 'หญิง', OTHER: 'อื่น ๆ' },
    site: { RIGHT: 'Right (ขวา)', LEFT: 'Left (ซ้าย)', BOTH: 'Both (สองข้าง)' },
    fracture: { CLOSED: 'Closed Fx', OPEN_G1: 'Open Fx Gr.1', OPEN_G2: 'Open Fx Gr.2', OPEN_G3: 'Open Fx Gr.3' },
    wound: { CLEAN: 'Clean (ประเภท 1)', CLEAN_CONTAMINATED: 'Clean contaminated (ประเภท 2)', CONTAMINATED: 'Contaminated (ประเภท 3)', DIRTY: 'Dirty (ประเภท 4)' },
    period: { IN_HOURS: 'ในเวลา', OUT_HOURS: 'นอกเวลา' },
    risk: {
      EQUIPMENT: 'เครื่องมือ/Set/ผ้า/วัสดุการแพทย์',
      DOCUMENT: 'เอกสาร/ใบประเมิน/ใบเซ็นยินยอม/LAN',
      COMPLICATION: 'ภาวะแทรกซ้อน/เหตุการณ์ทางคลินิก',
      PATIENT_ID_SITE: 'การระบุตัวผู้ป่วย/ข้างผ่าตัด',
      POSTPONE_CANCEL: 'เลื่อน/ยกเลิก Case ผ่าตัด'
    },
    role: { ADMIN: 'ผู้ดูแลระบบ', STAFF: 'เจ้าหน้าที่', VIEWER: 'ผู้ดู' },
    docType: { SURGEON: 'ศัลยแพทย์', ANESTHESIOLOGIST: 'วิสัญญีแพทย์' },
    teamRole: { SURGICAL_ASSISTANT: 'Surgical Assistant', SCRUB_NURSE: 'Scrub Nurse', CIRCULATING_NURSE: 'Circulating Nurse', NA: 'NA', ANESTHESIOLOGIST: 'Anesthesiologist', ANESTHESIA_NURSE: 'Anesthesia Nurse', OTHER: 'Other / Legacy' },
    anGroup: { GA: 'GA (GA+TIVA+IVS)', RA: 'RA (BB+SB)', LA: 'LA (LA+MAC)', OTHER: 'อื่น ๆ' }
  };
  OR.lab = function (map, k) { return (k && map[k]) || (k ? k : '-'); };

  /* ---------- ข้อความ / HTML ---------- */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  OR.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  OR.dash = function (s) { return (s == null || s === '') ? '-' : OR.esc(s); };
  OR.badge = function (cls, text) { return '<span class="badge b-' + OR.esc(cls) + '">' + OR.esc(text) + '</span>'; };
  OR.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };
  OR.$ = function (sel, root) { return (root || document).querySelector(sel); };
  OR.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- วันที่ (แสดงเป็น พ.ศ.) ---------- */
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  OR.pad = pad;
  OR.isoDate = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  OR.today = function () { return OR.isoDate(new Date()); };
  OR.fmtDate = function (iso) {
    if (!iso) return '-';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + (+p[0] + 543) : iso;
  };
  OR.fmtTime = function (iso) {
    if (!iso) return '-';
    var d = new Date(iso); return isNaN(d) ? '-' : pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  OR.fmtDateTime = function (iso) {
    if (!iso) return '-';
    var d = new Date(iso); return isNaN(d) ? '-' : OR.fmtDate(OR.isoDate(d)) + ' ' + OR.fmtTime(iso);
  };
  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  OR.fmtMonth = function (ym) { var p = ym.split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[0] + 543); };
  OR.toLocalInput = function (iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  OR.fromLocalInput = function (v) { if (!v) return null; var d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
  OR.age = function (birth, on) {
    if (!birth) return null;
    var b = new Date(birth + 'T00:00:00'), d = on ? new Date(on + 'T00:00:00') : new Date();
    var y = d.getFullYear() - b.getFullYear();
    if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) y--;
    return y < 0 ? null : y;
  };
  OR.fmtAge = function (birth, on) {
    if (!birth) return '-';
    var a = OR.age(birth, on); if (a == null) return '-';
    if (a >= 1) return a + ' ปี';
    var b = new Date(birth + 'T00:00:00'), d = on ? new Date(on + 'T00:00:00') : new Date();
    var m = (d.getFullYear() - b.getFullYear()) * 12 + d.getMonth() - b.getMonth() - (d.getDate() < b.getDate() ? 1 : 0);
    return Math.max(m, 0) + ' เดือน';
  };
  // ---- อายุที่พิมพ์เองได้ (ใช้เมื่อไม่ทราบวันเกิด) ----
  // แปลงอายุ (ปี/เดือน) เป็นวันเกิดโดยประมาณ ให้ได้อายุตรงกับวันที่อ้างอิง (เช่น วันผ่าตัด)
  OR.birthFromAge = function (n, unit, on) {
    var d = new Date((on || OR.today()) + 'T00:00:00'), y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    if (unit === 'm') m -= n; else y -= n;
    var last = new Date(y, m + 1, 0).getDate(), b = new Date(y, m, Math.min(day, last)), iso = OR.isoDate(b);
    return iso > OR.today() ? OR.today() : iso;
  };
  OR.ageFieldHtml = function (id) {
    return '<div><label for="' + id + '">อายุ <span class="note">(พิมพ์เองได้ถ้าไม่ทราบวันเกิด)</span></label>' +
      '<div style="display:flex;gap:6px"><input id="' + id + '" type="number" min="0" max="120" step="1" inputmode="numeric" placeholder="เช่น 65" style="flex:1;min-width:0">' +
      '<select id="' + id + 'u" aria-label="หน่วยอายุ" style="width:auto"><option value="y">ปี</option><option value="m">เดือน</option></select></div>' +
      '<div class="note" id="' + id + 'n" style="margin-top:4px"></div></div>';
  };
  // ผูกช่องอายุกับช่องวันเกิด: มีวันเกิด → คำนวณให้และล็อกช่องอายุ · ไม่มีวันเกิด → พิมพ์อายุเองได้
  OR.wireAge = function (id, birthId) {
    var a = OR.$('#' + id), u = OR.$('#' + id + 'u'), n = OR.$('#' + id + 'n'), b = OR.$(birthId);
    function sync() {
      if (b.value) {
        var t = OR.fmtAge(b.value), v = parseInt(t, 10);
        if (!isNaN(v)) { a.value = v; u.value = t.indexOf('เดือน') >= 0 ? 'm' : 'y'; }
        a.disabled = u.disabled = true; n.textContent = 'คำนวณจากวันเกิดอัตโนมัติ (ลบวันเกิดออกถ้าต้องการพิมพ์อายุเอง)';
      } else { a.disabled = u.disabled = false; n.textContent = a.value === '' ? '' : 'ไม่มีวันเกิด: ระบบจะเก็บวันเกิดโดยประมาณจากอายุนี้'; }
    }
    b.addEventListener('input', sync); a.addEventListener('input', sync); sync();
  };
  // อ่านค่าอายุที่พิมพ์ → { n, unit } | null (ว่าง) | { error }
  OR.readAge = function (id) {
    var a = OR.$('#' + id), u = OR.$('#' + id + 'u');
    if (a.disabled || a.value.trim() === '') return null;
    var n = Number(a.value);
    if (!/^\d{1,3}$/.test(a.value.trim()) || n > 120) return { error: 'อายุต้องเป็นจำนวนเต็ม 0–120' };
    return { n: n, unit: u.value };
  };
  OR.firstOfMonth = function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01'; };

  /* ---------- ข้อผิดพลาด ---------- */
  var CHK = {
    surgery_cases_time_entry_start_chk: 'เวลาเริ่มผ่าตัดต้องไม่ก่อนเวลาคนไข้ถึง OR',
    surgery_cases_time_start_end_chk: 'เวลาสิ้นสุดผ่าตัดต้องไม่ก่อนเวลาเริ่มผ่าตัด',
    surgery_cases_time_end_exit_chk: 'เวลาออกจาก OR ต้องไม่ก่อนเวลาสิ้นสุดผ่าตัด',
    surgery_cases_time_entry_exit_chk: 'เวลาออกจาก OR ต้องไม่ก่อนเวลาเข้า OR',
    surgery_cases_time_adm_entry_chk: 'เวลาเข้า OR ต้องไม่ก่อนเวลารับผู้ป่วย',
    surgery_cases_cancel_reason_chk: 'การยกเลิก Case ต้องระบุเหตุผล',
    patients_birth_chk: 'วันเกิดต้องไม่เป็นวันในอนาคต'
  };
  OR.errMsg = function (e) {
    if (!e) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
    var m = e.message || String(e), c = e.code, d = (e.details || '') + ' ' + m;
    if (c === '23505') return /patients_hn/.test(d) ? 'HN นี้มีอยู่ในระบบแล้ว' : /case_number/.test(d) ? 'เลข Case ซ้ำ ลองบันทึกอีกครั้ง' : 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
    if (c === '23514') { for (var k in CHK) if (d.indexOf(k) >= 0) return CHK[k]; return 'ข้อมูลไม่ผ่านการตรวจสอบของระบบ: ' + m; }
    if (c === '23503') return 'ข้อมูลอ้างอิงไม่ถูกต้องหรือยังถูกใช้งานอยู่';
    if (c === '42501' || /row-level security|permission denied/i.test(m)) return /ADMIN|เฉพาะ/.test(m) && c === '42501' ? m : 'คุณไม่มีสิทธิ์ทำรายการนี้';
    if (c === 'PGRST301' || /JWT/i.test(m)) return 'หมดเวลาเข้าสู่ระบบ กรุณา login ใหม่';
    if (/Invalid path specified/i.test(m)) return 'ค่า SUPABASE_URL ใน js/config.js ไม่ถูกต้อง ต้องเป็นรูปแบบ https://xxxxxxxx.supabase.co เท่านั้น (ไม่มี / หรือข้อความต่อท้าย)';
    if (/Invalid API key|No API key/i.test(m)) return 'ค่า SUPABASE_ANON_KEY ใน js/config.js ไม่ถูกต้อง ให้คัดลอก anon public key จาก Project Settings → API มาใหม่ทั้งหมด';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'เชื่อมต่ออินเทอร์เน็ตหรือเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่';
    return m;
  };

  /* ---------- Toast / Modal ---------- */
  OR.toast = function (msg, type, ms) {
    var box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg; box.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || (type === 'err' ? 7000 : 3500));
  };
  OR.busy = function (btn, on, text) {
    if (!btn) return;
    if (on) { btn.dataset.t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + OR.esc(text || 'กำลังบันทึก...'); }
    else { btn.disabled = false; if (btn.dataset.t != null) btn.innerHTML = btn.dataset.t; }
  };
  OR.modal = function (o) {
    var ov = document.createElement('div'); ov.className = 'overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="modal ' + (o.size || '') + '"><div class="modal-h"><h2>' + OR.esc(o.title || '') + '</h2><button class="x" type="button" aria-label="ปิด">×</button></div><div class="modal-b"></div>' + (o.buttons ? '<div class="modal-f"></div>' : '') + '</div>';
    var body = ov.querySelector('.modal-b');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    var api = { el: ov, body: body };
    api.close = function () { ov.remove(); document.removeEventListener('keydown', onkey); if (o.onClose) o.onClose(); };
    function onkey(e) { if (e.key === 'Escape' && ov === document.body.lastElementChild) api.close(); }
    document.addEventListener('keydown', onkey);
    ov.querySelector('.x').onclick = api.close;
    if (o.buttons) {
      var f = ov.querySelector('.modal-f'); api.btns = {};
      o.buttons.forEach(function (b) {
        var el = document.createElement('button'); el.type = 'button'; el.className = 'btn ' + (b.cls || ''); el.textContent = b.text;
        el.onclick = function () { b.onClick ? b.onClick(api, el) : api.close(); };
        f.appendChild(el); if (b.id) api.btns[b.id] = el;
      });
    }
    document.body.appendChild(ov);
    var first = ov.querySelector('input,select,textarea'); if (first && !o.noFocus) first.focus();
    return api;
  };
  OR.confirm = function (msg, o) {
    o = o || {};
    return new Promise(function (res) {
      var done = false, m = OR.modal({
        title: o.title || 'ยืนยัน', size: 'sm', body: '<p style="margin:0;white-space:pre-line">' + OR.esc(msg) + '</p>',
        onClose: function () { if (!done) { done = true; res(false); } },
        buttons: [
          { text: o.cancelText || 'ยกเลิก', onClick: function (a) { done = true; a.close(); res(false); } },
          { text: o.okText || 'ยืนยัน', cls: o.danger ? 'danger' : 'pri', onClick: function (a) { done = true; a.close(); res(true); } }
        ]
      });
    });
  };

  /* ---------- ดึงข้อมูลทีละหน้า (Supabase จำกัด 1000 แถว/คำขอ) ---------- */
  OR.fetchAll = async function (build) {
    var out = [], from = 0, size = 1000;
    for (;;) {
      var r = await build().range(from, from + size - 1);
      if (r.error) throw r.error;
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
      from += size;
      if (from > 200000) throw new Error('ข้อมูลมากเกินไป กรุณาลดช่วงวันที่');
    }
    return out;
  };
  // ตัดอักขระที่มีความหมายในตัวกรอง PostgREST ออกจากข้อความค้นหา (ป้องกัน filter injection)
  OR.cleanSearch = function (s) { return String(s || '').replace(/[,()%*\\"'`:;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); };

  /* ---------- ข้อมูลหลัก (เก็บในหน่วยความจำเท่านั้น) ---------- */
  OR.lookups = null;
  OR.loadLookups = async function (force) {
    if (OR.lookups && !force) return OR.lookups;
    var q = function (t, o) { return OR.db.from(t).select('*').order(o); };
    var r = await Promise.all([q('departments', 'department_name'), q('doctors', 'doctor_name'), q('or_rooms', 'room_number'), q('anesthesia_types', 'anesthesia_code'), OR.db.from('operation_codes').select('*').order('sort_order')]);
    for (var i = 0; i < r.length; i++) if (r[i].error) throw r[i].error;
    // รายชื่อทีมผ่าตัด: ถ้ายังไม่ได้รัน migration_phase3.sql ให้ใช้งานต่อได้ (พิมพ์ชื่อเองได้ แต่ยังไม่มีรายชื่อให้เลือก)
    var st = await OR.db.from('or_staff').select('*').order('staff_name');
    OR.lookups = { departments: r[0].data, doctors: r[1].data, rooms: r[2].data, anesthesia: r[3].data, opcodes: r[4].data, staff: st.error ? [] : st.data, staffMissing: !!st.error };
    return OR.lookups;
  };
  OR.options = function (list, val, lab, placeholder, selected) {
    var h = placeholder === false ? '' : '<option value="">' + OR.esc(placeholder || '— เลือก —') + '</option>';
    list.forEach(function (x) {
      var v = val(x); h += '<option value="' + OR.esc(v) + '"' + (selected != null && String(selected) === String(v) ? ' selected' : '') + '>' + OR.esc(lab(x)) + '</option>';
    });
    return h;
  };
  OR.enumOptions = function (map, placeholder, selected) {
    var h = placeholder === false ? '' : '<option value="">' + OR.esc(placeholder || '— เลือก —') + '</option>';
    Object.keys(map).forEach(function (k) { h += '<option value="' + k + '"' + (selected === k ? ' selected' : '') + '>' + OR.esc(map[k]) + '</option>'; });
    return h;
  };

  /* ---------- Audit: สรุปว่าฟิลด์ไหนเปลี่ยน ---------- */
  var FIELD = { case_status: 'สถานะ', cancel_reason: 'เหตุผลยกเลิก', surgery_date: 'วันที่ผ่าตัด', case_type: 'ประเภท', department_id: 'แผนก', diagnosis: 'Diagnosis', operation_name: 'Operation', operation_code_id: 'Code operation', surgeon_id: 'ศัลยแพทย์', anesthesiologist_id: 'วิสัญญี', room_id: 'ห้อง', anesthesia_type_id: 'ยาระงับความรู้สึก', admission_time: 'เวลารับ ER', or_entry_time: 'ถึง OR', surgery_start_time: 'เริ่ม', surgery_end_time: 'สิ้นสุด', or_exit_time: 'ออก OR', result: 'ผล', notes: 'หมายเหตุ', urgency: 'ความเร่งด่วน', from_er: 'ER', icd9_code: 'ICD-9', site: 'Site', fracture_type: 'Fracture', wound_class: 'Class แผล', work_period: 'ในเวลา/นอกเวลา', ward: 'Ward', team: 'Team', has_risk: 'ความเสี่ยง', risk_types: 'ประเภทความเสี่ยง', risk_detail: 'รายละเอียดความเสี่ยง', supplies_checked: 'ตรวจเวชภัณฑ์', ods_mis: 'ODS/MIS', is_active: 'เปิดใช้งาน', patient_name: 'ชื่อ', birth_date: 'วันเกิด', gender: 'เพศ', hn: 'HN', role: 'สิทธิ์', full_name: 'ชื่อ' };
  OR.auditChanges = function (row) {
    var o = row.old_data || {}, n = row.new_data || {}, out = [];
    if (row.action === 'INSERT') return ['สร้างรายการใหม่'];
    if (row.action === 'DELETE') return ['ลบรายการ'];
    Object.keys(n).forEach(function (k) {
      if (k === 'updated_at' || k === 'created_at') return;
      if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) out.push(FIELD[k] || k);
    });
    return out;
  };

  /* ---------- โครงหน้า ---------- */
  var NAV = [
    ['new-case.html', 'ลงทะเบียน Case', ['ADMIN', 'STAFF']],
    ['dashboard.html', 'ภาพรวม', ['ADMIN', 'STAFF', 'VIEWER']],
    ['registry.html', 'ทะเบียน', ['ADMIN', 'STAFF', 'VIEWER']],
    ['reports.html', 'รายงาน', ['ADMIN', 'STAFF', 'VIEWER']],
    ['settings.html', 'ตั้งค่า', ['ADMIN']]
  ];
  // หน้าแรกของแต่ละบทบาท: ADMIN/STAFF = ลงทะเบียน Case, VIEWER = ภาพรวม (ไม่มีสิทธิ์ลงทะเบียน)
  OR.homeFor = function (role) { return role === 'ADMIN' || role === 'STAFF' ? 'new-case.html' : 'dashboard.html'; };
  OR.mountShell = function (ctx, page) {
    var el = document.getElementById('topbar'); if (!el) return;
    var links = NAV.filter(function (n) { return n[2].indexOf(ctx.role) >= 0; }).map(function (n) {
      return '<a href="' + n[0] + '"' + (n[0] === page ? ' class="on" aria-current="page"' : '') + '>' + n[1] + '</a>';
    }).join('');
    el.className = 'topbar';
    el.innerHTML = '<div class="topbar-in"><a class="brand" href="' + OR.homeFor(ctx.role) + '"><i>✚</i>OR Registry</a><nav class="nav">' + links +
      '</nav><div class="userbox"><span class="nm"><b>' + OR.esc(ctx.profile.full_name || ctx.user.email) + '</b></span><span class="role">' + OR.esc(OR.L.role[ctx.role]) +
      '</span><button class="btn sm" id="btnLogout" type="button">ออกจากระบบ</button></div></div>';
    document.getElementById('btnLogout').onclick = function () { OR.auth.signOut(); };
  };
  OR.fatal = function (msg) {
    var m = document.getElementById('main') || document.body;
    m.innerHTML = '<div class="card"><div class="alert err" style="margin:0">' + OR.esc(msg) + '</div></div>';
  };
  // เริ่มต้นทุกหน้า: ตรวจ config + login + สิทธิ์ แล้วคืน ctx
  OR.init = async function (page, roles) {
    if (OR.configError) { OR.fatal(OR.configError); return null; }
    var ctx = await OR.auth.require(roles);
    if (!ctx) return null;
    ctx.isAdmin = ctx.role === 'ADMIN';
    ctx.canEdit = ctx.role === 'ADMIN' || ctx.role === 'STAFF';
    OR.mountShell(ctx, page);
    return ctx;
  };
})();
