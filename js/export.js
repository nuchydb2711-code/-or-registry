// Export รายงานเป็น Excel (.xlsx) และ PDF
// view = { title, subtitle, tables:[{title, head:[], rows:[[]], foot:[], note}], chart:canvasId|null, extraSheets:[{name, head, rows}] }
(function () {
  var esc = OR.esc;

  function safeSheet(n, used) {
    var s = String(n || 'Sheet').replace(/[:\\\/?*\[\]]/g, ' ').trim().slice(0, 31) || 'Sheet', k = s, i = 2;
    while (used[k]) k = s.slice(0, 28) + '_' + i++;
    used[k] = 1; return k;
  }
  function widths(aoa) {
    var w = [];
    aoa.forEach(function (r) { r.forEach(function (c, i) { var l = c == null ? 0 : String(c).length; if (!w[i] || l > w[i]) w[i] = l; }); });
    return w.map(function (x) { return { wch: Math.min(Math.max(x + 2, 8), 50) }; });
  }

  OR.exportExcel = function (view, filename) {
    if (typeof XLSX === 'undefined') { OR.toast('โหลดไลบรารี Excel ไม่สำเร็จ', 'err'); return; }
    var wb = XLSX.utils.book_new(), used = {};
    // ทุกตารางของรายงานอยู่ในชีตเดียว เรียงต่อกัน
    var aoa = [[view.title], [view.subtitle], []];
    view.tables.forEach(function (t) {
      if (t.title) aoa.push([t.title]);
      aoa.push(t.head);
      t.rows.forEach(function (r) { aoa.push(r); });
      if (t.foot) aoa.push(t.foot);
      if (t.note) aoa.push([t.note]);
      aoa.push([]);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = widths(aoa.slice(3));
    XLSX.utils.book_append_sheet(wb, ws, safeSheet('รายงาน', used));
    (view.extraSheets || []).forEach(function (s) {
      var a = [s.head].concat(s.rows), w = XLSX.utils.aoa_to_sheet(a); w['!cols'] = widths(a);
      XLSX.utils.book_append_sheet(wb, w, safeSheet(s.name, used));
    });
    try { XLSX.writeFile(wb, filename + '.xlsx'); OR.toast('สร้างไฟล์ Excel แล้ว', 'ok'); }
    catch (e) { OR.toast('สร้างไฟล์ Excel ไม่สำเร็จ: ' + OR.errMsg(e), 'err'); }
  };

  // PDF: เปิดหน้าสำหรับพิมพ์ แล้วให้เลือก "บันทึกเป็น PDF" (รองรับฟอนต์ไทยของเบราว์เซอร์)
  OR.exportPdf = function (view) {
    var w = window.open('', '_blank');
    if (!w) { OR.toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up ของเว็บนี้แล้วลองอีกครั้ง', 'err', 8000); return; }
    var img = '';
    if (view.chart) { var cv = document.getElementById(view.chart); if (cv) { try { img = '<img class="chart" src="' + cv.toDataURL('image/png') + '" alt="กราฟ">'; } catch (e) { /* ข้ามกราฟ */ } } }
    var num = function (v) { return typeof v === 'number' ? v.toLocaleString('th-TH') : esc(v == null ? '' : v); };
    var tables = view.tables.map(function (t) {
      var td = function (r, tag) { return '<tr>' + r.map(function (c, i) { return '<' + tag + (typeof c === 'number' ? ' class="n"' : '') + '>' + num(c) + '</' + tag + '>'; }).join('') + '</tr>'; };
      return (t.title ? '<h2>' + esc(t.title) + '</h2>' : '') + '<table><thead>' + td(t.head, 'th') + '</thead><tbody>' + t.rows.map(function (r) { return td(r, 'td'); }).join('') + '</tbody>' + (t.foot ? '<tfoot>' + td(t.foot, 'td') + '</tfoot>' : '') + '</table>' + (t.note ? '<p class="note">' + esc(t.note) + '</p>' : '');
    }).join('');
    w.document.open();
    w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + esc(view.title) + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap">' +
      '<style>@page{size:A4 landscape;margin:12mm}body{font:12px/1.5 Sarabun,Tahoma,sans-serif;color:#111}h1{font-size:18px;margin:0}h2{font-size:14px;margin:16px 0 6px}.sub{color:#555;margin:2px 0 10px}' +
      'table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #999;padding:4px 7px;text-align:left}th{background:#e6f2fb}td.n,th.n{text-align:right}tfoot td{font-weight:700;background:#f0f0f0}' +
      '.note{color:#555;font-size:11px;margin:2px 0 8px}.chart{max-width:100%;max-height:300px;margin:8px 0}.foot{margin-top:14px;color:#777;font-size:11px}tr{page-break-inside:avoid}</style></head><body>' +
      '<h1>' + esc(view.title) + '</h1><div class="sub">' + esc(view.subtitle) + '</div>' + img + tables +
      '<div class="foot">พิมพ์เมื่อ ' + esc(OR.fmtDateTime(new Date().toISOString())) + ' · OR Registry · เอกสารมีข้อมูลสุขภาพ เก็บรักษาตามนโยบายของโรงพยาบาล</div></body></html>');
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* ผู้ใช้กดพิมพ์เองได้ */ } }, 700);
    OR.toast('เปิดหน้าพิมพ์แล้ว เลือกปลายทาง "บันทึกเป็น PDF"', 'ok', 6000);
  };
})();
