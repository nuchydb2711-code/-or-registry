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
        '<div><label for="cf_opcode">Code operation (ใช้นับยอดรายเดือน)</label><select id="cf_opcode"></select></div>' +
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
        '<div class="full team-panel"><div class="team-head"><div><label>ทีมผ่าตัด (OR Team)</label><div class="hint">เลือกบทบาทและระบุชื่อผู้ปฏิบัติงาน เพิ่มได้หลายคน ระบบจะบันทึกชื่อพร้อมตำแหน่ง</div></div><button class="btn sm" id="cf_team_add" type="button">＋ เพิ่มบุคลากร</button></div><div id="cf_team_rows"></div><input id="cf_team" type="hidden" value="' + esc(v.team || '') + '"></div>' +
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

      /* ----- ทีมผ่าตัด: เลือกบทบาท + ระบุชื่อ บันทึกลงคอลัมน์ team เดิมเพื่อไม่ต้องแก้ฐานข้อมูล ----- */
      var teamRoles = [
        ['SURGICAL_ASSISTANT', 'Surgical Assistant'],
        ['SCRUB_NURSE', 'Scrub Nurse'],
        ['CIRCULATING_NURSE', 'Circulating Nurse'],
        ['NA', 'NA'],
        ['ANESTHESIOLOGIST', 'Anesthesiologist'],
        ['ANESTHESIA_NURSE', 'Anesthesia Nurse'],
        ['OTHER', 'Other / Legacy']
      ];
      var teamRows = g('cf_team_rows');
      function addTeamRow(role, name) {
        var row = document.createElement('div'); row.className = 'team-row';
        row.innerHTML = '<select aria-label="ตำแหน่งในทีม" class="team-role">' + teamRoles.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === (role || 'SCRUB_NURSE') ? ' selected' : '') + '> ' + r[1] + '</option>'; }).join('') + '</select>' +
          '<input class="team-name" type="text" maxlength="120" placeholder="ชื่อ-สกุลบุคลากร" aria-label="ชื่อบุคลากร" value="' + esc(name || '') + '">' +
          '<button class="team-remove" type="button" aria-label="ลบบุคลากร" title="ลบ">×</button>';
        row.querySelector('.team-remove').addEventListener('click', function () { row.remove(); syncTeam(); });
        row.querySelectorAll('select,input').forEach(function (el) { el.addEventListener('change', syncTeam); el.addEventListener('input', syncTeam); });
        teamRows.appendChild(row); syncTeam();
      }
      function syncTeam() {
        var lines = Array.prototype.slice.call(teamRows.querySelectorAll('.team-row')).map(function (row) {
          var role = row.querySelector('.team-role'), name = row.querySelector('.team-name').value.trim();
          var label = (teamRoles.filter(function (r) { return r[0] === role.value; })[0] || teamRoles[4])[1];
          return name ? label + ': ' + name : '';
        }).filter(Boolean);
        g('cf_team').value = lines.join(' | ');
      }
      var oldTeam = (v.team || '').trim();
      if (oldTeam) addTeamRow('OTHER', oldTeam); else addTeamRow('SURGICAL_ASSISTANT', '');
      g('cf_team_add').addEventListener('click', function () { addTeamRow('SURGICAL_ASSISTANT', ''); });

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
      g('cf_dept').addEventListener('change', function () { fillDeptDependent(null, null); });
      g('cf_opcode').addEventListener('change', function () {
        var o = lookups.opcodes.filter(function (x) { return x.id === g('cf_opcode').value; })[0];
        if (o && !g('cf_op').value.trim()) g('cf_op').value = o.operation_name;
      });

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
      return api;
    }
  };
})();
