// ฟอร์มข้อมูล Case (ขั้นตอนที่ 2 ข้อมูลการผ่าตัด + ขั้นตอนที่ 3 ข้อมูลห้องผ่าตัด)
// ใช้ร่วมกันระหว่างหน้า "ลงทะเบียน Case" และหน้าต่างแก้ไขในหน้า "ทะเบียน"
(function () {
  var $ = OR.$, esc = OR.esc;

  function timeOf(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : OR.pad(d.getHours()) + ':' + OR.pad(d.getMinutes()); }

  // ค่าที่แนะนำสำหรับ ในเวลา/นอกเวลา ตาม config
  function suggestPeriod(dateStr, timeStr) {
    if (!dateStr || !timeStr) return '';
    var oh = (window.OR_CONFIG && OR_CONFIG.OFFICE_HOURS) || { start: '08:00', end: '16:00', weekdaysOnly: true };
    var dow = new Date(dateStr + 'T00:00:00').getDay();
    if (oh.weekdaysOnly && (dow === 0 || dow === 6)) return 'OUT_HOURS';
    return (timeStr >= oh.start && timeStr < oh.end) ? 'IN_HOURS' : 'OUT_HOURS';
  }


  /* ---------- ช่องคลิกเลือก/พิมพ์ค้นหา (ใช้ซ้ำ: ศัลยแพทย์ วิสัญญี รายชื่อทีม) ---------- */
  var cbSeq = 0;
  function nrm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  // o: {items(): [{id,label,sub}], onPick(item), onClear(), create(text): Promise<item>, free: true=เก็บข้อความที่พิมพ์ไว้แม้ไม่ได้เลือก, placeholder}
  OR.combobox = function (host, o) {
    var uid = 'cb' + (++cbSeq), cur = null, shown = [], active = -1, qText = '';
    host.classList.add('combo');
    host.innerHTML = '<input type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="' + uid + '" placeholder="' + esc(o.placeholder || '') + '"><button type="button" class="combo-x" hidden aria-label="ล้าง">×</button><ul class="combo-list" id="' + uid + '" role="listbox" hidden></ul>';
    var inp = host.querySelector('input'), clr = host.querySelector('.combo-x'), list = host.querySelector('ul');
    function close() { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); active = -1; }
    function showClear() { clr.hidden = !inp.value; }
    function render(q) {
      qText = q; var toks = nrm(q).split(' ').filter(Boolean);
      var pool = o.items().filter(function (it) { var h = nrm(it.label + ' ' + (it.sub || '')); return toks.every(function (t) { return h.indexOf(t) >= 0; }); });
      shown = pool.slice(0, 80); var html = '';
      shown.forEach(function (it, i) { html += '<li role="option" data-i="' + i + '"><span>' + esc(it.label) + '</span>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</li>'; });
      var exact = o.items().some(function (it) { return nrm(it.label) === nrm(q); });
      if (o.create && q.trim() && !exact) html += '<li class="add" data-add="1">＋ เพิ่ม “' + esc(q.trim()) + '” เป็นรายชื่อใหม่</li>';
      if (!shown.length && !(o.create && q.trim() && !exact)) html = '<li class="none">' + (q.trim() ? 'ไม่พบรายชื่อ' : 'ยังไม่มีรายชื่อให้เลือก') + (o.free ? ' — พิมพ์ชื่อแล้วใช้ได้เลย' : '') + '</li>';
      else if (pool.length > shown.length) html += '<li class="none">แสดง ' + shown.length + ' จาก ' + pool.length + ' รายการ พิมพ์เพิ่มเพื่อกรอง</li>';
      list.innerHTML = html; list.hidden = false; inp.setAttribute('aria-expanded', 'true'); active = -1;
    }
    function hi(i) { var lis = list.querySelectorAll('li[data-i],li[data-add]'); if (!lis.length) return; active = (i + lis.length) % lis.length; lis.forEach(function (li, k) { li.classList.toggle('on', k === active); }); lis[active].scrollIntoView({ block: 'nearest' }); }
    function pick(it) { cur = it; inp.value = it.label; showClear(); close(); if (o.onPick) o.onPick(it); }
    async function add() {
      var t = qText.trim(); if (!t || !o.create) return;
      try { var it = await o.create(t); if (it) pick(it); } catch (e) { OR.toast(OR.errMsg(e), 'err'); }
    }
    function choose(li) { if (!li) return; if (li.dataset.add) add(); else if (li.dataset.i != null) pick(shown[+li.dataset.i]); }
    inp.addEventListener('focus', function () { inp.select(); render(''); });
    inp.addEventListener('click', function () { if (list.hidden) render(inp.value === (cur && cur.label) ? '' : inp.value); });
    inp.addEventListener('input', function () { cur = null; showClear(); if (o.onClear) o.onClear(inp.value); render(inp.value); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(inp.value); hi(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hi(active - 1); }
      else if (e.key === 'Enter') { if (!list.hidden) { var lis = list.querySelectorAll('li[data-i],li[data-add]'); var li = lis[active >= 0 ? active : (shown.length === 1 && lis.length === 1 ? 0 : -1)]; if (li) { e.preventDefault(); e.stopPropagation(); choose(li); } } }
      else if (e.key === 'Escape') { close(); if (cur) inp.value = cur.label; }
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); choose(e.target.closest('li')); });
    inp.addEventListener('blur', function () { setTimeout(function () { close(); if (cur) inp.value = cur.label; else if (!o.free) inp.value = ''; showClear(); }, 120); });
    clr.addEventListener('click', function () { cur = null; inp.value = ''; showClear(); if (o.onClear) o.onClear(''); inp.focus(); });
    return {
      input: inp,
      set: function (it) { cur = it || null; inp.value = it ? it.label : ''; showClear(); },
      text: function () { return inp.value.trim(); }
    };
  };

  // แปลง <select> ยาว ๆ ให้คลิกเลือกหรือพิมพ์ค้นหาได้ (select เดิมยังเก็บค่าไว้ จึงไม่ต้องแก้ส่วนอื่น)
  OR.enhanceSelect = function (sel, placeholder) {
    var host = document.createElement('div'); sel.parentNode.insertBefore(host, sel); sel.hidden = true;
    var lab = sel.parentNode.querySelector('label[for="' + sel.id + '"]');
    function fire() { sel.dispatchEvent(new Event('change', { bubbles: true })); }
    var cb = OR.combobox(host, {
      placeholder: placeholder,
      items: function () { return Array.prototype.filter.call(sel.options, function (op) { return op.value; }).map(function (op) { return { id: op.value, label: op.textContent }; }); },
      onPick: function (it) { sel.value = it.id; fire(); },
      onClear: function () { if (sel.value) { sel.value = ''; fire(); } }
    });
    cb.input.id = sel.id + '_q'; if (lab) lab.setAttribute('for', cb.input.id);
    function sync() { var op = sel.selectedOptions[0]; cb.set(op && op.value ? { id: op.value, label: op.textContent } : null); }
    new MutationObserver(sync).observe(sel, { childList: true });
    sync(); return cb;
  };

  OR.caseForm = {
    // lookups: ข้อมูลหลัก, ctx: {role}, v: ค่าเดิม (แถวจาก v_surgery_cases หรือ surgery_cases) ถ้าแก้ไข
    create: function (lookups, ctx, v) {
      v = v || {};
      var isAdmin = ctx.role === 'ADMIN';
      var s2 = document.createElement('div'), s3 = document.createElement('div');
      s2.className = 'grid'; s3.className = 'grid';
      var wasCancelled = v.case_status === 'CANCELLED';
      var periodTouched = !!v.work_period;

      var statusMap = {};
      Object.keys(OR.L.status).forEach(function (k) { if (k !== 'CANCELLED' || isAdmin || wasCancelled) statusMap[k] = OR.L.status[k]; });

      s2.innerHTML =
        '<div class="sect">01 · ข้อมูลวันผ่าตัดและประเภทเคส</div>' +
        '<div><label for="cf_date">วันที่ผ่าตัด <span class="req">*</span></label><input id="cf_date" type="date" value="' + esc(v.surgery_date || OR.today()) + '"></div>' +
        '<div><label for="cf_type">ประเภทการผ่าตัด <span class="req">*</span></label><select id="cf_type">' + OR.enumOptions(OR.L.caseType, '— เลือก —', v.case_type) + '</select></div>' +
        '<div><label for="cf_urgency">ความเร่งด่วน</label><select id="cf_urgency">' + OR.enumOptions(OR.L.urgency, false, v.urgency || 'ELECTIVE') + '</select></div>' +
        '<div><label class="chk" style="margin-top:22px"><input id="cf_er" type="checkbox"' + (v.from_er ? ' checked' : '') + '> รับผู้ป่วยจาก ER</label></div>' +
        '<div><label for="cf_dept">แผนก <span class="req">*</span></label><select id="cf_dept"></select></div>' +
        '<div><label for="cf_opsearch">Code operation (ใช้นับยอดรายเดือน)</label><div class="combo"><input id="cf_opsearch" type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="cf_oplist" placeholder="พิมพ์ค้นหา เช่น Sx04 หรือ appendectomy"><button type="button" class="combo-x" id="cf_opclear" aria-label="ล้าง Code operation" hidden>×</button><ul class="combo-list" id="cf_oplist" role="listbox" hidden></ul></div><select id="cf_opcode" hidden></select></div>' +
        '<div class="sect">02 · ข้อมูลการวินิจฉัยและรายการผ่าตัด</div>' +
        '<div class="full"><label for="cf_dx">Diagnosis <span class="req">*</span></label><input id="cf_dx" type="text" maxlength="300" value="' + esc(v.diagnosis || '') + '"></div>' +
        '<div class="full"><label for="cf_op">Operation <span class="req">*</span></label><input id="cf_op" type="text" maxlength="300" value="' + esc(v.operation_name || '') + '"></div>' +
        '<div><label for="cf_icd9">Operation (ICD-9)</label><input id="cf_icd9" type="text" maxlength="120" value="' + esc(v.icd9_code || '') + '"></div>' +
        '<div><label for="cf_site">ข้างที่ผ่าตัด (Site)</label><select id="cf_site">' + OR.enumOptions(OR.L.site, '— ไม่ระบุ —', v.site) + '</select></div>' +
        '<div><label for="cf_fx">Fracture (ถ้ามี)</label><select id="cf_fx">' + OR.enumOptions(OR.L.fracture, '— ไม่เกี่ยวข้อง —', v.fracture_type) + '</select></div>' +
        '<div class="sect">03 · แพทย์ผู้ทำผ่าตัดและวิสัญญี</div>' +
        '<div><label for="cf_surgeon">ศัลยแพทย์ <span class="req">*</span></label><select id="cf_surgeon"></select><div class="hint" id="cf_surgeon_hint"></div></div>' +
        '<div><label for="cf_anes">วิสัญญีแพทย์ / ผู้ให้ยา (Anesth)</label><select id="cf_anes"></select></div>';

      s3.innerHTML =
        '<div class="sect">04 · ห้องผ่าตัดและการระงับความรู้สึก</div>' +
        '<div><label for="cf_room">ห้องผ่าตัด</label><select id="cf_room"></select></div>' +
        '<div><label for="cf_antype">ประเภทการระงับความรู้สึก</label><select id="cf_antype"></select><div class="hint">กรณีใช้หลายแบบ (เช่น LA+GA) เลือกแบบหลัก และบันทึกเพิ่มในหมายเหตุ</div></div>' +
        '<div class="sect sect-time">05 · Surgery Timeline — บันทึกเวลา</div>' +
        '<div id="cf_er_time_box"><label for="cf_ertime">เวลารับผู้ป่วยจาก ER</label><input id="cf_ertime" type="time" value="' + esc(timeOf(v.admission_time)) + '"></div>' +
        '<div><label for="cf_arrive">คนไข้ถึง OR</label><input id="cf_arrive" type="time" value="' + esc(timeOf(v.or_entry_time)) + '"></div>' +
        '<div><label for="cf_start">เริ่มผ่าตัด (Start)</label><input id="cf_start" type="time" value="' + esc(timeOf(v.surgery_start_time)) + '"></div>' +
        '<div><label for="cf_end">สิ้นสุดผ่าตัด (Finish)</label><input id="cf_end" type="time" value="' + esc(timeOf(v.surgery_end_time)) + '"></div>' +
        '<div><label for="cf_recov">ออกจาก OR / เข้า Recovery room</label><input id="cf_recov" type="time" value="' + esc(timeOf(v.or_exit_time)) + '"></div>' +
        '<div class="sect">06 · สถานะและผลการผ่าตัด</div>' +
        '<div><label for="cf_status">สถานะ Case <span class="req">*</span></label><select id="cf_status"' + (wasCancelled && !isAdmin ? ' disabled' : '') + '>' + OR.enumOptions(statusMap, false, v.case_status || 'IN_PROGRESS') + '</select></div>' +
        '<div id="cf_cancel_box" class="full"><label for="cf_cancel">เหตุผลการยกเลิก <span class="req">*</span></label><input id="cf_cancel" type="text" maxlength="300" value="' + esc(v.cancel_reason || '') + '"></div>' +
        '<div class="full"><label for="cf_result">ผลการผ่าตัด</label><input id="cf_result" type="text" maxlength="500" value="' + esc(v.result || '') + '"></div>' +
        '<div class="sect">07 · ข้อมูลทะเบียนและการจำแนก</div>' +
        '<div><label for="cf_wound">Class แผล</label><select id="cf_wound">' + OR.enumOptions(OR.L.wound, '— ไม่ระบุ —', v.wound_class) + '</select></div>' +
        '<div><label for="cf_period">ในเวลา / นอกเวลา</label><select id="cf_period">' + OR.enumOptions(OR.L.period, '— ไม่ระบุ —', v.work_period) + '</select><div class="hint" id="cf_period_hint"></div></div>' +
        '<div><label for="cf_ward">Ward</label><input id="cf_ward" type="text" maxlength="60" value="' + esc(v.ward || '') + '"></div>' +
        '<div class="sect">08 · ทีมผ่าตัด (OR Team)</div>' +
        '<div class="full team-panel"><div class="team-head"><div><label>ทีมผ่าตัด (OR Team)</label><div class="hint">คลิกช่องชื่อเพื่อเลือกจากรายชื่อ (คนเดียวเลือกได้หลายตำแหน่ง เช่น Assistant / Scrub / Circulate — เลือกตำแหน่งที่ช่องซ้าย แล้วเลือกชื่อเดิมซ้ำได้) · ไม่มีชื่อให้พิมพ์ได้เลย เมื่อบันทึก Case ระบบจะจำชื่อใหม่ไว้ให้เลือกครั้งหน้า (หรือกด “＋ เพิ่ม” ในรายการเพื่อจำทันที)</div></div><div class="team-tools"><button class="btn sm" id="cf_team_copy" type="button" title="ใช้ทีมจาก Case ล่าสุดของวัน/ห้องเดียวกัน">⎘ ใช้ทีมเดิม</button><button class="btn sm" id="cf_team_add" type="button">＋ เพิ่มบุคลากร</button></div></div><div id="cf_team_rows"></div><input id="cf_team" type="hidden" value="' + esc(v.team || '') + '"></div>' +
        '<div class="sect">09 · ความปลอดภัย ความเสี่ยง และข้อมูลเพิ่มเติม</div>' +
        '<div><label class="chk"><input id="cf_ods" type="checkbox"' + (v.ods_mis ? ' checked' : '') + '> โครงการ ODS / MIS</label></div>' +
        '<div><label for="cf_supplies">ตรวจเวชภัณฑ์ในระบบ</label><select id="cf_supplies"><option value="">— ไม่ระบุ —</option><option value="1"' + (v.supplies_checked === true ? ' selected' : '') + '>ครบ</option><option value="0"' + (v.supplies_checked === false ? ' selected' : '') + '>ไม่ครบ</option></select></div>' +
        '<div class="full"><label class="chk"><input id="cf_risk" type="checkbox"' + (v.has_risk ? ' checked' : '') + '> มีความเสี่ยง</label></div>' +
        '<div class="full" id="cf_risk_box"><label>ประเภทความเสี่ยงที่พบ</label><div class="chips" id="cf_risk_types">' +
        Object.keys(OR.L.risk).map(function (k) { return '<label><input type="checkbox" value="' + k + '"' + ((v.risk_types || []).indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(OR.L.risk[k]) + '</label>'; }).join('') +
        '</div><label for="cf_risk_detail" style="margin-top:10px">รายละเอียดความเสี่ยง</label><textarea id="cf_risk_detail" maxlength="1000">' + esc(v.risk_detail || '') + '</textarea></div>' +
        '<div class="full"><label for="cf_notes">หมายเหตุ</label><textarea id="cf_notes" maxlength="1000">' + esc(v.notes || '') + '</textarea></div>';

      var root = document.createElement('div'); root.appendChild(s2); root.appendChild(s3);
      // s2/s3 อาจถูกย้ายไปแสดงคนละหน้าจอ (ขั้นตอน 2 / 3) จึงค้นจากสองส่วนนี้โดยตรง ไม่ใช้ root
      var g = function (id) { return s2.querySelector('#' + id) || s3.querySelector('#' + id); };

      /* ----- ทีมผ่าตัด: เลือกชื่อจากรายชื่อบุคลากร (คลิก/พิมพ์ค้นหา) เพิ่มชื่อใหม่ได้ทันที
             บันทึกลงคอลัมน์ team เดิมเป็นข้อความ "ตำแหน่ง: ชื่อ | ..." จึงไม่ต้องแก้โครงสร้างข้อมูล ----- */
      var teamRoles = Object.keys(OR.L.teamRole).map(function (k) { return [k, OR.L.teamRole[k]]; });
      var teamRows = g('cf_team_rows');
      function roleLabel(k) { return OR.L.teamRole[k] || k; }
      function syncTeam() {
        var lines = Array.prototype.slice.call(teamRows.querySelectorAll('.team-row')).map(function (row) {
          var name = row.querySelector('.team-namebox input').value.trim();
          return name ? roleLabel(row.querySelector('.team-role').value) + ': ' + name : '';
        }).filter(Boolean);
        g('cf_team').value = lines.join(' | ');
      }
      function addTeamRow(role, name) {
        var row = document.createElement('div'); row.className = 'team-row';
        row.innerHTML = '<select aria-label="ตำแหน่งในทีม" class="team-role">' + teamRoles.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === (role || 'SCRUB_NURSE') ? ' selected' : '') + '>' + esc(r[1]) + '</option>'; }).join('') + '</select>' +
          '<div class="team-namebox"></div><button class="team-remove" type="button" aria-label="ลบบุคลากร" title="ลบ">×</button>';
        var roleSel = row.querySelector('.team-role');
        var roleTouched = !!name;   // แถวที่มีชื่ออยู่แล้ว หรือที่ผู้ใช้เลือกตำแหน่งเอง → ไม่เปลี่ยนตำแหน่งตามตำแหน่งหลักของชื่อที่เลือก
        var cb = OR.combobox(row.querySelector('.team-namebox'), {
          placeholder: 'คลิกเลือก หรือพิมพ์ชื่อ...', free: true,
          items: function () {   // ชื่อที่ตำแหน่งตรงกับแถวนี้ขึ้นก่อน
            var r = roleSel.value, st = (lookups.staff || []).filter(function (x) { return x.is_active; });
            st.sort(function (a, b) { return (b.staff_role === r) - (a.staff_role === r) || a.staff_name.localeCompare(b.staff_name, 'th'); });
            return st.map(function (x) { return { id: x.id, label: x.staff_name, sub: roleLabel(x.staff_role), role: x.staff_role }; });
          },
          onPick: function (it) { if (!roleTouched && it.role && it.role !== 'OTHER') roleSel.value = it.role; roleTouched = true; syncTeam(); },
          onClear: syncTeam,
          create: lookups.staffMissing ? null : async function (text) {
            var r = await OR.db.from('or_staff').insert({ staff_name: text, staff_role: roleSel.value }).select('*').single();
            if (r.error && r.error.code === '23505') { r = await OR.db.from('or_staff').select('*').eq('staff_name', text).single(); }
            if (r.error) throw r.error;
            if (!lookups.staff.some(function (x) { return x.id === r.data.id; })) lookups.staff.push(r.data);
            OR.toast('เพิ่ม “' + text + '” ในรายชื่อบุคลากรแล้ว', 'ok');
            return { id: r.data.id, label: r.data.staff_name, sub: roleLabel(r.data.staff_role), role: r.data.staff_role };
          }
        });
        cb.input.setAttribute('aria-label', 'ชื่อบุคลากร'); cb.input.value = name || ''; if (name) cb.set({ id: null, label: name });
        cb.input.addEventListener('input', syncTeam); cb.input.addEventListener('blur', function () { setTimeout(syncTeam, 200); });
        roleSel.addEventListener('change', function () { roleTouched = true; syncTeam(); });
        row.querySelector('.team-remove').addEventListener('click', function () { row.remove(); syncTeam(); });
        teamRows.appendChild(row); syncTeam(); return cb;
      }
      function parseTeam(str) {
        var out = [];
        String(str || '').split('|').forEach(function (part) {
          part = part.trim(); if (!part) return;
          var m = part.match(/^([^:]{1,40}):\s*(.+)$/), r = m && teamRoles.filter(function (x) { return x[1].toLowerCase() === m[1].trim().toLowerCase(); })[0];
          out.push(r ? [r[0], m[2].trim()] : ['OTHER', part]);
        });
        return out;
      }
      function setTeam(str) {
        teamRows.innerHTML = ''; var rows = parseTeam(str);
        if (!rows.length) addTeamRow('SURGICAL_ASSISTANT', ''); else rows.forEach(function (r) { addTeamRow(r[0], r[1]); });
        syncTeam();
      }
      setTeam(v.team);
      if (lookups.staffMissing) g('cf_team').parentNode.querySelector('.hint').textContent = 'ยังจำรายชื่อไว้ไม่ได้ — ให้ผู้ดูแลระบบรัน database/migration_phase3.sql ใน Supabase ก่อน (ตอนนี้พิมพ์ชื่อได้ แต่จะไม่มีรายชื่อให้เลือกครั้งหน้า)';

      g('cf_team_add').addEventListener('click', function () { addTeamRow('SCRUB_NURSE', '').input.focus(); });
      // ใช้ทีมเดิม: ทีมจาก Case ล่าสุดของวัน+ห้องเดียวกัน → วันเดียวกัน → Case ล่าสุดทั้งหมด
      g('cf_team_copy').addEventListener('click', async function () {
        var btn = this, date = g('cf_date').value, room = g('cf_room').value;
        async function latest(f) { var b = OR.db.from('surgery_cases').select('case_number,team').not('team', 'is', null).order('created_at', { ascending: false }).limit(1); return f ? f(b) : b; }
        btn.disabled = true;
        try {
          var r = null;
          if (date && room) r = await latest(function (b) { return b.eq('surgery_date', date).eq('room_id', room); });
          if (!r || r.error || !r.data.length) r = date ? await latest(function (b) { return b.eq('surgery_date', date); }) : null;
          if (!r || r.error || !r.data.length) r = await latest();
          if (r.error) throw r.error;
          if (!r.data.length) { OR.toast('ยังไม่มีทีมที่เคยบันทึกไว้', ''); return; }
          setTeam(r.data[0].team); OR.toast('ใช้ทีมจาก Case ' + r.data[0].case_number + ' (แก้ไขได้)', 'ok');
        } catch (e) { OR.toast(OR.errMsg(e), 'err'); } finally { btn.disabled = false; }
      });

      /* ----- dropdown ที่ขึ้นกับข้อมูลหลัก ----- */
      g('cf_dept').innerHTML = OR.options(lookups.departments.filter(function (d) { return d.is_active || d.id === v.department_id; }), function (d) { return d.id; }, function (d) { return d.department_name; }, '— เลือกแผนก —', v.department_id);
      g('cf_room').innerHTML = OR.options(lookups.rooms.filter(function (r) { return r.is_active || r.id === v.room_id; }), function (r) { return r.id; }, function (r) { return r.room_name; }, '— เลือกห้อง —', v.room_id);
      g('cf_antype').innerHTML = OR.options(lookups.anesthesia.filter(function (a) { return a.is_active || a.id === v.anesthesia_type_id; }), function (a) { return a.id; }, function (a) { return a.anesthesia_name; }, '— เลือก —', v.anesthesia_type_id);
      g('cf_anes').innerHTML = OR.options(lookups.doctors.filter(function (d) { return d.doctor_type === 'ANESTHESIOLOGIST' && (d.is_active || d.id === v.anesthesiologist_id); }), function (d) { return d.id; }, function (d) { return d.doctor_name; }, '— เลือก —', v.anesthesiologist_id);

      function fillDeptDependent(keepOp, keepSurgeon) {
        var dept = g('cf_dept').value;
        var ops = lookups.opcodes.filter(function (o) { return o.department_id === dept && (o.is_active || o.id === keepOp); });
        g('cf_opcode').innerHTML = OR.options(ops, function (o) { return o.id; }, function (o) { return o.op_code + ' — ' + o.operation_name; }, dept ? '— เลือก Code operation —' : '— เลือกแผนกก่อน —', keepOp);
        var surg = lookups.doctors.filter(function (d) { return d.doctor_type === 'SURGEON' && (d.is_active || d.id === keepSurgeon); });
        var inDept = surg.filter(function (d) { return d.department_id === dept || d.id === keepSurgeon; });
        var list = dept && inDept.length ? inDept : surg;
        g('cf_surgeon').innerHTML = OR.options(list, function (d) { return d.id; }, function (d) { return d.doctor_name; }, '— เลือกศัลยแพทย์ —', keepSurgeon);
        g('cf_surgeon_hint').textContent = dept && !inDept.length ? 'แผนกนี้ยังไม่มีศัลยแพทย์ที่ผูกไว้ แสดงศัลยแพทย์ทั้งหมด (ผูกแพทย์กับแผนกได้ที่ ตั้งค่า)' : '';
      }
      fillDeptDependent(v.operation_code_id, v.surgeon_id);
      OR.enhanceSelect(g('cf_surgeon'), 'คลิกเลือก หรือพิมพ์ชื่อศัลยแพทย์');
      OR.enhanceSelect(g('cf_anes'), 'คลิกเลือก หรือพิมพ์ชื่อ');
      g('cf_dept').addEventListener('change', function () { fillDeptDependent(null, null); });
      g('cf_opcode').addEventListener('change', function () {
        var o = lookups.opcodes.filter(function (x) { return x.id === g('cf_opcode').value; })[0];
        if (o && !g('cf_op').value.trim()) g('cf_op').value = o.operation_name;
      });

      /* ----- Code operation: ช่องพิมพ์ค้นหา (ค่าจริงเก็บใน select ที่ซ่อนไว้) ----- */
      var oIn = g('cf_opsearch'), oList = g('cf_oplist'), oClear = g('cf_opclear'), oSel = g('cf_opcode'), oActive = -1, oItems = [];
      function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
      function opLabel(o) { return o.op_code + ' — ' + o.operation_name; }
      function opById(id) { return lookups.opcodes.filter(function (x) { return x.id === id; })[0]; }
      function syncOpText() {
        var o = opById(oSel.value); oIn.value = o ? opLabel(o) : '';
        oClear.hidden = !o;
        oIn.placeholder = g('cf_dept').value ? 'พิมพ์ค้นหา เช่น Sx04 หรือ appendectomy' : 'เลือกแผนกก่อน หรือพิมพ์ค้นหาจากทุกแผนก';
      }
      function opClose() { oList.hidden = true; oIn.setAttribute('aria-expanded', 'false'); oActive = -1; }
      function opRender(query) {
        var dept = g('cf_dept').value, tokens = norm(query).split(' ').filter(Boolean);
        var pool = lookups.opcodes.filter(function (o) { return (o.is_active || o.id === oSel.value) && (!dept || o.department_id === dept); });
        oItems = pool.filter(function (o) { var h = norm(o.op_code + ' ' + o.operation_name); return tokens.every(function (t) { return h.indexOf(t) >= 0; }); });
        var shown = oItems.slice(0, 60), html = '';
        shown.forEach(function (o, i) {
          var dn = !dept ? (lookups.departments.filter(function (d) { return d.id === o.department_id; })[0] || {}).department_name : '';
          html += '<li role="option" data-i="' + i + '"><b>' + esc(o.op_code) + '</b> ' + esc(o.operation_name) + (dn ? ' <small>' + esc(dn) + '</small>' : '') + '</li>';
        });
        if (!shown.length) html = '<li class="none">ไม่พบ Code operation ที่ตรงกับ "' + esc(query) + '"</li>';
        else if (oItems.length > shown.length) html += '<li class="none">แสดง ' + shown.length + ' จาก ' + oItems.length + ' รายการ พิมพ์เพิ่มเพื่อกรอง</li>';
        oItems = shown; oList.innerHTML = html; oList.hidden = false; oIn.setAttribute('aria-expanded', 'true'); oActive = -1;
      }
      function opHighlight(i) {
        var lis = oList.querySelectorAll('li[data-i]'); if (!lis.length) return;
        oActive = (i + lis.length) % lis.length;
        lis.forEach(function (li, k) { li.classList.toggle('on', k === oActive); });
        lis[oActive].scrollIntoView({ block: 'nearest' });
      }
      function opPick(o) {
        if (g('cf_dept').value !== o.department_id) {            // เลือกจากทุกแผนก: ตั้งแผนกให้อัตโนมัติ
          g('cf_dept').value = o.department_id; fillDeptDependent(o.id, g('cf_surgeon').value || null);
        }
        oSel.value = o.id; oSel.dispatchEvent(new Event('change', { bubbles: true }));
        syncOpText(); opClose();
      }
      oIn.addEventListener('focus', function () { oIn.select(); opRender(''); });
      oIn.addEventListener('input', function () { oSel.value = ''; oClear.hidden = true; opRender(oIn.value); });
      oIn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (oList.hidden) opRender(oIn.value); opHighlight(oActive + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); opHighlight(oActive - 1); }
        else if (e.key === 'Enter') { if (!oList.hidden) { e.preventDefault(); var o = oItems[oActive >= 0 ? oActive : (oItems.length === 1 ? 0 : -1)]; if (o) opPick(o); } }
        else if (e.key === 'Escape') { opClose(); syncOpText(); }
      });
      oList.addEventListener('mousedown', function (e) {           // mousedown กัน input เสีย focus ก่อนคลิก
        var li = e.target.closest('li[data-i]'); if (!li) { e.preventDefault(); return; }
        e.preventDefault(); opPick(oItems[+li.dataset.i]);
      });
      oIn.addEventListener('blur', function () { setTimeout(function () { opClose(); syncOpText(); }, 120); });
      oClear.addEventListener('click', function () { oSel.value = ''; syncOpText(); oIn.focus(); });
      g('cf_dept').addEventListener('change', syncOpText);
      syncOpText();

      /* ----- แสดง/ซ่อนตามเงื่อนไข ----- */
      function toggles() {
        g('cf_cancel_box').hidden = g('cf_status').value !== 'CANCELLED';
        g('cf_er_time_box').hidden = !g('cf_er').checked;
        g('cf_risk_box').hidden = !g('cf_risk').checked;
      }
      ['cf_status', 'cf_er', 'cf_risk'].forEach(function (id) { g(id).addEventListener('change', toggles); });
      toggles();

      function autoPeriod() {
        if (periodTouched) return;
        var t = g('cf_arrive').value || g('cf_start').value;
        var p = suggestPeriod(g('cf_date').value, t);
        g('cf_period').value = p;
        g('cf_period_hint').textContent = p ? 'ระบบแนะนำจากเวลาและวันที่ (แก้ไขได้)' : '';
      }
      g('cf_period').addEventListener('change', function () { periodTouched = true; g('cf_period_hint').textContent = ''; });
      ['cf_date', 'cf_arrive', 'cf_start'].forEach(function (id) { g(id).addEventListener('change', autoPeriod); });
      if (!v.id) autoPeriod();

      /* ----- ปุ่ม "ตอนนี้": ใส่เวลาปัจจุบันด้วยการแตะครั้งเดียว ----- */
      ['cf_ertime', 'cf_arrive', 'cf_start', 'cf_end', 'cf_recov'].forEach(function (id) {
        var inp = g(id), box = document.createElement('div'), b = document.createElement('button');
        box.className = 'timebox'; inp.parentNode.insertBefore(box, inp); box.appendChild(inp);
        b.type = 'button'; b.className = 'now'; b.textContent = 'ตอนนี้'; b.title = 'ใส่เวลาปัจจุบัน';
        b.addEventListener('click', function () {
          var d = new Date(); inp.value = OR.pad(d.getHours()) + ':' + OR.pad(d.getMinutes());
          inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
        });
        box.appendChild(b);
      });
      // กรอกเวลาสิ้นสุดผ่าตัดแล้ว สถานะ "กำลังดำเนินการ" เปลี่ยนเป็น "เสร็จสิ้น" ให้เอง (แก้ไขได้)
      g('cf_end').addEventListener('change', function () {
        if (g('cf_end').value && g('cf_status').value === 'IN_PROGRESS' && !g('cf_status').disabled) { g('cf_status').value = 'COMPLETED'; g('cf_status').dispatchEvent(new Event('change', { bubbles: true })); OR.toast('ตั้งสถานะเป็น “เสร็จสิ้น” ให้แล้ว', ''); }
      });

      /* ----- แปลงเวลา HH:MM เป็น timestamp (ข้ามเที่ยงคืนได้) ----- */
      function buildTimes() {
        var date = g('cf_date').value, out = {}, errs = [], prev = null;
        [['admission_time', 'cf_ertime', 'เวลารับจาก ER', !g('cf_er').checked],
         ['or_entry_time', 'cf_arrive', 'คนไข้ถึง OR'], ['surgery_start_time', 'cf_start', 'เริ่มผ่าตัด'],
         ['surgery_end_time', 'cf_end', 'สิ้นสุดผ่าตัด'], ['or_exit_time', 'cf_recov', 'ออกจาก OR']].forEach(function (f) {
          var t = f[3] ? '' : g(f[1]).value;
          if (!t || !date) { out[f[0]] = null; return; }
          var d = new Date(date + 'T' + t + ':00'), wrapped = false;
          while (prev && d < prev) { d = new Date(d.getTime() + 86400000); wrapped = true; }
          if (wrapped && prev && d - prev > 12 * 3600000) errs.push('เวลา "' + f[2] + '" ย้อนหลังเกิน 12 ชั่วโมงจากขั้นตอนก่อนหน้า กรุณาตรวจสอบลำดับเวลา');
          out[f[0]] = d.toISOString(); prev = d;
        });
        return { times: out, errs: errs };
      }

      var api = { s2: s2, s3: s3, root: root };

      // บันทึกชื่อที่พิมพ์เองและยังไม่มีในรายชื่อบุคลากร ไว้ให้เลือกครั้งหน้า (ล้มเหลวได้ ไม่กระทบการบันทึก Case)
      api.saveNewStaff = async function () {
        if (lookups.staffMissing) return 0;
        var added = 0, rows = Array.prototype.slice.call(teamRows.querySelectorAll('.team-row'));
        for (var i = 0; i < rows.length; i++) {
          var name = rows[i].querySelector('.team-namebox input').value.trim(), role = rows[i].querySelector('.team-role').value;
          if (!name || name.length > 200) continue;
          if (lookups.staff.some(function (x) { return nrm(x.staff_name) === nrm(name); })) continue;
          try {
            var r = await OR.db.from('or_staff').insert({ staff_name: name, staff_role: role }).select('*').single();
            if (r.error && r.error.code === '23505') r = await OR.db.from('or_staff').select('*').eq('staff_name', name).single();
            if (r.error || !r.data) continue;
            if (!lookups.staff.some(function (x) { return x.id === r.data.id; })) { lookups.staff.push(r.data); added++; }
          } catch (e) { /* ข้าม */ }
        }
        if (added) OR.toast('จำชื่อบุคลากรใหม่ ' + added + ' คน ไว้ในรายชื่อแล้ว', 'ok');
        return added;
      };

      api.get = function () {
        var t = buildTimes().times;
        var types = OR.$$('#cf_risk_types input:checked', root).map(function (i) { return i.value; });
        var sup = g('cf_supplies').value;
        var st = g('cf_status').value;
        var risk = g('cf_risk').checked;
        var p = {
          surgery_date: g('cf_date').value, case_type: g('cf_type').value, urgency: g('cf_urgency').value,
          from_er: g('cf_er').checked, department_id: g('cf_dept').value || null,
          operation_code_id: g('cf_opcode').value || null,
          diagnosis: g('cf_dx').value.trim(), operation_name: g('cf_op').value.trim(),
          icd9_code: g('cf_icd9').value.trim() || null, site: g('cf_site').value || null, fracture_type: g('cf_fx').value || null,
          surgeon_id: g('cf_surgeon').value || null, anesthesiologist_id: g('cf_anes').value || null,
          room_id: g('cf_room').value || null, anesthesia_type_id: g('cf_antype').value || null,
          admission_time: t.admission_time, or_entry_time: t.or_entry_time, surgery_start_time: t.surgery_start_time,
          surgery_end_time: t.surgery_end_time, or_exit_time: t.or_exit_time,
          case_status: st, cancel_reason: st === 'CANCELLED' ? g('cf_cancel').value.trim() : null,
          result: g('cf_result').value.trim() || null, wound_class: g('cf_wound').value || null,
          work_period: g('cf_period').value || null, ward: g('cf_ward').value.trim() || null, team: g('cf_team').value.trim() || null,
          has_risk: risk, risk_types: risk ? types : [], risk_detail: risk ? (g('cf_risk_detail').value.trim() || null) : null,
          supplies_checked: sup === '' ? null : sup === '1', ods_mis: g('cf_ods').checked,
          notes: g('cf_notes').value.trim() || null
        };
        return p;
      };

      // คืนรายการข้อความผิดพลาด (ว่าง = ผ่าน) ตามขั้นตอน: 2, 3 หรือทั้งหมด
      api.validate = function (step) {
        var p = api.get(), e = [];
        if (step !== 3) {
          if (!p.surgery_date) e.push('กรุณาระบุวันที่ผ่าตัด');
          if (!p.case_type) e.push('กรุณาเลือกประเภทการผ่าตัด (Major / Minor / LA)');
          if (!p.department_id) e.push('กรุณาเลือกแผนก');
          if (!p.diagnosis) e.push('กรุณากรอก Diagnosis');
          if (!p.operation_name) e.push('กรุณากรอก Operation');
          if (!p.surgeon_id) e.push('กรุณาเลือกศัลยแพทย์');
        }
        if (step !== 2) {
          var bt = buildTimes(); e = e.concat(bt.errs);
          if (p.case_status === 'CANCELLED' && !p.cancel_reason) e.push('กรุณาระบุเหตุผลการยกเลิก');
          if (p.case_status === 'COMPLETED') {
            if (!p.room_id) e.push('Case ที่เสร็จสิ้นต้องระบุห้องผ่าตัด');
            if (!p.surgery_start_time || !p.surgery_end_time) e.push('Case ที่เสร็จสิ้นต้องระบุเวลาเริ่มและสิ้นสุดผ่าตัด');
            if (!p.operation_code_id) e.push('Case ที่เสร็จสิ้นต้องเลือก Code operation (ใช้นับยอดรายเดือน)');
          }
          var seq = [p.admission_time, p.or_entry_time, p.surgery_start_time, p.surgery_end_time, p.or_exit_time].filter(Boolean);
          for (var i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) { e.push('ลำดับเวลาไม่ถูกต้อง'); break; }
        }
        return e;
      };
      api.focusDate = function () { g('cf_date').focus(); };
      api.focusFirst = function () { var q = g('cf_opsearch'); if (q) q.focus(); };
      return api;
    }
  };
})();
