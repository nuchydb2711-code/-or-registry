// ตั้งค่า (เฉพาะ ADMIN): ผู้ใช้, แพทย์, แผนก, ห้องผ่าตัด, ยาระงับความรู้สึก, Code operation, Audit Log
// ไม่มีการลบข้อมูล ใช้การปิดใช้งานแทน
(async function () {
  var ctx = await OR.init('settings.html', ['ADMIN']);
  if (!ctx) return;
  var $ = OR.$, esc = OR.esc, lookups;
  try { lookups = await OR.loadLookups(true); } catch (e) { OR.fatal('โหลดข้อมูลหลักไม่สำเร็จ: ' + OR.errMsg(e)); return; }

  var TABS = [['users', 'ผู้ใช้งาน'], ['doctors', 'แพทย์'], ['departments', 'แผนก'], ['rooms', 'ห้องผ่าตัด'], ['anesthesia', 'การระงับความรู้สึก'], ['opcodes', 'Code operation'], ['audit', 'Audit Log']];
  var tab = 'users', opDept = lookups.departments[0] ? lookups.departments[0].id : '';
  var main = document.getElementById('main');
  main.innerHTML = '<div class="pagehead"><div><h1>ตั้งค่าระบบ</h1><p>จัดการผู้ใช้และข้อมูลหลัก (ไม่มีการลบ ใช้การปิดใช้งานแทน)</p></div></div><div class="tabs" id="tabs"></div><div id="out"></div>';

  function tabs() {
    $('#tabs').innerHTML = TABS.map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    OR.$$('#tabs button').forEach(function (b) { b.onclick = function () { tab = b.dataset.t; tabs(); show(); }; });
  }
  var dname = function (id) { var d = lookups.departments.filter(function (x) { return x.id === id; })[0]; return d ? d.department_name : '-'; };
  var deptOpts = function (sel) { return OR.options(lookups.departments, function (d) { return d.id; }, function (d) { return d.department_name; }, '— ไม่ระบุ —', sel); };

  /* ---------- รายการตั้งค่าแบบทั่วไป ---------- */
  var CFG = {
    doctors: { table: 'doctors', order: 'doctor_name', add: 'เพิ่มแพทย์',
      head: ['ชื่อแพทย์', 'ประเภท', 'แผนก'], cells: function (x) { return [esc(x.doctor_name), esc(OR.L.docType[x.doctor_type]), esc(dname(x.department_id))]; },
      fields: [{ k: 'doctor_name', l: 'ชื่อแพทย์ (พร้อมคำนำหน้า)', t: 'text', req: 1 }, { k: 'doctor_type', l: 'ประเภท', t: 'enum', map: OR.L.docType, req: 1 }, { k: 'department_id', l: 'แผนก (ศัลยแพทย์ควรระบุ)', t: 'dept' }] },
    departments: { table: 'departments', order: 'department_name', add: 'เพิ่มแผนก',
      head: ['ชื่อแผนก', 'รหัส'], cells: function (x) { return [esc(x.department_name), esc(x.department_code)]; },
      fields: [{ k: 'department_name', l: 'ชื่อแผนก', t: 'text', req: 1 }, { k: 'department_code', l: 'รหัสแผนก (ภาษาอังกฤษ ไม่ซ้ำ)', t: 'text', req: 1 }] },
    rooms: { table: 'or_rooms', order: 'room_number', add: 'เพิ่มห้องผ่าตัด',
      head: ['หมายเลขห้อง', 'ชื่อห้อง'], cells: function (x) { return [esc(x.room_number), esc(x.room_name)]; },
      fields: [{ k: 'room_number', l: 'หมายเลขห้อง', t: 'number', req: 1 }, { k: 'room_name', l: 'ชื่อห้อง', t: 'text', req: 1 }] },
    anesthesia: { table: 'anesthesia_types', order: 'anesthesia_code', add: 'เพิ่มชนิด',
      head: ['รหัส', 'ชื่อ', 'กลุ่มรวมยอด'], cells: function (x) { return [esc(x.anesthesia_code), esc(x.anesthesia_name), esc(OR.L.anGroup[x.anesthesia_group])]; },
      fields: [{ k: 'anesthesia_code', l: 'รหัส (เช่น GA)', t: 'text', req: 1 }, { k: 'anesthesia_name', l: 'ชื่อ', t: 'text', req: 1 }, { k: 'anesthesia_group', l: 'กลุ่มรวมยอด', t: 'enum', map: OR.L.anGroup, req: 1 }] }
  };

  async function show() {
    var out = $('#out'); out.innerHTML = '<div class="loading"><span class="spin"></span> กำลังโหลด...</div>';
    try {
      if (tab === 'users') await showUsers();
      else if (tab === 'audit') await showAudit(0);
      else if (tab === 'opcodes') await showOps();
      else await showMaster(tab);
    } catch (e) { out.innerHTML = '<div class="alert err">โหลดไม่สำเร็จ: ' + esc(OR.errMsg(e)) + '</div>'; }
  }

  function statusCell(on) { return on ? OR.badge('COMPLETED', 'เปิดใช้งาน') : OR.badge('off', 'ปิดใช้งาน'); }

  async function toggle(table, id, to, after) {
    var r = await OR.db.from(table).update({ is_active: to }).eq('id', id).select('id');
    if (r.error || !r.data.length) { OR.toast(r.error ? OR.errMsg(r.error) : 'ไม่สามารถบันทึกได้', 'err'); return; }
    OR.toast('บันทึกแล้ว', 'ok'); await OR.loadLookups(true).then(function (l) { lookups = l; }); after();
  }

  /* ---------- ฟอร์มเพิ่ม/แก้ไข ---------- */
  function fieldHtml(f, v) {
    var val = v ? v[f.k] : '', id = 'f_' + f.k, lab = '<label for="' + id + '">' + esc(f.l) + (f.req ? ' <span class="req">*</span>' : '') + '</label>';
    if (f.t === 'enum') return '<div>' + lab + '<select id="' + id + '">' + OR.enumOptions(f.map, '— เลือก —', val) + '</select></div>';
    if (f.t === 'dept') return '<div>' + lab + '<select id="' + id + '">' + deptOpts(val) + '</select></div>';
    if (f.t === 'deptReq') return '<div>' + lab + '<select id="' + id + '">' + OR.options(lookups.departments, function (d) { return d.id; }, function (d) { return d.department_name; }, '— เลือกแผนก —', val) + '</select></div>';
    return '<div>' + lab + '<input id="' + id + '" type="' + (f.t === 'number' ? 'number' : 'text') + '" ' + (f.t === 'number' ? 'min="0" step="1"' : 'maxlength="200"') + ' value="' + esc(val == null ? '' : val) + '"></div>';
  }
  function editor(title, table, fields, row, defaults, onSaved) {
    var saving = false;
    var m = OR.modal({
      title: title, size: 'sm', body: '<div id="eerr"></div><div class="grid" style="grid-template-columns:1fr">' + fields.map(function (f) { return fieldHtml(f, row); }).join('') + '</div>',
      buttons: [{ text: 'ยกเลิก' }, {
        text: 'บันทึก', cls: 'ok', onClick: async function (api, btn) {
          if (saving) return;
          var p = {}, errs = [];
          fields.forEach(function (f) {
            var v = $('#f_' + f.k).value.trim();
            if (f.req && !v) errs.push('กรุณากรอก: ' + f.l);
            p[f.k] = f.t === 'number' ? (v === '' ? null : Number(v)) : (v === '' ? null : v);
          });
          if (errs.length) { $('#eerr').innerHTML = '<div class="alert err">' + esc(errs.join(' / ')) + '</div>'; return; }
          saving = true; OR.busy(btn, true);
          try {
            var q = row ? OR.db.from(table).update(p).eq('id', row.id) : OR.db.from(table).insert(Object.assign({}, defaults || {}, p));
            var r = await q.select('id');
            if (r.error) throw r.error;
            if (!r.data.length) throw new Error('ไม่สามารถบันทึกได้ (ไม่มีสิทธิ์ หรือไม่พบรายการ)');
            OR.toast('บันทึกสำเร็จ', 'ok'); m.close(); lookups = await OR.loadLookups(true); onSaved();
          } catch (e) { $('#eerr').innerHTML = '<div class="alert err">' + esc(OR.errMsg(e)) + '</div>'; saving = false; OR.busy(btn, false); }
        }
      }]
    });
  }

  function listHtml(head, rows) {
    return '<div class="tablewrap"><table><thead><tr>' + head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" class="empty">ไม่มีข้อมูล</td></tr>') + '</tbody></table></div>';
  }

  async function showMaster(key) {
    var c = CFG[key];
    var r = await OR.db.from(c.table).select('*').order(c.order); if (r.error) throw r.error;
    var rows = r.data.map(function (x) {
      return '<tr>' + c.cells(x).map(function (v) { return '<td>' + v + '</td>'; }).join('') + '<td>' + statusCell(x.is_active) + '</td><td style="white-space:nowrap"><button class="btn sm" data-e="' + x.id + '" type="button">แก้ไข</button> <button class="btn sm" data-a="' + x.id + '" type="button">' + (x.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน') + '</button></td></tr>';
    });
    $('#out').innerHTML = '<div class="card"><div class="pagehead" style="margin-bottom:10px"><h2>' + esc(TABS.filter(function (t) { return t[0] === key; })[0][1]) + '</h2><button class="btn ok" id="bAdd" type="button">+ ' + c.add + '</button></div>' + listHtml(c.head.concat(['สถานะ', '']), rows) + '</div>';
    var byId = {}; r.data.forEach(function (x) { byId[x.id] = x; });
    $('#bAdd').onclick = function () { editor(c.add, c.table, c.fields, null, null, show); };
    OR.$$('[data-e]').forEach(function (b) { b.onclick = function () { editor('แก้ไข', c.table, c.fields, byId[b.dataset.e], null, show); }; });
    OR.$$('[data-a]').forEach(function (b) { b.onclick = function () { var x = byId[b.dataset.a]; toggle(c.table, x.id, !x.is_active, show); }; });
  }

  async function showOps() {
    var f = { k: 'department_id', l: 'แผนก', t: 'deptReq', req: 1 };
    var fields = [f, { k: 'op_code', l: 'รหัส (เช่น Sx04)', t: 'text', req: 1 }, { k: 'operation_name', l: 'ชื่อรายการผ่าตัด', t: 'text', req: 1 }, { k: 'sort_order', l: 'ลำดับแสดง', t: 'number' }];
    var r = await OR.db.from('operation_codes').select('*').eq('department_id', opDept).order('sort_order'); if (r.error) throw r.error;
    var byId = {}; r.data.forEach(function (x) { byId[x.id] = x; });
    $('#out').innerHTML = '<div class="card"><div class="toolbar"><div><label for="od">แผนก</label><select id="od">' + OR.options(lookups.departments, function (d) { return d.id; }, function (d) { return d.department_name; }, false, opDept) + '</select></div>' +
      '<div class="actions"><button class="btn ok" id="bAdd" type="button">+ เพิ่ม Code operation</button></div></div><p class="note">รายการนี้ใช้เป็นตัวนับยอดในรายงาน "สรุปยอดประจำเดือน" (ทั้งหมด ' + r.data.length + ' รายการในแผนกนี้)</p>' +
      listHtml(['รหัส', 'รายการผ่าตัด', 'ลำดับ', 'สถานะ', ''], r.data.map(function (x) { return '<tr><td>' + esc(x.op_code) + '</td><td>' + esc(x.operation_name) + '</td><td>' + x.sort_order + '</td><td>' + statusCell(x.is_active) + '</td><td style="white-space:nowrap"><button class="btn sm" data-e="' + x.id + '" type="button">แก้ไข</button> <button class="btn sm" data-a="' + x.id + '" type="button">' + (x.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน') + '</button></td></tr>'; })) + '</div>';
    $('#od').onchange = function () { opDept = this.value; show(); };
    $('#bAdd').onclick = function () { editor('เพิ่ม Code operation', 'operation_codes', fields, { department_id: opDept, sort_order: r.data.length + 1 }, null, show); };
    OR.$$('[data-e]').forEach(function (b) { b.onclick = function () { editor('แก้ไข Code operation', 'operation_codes', fields, byId[b.dataset.e], null, show); }; });
    OR.$$('[data-a]').forEach(function (b) { b.onclick = function () { var x = byId[b.dataset.a]; toggle('operation_codes', x.id, !x.is_active, show); }; });
  }

  /* ---------- ผู้ใช้งาน ---------- */
  async function showUsers() {
    var r = await OR.db.from('profiles').select('*').order('created_at'); if (r.error) throw r.error;
    var byId = {}; r.data.forEach(function (x) { byId[x.id] = x; });
    var pending = r.data.filter(function (x) { return !x.is_active; }).length;
    $('#out').innerHTML = '<div class="card"><h2>ผู้ใช้งาน</h2>' +
      '<div class="alert info">เพิ่มผู้ใช้ใหม่ที่ Supabase → Authentication → Users → Add user แล้วกลับมากำหนดสิทธิ์และเปิดใช้งานที่นี่ (ผู้ใช้ใหม่เริ่มต้นเป็น "ผู้ดู" และยังใช้งานไม่ได้)</div>' +
      (pending ? '<div class="alert warn">มีผู้ใช้ที่ยังไม่เปิดใช้งาน ' + pending + ' คน</div>' : '') +
      listHtml(['ชื่อ', 'อีเมล', 'สิทธิ์', 'สถานะ', ''], r.data.map(function (x) { return '<tr><td>' + OR.dash(x.full_name) + (x.id === ctx.user.id ? ' <span class="note">(คุณ)</span>' : '') + '</td><td>' + OR.dash(x.email) + '</td><td>' + esc(OR.L.role[x.role]) + '</td><td>' + statusCell(x.is_active) + '</td><td><button class="btn sm" data-e="' + x.id + '" type="button">แก้ไข</button></td></tr>'; })) + '</div>';
    OR.$$('[data-e]').forEach(function (b) { b.onclick = function () { editUser(byId[b.dataset.e]); }; });
  }
  function editUser(u) {
    var self = u.id === ctx.user.id, saving = false;
    var m = OR.modal({
      title: 'แก้ไขผู้ใช้', size: 'sm',
      body: '<div id="eerr"></div><div class="grid" style="grid-template-columns:1fr"><div><label>อีเมล</label><input readonly value="' + esc(u.email || '') + '"></div>' +
        '<div><label for="uN">ชื่อ-สกุล</label><input id="uN" type="text" maxlength="200" value="' + esc(u.full_name || '') + '"></div>' +
        '<div><label for="uR">สิทธิ์</label><select id="uR"' + (self ? ' disabled' : '') + '>' + OR.enumOptions(OR.L.role, false, u.role) + '</select></div>' +
        '<div><label class="chk"><input id="uA" type="checkbox"' + (u.is_active ? ' checked' : '') + (self ? ' disabled' : '') + '> เปิดใช้งานบัญชี</label></div></div>' +
        (self ? '<p class="note">ไม่สามารถเปลี่ยนสิทธิ์หรือปิดบัญชีของตัวเองได้ เพื่อป้องกันระบบไม่มีผู้ดูแล</p>' : '') +
        '<p class="note">สิทธิ์: ผู้ดูแลระบบ = ทำได้ทุกอย่าง · เจ้าหน้าที่ = ลงทะเบียน/แก้ไข Case (ยกเลิก Case ไม่ได้) · ผู้ดู = ดูข้อมูลและรายงานอย่างเดียว</p>',
      buttons: [{ text: 'ยกเลิก' }, {
        text: 'บันทึก', cls: 'ok', onClick: async function (api, btn) {
          if (saving) return;
          var p = { full_name: $('#uN').value.trim() };
          if (!self) { p.role = $('#uR').value; p.is_active = $('#uA').checked; }
          saving = true; OR.busy(btn, true);
          try {
            var r = await OR.db.from('profiles').update(p).eq('id', u.id).select('id');
            if (r.error) throw r.error; if (!r.data.length) throw new Error('ไม่สามารถบันทึกได้');
            OR.toast('บันทึกสำเร็จ', 'ok'); m.close(); show();
          } catch (e) { $('#eerr').innerHTML = '<div class="alert err">' + esc(OR.errMsg(e)) + '</div>'; saving = false; OR.busy(btn, false); }
        }
      }]
    });
  }

  /* ---------- Audit Log ---------- */
  var auditTable = '', PAGE = 50;
  async function showAudit(page) {
    var q = OR.db.from('audit_logs').select('id,user_id,action,table_name,record_id,old_data,new_data,created_at', { count: 'exact' });
    if (auditTable) q = q.eq('table_name', auditTable);
    var r = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1); if (r.error) throw r.error;
    var ids = r.data.map(function (a) { return a.user_id; }).filter(function (u, i, a) { return u && a.indexOf(u) === i; }), us = {};
    if (ids.length) { var p = await OR.db.from('profiles').select('id,full_name,email').in('id', ids); (p.data || []).forEach(function (u) { us[u.id] = u.full_name || u.email; }); }
    var tables = ['patients', 'surgery_cases', 'doctors', 'departments', 'or_rooms', 'anesthesia_types', 'operation_codes', 'profiles'];
    var pages = Math.max(1, Math.ceil((r.count || 0) / PAGE));
    $('#out').innerHTML = '<div class="card"><h2>Audit Log</h2><p class="note">บันทึกอัตโนมัติทุกการเพิ่ม/แก้ไข แก้ไขหรือลบไม่ได้</p><div class="toolbar"><div><label for="at">ตาราง</label><select id="at"><option value="">ทั้งหมด</option>' + tables.map(function (t) { return '<option' + (t === auditTable ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div></div>' +
      listHtml(['เวลา', 'ผู้ทำ', 'การกระทำ', 'ตาราง', 'รหัสรายการ', 'สิ่งที่เปลี่ยน'], r.data.map(function (a) { return '<tr><td>' + OR.fmtDateTime(a.created_at) + '</td><td>' + OR.dash(us[a.user_id] || (a.user_id ? '' : 'ระบบ/ผู้ดูแล DB')) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.table_name) + '</td><td>' + esc(String(a.record_id || '').slice(0, 8)) + '</td><td>' + esc(OR.auditChanges(a).join(', ')) + '</td></tr>'; })) +
      '<div class="pager"><span>ทั้งหมด ' + (r.count || 0).toLocaleString('th-TH') + ' รายการ</span><span style="display:flex;gap:8px;align-items:center"><button class="btn sm" id="aP" type="button"' + (page === 0 ? ' disabled' : '') + '>← ก่อนหน้า</button> หน้า ' + (page + 1) + ' / ' + pages + ' <button class="btn sm" id="aN" type="button"' + (page + 1 >= pages ? ' disabled' : '') + '>ถัดไป →</button></span></div></div>';
    $('#at').onchange = function () { auditTable = this.value; showAudit(0).catch(function (e) { OR.toast(OR.errMsg(e), 'err'); }); };
    $('#aP').onclick = function () { showAudit(page - 1); }; $('#aN').onclick = function () { showAudit(page + 1); };
  }

  tabs(); show();
})();
