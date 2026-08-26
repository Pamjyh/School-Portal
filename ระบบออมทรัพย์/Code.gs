// ============================================================
// ระบบออมทรัพย์นักเรียนโรงเรียนบ้านท่าชะอม — v3
// รองรับ เลขบัญชี ธกส. + สรุปรายเดือน/รายเทอม
// ============================================================

const SHEET_ID         = '1_FiMepObJro052keUyznmYCnygfNKVGta7LFA3-bVQM';
const TEACHER_PASSWORD = 'REPLACE_WITH_YOUR_PASSWORD';   // ← ตั้งรหัสของคุณเองก่อน deploy
const ADMIN_PASSWORD   = 'REPLACE_WITH_YOUR_ADMIN_PASSWORD'; // ← ห้ามใช้ค่านี้จริง
const SCHOOL_NAME      = 'โรงเรียนบ้านท่าชะอม';

const GRADES = ['อ.2','อ.3','ป.1','ป.2','ป.3','ป.4','ป.5','ป.6'];
const NEXT_GRADE = {
  'อ.2':'อ.3','อ.3':'ป.1','ป.1':'ป.2','ป.2':'ป.3',
  'ป.3':'ป.4','ป.4':'ป.5','ป.5':'ป.6','ป.6':'จบการศึกษา'
};

// F1/F2 fix (scrutinize 2026-08-11): เดิม getStudents/getBootstrap เทียบค่า "ชั้น" กันคนละแบบ —
// getStudents ใช้ strict equality ไม่ trim, getBootstrap trim แล้วทิ้งเงียบๆถ้าไม่ตรง GRADES เป๊ะ (ดู comment ที่ 1239)
// ที่เคยเจอปัญหาจริงกับ อ.3 มาก่อน — รวม normalize เป็นจุดเดียว ใช้ทั้งสองฟังก์ชัน กันแก้ที่เดียวแล้วอีกที่ลืมตามอีก
function normGrade(g) { return String(g || '').trim(); }

// เทอม: เทอม1 = พ.ค.-ก.ย., เทอม2 = พ.ย.-มี.ค.
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// แปลง Date object จากเซลล์ Google Sheets (Sheets auto-convert ตอนพิมพ์/วางมือ) เป็นส่วนประกอบวันที่แบบไทยเสมอ
// ใช้ +7h shift + UTC getters แทน local getters (getDate/getMonth/getFullYear) เพราะไม่ต้องพึ่งว่า
// GAS Project Settings ตั้ง timezone เป็น Asia/Bangkok ถูกมั้ย — ถูกเสมอไม่ว่า project timezone จะตั้งเป็นอะไร
// (เดิมมี 2 convention ปนกันในไฟล์นี้: getHistory ใช้ +7h shift, exportMonthly/exportTerm/parseThaiDateStr ใช้ local getter ตรงๆ
//  รวมเป็นจุดเดียวตรงนี้ กันเพี้ยนถ้าย้าย GAS project แล้ว timezone setting ไม่ตรงกับเดิม — ดู [[project_gas_migration_plan]])
function thaiDateParts(dateObj) {
  const thai = new Date(dateObj.getTime() + 7*60*60*1000);
  const fullYear = thai.getUTCFullYear();
  const year = fullYear > 2500 ? fullYear : fullYear + 543; // กันกรณี Sheets เก็บเป็น พ.ศ. อยู่แล้ว
  return {
    day: thai.getUTCDate(),
    monthIdx: thai.getUTCMonth(),
    year: year,
    hh: String(thai.getUTCHours()).padStart(2,'0'),
    mm: String(thai.getUTCMinutes()).padStart(2,'0')
  };
}
// ต่อ string ไทยจาก parts — withTime=true ต่อเวลาด้วย (getHistory), false = แค่วันที่ (exportMonthly/exportTerm/parseThaiDateStr)
function thaiDateStrFromParts(parts, withTime) {
  var s = parts.day + ' ' + THAI_MONTHS[parts.monthIdx] + ' ' + parts.year;
  return withTime ? (s + ' ' + parts.hh + ':' + parts.mm) : s;
}

// ============================================================
// ENTRY POINT
// ============================================================
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  // Merge POST body into params (GAS 302 redirect can lose POST body from e.parameter)
  let params = (e && e.parameter) ? e.parameter : {};
  if (e && e.postData && e.postData.contents) {
    try {
      var _pp = {};
      e.postData.contents.split('&').forEach(function(pair) {
        var kv = pair.split('=');
        if (kv.length >= 1) {
          var k = decodeURIComponent(kv[0].replace(/\+/g,' '));
          var v = kv.length > 1 ? decodeURIComponent(kv.slice(1).join('=').replace(/\+/g,' ')) : '';
          _pp[k] = v;
        }
      });
      params = Object.assign({}, _pp, params);
    } catch(_) {}
  }
  const action = params.action || '';
  let result;
  try {
    switch(action) {
      case 'getStudents':       result = getStudents(params); break;
      case 'getStudentByName':  result = getStudentByName(params); break;
      case 'addStudent':        result = addStudent(params); break;
      case 'editStudent':       result = editStudent(params); break;
      case 'deleteStudent':     result = deleteStudent(params); break;
      case 'deposit':           result = addTransaction(params, 'ฝาก'); break;
      case 'withdraw':          result = addTransaction(params, 'ถอน'); break;
      case 'editTransaction':   result = editTransaction(params); break;
      case 'deleteTransaction': result = deleteTransaction(params); break;
      case 'getHistory':        result = getHistory(params); break;
      case 'getAllSummary':      result = getAllSummary(params); break;
      case 'exportMonthly':     result = exportMonthly(params); break;
      case 'exportTerm':        result = exportTerm(params); break;
      case 'generateDepositRegistry': result = generateDepositRegistry(params); break;
      case 'promoteGrade':      result = promoteGrade(params); break;
      case 'promoteAll':        result = promoteAll(params); break;
      case 'getGraduated':      result = getGraduated(params); break;
      case 'checkRole':         result = checkRole(params); break;
      case 'initSheets':        result = initSheets(); break;
      case 'getBootstrap':      result = getBootstrap(params); break;
      default: result = { ok: false, error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// INIT SHEETS
// ============================================================
function initSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // sheet นักเรียน
  let s = ss.getSheetByName('นักเรียน');
  if (!s) {
    s = ss.insertSheet('นักเรียน');
    s.getRange(1,1,1,9).setValues([[
      'id','ชื่อ-สกุล','ชั้นปัจจุบัน','ปีที่เข้า','สถานะ','เลขบัญชี_ธกส','วันที่เพิ่ม','หมายเหตุ','เลขที่'
    ]]);
    styleHeader(s, 9);
    s.setFrozenRows(1);
    s.setColumnWidth(2, 180);
    s.setColumnWidth(6, 160);
  } else {
    // ตรวจ sheet เดิม ถ้ายังไม่มีคอลัมน์เลขบัญชี ให้เพิ่ม
    const headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    if (!headers.includes('เลขบัญชี_ธกส')) {
      const nextCol = s.getLastColumn() + 1;
      // หาตำแหน่งที่ถูกต้อง: ต้องอยู่ที่ column 6
      if (headers.length < 6) {
        // เติม column ที่ขาดหายไป
        s.getRange(1, 6).setValue('เลขบัญชี_ธกส');
      } else {
        // แทรก column ที่ 6
        s.insertColumnBefore(6);
        s.getRange(1, 6).setValue('เลขบัญชี_ธกส');
      }
      styleHeader(s, Math.max(6, s.getLastColumn()));
    }
    // เพิ่มคอลัมน์ "เลขที่" (เลขประจำตัวในห้อง) — ต่อท้ายเสมอ ห้ามแทรกกลาง
    // เพราะโค้ดหลายจุด (editStudent, promoteGrade) อ้างอิงคอลัมน์ 2,3,5,6 แบบ hardcode อยู่แล้ว
    // ถ้าแทรกกลางจะทำให้ข้อมูลเขียนผิดคอลัมน์ทันที — ต่อท้ายปลอดภัยที่สุด ไม่กระทบอะไรเลย
    const headers2 = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(h => String(h).trim());
    if (!headers2.includes('เลขที่')) {
      s.getRange(1, s.getLastColumn() + 1).setValue('เลขที่');
      styleHeader(s, s.getLastColumn());
    }
  }

  // sheet ธุรกรรม
  let t = ss.getSheetByName('ธุรกรรม');
  if (!t) {
    t = ss.insertSheet('ธุรกรรม');
    t.getRange(1,1,1,8).setValues([[
      'id','นักเรียน_id','ชื่อ','ชั้น','ประเภท','จำนวนเงิน','ปีการศึกษา','วันที่'
    ]]);
    styleHeader(t, 8);
    t.setFrozenRows(1);
  }

  // sheet ประวัติเลื่อนชั้น
  let h = ss.getSheetByName('ประวัติเลื่อนชั้น');
  if (!h) {
    h = ss.insertSheet('ประวัติเลื่อนชั้น');
    h.getRange(1,1,1,6).setValues([['นักเรียน_id','ชื่อ','จากชั้น','เป็นชั้น','ปีการศึกษา','วันที่']]);
    styleHeader(h, 6);
    h.setFrozenRows(1);
  }

  // sheet ประวัติแก้ไข (scrutinize 2026-08-11 F2): เดิม editTransaction/deleteTransaction ไม่เหลือหลักฐานอะไรเลย
  // ธนาคารจริงไม่มีทางแก้/ลบรายการโดยไม่เก็บของเดิมไว้ตรวจสอบย้อนหลังได้ — เพิ่ม sheet log แยก ไม่กระทบโครงสร้างเดิม
  // (สร้างผ่าน ensureLogSheet ตัวเดียวกับที่ logTxChange ใช้ กันโค้ดสร้าง sheet ซ้ำ 2 จุดแล้วเพี้ยนกัน)
  ensureLogSheet(ss);

  return { ok: true, message: 'ตรวจสอบและอัพเดท Sheets สำเร็จ' };
}

// F1 fix (scrutinize 2026-08-11 รอบตรวจซ้ำ): เดิม logTxChange พึ่งว่า sheet 'ประวัติแก้ไข' ถูกสร้างไว้แล้วผ่าน
// initSheets ที่ต้องกดเอง — ไฟล์นี้เคยโดนบั๊กคลาสนี้มาก่อนแล้วจริง (ดู comment ensureTxNoteCol ด้านล่าง: "เคยเจอปัญหา
// คอลัมน์ 'เลขที่' ไม่มีอยู่จริงเพราะ initSheets() ไม่เคยถูกเรียก") ใช้ self-healing แบบเดียวกัน สร้าง sheet เองตอนใช้จริง
// ไม่พึ่งว่าใครจะกด "ตรวจสอบ/อัพเดท Sheets" ก่อน — กันไม่ให้ audit log เงียบหายไปแบบไม่มีใครรู้
function ensureLogSheet(ss) {
  let s = ss.getSheetByName('ประวัติแก้ไข');
  if (!s) {
    s = ss.insertSheet('ประวัติแก้ไข');
    s.getRange(1,1,1,6).setValues([['วันที่','การกระทำ','txId','ค่าเดิม','ค่าใหม่','โดย']]);
    styleHeader(s, 6);
    s.setFrozenRows(1);
  }
  return s;
}
function logTxChange(action, txId, oldVal, newVal, byRole) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    ensureLogSheet(ss).appendRow([thaiDate(new Date()), action, txId, oldVal, newVal, byRole]);
  } catch (e) {}
}

// ============================================================
// CHECK ROLE — ตรวจรหัสผ่านและคืน role (ไม่เก็บรหัสใน frontend)
// ============================================================
function checkRole(p) {
  if (p.password === ADMIN_PASSWORD)   return { ok: true, role: 'admin' };
  if (p.password === TEACHER_PASSWORD) return { ok: true, role: 'teacher' };
  return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' };
}

function styleHeader(sheet, cols) {
  sheet.getRange(1,1,1,cols)
    .setFontWeight('bold').setBackground('#1C1917').setFontColor('#FFFFFF');
}

// ============================================================
// STUDENTS
// ============================================================
// ค้นหานักเรียนด้วยชื่อ (สำหรับผู้ปกครอง)
function getStudentByName(p) {
  // F1 fix (Pam decision 2026-08-25, scrutinize F1 ของแผน central-auth รอบถัดไป): เปลี่ยนจาก
  // substring match เป็น exact full-name match — เดิมพิมพ์แค่บางส่วนของชื่อ (เช่น "สม") ก็เจอทุกคนที่มี
  // คำนั้นอยู่ในชื่อ ทำให้ใครก็ได้ที่เดาบางส่วนของชื่อถูกไล่ดูยอดออม/ประวัติธุรกรรมของเด็กคนอื่นได้ง่ายเกินไป
  // Pam ตัดสินใจให้ผู้ปกครองพิมพ์ชื่อ-นามสกุลเต็มแทน ไม่ต้องยืนยันตัวตนเพิ่มเพราะ endpoint นี้ read-only ล้วน
  // (รับทราบและยอมรับความเสี่ยงที่เหลือแล้ว — ดู CODEX_CLAUDE_REVIEW.md 2026-08-25)
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const keyword = norm(p.name);
  if (!keyword) return { ok: false, error: 'กรุณาใส่ชื่อ' };
  if (keyword.length < 2) return { ok: false, error: 'กรุณาพิมพ์ชื่อ-นามสกุลเต็ม' };

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const studSheet = ss.getSheetByName('นักเรียน');
  if (!studSheet) return { ok: false, error: 'ไม่พบ sheet' };

  const allData = studSheet.getDataRange().getValues();
  const headers = allData[0].map(h => String(h).trim());
  function findH(names) {
    for (var n of names) { var i = headers.indexOf(n); if (i >= 0) return i; }
    return -1;
  }
  const siId    = findH(['id']);
  const siName  = findH(['ชื่อ-สกุล','ชื่อ สกุล','ชื่อ']);
  const siGrade = findH(['ชั้นปัจจุบัน','ชั้น']);
  const siStatus = findH(['สถานะ']);

  const balances = calcAllBalances(ss);

  // F1 fix: exact match เท่านั้น (ไม่ใช่ contains แบบเดิม)
  const matches = allData.slice(1)
    .filter(r => {
      if (!r[siId]) return false;
      if (siStatus >= 0 && String(r[siStatus]) === 'จบการศึกษา') return false;
      return norm(r[siName]) === keyword;
    })
    .map(r => ({
      id:      String(r[siId]),
      name:    String(r[siName]   || ''),
      grade:   String(r[siGrade]  || ''),
      balance: balances[String(r[siId])] || 0
    }));

  if (!matches.length) return { ok: false, error: 'ไม่พบนักเรียนชื่อ "' + p.name + '" — กรุณาพิมพ์ชื่อ-นามสกุลเต็มให้ตรงกับที่ลงทะเบียนไว้' };
  if (matches.length > 15) return { ok: false, error: 'พบนักเรียนหลายคนเกินไป (' + matches.length + ' คน) กรุณาติดต่อโรงเรียน' };

  // F1 fix ต่อเนื่อง: เดิม endpoint นี้ไม่เคยรับ/ใช้ p.studentId เลย ทำให้ตอนผู้ปกครองคลิกเลือกคนใดคนหนึ่ง
  // จากรายชื่อที่ชื่อ-นามสกุลตรงกันมากกว่า 1 คน (กรณีหายาก) ประวัติธุรกรรมที่ได้กลับมาผิดคนหรือว่างเปล่า
  // แก้ให้เลือก target จาก matches ที่ผ่าน exact-name แล้วเท่านั้นตาม studentId (ไม่ query จาก studentId
  // อย่างเดียวโดยไม่เช็คชื่อ — กัน studentId ที่เดาได้กลายเป็นช่องทางข้าม name gate)
  let target = null;
  if (p.studentId) {
    const picked = matches.filter(m => String(m.id) === String(p.studentId));
    if (!picked.length) return { ok: false, error: 'ไม่พบข้อมูลนักเรียนที่เลือก กรุณาค้นหาใหม่' };
    target = picked[0];
  } else if (matches.length === 1) {
    target = matches[0];
  }

  if (target) {
    const txSheet = ss.getSheetByName('ธุรกรรม');
    let history = [];
    if (txSheet) {
      const txHeaders = txSheet.getDataRange().getValues()[0].map(h => String(h).trim());
      function findTH(names) {
        for (var n of names) { var i = txHeaders.indexOf(n); if (i >= 0) return i; }
        return -1;
      }
      const tiId    = findTH(['id']);
      const tiStu   = findTH(['นักเรียน_id']);
      const tiType  = findTH(['ประเภท']);
      const tiAmt   = findTH(['จำนวนเงิน']);
      const tiDate  = findTH(['วันที่']);
      history = txSheet.getDataRange().getValues().slice(1)
        .filter(r => r[0] && String(r[tiStu]) === target.id)
        .map(r => ({
          type:   String(r[tiType] || ''),
          amount: parseFloat(r[tiAmt]) || 0,
          date:   String(r[tiDate] || '')
        }))
        .reverse()
        .slice(0, 20);
    }
    return { ok: true, students: matches, history };
  }

  return { ok: true, students: matches, history: [] };
}

// เรียงตามเลขที่ (ถ้ามี) — คนที่มีเลขที่ขึ้นก่อนตามลำดับตัวเลข
// คนที่ยังไม่มีเลขที่ (นักเรียนเก่าก่อนมีฟีเจอร์นี้) ตกไปท้ายสุด เรียงตามลำดับที่เพิ่มเดิม (id = S + timestamp)
// ใช้ร่วมกันทั้ง getStudents() และ getBootstrap() — ห้ามแยกก็อปปี้ เพราะเคยเพี้ยนกันมาแล้ว (bootstrap ลืมอัปเดตตอนเพิ่มฟีเจอร์เลขที่)
function sortStudentsByRoll(list) {
  list.sort(function(a, b) {
    var ra = parseInt(a.rollNo, 10);
    var rb = parseInt(b.rollNo, 10);
    var raOk = a.rollNo !== '' && a.rollNo != null && !isNaN(ra);
    var rbOk = b.rollNo !== '' && b.rollNo != null && !isNaN(rb);
    if (raOk && rbOk) return ra - rb;
    if (raOk && !rbOk) return -1;
    if (!raOk && rbOk) return 1;
    var na = parseInt(String(a.id).replace('S','')) || 0;
    var nb = parseInt(String(b.id).replace('S','')) || 0;
    return na - nb;
  });
  return list;
}

function getStudents(p) {
  if (!checkAuth(p)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  // Cache ต่อชั้น (180 วินาที) — ลดการอ่าน sheet ซ้ำ
  if (p.grade) {
    const sCache = CacheService.getScriptCache();
    const cKey = 'ss_stus_' + p.grade;
    const hit = sCache.get(cKey);
    if (hit) { try { return JSON.parse(hit); } catch(e) {} }
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('นักเรียน');
  if (!sheet) return { ok: false, error: 'ไม่พบ sheet — กรุณา Run initSheets ก่อน' };

  const allData = sheet.getDataRange().getValues();
  const headers = allData[0].map(h => String(h).trim());

  // หา index แบบ dynamic — รองรับชื่อคอลัมน์หลายแบบ
  function findCol(names) {
    for (var n of names) {
      var idx = headers.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const idxId     = findCol(['id']);
  const idxName   = findCol(['ชื่อ-สกุล','ชื่อ สกุล','ชื่อ']);
  const idxGrade  = findCol(['ชั้นปัจจุบัน','ชั้น']);
  const idxYear   = findCol(['ปีที่เข้า','ปีการศึกษา']);
  const idxStatus = findCol(['สถานะ']);
  const idxBank   = findCol(['เลขบัญชี_ธกส','เลขบัญชีธกส','เลขบัญชี']);
  const idxRoll   = findCol(['เลขที่']);

  const rows = allData.slice(1);
  let students = rows
    .filter(r => {
      if (!r[idxId]) return false;
      // ถ้าไม่มีคอลัมน์สถานะ หรือสถานะว่าง ให้ถือว่ากำลังเรียน
      if (idxStatus < 0) return true;
      const status = String(r[idxStatus] || '').trim();
      return status !== 'จบการศึกษา';
    })
    .map(r => ({
      id:          String(r[idxId] || ''),
      name:        idxName  >= 0 ? String(r[idxName]  || '') : '',
      grade:       idxGrade >= 0 ? String(r[idxGrade] || '') : '',
      entryYear:   idxYear  >= 0 ? String(r[idxYear]  || '') : '',
      status:      idxStatus >= 0 ? String(r[idxStatus] || '') : 'กำลังเรียน',
      bankAccount: idxBank  >= 0 ? String(r[idxBank]  || '') : '',
      rollNo:      idxRoll  >= 0 ? String(r[idxRoll]  || '') : '',
    }));

  // กรองตามชั้น — ถ้าไม่พบ grade column ให้แสดงทั้งหมด
  // F1 fix (scrutinize 2026-08-11): เดิม strict equality ไม่ trim — นักเรียนที่มีค่า "ชั้น" เพี้ยนแม้ช่องว่างเกิน
  // จะหายไปทั้งคนจากรายชื่อ+ยอดคงเหลือของชั้นนั้นเลย (ไม่มี fallback แบบที่ generateDepositRegistry มี) ใช้ normGrade ให้ตรงกับ getBootstrap
  if (p.grade && idxGrade >= 0) {
    students = students.filter(s => normGrade(s.grade) === normGrade(p.grade));
  }

  // เรียงตามเลขที่ (shared กับ getBootstrap() — ดู sortStudentsByRoll ด้านล่าง กันโค้ดเรียงคนละที่แล้วเพี้ยนกัน)
  sortStudentsByRoll(students);

  const balances = calcAllBalances(ss);
  students = students.map(s => ({ ...s, balance: balances[String(s.id)] || 0 }));
  const result = { ok: true, students, debug: { headers: headers, idxGrade: idxGrade, idxStatus: idxStatus } };
  if (p.grade) {
    try { CacheService.getScriptCache().put('ss_stus_' + p.grade, JSON.stringify(result), 180); } catch(e) {}
  }
  return result;
}

function addStudent(p) {
  if (!checkAuth(p)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const name = (p.name || '').trim();
  const grade = p.grade;
  const bankAccount = (p.bankAccount || '').trim();
  const rollNo = (p.rollNo || '').trim();
  if (!name || !grade) return { ok: false, error: 'ข้อมูลไม่ครบ' };
  if (!GRADES.includes(grade)) return { ok: false, error: 'ชั้นไม่ถูกต้อง' };

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('นักเรียน');
  if (!sheet) return { ok: false, error: 'ไม่พบ sheet นักเรียน — กรุณา Run initSheets ก่อน' };

  const id = 'S' + Date.now();
  const year = thaiYear();
  const dateStr = thaiDate(new Date());

  // อ่าน header ดูว่า column อยู่ตำแหน่งไหน
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());

  function findH(names) {
    for (var n of names) { var i = headers.indexOf(n); if (i >= 0) return i; }
    return -1;
  }

  const hasGradeCol  = findH(['ชั้นปัจจุบัน','ชั้น']) >= 0;
  const hasStatusCol = findH(['สถานะ']) >= 0;

  // ถ้า header ครบ 8 คอลัมน์อยู่แล้ว → append ตรงๆ
  if (headers.length >= 7 && hasGradeCol) {
    // สร้าง row ตาม header จริง
    var row = new Array(Math.max(8, headers.length)).fill('');
    headers.forEach(function(h, i) {
      if (h === 'id')              row[i] = id;
      else if (['ชื่อ-สกุล','ชื่อ สกุล','ชื่อ'].includes(h)) row[i] = name;
      else if (['ชั้นปัจจุบัน','ชั้น'].includes(h))           row[i] = grade;
      else if (['ปีที่เข้า','ปีการศึกษา'].includes(h))        row[i] = year;
      else if (h === 'สถานะ')     row[i] = 'กำลังเรียน';
      else if (['เลขบัญชี_ธกส','เลขบัญชีธกส','เลขบัญชี'].includes(h)) row[i] = bankAccount;
      else if (h === 'วันที่เพิ่ม') row[i] = dateStr;
      else if (h === 'เลขที่')    row[i] = rollNo;
    });
    sheet.appendRow(row);
  } else {
    // header ไม่ครบ → เขียน header ใหม่ก่อน (ปลอดภัย เพราะมีข้อมูลอยู่แล้วจะไม่ลบ)
    // แค่ append ด้วย default format 8 คอลัมน์ (เคสนี้ไม่มีคอลัมน์เลขที่ให้เขียน — เป็น fallback ของ sheet เก่าที่ header ไม่ครบเท่านั้น)
    sheet.appendRow([id, name, grade, year, 'กำลังเรียน', bankAccount, dateStr, '']);
  }

  return { ok: true, id, name, grade, bankAccount, rollNo, entryYear: year };
}

function editStudent(p) {
  if (!checkAuth(p)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const name = (p.name || '').trim();
  if (!name || !p.studentId) return { ok: false, error: 'ข้อมูลไม่ครบ' };

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('นักเรียน');

  // หาคอลัมน์ "เลขที่" แบบ dynamic ตามชื่อ header — ไม่ hardcode index เพราะคอลัมน์นี้ถูกต่อท้าย
  // อาจอยู่ตำแหน่งต่างกันได้ในอนาคตถ้ามีการแก้ไข header เพิ่มเติม
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const idxRoll = headers.indexOf('เลขที่');

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.studentId) {
      sheet.getRange(i+1, 2).setValue(name);
      if (p.bankAccount !== undefined)
        sheet.getRange(i+1, 6).setValue(p.bankAccount);
      if (p.rollNo !== undefined && idxRoll >= 0)
        sheet.getRange(i+1, idxRoll + 1).setValue(String(p.rollNo).trim());
      SpreadsheetApp.flush();
      try { GRADES.forEach(function(g){ CacheService.getScriptCache().remove('ss_stus_'+g); }); } catch(e) {}
      return { ok: true, name };
    }
  }
  return { ok: false, error: 'ไม่พบนักเรียน' };
}

function deleteStudent(p) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('นักเรียน');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.studentId) {
      sheet.deleteRow(i + 1);
      SpreadsheetApp.flush();
      invalidateBalanceCache();
      return { ok: true };
    }
  }
  return { ok: false, error: 'ไม่พบนักเรียน' };
}

// ============================================================
// TRANSACTIONS
// ============================================================
// เพิ่ม header "หมายเหตุ" ต่อท้ายชีต ธุรกรรม ถ้ายังไม่มี — self-healing แทนพึ่ง migration แยกที่มักไม่ถูกรัน
// (เคยเจอปัญหาคอลัมน์ "เลขที่" ไม่มีอยู่จริงเพราะ initSheets() ไม่เคยถูกเรียก — ระบบนี้กันไว้ไม่ให้เกิดซ้ำ)
function ensureTxNoteCol(txSheet) {
  const lastCol = Math.max(txSheet.getLastColumn(), 1);
  const headers = txSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  const idx = headers.indexOf('หมายเหตุ');
  if (idx >= 0) return idx; // 0-indexed ตรงกับ array column ปกติ
  txSheet.getRange(1, lastCol + 1).setValue('หมายเหตุ');
  return lastCol; // ตำแหน่งคอลัมน์ใหม่ (0-indexed = lastCol เดิม)
}

function addTransaction(p, type) {
  if (!checkAuth(p)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const amount = parseFloat(p.amount);
  if (!p.studentId || isNaN(amount) || amount <= 0)
    return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  // F2 fix (scrutinize 2026-08-07): เดิมอ่าน balance ก่อนเช็ค/เขียน โดยไม่มี lock คั่นกลาง
  // ถ้า 2 คำขอ (ฝาก/ถอน คนเดียวกัน) มาพร้อมกัน ทั้งคู่อ่าน balance เก่าเหมือนกัน เช็คผ่านทั้งคู่ แล้วเขียนทับกัน
  // ยอดติดลบได้จริงโดยไม่มีแถวไหน "ผิด" เดี่ยวๆเลย — ครอบทั้งฟังก์ชันด้วย LockService กันการอ่าน-แล้ว-เขียนแบบนี้ชนกัน
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: 'ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่' };
  }
  try {
    if (type === 'ถอน') {
      const bal = getBalance(p.studentId);
      if (amount > bal) return { ok: false, error: 'ยอดไม่พอ (มี ' + bal + ' บาท)' };
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const txSheet = ss.getSheetByName('ธุรกรรม');
    if (!txSheet) return { ok: false, error: 'ไม่พบ sheet "ธุรกรรม" — กรุณารัน initSheets ก่อน (SHEET_ID=' + SHEET_ID + ')' };

    // หาชื่อและชั้นนักเรียน — ใช้ dynamic header ป้องกัน column order เปลี่ยน
    const studAllData = ss.getSheetByName('นักเรียน').getDataRange().getValues();
    const studHeaders = studAllData[0].map(function(h) { return String(h).trim(); });
    function findSColTx(names) {
      for (var n of names) { var idx = studHeaders.indexOf(n); if (idx >= 0) return idx; }
      return -1;
    }
    const siName  = findSColTx(['ชื่อ-สกุล', 'ชื่อ สกุล', 'ชื่อ']);
    const siGrade = findSColTx(['ชั้นปัจจุบัน', 'ชั้น']);
    let studentName = '', studentGrade = '';
    for (let i = 1; i < studAllData.length; i++) {
      if (String(studAllData[i][0]) === String(p.studentId)) {
        studentName  = siName  >= 0 ? String(studAllData[i][siName]  || '') : '';
        studentGrade = siGrade >= 0 ? String(studAllData[i][siGrade] || '') : '';
        break;
      }
    }

    const id = 'T' + Date.now();
    const dateStr = thaiDate(new Date());
    const yearVal = thaiYear();

    // อ่าน balance ปัจจุบัน ก่อน append (เพื่อหลีกเลี่ยง cache issue หลัง write) — ตอนนี้ปลอดภัยเพราะอยู่ใน lock แล้ว
    const sid = String(p.studentId);
    let currentBal = 0;
    const allRows = txSheet.getDataRange().getValues();
    allRows.slice(1).forEach(function(row) {
      if (String(row[1]) === sid) {
        currentBal += (row[4] === 'ฝาก' ? parseFloat(row[5])||0 : -(parseFloat(row[5])||0));
      }
    });

    // กันบันทึกซ้ำ — เผื่อกดส่งพร้อมกันจาก 2 อุปกรณ์ด้วยรหัสครูเดียวกัน (ฝั่ง frontend disable ปุ่มกันได้แค่เครื่องเดียวกัน)
    // เช็ค transaction คนเดียวกัน+ประเภทเดียวกัน+ยอดเท่ากัน ที่เพิ่งถูกบันทึกภายใน 8 วินาทีล่าสุด (ใช้ epoch ใน id "T<ms>" ไม่ต้องเพิ่มคอลัมน์ใหม่)
    const DUP_WINDOW_MS = 8000;
    const nowMs = Date.now();
    const isDupTx = allRows.slice(1).some(function(row) {
      if (String(row[1]) !== sid || row[4] !== type || (parseFloat(row[5])||0) !== amount) return false;
      const m = String(row[0]).match(/^T(\d+)$/);
      return m && (nowMs - parseInt(m[1], 10)) < DUP_WINDOW_MS;
    });
    if (isDupTx) {
      return { ok: false, error: 'ดูเหมือนเพิ่งบันทึกรายการนี้ไปแล้วเมื่อครู่ (คนเดียวกัน ยอดเดียวกัน) ถ้าตั้งใจทำซ้ำจริง รอสักครู่แล้วลองใหม่' };
    }

    const rowsBefore = txSheet.getLastRow();
    // append ตรงๆ ตาม column order ที่กำหนด: id, นักเรียน_id, ชื่อ, ชั้น, ประเภท, จำนวนเงิน, ปีการศึกษา, วันที่, [หมายเหตุ]
    // หมายเหตุ (เช่น "ดอกเบี้ย") อยู่คอลัมน์ท้ายสุดเสมอ ตำแหน่งขึ้นกับ ensureTxNoteCol (กันชนกับ column index 0-7 ที่ฟังก์ชันอื่น hardcode ไว้)
    const noteColIdx = ensureTxNoteCol(txSheet);
    const rowVals = [id, p.studentId, studentName, studentGrade, type, amount, yearVal, dateStr];
    while (rowVals.length < noteColIdx) rowVals.push('');
    rowVals[noteColIdx] = String(p.note || '').trim();
    txSheet.appendRow(rowVals);
    SpreadsheetApp.flush(); // บังคับ commit
    invalidateBalanceCache();
    const rowsAfter = txSheet.getLastRow();

    // คำนวณ balance ใหม่จาก balance เก่า + transaction นี้ (ไม่ re-read sheet หลัง write)
    const newBalance = type === 'ฝาก' ? currentBal + amount : currentBal - amount;

    return { ok: true, id, type, amount, date: dateStr, newBalance, debug: { rowsBefore, rowsAfter, wrote: rowsAfter > rowsBefore, currentBal } };
  } finally {
    lock.releaseLock();
  }
}

function getBalance(studentId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const txSheet = ss.getSheetByName('ธุรกรรม');
  if (!txSheet) return 0;
  const sid = String(studentId);
  let bal = 0;
  txSheet.getDataRange().getValues().slice(1).forEach(r => {
    if (String(r[1]) === sid) {
      bal += (r[4] === 'ฝาก' ? parseFloat(r[5])||0 : -(parseFloat(r[5])||0));
    }
  });
  return bal;
}

function calcAllBalances(ss) {
  const sCache = CacheService.getScriptCache();
  const hit = sCache.get('ss_balances');
  if (hit) { try { return JSON.parse(hit); } catch(e) {} }

  const txSheet = ss.getSheetByName('ธุรกรรม');
  const balances = {};
  if (!txSheet) return balances;
  txSheet.getDataRange().getValues().slice(1).forEach(r => {
    if (!r[0]) return;
    const sid = String(r[1]);
    if (!balances[sid]) balances[sid] = 0;
    balances[sid] += (r[4] === 'ฝาก' ? parseFloat(r[5])||0 : -(parseFloat(r[5])||0));
  });
  try { sCache.put('ss_balances', JSON.stringify(balances), 180); } catch(e) {}
  return balances;
}

// ลบ cache หลัง write — เรียกหลัง SpreadsheetApp.flush() ทุกครั้ง
function invalidateBalanceCache() {
  try {
    const c = CacheService.getScriptCache();
    c.remove('ss_balances');
    GRADES.forEach(function(g){ c.remove('ss_stus_' + g); });
  } catch(e) {}
}

function editTransaction(p) {
  if (!checkAuth(p)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const newAmount = parseFloat(p.amount);
  if (!p.txId || isNaN(newAmount) || newAmount <= 0) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };
  // F2 fix (scrutinize 2026-08-07): เหตุผลเดียวกับ addTransaction — เช็คยอด (balWithout) แล้วค่อยเขียน ไม่มี lock คั่นเดิม
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: 'ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่' };
  }
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const txSheet = ss.getSheetByName('ธุรกรรม');
    const data = txSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === p.txId) {
        const sid = data[i][1], type = data[i][4];
        const oldAmt = parseFloat(data[i][5]) || 0;
        if (type === 'ถอน') {
          const balWithout = getBalance(sid) + oldAmt;
          if (newAmount > balWithout) return { ok: false, error: 'ยอดไม่พอ (มี ' + balWithout + ' บาท)' };
        }
        // F2 fix (scrutinize 2026-08-11): เก็บ log ก่อนเขียนทับจริง — เดิมยอดเก่าหายไปเลย ตรวจสอบย้อนหลังไม่ได้
        logTxChange('แก้ไข', p.txId, oldAmt, newAmount, p.password === ADMIN_PASSWORD ? 'แอดมิน' : 'ครู');
        txSheet.getRange(i+1, 6).setValue(newAmount);
        SpreadsheetApp.flush();
        invalidateBalanceCache();
        return { ok: true, newBalance: getBalance(sid) };
      }
    }
    return { ok: false, error: 'ไม่พบรายการ' };
  } finally {
    lock.releaseLock();
  }
}

function deleteTransaction(p) {
  if (!checkAuth(p)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  if (!p.txId) return { ok: false, error: 'ไม่ระบุรายการ' };
  // F1 fix (scrutinize 2026-08-11): เดิมอ่าน snapshot แล้ว deleteRow ตาม index โดยไม่มี lock คั่น
  // เหตุผลเดียวกับ addTransaction/editTransaction ที่แก้ไปแล้ว — ถ้ามีคำขอแทรกกลางระหว่างอ่าน snapshot
  // กับ deleteRow แถวที่ลบอาจไม่ใช่แถวที่ตั้งใจ (index เลื่อนไปแล้ว) ลบผิดรายการแบบเงียบๆ
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: 'ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่' };
  }
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const txSheet = ss.getSheetByName('ธุรกรรม');
    const data = txSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === p.txId) {
        const sid = data[i][1];
        // F2 fix (scrutinize 2026-08-11): เก็บ log ก่อนลบจริง — ธนาคารจริงไม่มีทางลบรายการโดยไม่เหลือหลักฐาน
        logTxChange('ลบ', p.txId, data[i][5], '', p.password === ADMIN_PASSWORD ? 'แอดมิน' : 'ครู');
        txSheet.deleteRow(i + 1);
        SpreadsheetApp.flush();
        invalidateBalanceCache();
        return { ok: true, newBalance: getBalance(sid) };
      }
    }
    return { ok: false, error: 'ไม่พบรายการ' };
  } finally {
    lock.releaseLock();
  }
}

function getHistory(p) {
  if (!checkAuth(p)) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const txSheet = ss.getSheetByName('ธุรกรรม');
  if (!txSheet) return { ok: true, transactions: [] };

  const allData = txSheet.getDataRange().getValues();
  if (allData.length < 2) return { ok: true, transactions: [] };

  const headers = allData[0].map(h => String(h).trim());
  const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  function findH(names) {
    for (var n of names) { var i = headers.indexOf(n); if (i >= 0) return i; }
    return -1;
  }

  // หา index แต่ละ column ด้วยชื่อ header
  let tiId    = findH(['id']);
  let tiStu   = findH(['นักเรียน_id']);
  let tiName  = findH(['ชื่อ']);
  let tiGrade = findH(['ชั้น']);
  let tiType  = findH(['ประเภท']);
  let tiAmt   = findH(['จำนวนเงิน']);
  let tiDate  = findH(['วันที่']);
  let tiNote  = findH(['หมายเหตุ']); // อาจไม่มีถ้าเป็นแถวเก่าก่อนเพิ่มฟีเจอร์นี้ — findH คืน -1 แล้ว fallback เป็น '' ด้านล่าง

  // ถ้าหาจากชื่อไม่เจอ (header เป็น "คอลัมน์ 1" etc.) ให้ใช้ position ตามลำดับ
  // format: id, นักเรียน_id, ชื่อ, ชั้น, ประเภท, จำนวนเงิน, ปีการศึกษา, วันที่
  if (tiId < 0 && tiStu < 0 && tiName < 0) {
    tiId    = 0;
    tiStu   = 1;
    tiName  = 2;
    tiGrade = 3;
    tiType  = 4;
    tiAmt   = 5;
    // tiDate: scan หา column ที่มี Date object หรือ Thai string
    tiDate  = -1;
    const sampleRows = allData.slice(1).filter(r => r[0] !== '');
    if (sampleRows.length > 0) {
      for (let ci = headers.length - 1; ci >= 0; ci--) {
        const val = sampleRows[0][ci];
        if (val instanceof Date) { tiDate = ci; break; }
        if (typeof val === 'string' && MONTHS_TH.some(m => val.includes(m))) { tiDate = ci; break; }
      }
    }
    if (tiDate < 0) tiDate = headers.length - 1;
  }

  // scan หา tiDate จาก content ถ้ายังหาจากชื่อไม่เจอ
  if (tiDate < 0) {
    const sampleRows = allData.slice(1).filter(r => r[0] !== '');
    if (sampleRows.length > 0) {
      for (let ci = headers.length - 1; ci >= 0; ci--) {
        const val = sampleRows[0][ci];
        if (val instanceof Date) { tiDate = ci; break; }
        if (typeof val === 'string' && MONTHS_TH.some(m => val.includes(m))) { tiDate = ci; break; }
      }
    }
    if (tiDate < 0) tiDate = headers.length - 1;
  }

  let data = allData.slice(1)
    .filter(r => r.length > tiId && r[tiId] !== '' && r[tiId] !== null && r[tiId] !== undefined)
    .map(r => {
      const rawDate = r[tiDate];
      // ใช้ shared helper thaiDateParts (+7h shift) แทนคำนวณเองซ้ำ — รวม convention เดียวกับ parseThaiDateStr/exportMonthly/exportTerm
      const dateStr = (rawDate instanceof Date) ? thaiDateStrFromParts(thaiDateParts(rawDate), true) : String(rawDate || '');
      return {
        id:        String(r[tiId]  || ''),
        studentId: String(r[tiStu] || ''),
        name:      String(r[tiName]  || ''),
        grade:     String(r[tiGrade] || ''),
        type:      String(r[tiType]  || ''),
        amount:    parseFloat(r[tiAmt]) || 0,
        date:      dateStr,
        note:      tiNote >= 0 ? String(r[tiNote] || '') : ''
      };
    });

  if (p.studentId) data = data.filter(r => r.studentId === p.studentId);
  // F2 fix (scrutinize 2026-08-11): เดิม strict equality — ถ้า grade ที่บันทึกไว้มีช่องว่างเกิน/รูปแบบเพี้ยนแม้ตัวเดียว
  // (เช่น "ป.1 " มี trailing space) จะหลุดจาก filter นี้ไปเงียบๆ ทำให้หน้าครู (ที่ส่ง grade มา filter ตรงนี้) เห็นน้อยกว่าจริง
  // ขณะที่หน้าแอดมิน (group เองฝั่ง client จาก key ดิบ) ไปโป่งอยู่ใน "อื่นๆ/ไม่ทราบชั้น" แทน — สองฝั่งเบี้ยวกันคนละแบบ
  // trim ทั้งสองข้างก่อนเทียบ กันช่องว่างหลุดทำให้ค่าที่ควรเป็นชั้นเดียวกันไม่ match กัน
  if (p.grade)     data = data.filter(r => String(r.grade).trim() === String(p.grade).trim());
  if (p.date)      data = data.filter(r => r.date.indexOf(p.date) === 0);
  // fix (2026-08-07): เดิมไม่มี filter เดือน/ปีเลย ทั้งที่หน้าแอดมินส่ง month/year มาด้วย
  // ทำให้ limit (บรรทัดถัดไป) ตัดเอา "500 รายการล่าสุดทั้งโรงเรียน" ก่อน ค่อยกรองเดือนที่ frontend ทีหลัง
  // ถ้าเดือนที่ขอไม่ได้อยู่ใน 500 รายการล่าสุด ข้อมูลเดือนนั้นหายไปเงียบๆ ก่อนถึง frontend เลย (ยอดรายเดือนแอดมินขาดหายไปหลักพัน-หมื่นบาทได้)
  // ต้อง filter เดือน/ปีตรงนี้ ก่อน reverse+limit เสมอ ให้ limit ตัดแค่ "ภายในเดือนที่ขอ" ไม่ใช่ตัดทั้งโรงเรียนก่อนรู้ด้วยซ้ำว่าจะเอาเดือนไหน
  if (p.month && p.year) data = data.filter(r => r.date.indexOf(p.month) >= 0 && r.date.indexOf(String(p.year)) >= 0);

  data.reverse();
  // fix รอบ 2 (2026-08-07): รอบแรกแก้แค่ "ลำดับ" ให้ filter เดือนก่อน limit ตัด แต่ตัวเลข limit (500 จากฝั่งแอดมิน)
  // เองก็เล็กเกินไปสำหรับ "หนึ่งเดือน ทั้งโรงเรียนรวม 8 ชั้น" อยู่ดี ถ้าเดือนนั้นมีธุรกรรมรวมเกิน 500 (โรงเรียนเก็บออมทรัพย์รายสัปดาห์ นักเรียนหลักร้อยคน
  // เดือนเดียวทะลุ 500 ได้ง่ายมาก) ชั้นที่ดันตกอยู่นอกช่วง 500 ที่เหลือ (ตาม reverse แล้วตัด) จะหายไปทั้งชั้นแบบเงียบๆ
  // (พิสูจน์ด้วยจำลองตัวเลข: 8 ชั้น x 25 คน x ฝากสัปดาห์ละครั้ง = 800 รายการ/เดือน > 500 → ป.1 หายไปทั้งชั้น 2,000 บาท)
  // ทางแก้ที่ถูกต้อง: ถ้า query ถูก scope ด้วยช่วงเวลาแล้ว (date หรือ month+year) ผลลัพธ์ถูกจำกัดด้วยข้อมูลจริงของช่วงนั้นอยู่แล้ว
  // ไม่ควรมี limit มาตัดซ้ำอีกชั้น — ตัด limit เฉพาะตอนที่ query ไม่ได้ระบุช่วงเวลาเลย (กรณีในอนาคตที่อาจมี "ดูล่าสุด N รายการ" แบบไม่ระบุช่วง)
  var alreadyScopedByTime = !!(p.date || (p.month && p.year));
  if (p.limit && !alreadyScopedByTime) data = data.slice(0, parseInt(p.limit));
  return { ok: true, transactions: data };
}

// ============================================================
// SUMMARY
// ============================================================
function getAllSummary(p) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const studAllData = ss.getSheetByName('นักเรียน').getDataRange().getValues();
  // dynamic header lookup ป้องกัน column order เปลี่ยน
  const sumHeaders = studAllData[0].map(function(h) { return String(h).trim(); });
  function findSColSum(names) {
    for (var n of names) { var idx = sumHeaders.indexOf(n); if (idx >= 0) return idx; }
    return -1;
  }
  const ssId     = findSColSum(['id']);
  const ssName   = findSColSum(['ชื่อ-สกุล', 'ชื่อ สกุล', 'ชื่อ']);
  const ssGrade  = findSColSum(['ชั้นปัจจุบัน', 'ชั้น']);
  const ssYear   = findSColSum(['ปีที่เข้า', 'ปีการศึกษา']);
  const ssStatus = findSColSum(['สถานะ']);
  const ssBank   = findSColSum(['เลขบัญชี_ธกส', 'เลขบัญชีธกส', 'เลขบัญชี']);
  const ssRoll   = findSColSum(['เลขที่']);

  const studRows = studAllData.slice(1).filter(function(r) { return r[ssId >= 0 ? ssId : 0] !== ''; });
  const balances = calcAllBalances(ss);
  const grades = {};
  GRADES.forEach(g => grades[g] = { students:[], totalBalance:0 });
  studRows.forEach(function(r) {
    const id     = String(r[ssId     >= 0 ? ssId     : 0] || '');
    const name   = String(r[ssName   >= 0 ? ssName   : 1] || '');
    const grade  = String(r[ssGrade  >= 0 ? ssGrade  : 2] || '');
    const year   = String(r[ssYear   >= 0 ? ssYear   : 3] || '');
    const status = String(r[ssStatus >= 0 ? ssStatus : 4] || '');
    const bank   = String(r[ssBank   >= 0 ? ssBank   : 5] || '');
    const roll   = ssRoll >= 0 ? String(r[ssRoll] || '') : '';
    // fix (scrutinize 2026-08-11): เดิม !grades[grade] เทียบ grade ดิบไม่ trim — บั๊กคลาสเดียวกับที่แก้ไปแล้วใน
    // getStudents/getBootstrap (ดู normGrade) แต่ลืมฟังก์ชันนี้ นักเรียนที่มีค่า "ชั้น" เพี้ยนช่องว่างจะหายไปทั้งคน
    // จากหน้าภาพรวมเงียบๆ — ใช้ normGrade ให้ตรงกับจุดอื่น
    const gradeKey = normGrade(grade);
    if (status === 'จบการศึกษา' || !grades[gradeKey]) return;
    const bal = balances[id] || 0;
    grades[gradeKey].students.push({ id, name, grade: gradeKey, entryYear:year, bankAccount:bank, rollNo:roll, balance:bal });
    grades[gradeKey].totalBalance += bal;
  });
  // เรียงตามเลขที่ต่อชั้น (shared กับ getStudents()/getBootstrap() — ดู sortStudentsByRoll ด้านบน
  // เคยลืมอัปเดตจุดนี้มาก่อน เป็น duplicate ที่ 3 ของ pattern เดียวกัน พบระหว่าง scrutinize 2026-07-07)
  GRADES.forEach(g => sortStudentsByRoll(grades[g].students));
  const grandTotal = Object.values(grades).reduce((s,g) => s+g.totalBalance, 0);
  const totalStudents = studRows.filter(function(r) {
    return String(r[ssStatus >= 0 ? ssStatus : 4] || '') !== 'จบการศึกษา';
  }).length;
  return { ok: true, grades, grandTotal, totalStudents };
}

// ============================================================
// EXPORT รายเดือน — สร้าง sheet สรุปส่งธนาคาร
// ============================================================
function exportMonthly(p) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };

  const monthIdx = parseInt(p.month) - 1;
  const year     = parseInt(p.year);
  const grade    = p.grade || '';

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const txSheet   = ss.getSheetByName('ธุรกรรม');
  const studSheet = ss.getSheetByName('นักเรียน');
  if (!txSheet || !studSheet) return { ok: false, error: 'ไม่พบ sheet' };

  // อ่านนักเรียน — dynamic index
  const studAllData = studSheet.getDataRange().getValues();
  const studHeaders = studAllData[0].map(h => String(h).trim());
  function findSH(names) {
    for (var n of names) { var i = studHeaders.indexOf(n); if (i >= 0) return i; }
    return -1;
  }
  const siId    = findSH(['id']);
  const siName  = findSH(['ชื่อ-สกุล','ชื่อ สกุล','ชื่อ']);
  const siGrade = findSH(['ชั้นปัจจุบัน','ชั้น']);
  const siBank  = findSH(['เลขบัญชี_ธกส','เลขบัญชีธกส','เลขบัญชี']);

  const studMap = {};
  studAllData.slice(1).forEach(r => {
    if (r[siId]) studMap[String(r[siId])] = {
      name:        String(r[siName]  || ''),
      grade:       String(r[siGrade] || ''),
      bankAccount: siBank >= 0 ? String(r[siBank] || '') : ''
    };
  });

  // อ่านธุรกรรม — dynamic index
  const txAllData = txSheet.getDataRange().getValues();
  const txHeaders = txAllData[0].map(h => String(h).trim());
  function findTH(names) {
    for (var n of names) { var i = txHeaders.indexOf(n); if (i >= 0) return i; }
    return -1;
  }
  const tiStuId = findTH(['นักเรียน_id']);
  const tiGrade = findTH(['ชั้น']);
  const tiType  = findTH(['ประเภท']);
  const tiAmt   = findTH(['จำนวนเงิน']);
  const tiDate  = findTH(['วันที่']);

  const monthName = THAI_MONTHS[monthIdx];
  const yearStr   = String(year);

  // helper แปลงวันที่ทุกรูปแบบ → Thai string
  function toThaiDateStr(val) {
    if (!val) return '';
    // ใช้ shared helper thaiDateParts (+7h shift) แทน local getter ตรงๆ — รวม convention เดียวกับ getHistory/parseThaiDateStr/exportTerm
    if (val instanceof Date) return thaiDateStrFromParts(thaiDateParts(val), false);
    return String(val);
  }

  const txRows = txAllData.slice(1).filter(r => {
    if (!r[0]) return false;
    const dateStr    = toThaiDateStr(r[tiDate]);
    const gradeMatch = !grade || String(r[tiGrade] || '') === grade;
    return dateStr.includes(monthName) && dateStr.includes(yearStr) && gradeMatch;
  });

  // รวมยอดฝากแต่ละคน
  const summary = {};
  txRows.forEach(r => {
    const sid  = String(r[tiStuId] || '');
    const type = String(r[tiType]  || '');
    const amt  = parseFloat(r[tiAmt]) || 0;
    if (!summary[sid]) summary[sid] = { deposit: 0, withdraw: 0 };
    if (type === 'ฝาก') summary[sid].deposit += amt;
    else summary[sid].withdraw += amt;
  });

  if (Object.keys(summary).length === 0) {
    return { ok: false, error: 'ไม่พบข้อมูลธุรกรรมในเดือน ' + monthName + ' ' + year + (grade ? ' ชั้น' + grade : '') + '\nกรุณาตรวจสอบว่ามีการบันทึกฝากเงินในเดือนนี้หรือไม่' };
  }

  // เรียงตามชั้น
  const gradeOrder = {};
  GRADES.forEach((g, i) => gradeOrder[g] = i);

  const studentList = Object.entries(summary)
    .map(([sid, s]) => {
      const info = studMap[sid] || { name: 'ไม่พบ', grade: '', bankAccount: '' };
      return { sid, deposit: s.deposit, withdraw: s.withdraw, net: s.deposit - s.withdraw, ...info };
    })
    .filter(s => !grade || s.grade === grade)
    .sort((a, b) => {
      const go = (gradeOrder[a.grade] || 0) - (gradeOrder[b.grade] || 0);
      return go !== 0 ? go : a.name.localeCompare(b.name, 'th');
    });

  // ===== สร้าง Sheet ตามรูปแบบธนาคาร =====
  const sheetName = 'ฝากเดือน' + monthName + year + (grade ? '_' + grade : '');
  let out = ss.getSheetByName(sheetName);
  if (out) ss.deleteSheet(out);
  out = ss.insertSheet(sheetName);

  const dateLabel = 'วันที่ .......... เดือน ' + monthName + ' พ.ศ. ' + year;

  // === แถว 1: เลขที่เอกสาร + หน้าที่ ===
  out.getRange('A1').setValue('เลขที่เอกสาร 002');
  out.getRange('G1').setValue('หน้าที่ 1');
  out.getRange('A1').setFontWeight('bold').setBackground('#FFFF00');
  out.getRange('G1').setFontWeight('bold');

  // === แถว 2: ชื่อโรงเรียน ===
  out.getRange('A2:G2').merge();
  out.getRange('A2').setValue('โรงเรียนธนาคารบ้านท่าชะอม')
    .setHorizontalAlignment('center')
    .setFontWeight('bold')
    .setFontSize(14);

  // === แถว 3: หัวเรื่อง ===
  out.getRange('A3:G3').merge();
  out.getRange('A3').setValue('ทะเบียนการรับฝากเงินประจำ' + dateLabel)
    .setHorizontalAlignment('center')
    .setFontWeight('bold');

  // === แถว 4: ว่าง + ชั้น ===
  if (grade) {
    out.getRange('A4:G4').merge();
    out.getRange('A4').setValue('ชั้น ' + grade)
      .setHorizontalAlignment('center')
      .setFontWeight('bold');
  }

  // === แถว 5: หัวตาราง ===
  const headerRow = grade ? 5 : 4;
  const headers = ['ลำดับที่', 'เลขที่บัญชี', 'ชื่อบัญชี', 'การรับฝากเงิน\nจำนวน', 'การรับฝากเงิน\nยอดรวม', 'ผู้รับเงิน', 'หมายเหตุ'];
  out.getRange(headerRow, 1, 1, 7).setValues([headers]);
  out.getRange(headerRow, 1, 1, 7)
    .setBackground('#92D050')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  out.setRowHeight(headerRow, 45);

  // === ข้อมูล ===
  let row = headerRow + 1;
  let grandTotal = 0;

  studentList.forEach((s, i) => {
    const net = s.deposit - s.withdraw;
    out.getRange(row, 1, 1, 7).setValues([[
      i + 1,
      s.bankAccount || '',
      s.name,
      net,
      net,
      '',
      ''
    ]]);
    // จัดรูปแบบ
    out.getRange(row, 1).setHorizontalAlignment('center');
    out.getRange(row, 4, 1, 2).setNumberFormat('#,##0').setHorizontalAlignment('right');
    // สีแถวสลับ
    if ((i + 1) % 2 === 0) out.getRange(row, 1, 1, 7).setBackground('#F2F2F2');
    grandTotal += net;
    row++;
  });

  // === แถวรวม ===
  out.getRange(row, 1, 1, 7).setValues([['', '', 'รวมทั้งหมด', grandTotal, grandTotal, '', '']]);
  out.getRange(row, 1, 1, 7)
    .setFontWeight('bold')
    .setBackground('#92D050');
  out.getRange(row, 4, 1, 2).setNumberFormat('#,##0');

  // === ลายเซ็น ===
  row += 2;
  out.getRange(row, 2, 1, 2).merge();
  out.getRange(row, 2).setValue('ลงชื่อ .................................................. ผู้รับฝาก');
  out.getRange(row, 5, 1, 2).merge();
  out.getRange(row, 5).setValue('ลงชื่อ .................................................. ผู้ตรวจสอบ');
  row++;
  out.getRange(row, 2, 1, 2).merge();
  out.getRange(row, 2).setValue('(.............................................)');
  out.getRange(row, 5, 1, 2).merge();
  out.getRange(row, 5).setValue('(.............................................)');

  // === จัดขนาดคอลัมน์ ===
  out.setColumnWidth(1, 55);   // ลำดับ
  out.setColumnWidth(2, 130);  // เลขบัญชี
  out.setColumnWidth(3, 180);  // ชื่อ
  out.setColumnWidth(4, 80);   // จำนวน
  out.setColumnWidth(5, 80);   // ยอดรวม
  out.setColumnWidth(6, 80);   // ผู้รับเงิน
  out.setColumnWidth(7, 80);   // หมายเหตุ

  // ===เส้นตาราง===
  out.getRange(headerRow, 1, row - headerRow, 7).setBorder(true, true, true, true, true, true);

  return {
    ok: true,
    sheetName,
    studentCount: studentList.length,
    totalDeposit: grandTotal,
    totalWithdraw: 0,
    net: grandTotal,
    url: 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + out.getSheetId()
  };
}

// ============================================================
// ทะเบียนรับฝากธนาคารรายวัน + ใบปะหน้านำฝาก (สร้าง 2026-07-07)
// แทนที่การสร้างเอกสารนี้ด้วยมือทุกวันที่ต้องส่ง ธ.ก.ส.
// ดู BLUEPRINT-bank-deposit-registry.md / CONSTRUCTION_PLAN-bank-deposit-registry.md
// ============================================================

// แปลง Thai date string "D MMM YYYY" (เช่น "7 ก.ค. 2569") เป็น {day, monthIdx, year}
// คืน null ถ้า parse ไม่ได้ (กันชื่อ sheet เพี้ยน/กรองผิดวันแบบเงียบๆ)
// รับ Date object ได้ด้วย — เซลล์ "วันที่" บางแถวถูก Google Sheets แปลงเป็น Date object จริงแทน string เฉยๆ
// (auto-detect ตอนพิมพ์/วางในชีต) เจอ pattern นี้มาก่อนแล้วใน getHistory/exportMonthly/exportTerm
// ถ้าไม่รองรับตรงนี้ แถวที่เป็น Date object จะหลุดจากการกรองแบบเงียบๆ ทันที (String(dateObj) ได้ format คนละแบบ)
function parseThaiDateStr(dateVal) {
  if (dateVal instanceof Date) {
    return thaiDateParts(dateVal); // ใช้ shared helper (+7h shift) แทน local getter ตรงๆ — ดู thaiDateParts ด้านบน
  }
  var parts = String(dateVal || '').trim().split(' ').filter(function(x){ return x !== ''; });
  if (parts.length < 3) return null;
  var day = parseInt(parts[0], 10);
  var monthIdx = THAI_MONTHS.indexOf(parts[1]);
  var year = parseInt(parts[2], 10);
  if (isNaN(day) || monthIdx < 0 || isNaN(year)) return null;
  return { day: day, monthIdx: monthIdx, year: year };
}

// สำหรับ generateDepositRegistry เท่านั้น — รับ "MMM YYYY" (ไม่มีวัน) เช่น "ก.ค. 2569"
function parseThaiMonthStr(monthStr) {
  var parts = String(monthStr || '').trim().split(' ').filter(function(x){ return x !== ''; });
  if (parts.length < 2) return null;
  var monthIdx = THAI_MONTHS.indexOf(parts[0]);
  var year = parseInt(parts[1], 10);
  if (monthIdx < 0 || isNaN(year)) return null;
  return { monthIdx: monthIdx, year: year };
}

function generateDepositRegistry(p) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };

  // rangeStr เป็น "MMM YYYY" (ไม่มีวัน) เช่น "ก.ค. 2569" — รวมยอดฝากทั้งเดือนเป็นทะเบียนเดียว
  // (Pam ยืนยัน 2026-07-07 ว่าต้องการรายเดือน ไม่ใช่รายวัน — สอดคล้องกับที่เงินสดสะสมไว้แล้วค่อยฝากธนาคารทีเดียวต่อเดือน)
  const rangeStr = String(p.date || '').trim();
  const docNo = String(p.docNo || '').trim();
  const receiverName = String(p.receiverName || '').trim();
  if (!rangeStr) return { ok: false, error: 'กรุณาระบุเดือน' };

  const parsed = parseThaiMonthStr(rangeStr);
  if (!parsed) return { ok: false, error: 'รูปแบบเดือนไม่ถูกต้อง (' + rangeStr + ')' };

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const txSheet = ss.getSheetByName('ธุรกรรม');
  const studSheet = ss.getSheetByName('นักเรียน');
  if (!txSheet || !studSheet) return { ok: false, error: 'ไม่พบ sheet' };

  // อ่านนักเรียน — dynamic header lookup (pattern เดียวกับ exportMonthly)
  const studAllData = studSheet.getDataRange().getValues();
  const studHeaders = studAllData[0].map(function(h) { return String(h).trim(); });
  function findSH(names) {
    for (var n of names) { var i = studHeaders.indexOf(n); if (i >= 0) return i; }
    return -1;
  }
  const siId   = findSH(['id']);
  const siBank = findSH(['เลขบัญชี_ธกส', 'เลขบัญชีธกส', 'เลขบัญชี']);
  const siRoll = findSH(['เลขที่']);
  const studMap = {};
  studAllData.slice(1).forEach(function(r) {
    if (r[siId]) studMap[String(r[siId])] = {
      bankAccount: siBank >= 0 ? String(r[siBank] || '') : '',
      rollNo: siRoll >= 0 ? String(r[siRoll] || '') : ''
    };
  });

  // อ่านธุรกรรม — dynamic header lookup
  const txAllData = txSheet.getDataRange().getValues();
  const txHeaders = txAllData[0].map(function(h) { return String(h).trim(); });
  function findTH(names) {
    for (var n of names) { var i = txHeaders.indexOf(n); if (i >= 0) return i; }
    return -1;
  }
  const tiId    = findTH(['id']);
  const tiStuId = findTH(['นักเรียน_id']);
  const tiName  = findTH(['ชื่อ']);
  const tiGrade = findTH(['ชั้น']);
  const tiType  = findTH(['ประเภท']);
  const tiAmt   = findTH(['จำนวนเงิน']);
  const tiDate  = findTH(['วันที่']);

  // เฉพาะ "ฝาก" เท่านั้น (ไม่รวม "ถอน") + อยู่ในเดือน/ปีที่เลือก
  // เทียบด้วย parseThaiDateStr ของแต่ละธุรกรรมเอง (ตัดวัน/เวลาทิ้ง เหลือแค่ monthIdx+year) ไม่ใช้ string match
  // เพราะทนกว่า — ไม่ต้องกังวลเรื่อง "7" ไปแมตช์ "17" แบบ prefix match ของเวอร์ชันรายวันเดิม
  const matches = txAllData.slice(1).filter(function(r) {
    if (!r[tiId]) return false;
    if (String(r[tiType] || '') !== 'ฝาก') return false;
    if ((parseFloat(r[tiAmt]) || 0) <= 0) return false; // เฉพาะฝากจริง >0 บาท (กันแถวผิดพลาดถ้าใครแก้ sheet มือ)
    // ส่ง r[tiDate] ดิบๆ ไม่ String() ทับก่อน — ต้องให้ parseThaiDateStr เห็น Date object ถ้ามี ไม่งั้นเช็ค instanceof ข้างในจะไม่มีทางเจอ
    const txParsed = parseThaiDateStr(r[tiDate]);
    return txParsed && txParsed.monthIdx === parsed.monthIdx && txParsed.year === parsed.year;
  });

  if (!matches.length) {
    return { ok: false, error: 'ไม่พบธุรกรรมฝากในเดือน ' + rangeStr };
  }

  // เรียงตามเวลาฝากจริง (id = "T<epoch ms>") — สะท้อนลำดับที่มารับฝากครั้งแรกในเดือนนั้น
  matches.sort(function(a, b) {
    var ma = String(a[tiId]).match(/^T(\d+)$/);
    var mb = String(b[tiId]).match(/^T(\d+)$/);
    var na = ma ? parseInt(ma[1], 10) : 0;
    var nb = mb ? parseInt(mb[1], 10) : 0;
    return na - nb;
  });

  // รวมยอดต่อคน (คนเดียวกันอาจฝากหลายครั้งในเดือนเดียว) — group by นักเรียน_id แล้ว sum
  // เลขบัญชี+เลขที่: join จากชีตนักเรียนปัจจุบัน (สดตอนสร้างทะเบียน กันกรณีเพิ่งเพิ่มเลขบัญชี/แก้เลขที่ทีหลัง)
  // ชื่อ+ชั้น: ใช้ snapshot จากธุรกรรมแรกที่เจอของแต่ละคน (ไม่พึ่ง join 100%) — กันชื่อหายถ้าลบนักเรียนไปแล้ว
  // และกันปัญหาเลื่อนชั้นแล้วยอดเก่าไปโผล่ผิดชั้น (ชั้น ณ ตอนฝากจริง ไม่ใช่ชั้นปัจจุบัน)
  const groups = {};
  const order = [];
  matches.forEach(function(r) {
    const stuId = String(r[tiStuId] || '');
    const key = stuId || ('name:' + String(r[tiName] || ''));
    if (!groups[key]) {
      const info = studMap[stuId] || { bankAccount: '', rollNo: '' };
      groups[key] = {
        id: stuId,
        name: String(r[tiName] || ''),
        grade: String(r[tiGrade] || ''),
        bankAccount: info.bankAccount || '',
        rollNo: info.rollNo || '',
        amount: 0,
        count: 0
      };
      order.push(key);
    }
    groups[key].amount += parseFloat(r[tiAmt]) || 0;
    groups[key].count += 1;
  });
  let rows = order.map(function(key) { return groups[key]; });

  // เรียงตามชั้น (ลำดับ GRADES) แล้วตามเลขที่ในชั้นเดียวกัน (คนไม่มีเลขที่ตกท้ายกลุ่มชั้นนั้น)
  // ทำครั้งเดียวตอนนี้ก่อนแยก account/no-account — แยกทีหลังยังคงลำดับเดิมไว้ทั้งคู่
  rows.sort(function(a, b) {
    var ga = GRADES.indexOf(a.grade); if (ga < 0) ga = GRADES.length;
    var gb = GRADES.indexOf(b.grade); if (gb < 0) gb = GRADES.length;
    if (ga !== gb) return ga - gb;
    var ra = parseInt(a.rollNo, 10), rb = parseInt(b.rollNo, 10);
    var raOk = a.rollNo !== '' && a.rollNo != null && !isNaN(ra);
    var rbOk = b.rollNo !== '' && b.rollNo != null && !isNaN(rb);
    if (raOk && rbOk) return ra - rb;
    if (raOk && !rbOk) return -1;
    if (!raOk && rbOk) return 1;
    var na = parseInt(String(a.id).replace('S', '')) || 0;
    var nb = parseInt(String(b.id).replace('S', '')) || 0;
    return na - nb;
  });

  // แยกคนมีเลขบัญชีกับไม่มี — Sheet1 (ส่งธนาคาร) เอาเฉพาะคนมีบัญชี, คนไม่มีบัญชีไปอยู่ Sheet3 ต่างหาก
  const accountRows = rows.filter(function(r) { return r.bankAccount !== ''; });
  const noAccountRows = rows.filter(function(r) { return r.bankAccount === ''; });

  if (accountRows.length === 0) {
    return { ok: false, error: 'มีคนฝากในเดือนนี้ แต่ยังไม่มีใครมีเลขบัญชี ธ.ก.ส. เลย ไม่สามารถสร้างทะเบียนส่งธนาคารได้' };
  }

  const totalAmount = accountRows.reduce(function(s, r) { return s + r.amount; }, 0);
  const depositorCount = accountRows.length; // จำนวนคนจริงที่มีบัญชี (ไม่ใช่จำนวนครั้งที่ฝาก และไม่รวมคนไม่มีบัญชี)
  const dateSlug = (parsed.monthIdx + 1) + '-' + parsed.year; // เช่น "7-2569"
  const sheet1Name = 'ทะเบียนฝาก_' + dateSlug;
  const sheet2Name = 'ปะหน้าฝาก_' + dateSlug;

  // เช็ค guard ของ Sheet2 ก่อนแตะ Sheet1 เลย (fail fast) — เดิม guard นี้เช็คทีหลังสุด
  // ทำให้ Sheet1 ถูกลบ+สร้างใหม่ไปแล้วก่อนจะรู้ว่าต้อง error กลายเป็น "error แต่ Sheet1 เปลี่ยนไปแล้ว"
  // ซึ่งขัดกับสิ่งที่ Pam คาดหวังว่า error ควรแปลว่า "ไม่มีอะไรเกิดขึ้นเลย"
  const s2Existing = ss.getSheetByName(sheet2Name);
  if (s2Existing) {
    const existingCounts = s2Existing.getRange(6, 3, 12, 1).getValues().flat();
    const hasCounts = existingCounts.some(function(v) { return v !== '' && v !== null && !isNaN(v) && Number(v) !== 0; });
    if (hasCounts) {
      return { ok: false, error: 'ชีต "' + sheet2Name + '" มีข้อมูลนับเงินสดที่กรอกไว้แล้ว ถ้าต้องการสร้างใหม่ทับ กรุณาลบชีตนี้เองก่อน (คลิกขวาที่แท็บชีต > ลบ)' };
    }
  }

  // ==== Sheet1: ทะเบียนการรับฝากเงินประจำวัน ====
  let s1 = ss.getSheetByName(sheet1Name);
  if (s1) ss.deleteSheet(s1);
  s1 = ss.insertSheet(sheet1Name);

  s1.getRange('A1').setValue('เลขที่เอกสาร ' + docNo).setFontWeight('bold').setBackground('#FFFF00');
  s1.getRange('A2:G2').merge();
  s1.getRange('A2').setValue(SCHOOL_NAME).setHorizontalAlignment('center').setFontWeight('bold').setFontSize(14);
  s1.getRange('A3:G3').merge();
  s1.getRange('A3').setValue('ทะเบียนการรับฝากเงินประจำเดือน ' + rangeStr).setHorizontalAlignment('center').setFontWeight('bold');

  const headerRow = 4;
  const headers1 = ['ลำดับที่', 'เลขที่บัญชี', 'ชื่อบัญชี', 'จำนวน', 'ยอดรวม', 'ผู้รับเงิน', 'หมายเหตุ'];
  s1.getRange(headerRow, 1, 1, 7).setValues([headers1]);
  s1.getRange(headerRow, 1, 1, 7)
    .setBackground('#92D050').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  s1.setRowHeight(headerRow, 45);

  // จัดกลุ่มเป็นช่วงต่อชั้น (ตามลำดับ GRADES) — ข้ามชั้นที่ไม่มีใครฝาก (accountRows เรียงชั้น+เลขที่มาแล้ว)
  // ลำดับที่ (seq) ต่อเนื่องทั้งไฟล์ ไม่รีเซ็ตต่อชั้น ตาม Decision Log #19
  let row = headerRow + 1;
  let seq = 1;

  // แยกเป็นฟังก์ชันกลาง — ใช้ทั้งกับชั้นที่รู้จักใน GRADES และหมวด "อื่นๆ" ด้านล่าง
  // (กันโค้ดซ้ำ 2 ที่แล้วมีโอกาสแก้ไม่ตรงกัน)
  function renderSection(label, sectionRows) {
    if (!sectionRows.length) return;
    s1.getRange(row, 1, 1, 7).merge();
    s1.getRange(row, 1).setValue(label).setFontWeight('bold').setBackground('#D9D9D9').setHorizontalAlignment('left');
    row++;

    let subtotal = 0;
    sectionRows.forEach(function(r) {
      // จำนวน กับ ยอดรวม เขียนจากตัวแปรเดียวกันเสมอ (r.amount) — กันบั๊กพิมพ์แยก 2 ที่ไม่ตรงกัน
      // ที่เจอในไฟล์ตัวอย่างจริง (แถวลำดับที่ 93 ของกรกฎาคม 2568: จำนวน=0 แต่ยอดรวม=20)
      // หมายเหตุ: โชว์จำนวนครั้งที่ฝากถ้ามากกว่า 1 (ยอดนี้เป็นผลรวมทั้งเดือน ไม่ใช่ฝากครั้งเดียว)
      const note = r.count > 1 ? ('รวม ' + r.count + ' ครั้ง') : '';
      s1.getRange(row, 1, 1, 7).setValues([[seq, r.bankAccount, r.name, r.amount, r.amount, receiverName, note]]);
      s1.getRange(row, 1).setHorizontalAlignment('center');
      s1.getRange(row, 4, 1, 2).setNumberFormat('#,##0').setHorizontalAlignment('right');
      if (seq % 2 === 0) s1.getRange(row, 1, 1, 7).setBackground('#F2F2F2');
      subtotal += r.amount;
      row++;
      seq++;
    });

    s1.getRange(row, 1, 1, 7).setValues([['', '', 'รวม' + label + ' (' + sectionRows.length + ' ราย)', subtotal, subtotal, '', '']]);
    s1.getRange(row, 1, 1, 7).setFontWeight('bold').setBackground('#FFF2CC');
    s1.getRange(row, 4, 1, 2).setNumberFormat('#,##0');
    row++;
  }

  GRADES.forEach(function(g) {
    renderSection('ชั้น ' + g, accountRows.filter(function(r) { return r.grade === g; }));
  });

  // กันเงินหายเงียบๆ: ถ้าใครมีค่า "ชั้น" ในธุรกรรมไม่ตรงกับ GRADES ที่รู้จักเป๊ะ (ข้อมูลเพี้ยน เคยเจอปัญหานี้กับ อ.3 มาก่อน)
  // ต้องยังโผล่ในตารางที่เห็นได้ ไม่งั้นยอดรวมใหญ่จะไม่เท่ากับผลรวมแถวที่เห็นจริง (บั๊กคลาสเดียวกับที่ทั้งฟีเจอร์นี้กันไว้)
  const otherRows = accountRows.filter(function(r) { return GRADES.indexOf(r.grade) < 0; });
  renderSection('อื่นๆ/ไม่ทราบชั้น', otherRows);

  // ยอดรวมใหญ่ปิดท้ายทั้งหมด
  s1.getRange(row, 1, 1, 7).setValues([['', '', 'รวมทั้งหมด (' + depositorCount + ' ราย)', totalAmount, totalAmount, '', '']]);
  s1.getRange(row, 1, 1, 7).setFontWeight('bold').setBackground('#1C1917').setFontColor('#FFFFFF');
  s1.getRange(row, 4, 1, 2).setNumberFormat('#,##0');

  s1.getRange(headerRow, 1, row - headerRow + 1, 7).setBorder(true, true, true, true, true, true);
  s1.setColumnWidth(1, 55);
  s1.setColumnWidth(2, 130);
  s1.setColumnWidth(3, 180);
  s1.setColumnWidth(4, 80);
  s1.setColumnWidth(5, 80);
  s1.setColumnWidth(6, 80);
  s1.setColumnWidth(7, 80);

  // ==== Sheet2: ใบปะหน้านำฝาก ธ.ก.ส. (ตรวจนับเงินสด) ====
  // guard กันลบทับข้อมูลนับเงินสด เช็คไปแล้วก่อนหน้านี้ (fail fast ก่อนแตะ Sheet1) — ตรงนี้แค่ลบของเดิมทิ้งถ้ามี
  let s2 = s2Existing;
  if (s2) ss.deleteSheet(s2);
  s2 = ss.insertSheet(sheet2Name);

  s2.getRange('A1:D1').merge();
  s2.getRange('A1').setValue('ใบปะหน้านำฝาก ธ.ก.ส. ' + SCHOOL_NAME).setHorizontalAlignment('center').setFontWeight('bold').setFontSize(13);
  s2.getRange('A2:D2').merge();
  s2.getRange('A2').setValue('ใบตรวจนับเงินสดคงเหลือ').setHorizontalAlignment('center').setFontWeight('bold');
  s2.getRange('A3').setValue('ประจำเดือน ' + rangeStr);

  const denomHeaderRow = 5;
  s2.getRange(denomHeaderRow, 1, 1, 4).setValues([['รายการตรวจนับเงินสด', 'มูลค่าต่อหน่วย', 'จำนวนหน่วย', 'จำนวนเงิน']]);
  s2.getRange(denomHeaderRow, 1, 1, 4).setFontWeight('bold').setBackground('#92D050');

  // ธนบัตร 1000-10 บาท + เหรียญ 10-0.25 บาท — Pam กรอกจำนวนหน่วยเอง (คอลัมน์ 3 เว้นว่าง)
  // "จำนวนเงิน" (คอลัมน์ 4) เป็นสูตรคูณ ไม่ใช่ค่าคงที่ — recalculate สดตอน Pam พิมพ์
  const denoms = [
    ['ธนบัตร', 1000], ['ธนบัตร', 500], ['ธนบัตร', 100], ['ธนบัตร', 50], ['ธนบัตร', 20], ['ธนบัตร', 10],
    ['เหรียญ', 10], ['เหรียญ', 5], ['เหรียญ', 2], ['เหรียญ', 1], ['เหรียญ', 0.5], ['เหรียญ', 0.25]
  ];
  let dRow = denomHeaderRow + 1;
  const firstDataRow = dRow;
  denoms.forEach(function(d) {
    s2.getRange(dRow, 1).setValue(d[0]);
    s2.getRange(dRow, 2).setValue(d[1]).setNumberFormat('#,##0.00');
    s2.getRange(dRow, 4).setFormula('=B' + dRow + '*C' + dRow).setNumberFormat('#,##0.00');
    dRow++;
  });
  const lastDataRow = dRow - 1;

  const sumRow1 = dRow + 1; // ยอดรวมเงินสดที่ตรวจนับได้จริง (1) — สูตร SUM คำนวณสด
  s2.getRange(sumRow1, 1, 1, 3).merge();
  s2.getRange(sumRow1, 1).setValue('ยอดรวมเงินสดที่ตรวจนับได้จริง (ธนบัตร+เหรียญ) (1)').setFontWeight('bold');
  s2.getRange(sumRow1, 4).setFormula('=SUM(D' + firstDataRow + ':D' + lastDataRow + ')').setNumberFormat('#,##0.00').setFontWeight('bold');

  const sumRow2 = sumRow1 + 1; // ยอดรวมตามทะเบียน (2) — ค่าคงที่จาก Sheet1 ตอนสร้าง (ไม่ใช่สูตรอ้างข้ามชีต กันปัญหาถ้า Pam ลบ/ย้าย Sheet1 ทีหลัง)
  s2.getRange(sumRow2, 1, 1, 3).merge();
  s2.getRange(sumRow2, 1).setValue('ยอดรวมเงินสดตามทะเบียนเงินสด (2)').setFontWeight('bold');
  s2.getRange(sumRow2, 4).setValue(totalAmount).setNumberFormat('#,##0.00').setFontWeight('bold');

  const diffRow = sumRow2 + 1; // ผลต่าง — สูตร recalculate สดตอน Pam กรอกจำนวนหน่วย
  s2.getRange(diffRow, 1, 1, 3).merge();
  s2.getRange(diffRow, 1).setValue('ผลต่าง (1)-(2)').setFontWeight('bold');
  s2.getRange(diffRow, 4).setFormula('=D' + sumRow1 + '-D' + sumRow2).setNumberFormat('#,##0.00').setFontWeight('bold');

  const countRow = diffRow + 1;
  s2.getRange(countRow, 1, 1, 4).merge();
  // "จำนวนผู้ฝากทั้งหมด" = depositorCount เสมอ (จำนวนแถวจริงใน Sheet1) — กันเลขไม่ตรงแบบที่เจอในไฟล์ตัวอย่าง (155 vs 127)
  s2.getRange(countRow, 1).setValue('จำนวนผู้ฝากทั้งหมด ' + depositorCount + ' ราย');

  const noteRow = countRow + 1;
  s2.getRange(noteRow, 1, 1, 4).merge();
  s2.getRange(noteRow, 1).setValue('*** ผลต่างต้องเท่ากับศูนย์ (0)').setFontColor('#c0392b');

  // ลายเซ็น — เว้นว่างทั้งหมดให้เซ็นมือ (เหมือนไฟล์ตัวอย่างจริง)
  let sigRow = noteRow + 2;
  s2.getRange(sigRow, 1).setValue('กรรมการผู้รักษาเงินสดโรงเรียนธนาคาร');
  s2.getRange(sigRow, 4).setValue('พนักงาน ธ.ก.ส.');
  sigRow++;
  s2.getRange(sigRow, 1).setValue('1. ..................................');
  s2.getRange(sigRow, 4).setValue('..........................................................');
  sigRow++;
  s2.getRange(sigRow, 1).setValue('2. ..................................');
  s2.getRange(sigRow, 4).setValue('(ผู้จัดการ/ผู้ช่วยผู้จัดการ)');
  sigRow++;
  s2.getRange(sigRow, 1).setValue('3. .................................. ครูผู้รับมอบเงิน');
  s2.getRange(sigRow, 4).setValue('วันที่ ................................. เวลา ............... น.');
  sigRow++;
  s2.getRange(sigRow, 1).setValue('ตำแหน่ง.............................');
  sigRow++;
  s2.getRange(sigRow, 1).setValue('วันที่ .................................................');
  sigRow += 2;
  s2.getRange(sigRow, 1, 1, 4).merge();
  s2.getRange(sigRow, 1).setValue('**** เอกสารนำส่ง ธ.ก.ส.');

  s2.setColumnWidth(1, 260);
  s2.setColumnWidth(2, 110);
  s2.setColumnWidth(3, 110);
  s2.setColumnWidth(4, 110);

  // ==== Sheet3: รายชื่อฝากจริงแต่ยังไม่มีเลขบัญชี ธ.ก.ส. (สร้างเฉพาะมีอย่างน้อย 1 คน) ====
  // ตาราง flat ไม่จัดกลุ่มชั้น ไม่มี subtotal — เป็นแค่ note เตือน Pam ไม่ได้ส่งธนาคาร
  let sheet3Name = null;
  if (noAccountRows.length > 0) {
    sheet3Name = 'ไม่มีบัญชี_' + dateSlug;
    let s3 = ss.getSheetByName(sheet3Name);
    if (s3) ss.deleteSheet(s3);
    s3 = ss.insertSheet(sheet3Name);

    s3.getRange('A1:F1').merge();
    s3.getRange('A1').setValue('รายชื่อฝากเงินแต่ยังไม่มีเลขบัญชี ธ.ก.ส. — เดือน ' + rangeStr)
      .setHorizontalAlignment('center').setFontWeight('bold').setFontSize(13);

    const s3HeaderRow = 3;
    const headers3 = ['ลำดับที่', 'ชื่อ', 'ชั้น', 'เลขที่', 'ยอดสะสมเดือนนี้', 'หมายเหตุ'];
    s3.getRange(s3HeaderRow, 1, 1, 6).setValues([headers3]);
    s3.getRange(s3HeaderRow, 1, 1, 6).setBackground('#92D050').setFontWeight('bold').setHorizontalAlignment('center');

    let r3 = s3HeaderRow + 1;
    noAccountRows.forEach(function(r, i) {
      const note = r.count > 1 ? ('รวม ' + r.count + ' ครั้ง') : '';
      s3.getRange(r3, 1, 1, 6).setValues([[i + 1, r.name, r.grade, r.rollNo || '', r.amount, note]]);
      s3.getRange(r3, 1).setHorizontalAlignment('center');
      s3.getRange(r3, 5).setNumberFormat('#,##0').setHorizontalAlignment('right');
      if ((i + 1) % 2 === 0) s3.getRange(r3, 1, 1, 6).setBackground('#F2F2F2');
      r3++;
    });

    s3.getRange(s3HeaderRow, 1, r3 - s3HeaderRow, 6).setBorder(true, true, true, true, true, true);
    s3.setColumnWidth(1, 55);
    s3.setColumnWidth(2, 180);
    s3.setColumnWidth(3, 80);
    s3.setColumnWidth(4, 70);
    s3.setColumnWidth(5, 110);
    s3.setColumnWidth(6, 100);
  }

  const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + s1.getSheetId();

  return {
    ok: true,
    sheet1Name: sheet1Name,
    sheet2Name: sheet2Name,
    sheet3Name: sheet3Name,
    noAccountCount: noAccountRows.length,
    url: url,
    totalAmount: totalAmount,
    depositorCount: depositorCount
  };
}

// ============================================================
// EXPORT รายเทอม
// ============================================================
function exportTerm(p) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };

  const term  = parseInt(p.term);
  const year  = parseInt(p.year);
  const grade = p.grade || '';
  const termMonths = term === 1 ? [4,5,6,7,8] : [10,11,0,1,2];

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const txSheet   = ss.getSheetByName('ธุรกรรม');
  const studSheet = ss.getSheetByName('นักเรียน');
  if (!txSheet || !studSheet) return { ok: false, error: 'ไม่พบ sheet' };

  // อ่านนักเรียน — dynamic index
  const studHeaders = studSheet.getDataRange().getValues()[0];
  const siName  = studHeaders.indexOf('ชื่อ-สกุล');
  const siGrade = studHeaders.indexOf('ชั้นปัจจุบัน');
  const siBank  = studHeaders.indexOf('เลขบัญชี_ธกส');
  const studMap = {};
  studSheet.getDataRange().getValues().slice(1).forEach(r => {
    if (r[0]) studMap[r[0]] = {
      name:        r[siName]  || '',
      grade:       r[siGrade] || '',
      bankAccount: siBank >= 0 ? (r[siBank] || '') : ''
    };
  });

  // อ่านธุรกรรม — dynamic index
  const txHeaders = txSheet.getDataRange().getValues()[0];
  const tiStuId = txHeaders.indexOf('นักเรียน_id');
  const tiGrade = txHeaders.indexOf('ชั้น');
  const tiType  = txHeaders.indexOf('ประเภท');
  const tiAmt   = txHeaders.indexOf('จำนวนเงิน');
  const tiDate  = txHeaders.indexOf('วันที่');

  const txRows = txSheet.getDataRange().getValues().slice(1).filter(r => {
    if (!r[0]) return false;
    // แปลง Date object หรือ string → Thai string
    const rawDate = r[tiDate];
    // ใช้ shared helper thaiDateParts (+7h shift) แทน local getter ตรงๆ — รวม convention เดียวกับ getHistory/parseThaiDateStr/exportMonthly
    const dateStr = (rawDate instanceof Date)
      ? thaiDateStrFromParts(thaiDateParts(rawDate), false)
      : String(rawDate || '');
    const gradeMatch = !grade || String(r[tiGrade] || '') === grade;
    const monthMatch = termMonths.some(m => {
      const checkYear = (term === 2 && m <= 2) ? year + 1 : year;
      return dateStr.includes(THAI_MONTHS[m]) && dateStr.includes(String(checkYear));
    });
    return monthMatch && gradeMatch;
  });

  const summary = {};
  txRows.forEach(r => {
    const sid = String(r[tiStuId] || '');
    const type = String(r[tiType] || '');
    const amt = parseFloat(r[tiAmt]) || 0;
    const rawDate = r[tiDate];
    // ใช้ shared helper thaiDateParts (+7h shift) แทน local getter ตรงๆ — รวม convention เดียวกับ getHistory/parseThaiDateStr/exportMonthly
    const dateStr = (rawDate instanceof Date)
      ? thaiDateStrFromParts(thaiDateParts(rawDate), false)
      : String(rawDate || '');
    let monthLabel = '';
    THAI_MONTHS.forEach((m, i) => { if (dateStr.includes(m)) monthLabel = m; });
    if (!summary[sid]) summary[sid] = { deposit:0, withdraw:0, monthly:{} };
    if (!summary[sid].monthly[monthLabel]) summary[sid].monthly[monthLabel] = 0;
    if (type === 'ฝาก') { summary[sid].deposit += amt; summary[sid].monthly[monthLabel] += amt; }
    else { summary[sid].withdraw += amt; summary[sid].monthly[monthLabel] -= amt; }
  });

  if (Object.keys(summary).length === 0) {
    return { ok: false, error: 'ไม่พบข้อมูลธุรกรรมในภาคเรียนที่ ' + term + ' ปี ' + year + (grade ? ' ชั้น' + grade : '') };
  }

  const termLabel  = 'เทอม' + term + '_' + year;
  const sheetName  = 'สรุป' + termLabel + (grade ? '_' + grade : '');
  let outSheet = ss.getSheetByName(sheetName);
  if (outSheet) ss.deleteSheet(outSheet);
  outSheet = ss.insertSheet(sheetName);

  const title = SCHOOL_NAME + ' — สรุปยอดออมทรัพย์ ภาคเรียนที่' + term + ' ปีการศึกษา ' + year + (grade ? ' ชั้น' + grade : '');
  outSheet.getRange(1,1).setValue(title).setFontWeight('bold').setFontSize(13);
  outSheet.getRange(2,1).setValue('วันที่สร้าง: ' + thaiDate(new Date())).setFontColor('#78716C');

  const monthLabels = termMonths.map(m => THAI_MONTHS[m]);
  const headers = ['ลำดับ','ชื่อ-สกุล','ชั้น','เลขบัญชี ธกส.'].concat(
    monthLabels.map(m => 'ฝาก ' + m)
  ).concat(['รวมฝาก','รวมถอน','คงเหลือ']);
  const totalCols = headers.length;
  outSheet.getRange(4,1,1,totalCols).setValues([headers]);
  styleHeader(outSheet, totalCols);

  const gradeOrder = {};
  GRADES.forEach((g, i) => gradeOrder[g] = i);

  const studentList = Object.entries(summary)
    .map(([sid, s]) => ({ sid, ...s, ...(studMap[sid] || { name:'ไม่พบ', grade:'', bankAccount:'' }) }))
    .filter(s => !grade || s.grade === grade)
    .sort((a, b) => (gradeOrder[a.grade] || 0) - (gradeOrder[b.grade] || 0));

  let row = 5, no = 1, grandDep = 0, grandWit = 0;
  studentList.forEach(s => {
    const monthlyAmts = monthLabels.map(m => s.monthly[m] || 0);
    const rowData = [no++, s.name, s.grade, s.bankAccount || '—']
      .concat(monthlyAmts)
      .concat([s.deposit, s.withdraw, s.deposit - s.withdraw]);
    outSheet.getRange(row, 1, 1, totalCols).setValues([rowData]);
    if (row % 2 === 0) outSheet.getRange(row, 1, 1, totalCols).setBackground('#F5F5F4');
    grandDep += s.deposit; grandWit += s.withdraw; row++;
  });

  const sumRow = ['', 'รวมทั้งหมด', '', '']
    .concat(monthLabels.map(m => studentList.reduce((s, x) => s + (x.monthly[m] || 0), 0)))
    .concat([grandDep, grandWit, grandDep - grandWit]);
  outSheet.getRange(row, 1, 1, totalCols).setValues([sumRow])
    .setFontWeight('bold').setBackground('#1C1917').setFontColor('#FFFFFF');

  outSheet.autoResizeColumns(1, totalCols);
  outSheet.getRange(5, 5, row - 4, totalCols - 4).setNumberFormat('#,##0.00');

  return {
    ok: true, sheetName,
    studentCount: studentList.length,
    totalDeposit: grandDep,
    totalWithdraw: grandWit,
    net: grandDep - grandWit,
    url: 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + outSheet.getSheetId()
  };
}
// ============================================================
// PROMOTE
// ============================================================
function promoteGrade(p, _skipLock) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };
  const grade = p.grade;
  if (!grade || !NEXT_GRADE[grade]) return { ok: false, error: 'ชั้นไม่ถูกต้อง' };

  var lock = null;
  if (!_skipLock) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return { ok: false, error: 'ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่' };
    }
  }
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const studSheet = ss.getSheetByName('นักเรียน');
    const histSheet = ss.getSheetByName('ประวัติเลื่อนชั้น');
    const data = studSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    // หา index แบบ dynamic — รองรับชื่อคอลัมน์หลายแบบ และป้องกัน column order เปลี่ยน
    function findCol(names) {
      for (var n of names) {
        var idx = headers.indexOf(n);
        if (idx >= 0) return idx;
      }
      return -1;
    }
    const idxGrade  = findCol(['ชั้นปัจจุบัน','ชั้น']);
    const idxStatus = findCol(['สถานะ']);
    if (idxGrade < 0 || idxStatus < 0) return { ok: false, error: 'ไม่พบคอลัมน์ ชั้นปัจจุบัน/สถานะ ในชีต นักเรียน' };

    const nextGrade = NEXT_GRADE[grade];
    const dateStr = thaiDate(new Date());
    const year = thaiYear();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxGrade] === grade && data[i][idxStatus] === 'กำลังเรียน') {
        histSheet.appendRow([data[i][0], data[i][1], grade, nextGrade, year, dateStr]);
        if (nextGrade === 'จบการศึกษา') {
          studSheet.getRange(i+1, idxGrade+1).setValue('จบการศึกษา');
          studSheet.getRange(i+1, idxStatus+1).setValue('จบการศึกษา');
        } else {
          studSheet.getRange(i+1, idxGrade+1).setValue(nextGrade);
        }
        count++;
      }
    }
    return { ok: true, promoted: count, from: grade, to: nextGrade };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function promoteAll(p) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { // นานกว่าปกติเพราะทำหลายชั้นต่อกันในคำขอเดียว
    return { ok: false, error: 'ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่' };
  }
  try {
    const results = [];
    [...GRADES].reverse().forEach(g => results.push(promoteGrade({ password: ADMIN_PASSWORD, grade: g }, true))); // skipLock กันล็อกซ้อน
    return { ok: true, results };
  } finally {
    lock.releaseLock();
  }
}

function getGraduated(p) {
  if (p.password !== ADMIN_PASSWORD) return { ok: false, error: 'เฉพาะผู้ดูแล' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const rows = ss.getSheetByName('นักเรียน').getDataRange().getValues().slice(1)
    .filter(r => r[0] !== '' && r[4] === 'จบการศึกษา');
  const balances = calcAllBalances(ss);
  return { ok: true, students: rows.map(r => ({
    id:r[0], name:r[1], entryYear:r[3], bankAccount:r[5]||'', balance: balances[r[0]]||0
  }))};
}

// ============================================================
// BOOTSTRAP — คืนนักเรียนทุกชั้นในคำขอเดียว (ลด 8 calls → 1 call)
// ============================================================
function getBootstrap(p) {
  if (!checkAuth(p || {})) return { ok: false, error: 'ไม่มีสิทธิ์' };
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const studSheet = ss.getSheetByName('นักเรียน');
  if (!studSheet) return { ok: false, error: 'ไม่พบ sheet นักเรียน' };

  const allData = studSheet.getDataRange().getValues();
  const headers = allData[0].map(h => String(h).trim());

  function findCol(names) {
    for (var n of names) { var idx = headers.indexOf(n); if (idx >= 0) return idx; }
    return -1;
  }
  const idxId     = findCol(['id']);
  const idxName   = findCol(['ชื่อ-สกุล','ชื่อ สกุล','ชื่อ']);
  const idxGrade  = findCol(['ชั้นปัจจุบัน','ชั้น']);
  const idxYear   = findCol(['ปีที่เข้า','ปีการศึกษา']);
  const idxStatus = findCol(['สถานะ']);
  const idxBank   = findCol(['เลขบัญชี_ธกส','เลขบัญชีธกส','เลขบัญชี']);
  const idxRoll   = findCol(['เลขที่']);

  // คำนวณยอดครั้งเดียว — ใช้ cache
  const balances = calcAllBalances(ss);

  // จัดกลุ่มตามชั้น
  const gradeMap = {};
  GRADES.forEach(g => gradeMap[g] = []);

  allData.slice(1).forEach(r => {
    if (!r[idxId]) return;
    const status = idxStatus >= 0 ? String(r[idxStatus] || '').trim() : '';
    if (status === 'จบการศึกษา') return;
    const grade = normGrade(idxGrade >= 0 ? r[idxGrade] : '');
    // F2 fix (scrutinize 2026-08-11): เดิม return ทิ้งเงียบๆถ้า grade ไม่ตรง GRADES เป๊ะ (เคยเจอปัญหานี้กับ อ.3 มาก่อน
    // ดู comment ที่ generateDepositRegistry) — คนหายไปทั้งคนจากทุกที่ที่ใช้ getBootstrap โดยไม่มีทางรู้เลย
    // เปลี่ยนให้เก็บไว้ใน key ของตัวเอง (ไม่ทิ้ง) อย่างน้อยข้อมูลยังตรวจสอบได้ ไม่หายเงียบไปจากระบบเลย
    if (!gradeMap[grade]) gradeMap[grade] = [];
    gradeMap[grade].push({
      id:          String(r[idxId] || ''),
      name:        idxName   >= 0 ? String(r[idxName]   || '') : '',
      grade,
      entryYear:   idxYear   >= 0 ? String(r[idxYear]   || '') : '',
      status:      status || 'กำลังเรียน',
      bankAccount: idxBank   >= 0 ? String(r[idxBank]   || '') : '',
      rollNo:      idxRoll   >= 0 ? String(r[idxRoll]   || '') : '',
      balance:     balances[String(r[idxId])] || 0
    });
  });

  // เรียงตามเลขที่ (shared กับ getStudents() — sortStudentsByRoll) แล้วเซ็ต GAS cache ต่อชั้น
  const sCache = CacheService.getScriptCache();
  GRADES.forEach(g => {
    sortStudentsByRoll(gradeMap[g]);
    try { sCache.put('ss_stus_'+g, JSON.stringify({ok:true,students:gradeMap[g]}), 180); } catch(e) {}
  });

  return { ok: true, grades: gradeMap };
}

// keepWarm — รัน time-based trigger ทุก 10 นาทีเพื่อป้องกัน cold start
function keepWarm() {
  SpreadsheetApp.openById(SHEET_ID);
}

// ============================================================
// UTILS
// ============================================================
function checkAuth(p) {
  return p.password === TEACHER_PASSWORD || p.password === ADMIN_PASSWORD;
}
// F1 fix (scrutinize 2026-08-11): เดิมใช้ local getter (getFullYear/getMonth/getDate/getHours) ขึ้นกับ
// GAS Project Settings > Time Zone ตรงๆ — ถ้าโปรเจกต์ไม่ได้ตั้งเป็น Asia/Bangkok พอดี ธุรกรรมที่ทำใกล้เที่ยงคืน/ต้นเดือน
// จะถูกลงวันที่/เดือนผิด (หายจากเดือนที่ควรอยู่ไปโป่งเดือนข้างเคียง) เพราะ addTransaction เขียนค่านี้เป็น string ล้วนลงเซลล์
// (ไม่ใช่ Date object) ทำให้ getHistory อ่านกลับมาแบบ rawDate instanceof Date = false เสมอ แล้วใช้ string นี้ตรงๆ
// ไม่ผ่าน thaiDateParts()/thaiDateStrFromParts() ที่ตั้งใจรวม convention +7h ไว้จุดเดียวเลย — เปลี่ยนให้เรียกจุดเดียวกันแทน
function thaiDate(d) {
  return thaiDateStrFromParts(thaiDateParts(d), true);
}
function thaiYear() { return new Date().getFullYear() + 543; }

// ============================================================
// สร้างฟอร์มส่งธนาคาร — รันจาก Apps Script โดยตรง
// เปลี่ยน function เป็น createBankForm แล้วกด ▶ เรียกใช้
// ============================================================

// ตั้งค่าก่อนรัน
var FORM_MONTH  = 5;      // เดือน (1-12)
var FORM_YEAR   = 2569;   // ปี พ.ศ.
var FORM_GRADE  = '';     // ชั้น เช่น 'ป.1' หรือ '' = ทุกชั้น
var FORM_TERM   = 1;      // เทอม 1 หรือ 2 (สำหรับ createTermForm)

function createBankForm() {
  // สร้างฟอร์มส่งธนาคารรายเดือน
  var result = exportMonthly({
    password: ADMIN_PASSWORD,
    month: String(FORM_MONTH),
    year: String(FORM_YEAR),
    grade: FORM_GRADE
  });
  if (result.ok) {
    SpreadsheetApp.getUi().alert(
      '✅ สร้างฟอร์มสำเร็จ!\n\n' +
      'Sheet: ' + result.sheetName + '\n' +
      'นักเรียน: ' + result.studentCount + ' คน\n' +
      'ยอดฝากรวม: ' + result.totalDeposit.toLocaleString() + ' บาท\n\n' +
      'กดดู sheet "' + result.sheetName + '" ได้เลย'
    );
  } else {
    SpreadsheetApp.getUi().alert('❌ เกิดข้อผิดพลาด:\n' + result.error);
  }
}

function createTermForm() {
  // สร้างฟอร์มส่งธนาคารรายเทอม
  var result = exportTerm({
    password: ADMIN_PASSWORD,
    term: String(FORM_TERM),
    year: String(FORM_YEAR),
    grade: FORM_GRADE
  });
  if (result.ok) {
    SpreadsheetApp.getUi().alert(
      '✅ สร้างฟอร์มสำเร็จ!\n\n' +
      'Sheet: ' + result.sheetName + '\n' +
      'นักเรียน: ' + result.studentCount + ' คน\n' +
      'ยอดฝากรวม: ' + result.totalDeposit.toLocaleString() + ' บาท\n\n' +
      'กดดู sheet "' + result.sheetName + '" ได้เลย'
    );
  } else {
    SpreadsheetApp.getUi().alert('❌ เกิดข้อผิดพลาด:\n' + result.error);
  }
}

// เพิ่มเมนูใน Google Sheets อัตโนมัติ
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 ระบบออมทรัพย์')
    .addItem('📅 สร้างฟอร์มส่งธนาคาร (รายเดือน)', 'createBankForm')
    .addItem('📚 สร้างฟอร์มส่งธนาคาร (รายเทอม)', 'createTermForm')
    .addSeparator()
    .addItem('⚙️ ตั้งค่าเดือน/ปี/ชั้น', 'showSettings')
    .addToUi();
}

function showSettings() {
  var ui = SpreadsheetApp.getUi();
  var html = '<p style="font-family:sans-serif;font-size:14px">' +
    'แก้ค่าใน Code.gs บรรทัดหัว:<br><br>' +
    '<b>FORM_MONTH</b> = เดือน (1-12)<br>' +
    '<b>FORM_YEAR</b> = ปี พ.ศ. เช่น 2569<br>' +
    '<b>FORM_GRADE</b> = ชั้น เช่น ป.1 หรือ "" = ทุกชั้น<br>' +
    '<b>FORM_TERM</b> = เทอม 1 หรือ 2' +
    '</p>';
  ui.alert('วิธีตั้งค่า', 
    'แก้ค่าใน Code.gs บรรทัดหัว:\n\n' +
    'FORM_MONTH = เดือน (1-12)\n' +
    'FORM_YEAR  = ปี พ.ศ. เช่น 2569\n' +
    'FORM_GRADE = ชั้น เช่น ป.1 หรือ "" = ทุกชั้น\n' +
    'FORM_TERM  = เทอม 1 หรือ 2',
    ui.ButtonSet.OK);
}


function testPromoteAndBalance() {
  Logger.log('=== ทดสอบ: เลื่อนชั้น ป.6 → จบการศึกษา ===');

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var studSheet = ss.getSheetByName('นักเรียน');
  var txSheet   = ss.getSheetByName('ธุรกรรม');

  // 1. ดูนักเรียน ป.6 ก่อนเลื่อนชั้น
  var before = getStudents({ grade: 'ป.6', password: TEACHER_PASSWORD });
  Logger.log('นักเรียน ป.6 ก่อนเลื่อน: ' + before.students.length + ' คน');
  before.students.forEach(function(s) {
    Logger.log('  ' + s.name + ' | ยอด: ' + s.balance + ' บาท | สถานะ: ' + s.status);
  });

  // 2. เลื่อนชั้น ป.6
  Logger.log('\n--- เลื่อนชั้น ป.6 → จบการศึกษา ---');
  var promoteResult = promoteGrade({ password: ADMIN_PASSWORD, grade: 'ป.6' });
  Logger.log('ผล: ' + JSON.stringify(promoteResult));

  // 3. ดูนักเรียนที่จบแล้ว
  Logger.log('\n--- นักเรียนที่จบการศึกษา ---');
  var graduated = getGraduated({ password: ADMIN_PASSWORD });
  graduated.students.forEach(function(s) {
    Logger.log('  ' + s.name + ' | ยอดสะสม: ' + s.balance + ' บาท ← ยังคงอยู่ครบ');
  });

  // 4. ตรวจว่า ป.6 ไม่แสดงในรายชื่อปกติแล้ว
  var after = getStudents({ grade: 'ป.6', password: TEACHER_PASSWORD });
  Logger.log('\nนักเรียน ป.6 หลังเลื่อน: ' + after.students.length + ' คน (ควรเป็น 0)');

  Logger.log('\n✅ สรุป: ยอดเงินยังอยู่ครบ เพียงแต่ย้ายไปอยู่ในหน้า "จบแล้ว"');
}

function debugSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('นักเรียน');
  if (!sheet) { Logger.log('ไม่พบ sheet นักเรียน'); return; }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  Logger.log('lastRow: ' + lastRow + ', lastCol: ' + lastCol);

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  Logger.log('Headers: ' + JSON.stringify(headers));

  // ดูทุก row ว่ามีอะไร
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    Logger.log('Total data rows: ' + data.length);
    data.forEach(function(r, i) {
      Logger.log('Row ' + (i+2) + ': id=' + r[0] + ' name=' + r[1] + ' grade=' + r[2] + ' status=' + r[4]);
    });
  }
}

function testAddStudent() {
  // ทดสอบเพิ่มนักเรียน
  var result = addStudent({ name: 'ทดสอบ ระบบ', grade: 'ป.1', bankAccount: '', password: TEACHER_PASSWORD });
  Logger.log('addStudent result: ' + JSON.stringify(result));

  // ดู header จริงใน sheet
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('นักเรียน');
  if (sheet) {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log('Headers: ' + JSON.stringify(headers));
    Logger.log('Last column: ' + sheet.getLastColumn());
    Logger.log('Last row: ' + sheet.getLastRow());
    var data = sheet.getRange(1, 1, Math.min(4, sheet.getLastRow()), sheet.getLastColumn()).getValues();
    Logger.log('Data rows: ' + JSON.stringify(data));
  } else {
    Logger.log('ERROR: ไม่พบ sheet นักเรียน');
  }
}

function debugHistory() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('ธุรกรรม');
  if (!sheet) { Logger.log('ไม่พบ sheet ธุรกรรม'); return; }

  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  Logger.log('Headers (' + headers.length + '): ' + JSON.stringify(headers));

  var rows = sheet.getDataRange().getValues().slice(1).filter(function(r){ return r[0] !== ''; });
  Logger.log('Total data rows: ' + rows.length);

  if (rows.length > 0) {
    Logger.log('Row 1 raw: ' + JSON.stringify(rows[0]));
    rows[0].forEach(function(v, i) {
      Logger.log('  col ' + i + ' [' + headers[i] + ']: ' + JSON.stringify(v) + ' type=' + typeof v + (v instanceof Date ? ' (Date)' : ''));
    });
  }

  // ลองรัน getHistory จริง
  var result = getHistory({ grade: 'ป.1', limit: '5', password: TEACHER_PASSWORD });
  Logger.log('getHistory result ok=' + result.ok + ' count=' + result.transactions.length);
  if (result.transactions.length > 0) {
    Logger.log('Sample tx date: [' + result.transactions[0].date + ']');
  }
}

// ฟังก์ชัน debug: ทดสอบว่า appendRow ใช้งานได้ไหม
// รันใน Apps Script editor → Run → testAppendRow แล้วดู Logs
function testAppendRow() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('ธุรกรรม');
  Logger.log('sheet found: ' + !!sheet);
  if (!sheet) return;

  Logger.log('rows before: ' + sheet.getLastRow());
  Logger.log('isProtected: ' + sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length);

  try {
    sheet.appendRow(['TEST_DELETE_ME', 'S_TEST', 'ทดสอบ', 'ป.1', 'ฝาก', 1, '2569', 'ทดสอบ']);
    SpreadsheetApp.flush();
    Logger.log('rows after appendRow+flush: ' + sheet.getLastRow());

    // ลบ row ทดสอบออก
    var lastRow = sheet.getLastRow();
    if (sheet.getRange(lastRow, 1).getValue() === 'TEST_DELETE_ME') {
      sheet.deleteRow(lastRow);
      SpreadsheetApp.flush();
      Logger.log('test row deleted. rows now: ' + sheet.getLastRow());
    }
  } catch(e) {
    Logger.log('ERROR: ' + e.message);
  }
}

function testTodayFilter() {
  // ทดสอบว่า date filter ทำงานถูกไหม
  var todayDate = new Date();
  var months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  // วันนี้ใน timezone ไทย
  var thaiNow = new Date(todayDate.getTime() + 7*60*60*1000);
  var todayStr = thaiNow.getUTCDate() + ' ' + months[thaiNow.getUTCMonth()] + ' ' + (thaiNow.getUTCFullYear()+543);
  Logger.log('Today Thai string: ' + todayStr);
  
  // ดูข้อมูลในชั้น ป.1
  var result = getHistory({ grade: 'ป.1', limit: '5', password: TEACHER_PASSWORD });
  Logger.log('Total transactions: ' + result.transactions.length);
  result.transactions.forEach(function(t) {
    Logger.log('date: [' + t.date + '] | starts with today: ' + (t.date.indexOf(todayStr) === 0));
  });
  
  // ทดสอบ filter
  var filtered = getHistory({ grade: 'ป.1', date: todayStr, limit: '100', password: TEACHER_PASSWORD });
  Logger.log('Filtered (today only): ' + filtered.transactions.length);
}

function testExportMonthly() {
  // แก้ค่าตามต้องการ
  var result = exportMonthly({
    password: ADMIN_PASSWORD,
    month: '5',    // พฤษภาคม
    year: '2569',
    grade: ''      // ว่าง = ทุกชั้น
  });
  Logger.log('Result: ' + JSON.stringify(result));

  // debug ดูวันที่จริงใน sheet
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var txSheet = ss.getSheetByName('ธุรกรรม');
  if (txSheet) {
    var rows = txSheet.getDataRange().getValues().slice(1).filter(function(r) { return r[0]; });
    rows.forEach(function(r) {
      var dateVal = r[7];
      Logger.log('Date raw: ' + JSON.stringify(dateVal) + ' | type: ' + typeof dateVal + ' | instanceof Date: ' + (dateVal instanceof Date));
    });
  }
}

function testExportTerm() {
  var result = exportTerm({
    password: ADMIN_PASSWORD,
    term: '1',
    year: '2569',
    grade: ''
  });
  Logger.log('Result: ' + JSON.stringify(result));
}
