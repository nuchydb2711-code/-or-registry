// Dashboard: ตัวเลขและกราฟทั้งหมดดึงจากฐานข้อมูลจริง (หน่วยนับ = Case)
(async function () {
  var ctx = await OR.init('dashboard.html', ['ADMIN', 'STAFF', 'VIEWER']);
  if (!ctx) return;
  var $ = OR.$, esc = OR.esc, charts = {}, seq = 0;
  var COL = { COMPLETED: '#2f9e7a', IN_PROGRESS: '#0b6fb8', POSTPONED: '#e0a030', CANCELLED: '#d65a4e' };

  document.getElementById('main').innerHTML =
    '<div class="pagehead"><div><h1>ภาพรวมห้องผ่าตัด</h1><p>ข้อมูลจากทะเบียนจริง หน่วยนับเป็น Case (ไม่ใช่จำนวนผู้ป่วย)</p></div>' +
    '<div class="toolbar" style="margin:0"><div><label for="dFrom">ตั้งแต่</label><input id="dFrom" type="date"></div><div><label for="dTo">ถึง</label><input id="dTo" type="date"></div>' +
    '<div class="actions"><button class="btn" id="dMonth" type="button">เดือนนี้</button><button class="btn" id="dYear" type="button">ปีนี้</button></div></div></div>' +
    '<div id="err"></div><div class="kpis" id="kpis"></div>' +
    '<div class="charts"><div class="card"><h2>จำนวน Case รายวัน</h2><div class="chartbox"><canvas id="cDaily"></canvas></div><div class="note" id="dailyNote"></div></div>' +
    '<div class="card"><h2>จำนวน Case รายเดือน (12 เดือนล่าสุด)</h2><div class="chartbox"><canvas id="cMonthly"></canvas></div></div>' +
    '<div class="card"><h2>สัดส่วนประเภทการผ่าตัด</h2><div class="chartbox"><canvas id="cType"></canvas></div></div>' +
    '<div class="card"><h2>จำนวน Case แยกตามห้องผ่าตัด</h2><div class="chartbox"><canvas id="cRoom"></canvas></div></div></div>' +
    '<p class="note" style="margin-top:14px">ตัวเลข “Case ทั้งหมด” และประเภท Major/Minor/LA นับทุกสถานะรวมกัน · กราฟรายเดือนแสดง Case ทั้งหมดเทียบกับที่เสร็จสิ้น · ห้องผ่าตัดไม่นับ Case ที่ยกเลิก/เลื่อน</p>';

  var set = function (a, b) { $('#dFrom').value = a; $('#dTo').value = b; load(); };
  $('#dMonth').onclick = function () { set(OR.firstOfMonth(), OR.today()); };
  $('#dYear').onclick = function () { set(new Date().getFullYear() + '-01-01', OR.today()); };
  $('#dFrom').onchange = $('#dTo').onchange = function () { load(); };

  function mk(id, cfg) {
    if (charts[id]) charts[id].destroy();
    Chart.defaults.font.family = "'Sarabun', sans-serif"; Chart.defaults.font.size = 13;
    charts[id] = new Chart($('#' + id), cfg);
  }
  function count(rows, f) { var o = {}; rows.forEach(function (r) { var k = f(r); o[k] = (o[k] || 0) + 1; }); return o; }

  async function load() {
    var my = ++seq, from = $('#dFrom').value, to = $('#dTo').value;
    if (!from || !to || from > to) { $('#err').innerHTML = '<div class="alert err">ช่วงวันที่ไม่ถูกต้อง</div>'; return; }
    $('#err').innerHTML = ''; $('#kpis').innerHTML = '<div class="loading" style="grid-column:1/-1"><span class="spin"></span> กำลังโหลด...</div>';
    try {
      var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11);
      var mFrom = OR.isoDate(d);
      var res = await Promise.all([
        OR.fetchAll(function () { return OR.db.from('v_surgery_cases').select('id,surgery_date,case_type,case_status,room_number,urgency').gte('surgery_date', from).lte('surgery_date', to).order('surgery_date').order('id'); }),
        OR.fetchAll(function () { return OR.db.from('v_surgery_cases').select('id,surgery_date,case_status').gte('surgery_date', mFrom).lte('surgery_date', OR.today()).order('surgery_date').order('id'); })
      ]);
      if (my !== seq) return;
      draw(res[0], res[1], from, to, mFrom);
    } catch (e) { if (my === seq) { $('#kpis').innerHTML = ''; $('#err').innerHTML = '<div class="alert err">โหลดข้อมูลไม่สำเร็จ: ' + esc(OR.errMsg(e)) + ' <button class="btn sm" id="rt" type="button">ลองใหม่</button></div>'; $('#rt').onclick = load; } }
  }

  function draw(rows, mrows, from, to, mFrom) {
    var ty = count(rows, function (r) { return r.case_type; }), stt = count(rows, function (r) { return r.case_status; });
    var k = function (cls, label, v) { return '<div class="kpi ' + cls + '"><span>' + label + '</span><b>' + (v || 0).toLocaleString('th-TH') + '</b></div>'; };
    $('#kpis').innerHTML = k('', 'Case ทั้งหมด', rows.length) + k('', 'Major', ty.MAJOR) + k('', 'Minor', ty.MINOR) + k('', 'LA', ty.LA) +
      k('g', 'เสร็จสิ้น', stt.COMPLETED) + k('', 'กำลังดำเนินการ', stt.IN_PROGRESS) + k('w', 'เลื่อน', stt.POSTPONED) + k('r', 'ยกเลิก', stt.CANCELLED) +
      k('r', 'Emergency', rows.filter(function (r) { return r.urgency === 'EMERGENCY'; }).length);

    /* รายวัน (สูงสุด 93 วัน) */
    var days = [], cur = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00');
    while (cur <= end) { days.push(OR.isoDate(cur)); cur.setDate(cur.getDate() + 1); }
    var cut = days.length > 93; if (cut) days = days.slice(-93);
    $('#dailyNote').textContent = cut ? 'แสดง 93 วันสุดท้ายของช่วงที่เลือก' : '';
    var byDay = {}; rows.forEach(function (r) { (byDay[r.surgery_date] = byDay[r.surgery_date] || {})[r.case_status] = ((byDay[r.surgery_date] || {})[r.case_status] || 0) + 1; });
    mk('cDaily', {
      type: 'bar', data: {
        labels: days.map(function (x) { return x.slice(8) + '/' + x.slice(5, 7); }),
        datasets: ['COMPLETED', 'IN_PROGRESS', 'POSTPONED', 'CANCELLED'].map(function (s) { return { label: OR.L.status[s], backgroundColor: COL[s], data: days.map(function (x) { return (byDay[x] || {})[s] || 0; }) }; })
      }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }
    });

    /* รายเดือน 12 เดือน */
    var months = [], m = new Date(mFrom + 'T00:00:00');
    for (var i = 0; i < 12; i++) { months.push(m.getFullYear() + '-' + OR.pad(m.getMonth() + 1)); m.setMonth(m.getMonth() + 1); }
    var tot = count(mrows, function (r) { return r.surgery_date.slice(0, 7); });
    var don = count(mrows.filter(function (r) { return r.case_status === 'COMPLETED'; }), function (r) { return r.surgery_date.slice(0, 7); });
    mk('cMonthly', {
      type: 'bar', data: {
        labels: months.map(OR.fmtMonth), datasets: [
          { label: 'Case ทั้งหมด', backgroundColor: '#9fcdec', data: months.map(function (x) { return tot[x] || 0; }) },
          { label: 'เสร็จสิ้น', backgroundColor: COL.COMPLETED, data: months.map(function (x) { return don[x] || 0; }) }]
      }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }
    });

    /* สัดส่วนประเภท */
    mk('cType', {
      type: 'doughnut', data: { labels: ['Major', 'Minor', 'LA'], datasets: [{ data: [ty.MAJOR || 0, ty.MINOR || 0, ty.LA || 0], backgroundColor: ['#4f46e5', '#0b6fb8', '#2f9e7a'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    /* ห้องผ่าตัด (ไม่นับยกเลิก/เลื่อน) */
    var rm = count(rows.filter(function (r) { return r.room_number != null && r.case_status !== 'CANCELLED' && r.case_status !== 'POSTPONED'; }), function (r) { return r.room_number; });
    var nums = Object.keys(rm).map(Number).sort(function (a, b) { return a - b; });
    if (!nums.length) nums = [1, 2, 3, 4, 5, 6, 7];
    mk('cRoom', {
      type: 'bar', data: { labels: nums.map(function (n) { return 'ห้อง ' + n; }), datasets: [{ label: 'Case', backgroundColor: '#0b6fb8', data: nums.map(function (n) { return rm[n] || 0; }) }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } }
    });
  }
  set(OR.firstOfMonth(), OR.today());
})();
