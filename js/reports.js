// รายงาน: 6 ประเภทตามสเปก + สรุปยอดประจำเดือน + รายชื่อผ่าตัดซ้ำ (ตามทะเบียนเดิม)
// หลักการนับ: หน่วยนับ = Case · COMPLETED = ผ่าตัดสำเร็จ · CANCELLED ไม่นับ · POSTPONED แสดงแยก · ผู้ป่วย (คน) แยกจาก Case
(async function () {
  var ctx = await OR.init('reports.html', ['ADMIN', 'STAFF', 'VIEWER']);
  if (!ctx) return;
  var $ = OR.$, esc = OR.esc;
  var lookups;
  try { lookups = await OR.loadLookups(true); } catch (e) { OR.fatal('โหลดข้อมูลหลักไม่สำเร็จ: ' + OR.errMsg(e)); return; }

  var TABS = [['daily', 'รายวัน'], ['monthly', 'รายเดือน / รายปี'], ['doctor', 'รายแพทย์'], ['department', 'รายแผนก'], ['room', 'ห้องผ่าตัด'], ['type', 'ประเภทการผ่าตัด'], ['summary', 'สรุปยอดประจำเดือน'], ['repeat', 'ผ่าตัดซ้ำ']];
  var COL = { COMPLETED: '#2f9e7a', IN_PROGRESS: '#0b6fb8', POSTPONED: '#e0a030', CANCELLED: '#d65a4e' };
  var COLS = 'id,case_number,surgery_date,case_type,case_status,urgency,from_er,fracture_type,wound_class,work_period,anesthesia_group,anesthesia_code,department_id,department_name,surgeon_id,surgeon_name,anesthesiologist_id,anesthesiologist_name,room_number,patient_id,hn,patient_name,age_years,diagnosis,operation_name,operation_code_id,op_code,op_code_name';
  var S = { rows: null, tab: 'daily', view: null, chart: null, filt: null, seq: 0, opt: { gran: 'month', docRole: 'surgeon', zero: false } };

  var main = document.getElementById('main');
  main.innerHTML =
    '<div class="pagehead"><div><h1>รายงาน</h1><p>นับเป็น Case: เสร็จสิ้น = ผ่าตัดสำเร็จ · เลื่อนแสดงแยก · ยกเลิกไม่นับเป็นผ่าตัดสำเร็จ · จำนวนผู้ป่วย (คน) แยกจากจำนวน Case</p></div></div>' +
    '<div class="card"><div class="toolbar">' +
    '<div><label for="rFrom">วันที่เริ่มต้น</label><input id="rFrom" type="date"></div><div><label for="rTo">วันที่สิ้นสุด</label><input id="rTo" type="date"></div>' +
    '<div><label for="rType">ประเภทการผ่าตัด</label><select id="rType">' + OR.enumOptions(OR.L.caseType, 'ทั้งหมด') + '</select></div>' +
    '<div><label for="rDept">แผนก</label><select id="rDept">' + OR.options(lookups.departments, function (d) { return d.id; }, function (d) { return d.department_name; }, 'ทั้งหมด') + '</select></div>' +
    '<div><label for="rDoc">แพทย์ (ศัลยแพทย์/วิสัญญี)</label><select id="rDoc">' + OR.options(lookups.doctors, function (d) { return d.id; }, function (d) { return d.doctor_name + ' (' + OR.L.docType[d.doctor_type] + ')'; }, 'ทั้งหมด') + '</select></div>' +
    '<div><label for="rRoom">ห้องผ่าตัด</label><select id="rRoom">' + OR.options(lookups.rooms, function (r) { return r.id; }, function (r) { return r.room_name; }, 'ทั้งหมด') + '</select></div>' +
    '<div class="actions"><button class="btn pri" id="rRun" type="button">แสดงรายงาน</button></div></div></div>' +
    '<div class="tabs" id="tabs" style="margin-top:16px" role="tablist"></div>' +
    '<div id="opt"></div><div id="err"></div><div id="out"></div>';

  $('#rFrom').value = OR.firstOfMonth(); $('#rTo').value = OR.today();
  $('#rRun').onclick = run;
  OR.$$('.toolbar input,.toolbar select').forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); }); });

  function drawTabs() {
    $('#tabs').innerHTML = TABS.map(function (t) { return '<button type="button" role="tab" data-t="' + t[0] + '" class="' + (t[0] === S.tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    OR.$$('#tabs button').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.t; history.replaceState(null, '', '#' + S.tab); drawTabs(); render(); }; });
  }
  var h = location.hash.slice(1); if (TABS.some(function (t) { return t[0] === h; })) S.tab = h;
  drawTabs();

  /* ---------------- ดึงข้อมูล ---------------- */
  async function run() {
    var from = $('#rFrom').value, to = $('#rTo').value;
    if (!from || !to) { $('#err').innerHTML = '<div class="alert err">กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด</div>'; return; }
    if (from > to) { $('#err').innerHTML = '<div class="alert err">วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด</div>'; return; }
    var my = ++S.seq, f = { from: from, to: to, type: $('#rType').value, dept: $('#rDept').value, doc: $('#rDoc').value, room: $('#rRoom').value };
    $('#err').innerHTML = ''; $('#out').innerHTML = '<div class="loading"><span class="spin"></span> กำลังโหลดข้อมูล...</div>'; OR.busy($('#rRun'), true, 'กำลังโหลด...');
    try {
      var rows = await OR.fetchAll(function () {
        var q = OR.db.from('v_surgery_cases').select(COLS).gte('surgery_date', f.from).lte('surgery_date', f.to);
        if (f.type) q = q.eq('case_type', f.type);
        if (f.dept) q = q.eq('department_id', f.dept);
        if (f.doc) q = q.or('surgeon_id.eq.' + f.doc + ',anesthesiologist_id.eq.' + f.doc);
        if (f.room) q = q.eq('room_id', f.room);
        return q.order('surgery_date').order('id');
      });
      if (my !== S.seq) return;
      S.rows = rows; S.filt = f; render();
    } catch (e) { if (my === S.seq) { $('#out').innerHTML = ''; $('#err').innerHTML = '<div class="alert err">โหลดรายงานไม่สำเร็จ: ' + esc(OR.errMsg(e)) + '</div>'; } }
    finally { OR.busy($('#rRun'), false); }
  }

  /* ---------------- ตัวช่วยคำนวณ ---------------- */
  function agg(rows, keyFn) {
    var m = {}, order = [];
    rows.forEach(function (r) {
      var k = keyFn(r), g = m[k];
      if (!g) { g = m[k] = { key: k, total: 0, completed: 0, inprog: 0, postponed: 0, cancelled: 0, major: 0, minor: 0, la: 0, pts: {} }; order.push(k); }
      g.total++;
      if (r.case_status === 'COMPLETED') {
        g.completed++; g.pts[r.patient_id] = 1;
        if (r.case_type === 'MAJOR') g.major++; else if (r.case_type === 'MINOR') g.minor++; else if (r.case_type === 'LA') g.la++;
      } else if (r.case_status === 'IN_PROGRESS') g.inprog++;
      else if (r.case_status === 'POSTPONED') g.postponed++;
      else if (r.case_status === 'CANCELLED') g.cancelled++;
    });
    return order.map(function (k) { return m[k]; });
  }
  var HEAD = ['Case ทั้งหมด', 'เสร็จสิ้น', 'กำลังดำเนินการ', 'เลื่อน', 'ยกเลิก', 'Major', 'Minor', 'LA', 'ผู้ป่วย (คน)'];
  function groupTable(title, first, groups, labelFn, allRows) {
    var rows = groups.map(function (g) { return [labelFn(g)].concat([g.total, g.completed, g.inprog, g.postponed, g.cancelled, g.major, g.minor, g.la, Object.keys(g.pts).length]); });
    var tot = agg(allRows, function () { return 'x'; })[0] || { total: 0, completed: 0, inprog: 0, postponed: 0, cancelled: 0, major: 0, minor: 0, la: 0, pts: {} };
    return {
      title: title, head: [first].concat(HEAD), rows: rows,
      foot: ['รวม', tot.total, tot.completed, tot.inprog, tot.postponed, tot.cancelled, tot.major, tot.minor, tot.la, Object.keys(tot.pts).length],
      note: 'Major / Minor / LA และผู้ป่วย (คน) นับเฉพาะ Case ที่เสร็จสิ้น · ผู้ป่วย (คน) ในแถวรวมนับผู้ป่วยไม่ซ้ำ จึงอาจน้อยกว่าผลรวมของแถว'
    };
  }
  function chartOf(groups, labelFn, horizontal) {
    return {
      horizontal: !!horizontal, labels: groups.map(labelFn),
      datasets: [['completed', 'เสร็จสิ้น', COL.COMPLETED], ['inprog', 'กำลังดำเนินการ', COL.IN_PROGRESS], ['postponed', 'เลื่อน', COL.POSTPONED], ['cancelled', 'ยกเลิก', COL.CANCELLED]].map(function (d) {
        return { label: d[1], backgroundColor: d[2], data: groups.map(function (g) { return g[d[0]]; }) };
      })
    };
  }
  function cnt(rows, f) { return rows.filter(f).length; }

  /* ---------------- สร้างรายงานแต่ละแบบ ---------------- */
  var BUILD = {
    daily: function (rows) {
      var g = agg(rows, function (r) { return r.surgery_date; }).sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      var lab = function (x) { return OR.fmtDate(x.key); };
      return { title: 'รายงานประจำวัน (Daily Report)', tables: [groupTable('', 'วันที่', g, lab, rows)], chart: chartOf(g, function (x) { return x.key.slice(8) + '/' + x.key.slice(5, 7); }) };
    },
    monthly: function (rows) {
      var yearly = S.opt.gran === 'year', n = yearly ? 4 : 7;
      var g = agg(rows, function (r) { return r.surgery_date.slice(0, n); }).sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      var lab = function (x) { return yearly ? 'พ.ศ. ' + (+x.key + 543) : OR.fmtMonth(x.key); };
      return { title: yearly ? 'รายงานประจำปี (Yearly Report)' : 'รายงานประจำเดือน (Monthly Report)', tables: [groupTable('', yearly ? 'ปี' : 'เดือน', g, lab, rows)], chart: chartOf(g, lab) };
    },
    doctor: function (rows) {
      var an = S.opt.docRole === 'anes', idf = an ? 'anesthesiologist_id' : 'surgeon_id', nf = an ? 'anesthesiologist_name' : 'surgeon_name', names = {};
      rows.forEach(function (r) { names[r[idf] || 'none'] = r[nf]; });
      var g = agg(rows, function (r) { return r[idf] || 'none'; }).sort(function (a, b) { return b.completed - a.completed || b.total - a.total; });
      var lab = function (x) { return names[x.key] || 'ไม่ระบุ'; };
      return { title: 'รายงานรายแพทย์ — ' + (an ? 'วิสัญญีแพทย์' : 'ศัลยแพทย์'), tables: [groupTable('', an ? 'วิสัญญีแพทย์' : 'ศัลยแพทย์', g, lab, rows)], chart: chartOf(g.slice(0, 15), lab, true) };
    },
    department: function (rows) {
      var names = {}; rows.forEach(function (r) { names[r.department_id || 'none'] = r.department_name; });
      var g = agg(rows, function (r) { return r.department_id || 'none'; }).sort(function (a, b) { return b.completed - a.completed || b.total - a.total; });
      var lab = function (x) { return names[x.key] || 'ไม่ระบุแผนก'; };
      return { title: 'รายงานรายแผนก (Department Report)', tables: [groupTable('', 'แผนก', g, lab, rows)], chart: chartOf(g, lab, true) };
    },
    room: function (rows) {
      var g = agg(rows, function (r) { return r.room_number == null ? 'none' : r.room_number; }).sort(function (a, b) { return (a.key === 'none') - (b.key === 'none') || a.key - b.key; });
      var lab = function (x) { return x.key === 'none' ? 'ไม่ระบุห้อง' : 'ห้องผ่าตัด ' + x.key; };
      return { title: 'รายงานห้องผ่าตัด (Operating Room Report)', tables: [groupTable('', 'ห้องผ่าตัด', g, lab, rows)], chart: chartOf(g, lab) };
    },
    type: function (rows) {
      var order = ['MAJOR', 'MINOR', 'LA'];
      var g = agg(rows, function (r) { return r.case_type; }).sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
      var gu = agg(rows, function (r) { return r.urgency; });
      var ga = agg(rows, function (r) { return r.anesthesia_group || 'NONE'; });
      return {
        title: 'รายงานประเภทการผ่าตัด (Surgery Type Report)',
        tables: [groupTable('ตามประเภทการผ่าตัด', 'ประเภท', g, function (x) { return OR.lab(OR.L.caseType, x.key); }, rows),
          groupTable('ตามความเร่งด่วน', 'ความเร่งด่วน', gu, function (x) { return OR.lab(OR.L.urgency, x.key); }, rows),
          groupTable('ตามกลุ่มการระงับความรู้สึก', 'กลุ่ม', ga, function (x) { return x.key === 'NONE' ? 'ไม่ระบุ' : OR.L.anGroup[x.key]; }, rows)],
        chart: chartOf(g, function (x) { return OR.lab(OR.L.caseType, x.key); })
      };
    },
    repeat: function (rows) {
      var by = {};
      rows.filter(function (r) { return r.case_status === 'COMPLETED'; }).forEach(function (r) { (by[r.patient_id] = by[r.patient_id] || []).push(r); });
      var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (a) { return a.length >= 2; }).sort(function (a, b) { return b.length - a.length; });
      var body = [];
      list.forEach(function (a) {
        a.forEach(function (r, i) { body.push([i === 0 ? r.hn : '', i === 0 ? r.patient_name : '', i === 0 ? a.length : '', OR.fmtDate(r.surgery_date), r.case_number, r.operation_name || '-', r.department_name || '-']); });
      });
      return {
        title: 'รายชื่อผู้ป่วยผ่าตัดซ้ำในช่วงที่เลือก', chart: null,
        tables: [{ title: '', head: ['HN', 'ชื่อ-สกุล', 'จำนวนครั้ง', 'วันที่ผ่าตัด', 'เลข Case', 'Operation', 'แผนก'], rows: body, foot: ['ผู้ป่วยผ่าตัดซ้ำ (คน)', '', list.length, '', '', '', ''], note: 'นับเฉพาะ Case ที่เสร็จสิ้น ผู้ป่วยที่มี 2 Case ขึ้นไปในช่วงวันที่ที่เลือก' }]
      };
    },
    summary: function (rows, showZero) {
      var done = rows.filter(function (r) { return r.case_status === 'COMPLETED'; });
      var tables = [];
      var depts = lookups.departments.filter(function (d) { return d.is_active || done.some(function (r) { return r.department_id === d.id; }); });
      depts.forEach(function (d) {
        var dr = done.filter(function (r) { return r.department_id === d.id; }), by = {};
        dr.forEach(function (r) { if (r.operation_code_id) by[r.operation_code_id] = (by[r.operation_code_id] || 0) + 1; });
        var ops = lookups.opcodes.filter(function (o) { return o.department_id === d.id; });
        var body = ops.filter(function (o) { return showZero || by[o.id]; }).map(function (o) { return [o.op_code + ' · ' + o.operation_name, by[o.id] || 0]; });
        var nocode = dr.filter(function (r) { return !r.operation_code_id; }).length;
        if (nocode) body.push(['(ไม่ได้เลือก Code operation)', nocode]);
        if (!body.length && !dr.length && !showZero) return;
        tables.push({ title: d.department_name, head: ['รายการผ่าตัด', 'จำนวน (ราย)'], rows: body, foot: ['รวมผ่าตัดทั้งหมด', dr.length] });
      });
      var nodept = done.filter(function (r) { return !r.department_id; }).length;
      if (nodept) tables.push({ title: 'ไม่ระบุแผนก', head: ['รายการ', 'จำนวน (ราย)'], rows: [], foot: ['รวม', nodept] });

      var grp = function (rs, g) { return cnt(rs, function (r) { return r.anesthesia_group === g; }); };
      var el = done.filter(function (r) { return r.urgency === 'ELECTIVE'; }), em = done.filter(function (r) { return r.urgency === 'EMERGENCY'; });
      var other = function (rs) { return rs.length - grp(rs, 'GA') - grp(rs, 'RA') - grp(rs, 'LA'); };
      var T = [];
      T.push({ title: 'สรุปยอดตามความเร่งด่วนและการระงับความรู้สึก', head: ['ประเภท', 'GA (GA+TIVA+IVS)', 'RA (BB+SB)', 'LA (LA+MAC)', 'อื่น ๆ / ไม่ระบุ', 'รวม'],
        rows: [['Elective case', grp(el, 'GA'), grp(el, 'RA'), grp(el, 'LA'), other(el), el.length], ['Emergency case', grp(em, 'GA'), grp(em, 'RA'), grp(em, 'LA'), other(em), em.length]],
        foot: ['รวมทุกประเภท', grp(done, 'GA'), grp(done, 'RA'), grp(done, 'LA'), other(done), done.length] });
      var fx = function (k) { return cnt(done, function (r) { return r.fracture_type === k; }); };
      var openFx = fx('OPEN_G1') + fx('OPEN_G2') + fx('OPEN_G3');
      T.push({ title: 'ยอดรับผู้ป่วยจาก ER และ Fracture', head: ['รายการ', 'จำนวน (ราย)'], rows: [['ยอดรับผู้ป่วยจาก ER', cnt(done, function (r) { return r.from_er; })], ['Closed Fx', fx('CLOSED')], ['Open Fx Gr.1', fx('OPEN_G1')], ['Open Fx Gr.2', fx('OPEN_G2')], ['Open Fx Gr.3', fx('OPEN_G3')], ['รวม Open Fx. 3 Group', openFx]], foot: ['Total case Fx.', fx('CLOSED') + openFx] });
      var ih = cnt(done, function (r) { return r.work_period === 'IN_HOURS'; }), oh = cnt(done, function (r) { return r.work_period === 'OUT_HOURS'; });
      T.push({ title: 'ในเวลา / นอกเวลา', head: ['รายการ', 'จำนวน (ราย)'], rows: [['ในเวลา', ih], ['นอกเวลา', oh], ['ไม่ระบุ', done.length - ih - oh]], foot: ['รวมยอด ในเวลา + นอกเวลา', done.length] });
      var wc = function (k) { return cnt(done, function (r) { return r.wound_class === k; }); };
      T.push({ title: 'ประเภทแผลผ่าตัด', head: ['รายการ', 'จำนวน (ราย)'], rows: [['ประเภท 1 (Clean)', wc('CLEAN')], ['ประเภท 2 (Clean contaminated)', wc('CLEAN_CONTAMINATED')], ['ประเภท 3 (Contaminated)', wc('CONTAMINATED')], ['ประเภท 4 (Dirty)', wc('DIRTY')], ['ไม่ระบุ', cnt(done, function (r) { return !r.wound_class; })]], foot: ['รวมยอดผ่าตัด', done.length] });
      var pts = {}; done.forEach(function (r) { pts[r.patient_id] = (pts[r.patient_id] || 0) + 1; });
      var rep = Object.keys(pts).filter(function (k) { return pts[k] >= 2; }).length;
      T.push({ title: 'สรุปรวมทุกแผนก', head: ['รายการ', 'จำนวน'], rows: [['ผู้ป่วยที่มาผ่าตัดทั้งหมด (คน)', Object.keys(pts).length], ['ผู้ป่วยที่มาผ่าตัดซ้ำในช่วงที่เลือก (คน)', rep], ['Case ที่เลื่อน (ไม่นับ)', cnt(rows, function (r) { return r.case_status === 'POSTPONED'; })], ['Case ที่ยกเลิก (ไม่นับ)', cnt(rows, function (r) { return r.case_status === 'CANCELLED'; })], ['Case ที่กำลังดำเนินการ (ยังไม่นับ)', cnt(rows, function (r) { return r.case_status === 'IN_PROGRESS'; })]], foot: ['รวมผ่าตัดทั้งหมดทุกแผนก (Case ที่เสร็จสิ้น)', done.length] });
      return { title: 'สรุปยอดผ่าตัดประจำเดือน', tables: T.concat(tables), chart: null, grid: tables.length };
    }
  };

  /* ---------------- แสดงผล ---------------- */
  function subtitle() {
    var f = S.filt, p = ['ช่วงวันที่ ' + OR.fmtDate(f.from) + ' – ' + OR.fmtDate(f.to)];
    if (f.type) p.push('ประเภท: ' + OR.L.caseType[f.type]);
    if (f.dept) p.push('แผนก: ' + lookups.departments.filter(function (d) { return d.id === f.dept; }).map(function (d) { return d.department_name; })[0]);
    if (f.doc) p.push('แพทย์: ' + lookups.doctors.filter(function (d) { return d.id === f.doc; }).map(function (d) { return d.doctor_name; })[0]);
    if (f.room) p.push('ห้อง: ' + lookups.rooms.filter(function (r) { return r.id === f.room; }).map(function (r) { return r.room_name; })[0]);
    return p.join(' · ');
  }
  function tableHtml(t) {
    var num = function (v) { return typeof v === 'number' ? v.toLocaleString('th-TH') : esc(v == null ? '' : v); };
    var cell = function (tag, v) { return '<' + tag + (typeof v === 'number' ? ' class="num"' : '') + '>' + num(v) + '</' + tag + '>'; };
    return '<div class="tablewrap"><table><thead><tr>' + t.head.map(function (v, i) { return '<th' + (i ? ' class="num"' : '') + '>' + esc(v) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (t.rows.length ? t.rows.map(function (r) { return '<tr>' + r.map(function (v) { return cell('td', v); }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + t.head.length + '" class="empty">ไม่มีข้อมูล</td></tr>') +
      '</tbody>' + (t.foot ? '<tfoot><tr>' + t.foot.map(function (v) { return cell('td', v); }).join('') + '</tr></tfoot>' : '') + '</table></div>' + (t.note ? '<p class="note">' + esc(t.note) + '</p>' : '');
  }

  function optionsBar() {
    var o = $('#opt'); o.innerHTML = '';
    if (S.tab === 'monthly') { o.innerHTML = '<div class="toolbar"><div><label for="oG">แสดงเป็น</label><select id="oG"><option value="month">รายเดือน</option><option value="year">รายปี</option></select></div></div>'; $('#oG').value = S.opt.gran; $('#oG').onchange = function () { S.opt.gran = this.value; render(); }; }
    if (S.tab === 'doctor') { o.innerHTML = '<div class="toolbar"><div><label for="oD">แพทย์ประเภท</label><select id="oD"><option value="surgeon">ศัลยแพทย์</option><option value="anes">วิสัญญีแพทย์</option></select></div></div>'; $('#oD').value = S.opt.docRole; $('#oD').onchange = function () { S.opt.docRole = this.value; render(); }; }
    if (S.tab === 'summary') { o.innerHTML = '<div class="toolbar"><div><label class="chk"><input id="oZ" type="checkbox"' + (S.opt.zero ? ' checked' : '') + '> แสดงรายการผ่าตัดที่จำนวนเป็น 0 (ไฟล์ Excel จะมีทุกรายการเสมอ)</label></div></div>'; $('#oZ').onchange = function () { S.opt.zero = this.checked; render(); }; }
  }

  function render() {
    optionsBar();
    if (!S.rows) { $('#out').innerHTML = '<div class="empty">กำลังเตรียมรายงาน...</div>'; return; }
    var v = BUILD[S.tab](S.rows, S.tab === 'summary' ? S.opt.zero : undefined);
    v.subtitle = subtitle() + ' · นับเป็น Case'; S.view = v;
    var h = '<div class="card"><div class="pagehead" style="margin-bottom:8px"><div><h2>' + esc(v.title) + '</h2><p class="note">' + esc(v.subtitle) + ' · ทั้งหมด ' + S.rows.length.toLocaleString('th-TH') + ' Case</p></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      (ctx.canEdit ? '<label class="chk" style="min-height:40px"><input id="xDetail" type="checkbox"> รวมรายการรายตัว (มี HN/ชื่อ) ใน Excel</label>' : '') +
      '<button class="btn" id="xXlsx" type="button">Export Excel</button><button class="btn" id="xPdf" type="button">Export PDF</button></div></div>';
    if (v.chart) h += '<div class="chartbox" style="height:' + (v.chart.horizontal ? Math.max(260, v.chart.labels.length * 34 + 90) : 320) + 'px;margin-bottom:16px"><canvas id="rChart"></canvas></div>';
    if (S.tab === 'summary') {
      h += v.tables.slice(0, v.tables.length - v.grid).map(function (t) { return '<h3 style="margin:16px 0 8px">' + esc(t.title) + '</h3>' + tableHtml(t); }).join('') +
        '<h3 style="margin:22px 0 4px">จำนวนตามรายการผ่าตัดของแต่ละแผนก (Code operation)</h3><div class="sumgrid" style="margin-top:8px">' +
        v.tables.slice(v.tables.length - v.grid).map(function (t) { return '<div><h3 style="margin:0 0 6px">' + esc(t.title) + '</h3>' + tableHtml(t) + '</div>'; }).join('') + '</div>';
    } else h += v.tables.map(function (t) { return (t.title ? '<h3 style="margin:16px 0 8px">' + esc(t.title) + '</h3>' : '') + tableHtml(t); }).join('');
    $('#out').innerHTML = h + '</div>';
    if (v.chart) { v.chartId = 'rChart'; drawChart(v.chart); }
    $('#xXlsx').onclick = function () { exportXlsx(v); };
    $('#xPdf').onclick = function () { OR.exportPdf({ title: v.title, subtitle: v.subtitle, tables: exportTables(v), chart: v.chart ? 'rChart' : null }); };
  }

  function drawChart(c) {
    if (S.chart) S.chart.destroy();
    Chart.defaults.font.family = "'Sarabun', sans-serif"; Chart.defaults.font.size = 13;
    var hz = c.horizontal;
    S.chart = new Chart($('#rChart'), {
      type: 'bar', data: { labels: c.labels, datasets: c.datasets },
      options: { indexAxis: hz ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: false,
        scales: { x: { stacked: true, beginAtZero: true, grid: { display: hz }, ticks: { precision: 0 } }, y: { stacked: true, beginAtZero: true, grid: { display: !hz }, ticks: { precision: 0 } } },
        plugins: { legend: { position: 'bottom' } } }
    });
  }

  // ตารางสำหรับ export: สรุปยอดเอา Code operation ครบทุกรายการ (รวมที่เป็น 0) ให้เหมือนแบบฟอร์มเดิม
  function exportTables(v) { return S.tab === 'summary' ? BUILD.summary(S.rows, true).tables : v.tables; }

  function exportXlsx(v) {
    var ev = { title: v.title, subtitle: v.subtitle, tables: exportTables(v), extraSheets: [] };
    var d = $('#xDetail');
    if (d && d.checked && S.rows.length) {
      ev.extraSheets.push({
        name: 'รายการ Case', head: ['เลข Case', 'วันที่ผ่าตัด', 'HN', 'ชื่อ-สกุล', 'อายุ', 'ประเภท', 'ความเร่งด่วน', 'แผนก', 'Code operation', 'Diagnosis', 'Operation', 'ศัลยแพทย์', 'วิสัญญีแพทย์', 'ห้อง', 'ยาระงับ', 'ในเวลา/นอกเวลา', 'สถานะ'],
        rows: S.rows.map(function (r) { return [r.case_number, OR.fmtDate(r.surgery_date), r.hn, r.patient_name, r.age_years == null ? '' : r.age_years, OR.lab(OR.L.caseType, r.case_type), OR.lab(OR.L.urgency, r.urgency), r.department_name || '', r.op_code || '', r.diagnosis || '', r.operation_name || '', r.surgeon_name || '', r.anesthesiologist_name || '', r.room_number == null ? '' : r.room_number, r.anesthesia_code || '', r.work_period ? OR.L.period[r.work_period] : '', OR.lab(OR.L.status, r.case_status)]; })
      });
    }
    OR.exportExcel(ev, 'OR-Report-' + S.tab + '-' + S.filt.from + '_' + S.filt.to);
  }

  run();
})();
