#!/usr/bin/env python3
"""
OR Registry | tools/xlsx_to_sql.py
แปลงไฟล์ทะเบียนเดิม (ชีต "Data") เป็นไฟล์ SQL สำหรับนำเข้า Supabase

วิธีใช้:   pip install openpyxl
           python3 tools/xlsx_to_sql.py ทะเบียนเดือนพฤศจิกายน.xlsx import_2569-11.sql
แล้วเปิดไฟล์ .sql วางใน Supabase > SQL Editor > Run (รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ)

หมายเหตุสำคัญ
 - ไฟล์ .sql ที่ได้มี HN และชื่อผู้ป่วยจริง: ห้ามอัปโหลดขึ้น GitHub / ส่งต่อ ใช้เสร็จให้ลบทิ้ง
 - นำเข้าข้อมูลจริงได้เมื่อโรงพยาบาลอนุมัติแล้วเท่านั้น
 - ทุก Case ที่นำเข้ามีสถานะ "เสร็จสิ้น" (ทะเบียนเดิมไม่มีช่องสถานะ)
 - สคริปต์พิมพ์รายงานแถวที่ข้าม / ค่าที่แปลงไม่ได้ ให้ตรวจก่อนรัน SQL
"""
import sys, re, datetime, collections
try:
    import openpyxl
except ImportError:
    sys.exit('ต้องติดตั้งก่อน: pip install openpyxl')

DEPT = {'GEN SX': 'SURG', 'GENSX': 'SURG', 'ORTHOPIDIC': 'ORTHO', 'ORTHOPEDIC': 'ORTHO', 'ORTHOPAEDIC': 'ORTHO', 'ORTHO': 'ORTHO',
        'OB/GYN': 'OBGYN', 'OBGYN': 'OBGYN', 'EYE': 'EYE', 'ENT': 'ENT', 'PED': 'PED', 'MAXILLOFACIAL': 'MAXILLO'}
ANES = {'MAC': 'MAC', 'LA': 'LA', 'GA': 'GA', 'SB': 'SB', 'TIVA': 'TIVA', 'BB': 'BB', 'IVS': 'IVS', 'EPIDURAL': 'EPIDURAL'}
WOUND = {'CLEAN': 'CLEAN', 'CLEAN CONTAMIATE': 'CLEAN_CONTAMINATED', 'CLEAN CONTAMINATED': 'CLEAN_CONTAMINATED',
         'CONTAMINATE': 'CONTAMINATED', 'CONTAMINATED': 'CONTAMINATED', 'DIRTY': 'DIRTY'}
RISK = [('เครื่องมือ', 'EQUIPMENT'), ('เอกสาร', 'DOCUMENT'), ('ภาวะแทรก', 'COMPLICATION'), ('ระบุตัว', 'PATIENT_ID_SITE'), ('เลื่อน', 'POSTPONE_CANCEL')]

def q(v):
    if v is None: return 'null'
    s = str(v).strip()
    return 'null' if s in ('', '-') else "'" + s.replace("'", "''") + "'"

def clean(v):
    return None if v is None or str(v).strip() in ('', '-') else str(v).strip()

def hm(x):
    """เวลาในทะเบียนเก็บเป็นทศนิยม 18.5 = 18:50, 9.05 = 09:05"""
    if x is None or isinstance(x, str) or isinstance(x, bool): return None
    h = int(x); m = int(round((x - h) * 100))
    return (h, m) if 0 <= h < 24 and 0 <= m < 60 else None

def main(src, dst):
    wb = openpyxl.load_workbook(src, data_only=True)
    if 'Data' not in wb.sheetnames: sys.exit('ไม่พบชีตชื่อ Data')
    ws = wb['Data']
    hrow = next((i for i in range(1, 8) if 'HN' in [str(c.value).strip() if c.value else '' for c in ws[i]]), None)
    if not hrow: sys.exit('ไม่พบแถวหัวตาราง (ต้องมีคอลัมน์ HN)')
    col = {}
    for c in ws[hrow]:
        if c.value is not None and str(c.value).strip() not in col: col[str(c.value).strip()] = c.column - 1
    need = ['วันที่ผ่าตัด', 'HN', 'ชื่อ-สกุล']
    miss = [n for n in need if n not in col]
    if miss: sys.exit('ไม่พบคอลัมน์: ' + ', '.join(miss))
    def g(r, name):
        i = col.get(name); return r[i] if i is not None and i < len(r) else None

    warn = collections.Counter(); skipped = []
    out = ['-- สร้างโดย tools/xlsx_to_sql.py จาก ' + src.split('/')[-1],
           '-- *** มีข้อมูลผู้ป่วยจริง ห้ามอัปโหลดขึ้นที่สาธารณะ ***', 'begin;']
    surgeons = {}; patients = {}; cases = []
    for n, r in enumerate(ws.iter_rows(min_row=hrow + 1, values_only=True), start=hrow + 1):
        d = g(r, 'วันที่ผ่าตัด')
        if d is None and g(r, 'HN') is None: continue          # แถวว่าง
        if not isinstance(d, (datetime.datetime, datetime.date)): skipped.append((n, 'วันที่ผ่าตัดไม่ใช่วันที่')); continue
        hn = clean(g(r, 'HN')); name = clean(g(r, 'ชื่อ-สกุล'))
        if not hn or not name: skipped.append((n, 'ไม่มี HN หรือชื่อ')); continue
        if isinstance(g(r, 'HN'), float): hn = str(int(g(r, 'HN')))
        date = d.date() if isinstance(d, datetime.datetime) else d
        branch = (clean(g(r, 'สาขา')) or '').upper()
        dc = DEPT.get(branch)
        if not dc: skipped.append((n, 'ไม่รู้จักสาขา: %r' % branch)); continue

        age = g(r, 'อายุ'); bd = None
        if isinstance(age, (int, float)): bd = datetime.date(max(1900, date.year - int(age)), date.month, 1)
        elif age:
            m = re.search(r'(\d+)\s*เดือน', str(age)); mo = int(m.group(1)) if m else 0
            if m or re.search(r'วัน|สัปดาห์', str(age)):
                t = date.year * 12 + date.month - 1 - mo; bd = datetime.date(t // 12, t % 12 + 1, 1)
            else: warn['อายุอ่านไม่ได้ (ไม่ใส่วันเกิด)'] += 1
        gen = 'MALE' if re.match(r'^(นาย|ด\.ช\.|เด็กชาย|พระ|ดช)', name) else ('FEMALE' if re.match(r'^(นาง|น\.ส\.|นางสาว|ด\.ญ\.|เด็กหญิง|ดญ)', name) else None)
        if hn not in patients: patients[hn] = (name, bd, gen)

        ct = {'MAJOR': 'MAJOR', 'MINOR': 'MINOR', 'LA': 'LA'}.get((clean(g(r, 'Type of surgery')) or '').upper())
        if not ct: ct = 'MINOR'; warn['ไม่มี Major/Minor (ใช้ MINOR)'] += 1
        s, e, a, rc = (hm(g(r, k)) for k in ('Start', 'Finish', 'คนไข้ถึง OR', 'Recovery room'))
        def ts(t, after=None):
            if not t: return None, None
            dt = datetime.datetime(date.year, date.month, date.day, *t)
            if after and dt < after: dt += datetime.timedelta(days=1)   # ข้ามเที่ยงคืน
            return dt, dt
        s_dt = ts(s)[0]; e_dt = ts(e, s_dt)[0]; a_dt = ts(a)[0]
        if a_dt and s_dt and a_dt > s_dt: a_dt = None; warn['เวลาถึง OR หลัง Start (ไม่นำเข้าเวลาถึง OR)'] += 1
        r_dt = ts(rc, e_dt)[0]
        f = lambda dt: "'%s+07'" % dt.strftime('%Y-%m-%d %H:%M:00') if dt else 'null'

        an_raw = (clean(g(r, 'Anesth')) or '').upper(); notes = None
        an = ANES.get(an_raw)
        if an_raw and not an: an = 'OTHER'; notes = 'Anesth เดิม: ' + clean(g(r, 'Anesth')); warn['Anesth หลายแบบ/ไม่รู้จัก (ใช้ OTHER และบันทึกในหมายเหตุ)'] += 1
        code = None
        m = re.match(r'^([A-Za-z]+\d+)', clean(g(r, 'Code operation')) or '')
        if m: code = m.group(1)
        surgeon = clean(g(r, 'Surgeon'))
        if surgeon: surgeons[(surgeon, dc)] = 1
        room = g(r, 'OR'); room = int(room) if isinstance(room, (int, float)) else None
        fx = (clean(g(r, 'fracture')) or '').upper()
        fx = 'CLOSED' if fx.startswith('CFX') else ('OPEN_G1' if 'GR1' in fx else 'OPEN_G2' if 'GR2' in fx else 'OPEN_G3' if 'GR3' in fx else None)
        site = {'RIGHT': 'RIGHT', 'LEFT': 'LEFT', 'BOTH': 'BOTH'}.get((clean(g(r, 'Site')) or '').upper())
        wound = WOUND.get((clean(g(r, 'Class แผล')) or '').upper())
        per = {'ในเวลา': 'IN_HOURS', 'นอกเวลา': 'OUT_HOURS'}.get(clean(g(r, 'ในเวลา / นอกเวลา')))
        rtxt = clean(g(r, 'ประเภทความเสี่ยงที่พบ')) or ''
        rtypes = [v for k, v in RISK if k in rtxt]
        has_risk = (clean(g(r, 'ความเสี่ยง')) == 'มีความเสี่ยง') or bool(rtypes)
        stxt = (clean(g(r, 'Completeของการเช็กเวชภัณฑ์ในระบบ')) or '').lower()
        ods = clean(g(r, 'โครงการ ODS / MIS'))
        cases.append(dict(hn=hn, date=date, ct=ct, dc=dc, dx=clean(g(r, 'Diagnosis')) or '-', op=clean(g(r, 'Operation')) or '-',
            code=code, icd9=clean(g(r, 'Operation(ICD9)')), site=site, fx=fx,
            urg='EMERGENCY' if (clean(g(r, 'ความเร่งด่วน')) or '').upper() == 'EMERGENCY' else 'ELECTIVE',
            er=(clean(g(r, 'รับผู้ป่วยจาก ER')) or '').upper() == 'ER', surgeon=surgeon, room=room, an=an,
            a=f(a_dt), s=f(s_dt), e=f(e_dt), rc=f(r_dt), wound=wound, per=per, ward=clean(g(r, 'Ward')), team=clean(g(r, 'Team')),
            risk=has_risk, rtypes=rtypes, rdetail=clean(g(r, 'รายละเอียดความเสี่ยงอุปกรณ์และสิ่งแวดล้อม OR อื่นๆ')),
            sup=('complete' in stxt) if stxt else None, ods=bool(ods), notes=notes, code_txt=clean(g(r, 'Code operation'))))

    for (nm, dc) in surgeons:
        out.append("insert into public.doctors (doctor_name, department_id, doctor_type) select %s, d.id, 'SURGEON' from public.departments d where d.department_code = '%s' and not exists (select 1 from public.doctors x where x.doctor_name = %s and x.doctor_type = 'SURGEON');" % (q(nm), dc, q(nm)))
    for hn, (nm, bd, gen) in patients.items():
        out.append("insert into public.patients (hn, patient_name, birth_date, gender) values (%s, %s, %s, %s) on conflict (hn) do nothing;" % (q(hn), q(nm), q(bd), q(gen)))
    nocode = 0
    for c in cases:
        if c['code_txt'] and not c['code']: nocode += 1
        arr = "array[%s]::text[]" % ','.join("'%s'" % t for t in c['rtypes']) if c['rtypes'] else "'{}'::text[]"
        out.append("""insert into public.surgery_cases (patient_id, surgery_date, case_type, department_id, diagnosis, operation_name, operation_code_id, icd9_code, site, fracture_type, urgency, from_er, surgeon_id, room_id, anesthesia_type_id, or_entry_time, surgery_start_time, surgery_end_time, or_exit_time, case_status, wound_class, work_period, ward, team, has_risk, risk_types, risk_detail, supplies_checked, ods_mis, notes)
select p.id, '%(date)s', '%(ct)s', d.id, %(dx)s, %(op)s, (select oc.id from public.operation_codes oc where oc.department_id = d.id and lower(oc.op_code) = lower(%(code)s)), %(icd9)s, %(site)s, %(fx)s, '%(urg)s', %(er)s,
 (select x.id from public.doctors x where x.doctor_name = %(sg)s and x.doctor_type = 'SURGEON' limit 1), %(room)s, %(an)s, %(a)s, %(s)s, %(e)s, %(rc)s, 'COMPLETED', %(wound)s, %(per)s, %(ward)s, %(team)s, %(risk)s, %(arr)s, %(rd)s, %(sup)s, %(ods)s, %(notes)s
from public.patients p join public.departments d on d.department_code = '%(dc)s'
where p.hn = %(hn)s and not exists (select 1 from public.surgery_cases x where x.patient_id = p.id and x.surgery_date = '%(date)s' and x.operation_name = %(op)s and x.surgery_start_time is not distinct from %(s)s);""" % dict(
            date=c['date'], ct=c['ct'], dx=q(c['dx']), op=q(c['op']), code=q(c['code']), icd9=q(c['icd9']), site=q(c['site']), fx=q(c['fx']), urg=c['urg'],
            er='true' if c['er'] else 'false', sg=q(c['surgeon']), room=("(select id from public.or_rooms where room_number = %d)" % c['room']) if c['room'] else 'null',
            an=("(select id from public.anesthesia_types where anesthesia_code = '%s')" % c['an']) if c['an'] else 'null',
            a=c['a'], s=c['s'], e=c['e'], rc=c['rc'], wound=q(c['wound']), per=q(c['per']), ward=q(c['ward']), team=q(c['team']),
            risk='true' if c['risk'] else 'false', arr=arr, rd=q(c['rdetail']), sup='null' if c['sup'] is None else str(c['sup']).lower(),
            ods='true' if c['ods'] else 'false', notes=q(c['notes']), dc=c['dc'], hn=q(c['hn'])))
    out.append('commit;')
    open(dst, 'w', encoding='utf-8').write('\n'.join(out) + '\n')

    print('อ่านได้ %d Case · %d ผู้ป่วย · %d ศัลยแพทย์ → %s' % (len(cases), len(patients), len(surgeons), dst))
    if nocode: print('  ! %d Case มี Code operation ที่ไม่พบ/อ่านไม่ได้ (จะนำเข้าโดยไม่มี Code: ยอดตาม Code จะไม่ครบ)' % nocode)
    for k, v in warn.items(): print('  ! %s: %d แถว' % (k, v))
    for n, why in skipped: print('  ข้ามแถว %d: %s' % (n, why))
    if skipped: print('  *** ข้าม %d แถว ตรวจในไฟล์ Excel แล้วแก้ก่อนรัน หรือกรอกเพิ่มในระบบเอง ***' % len(skipped))

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
