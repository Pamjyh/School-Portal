// =====================================================================
// EXPORT CSV
// =====================================================================

// helper: สร้าง CSV แล้ว download (UTF-8 BOM เพื่อให้ Excel อ่านภาษาไทยได้)
function downloadCSV(filename, rows){
  var BOM = '﻿';
  // ป้องกัน CSV/Formula Injection (OWASP): ถ้าค่าขึ้นต้นด้วย = + - @ tab หรือ CR
  // โปรแกรมสเปรดชีต (Excel/Sheets) อาจตีความเป็นสูตรตอนเปิดไฟล์ที่ export ออกไป
  // ยกเว้นตัวเลขล้วน (รวมติดลบ/ทศนิยม) เพื่อไม่ให้จำนวนเงินติดลบที่ถูกต้องกลายเป็นข้อความ
  function csvGuard(s){
    if(/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)){
      s = "'" + s;
    }
    return s;
  }
  var csv = BOM + rows.map(function(row){
    return row.map(function(cell){
      var s = (cell === null || cell === undefined) ? '' : String(cell);
      s = csvGuard(s);
      // ถ้ามี comma, newline หรือ quote → ครอบด้วย ""
      if(s.includes(',') || s.includes('\n') || s.includes('"')){
        s = '"' + s.replace(/"/g,'""') + '"';
      }
      return s;
    }).join(',');
  }).join('\r\n');

  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- EXPORT พัสดุ ----------
function exportProcCSV(){
  var rows = getFilteredProc(); // ส่งออกเฉพาะรายการที่กรองอยู่
  if(!rows.length){ alert('ไม่มีข้อมูลพัสดุที่จะส่งออก'); return; }

  var header = ['ลำดับ','ประเภท','รายการ','โครงการ','ผู้รับผิดชอบ','วันที่รายงาน','วงเงิน (บาท)','สถานะ','เลขใบเบิก','หมายเหตุ'];
  var data = rows.map(function(i){
    return [
      'จ.'+i.seq,
      i.type,
      i.title,
      (i.projects && i.projects.name) ? i.projects.name : (PROJECTS.find(function(p){return p.id===i.project_id;})||{}).name || '',
      i.person || '',
      i.report_date || '',
      i.amount || 0,
      i.withdraw_status,
      i.withdraw_no || '',
      i.remark || ''
    ];
  });

  var filename = 'พัสดุ_ปี'+CYbe+'_'+_today()+'.csv';
  downloadCSV(filename, [header].concat(data));
}

// ---------- EXPORT รายการรับ-จ่าย ----------
function exportFinanceCSV(){
  var list = FINANCE_TRANSACTIONS;
  if(!list.length){ alert('ไม่มีรายการรับ-จ่ายที่จะส่งออก'); return; }

  var header = ['วันที่','ประเภท','หมวดเงิน','รายละเอียด','เลขเอกสาร','ที่เก็บเงิน','จำนวนเงิน (บาท)','โครงการ','หมายเหตุ'];
  var data = list.map(function(i){
    return [
      i.transaction_date || '',
      i.transaction_type || '',
      (i.fund_categories && i.fund_categories.name) ? i.fund_categories.name : '',
      i.description || '',
      i.document_no || '',
      i.holding_type || '',
      i.amount || 0,
      (i.projects && i.projects.name) ? i.projects.name : '',
      i.remark || ''
    ];
  });

  var filename = 'รายการการเงิน_ปี'+CYbe+'_'+_today()+'.csv';
  downloadCSV(filename, [header].concat(data));
}

// ---------- EXPORT เงินคงเหลือ (pivot) ----------
function exportBalanceCSV(){
  if(!FINANCE_BALANCES.length){ alert('ไม่มีข้อมูลเงินคงเหลือที่จะส่งออก'); return; }

  var COLS = ['เงินสด','เงินฝากธนาคาร','เงินฝากส่วนราชการผู้เบิก'];

  // pivot
  var pivot = {};
  var fundOrder = [];
  FINANCE_BALANCES.forEach(function(row){
    var fname = row.fund_name || 'ไม่ระบุหมวด';
    if(!pivot[fname]){ pivot[fname]={}; fundOrder.push(fname); }
    pivot[fname][row.holding_type] = Number(row.balance||0);
  });
  var funds = fundOrder.filter(function(v,i){ return fundOrder.indexOf(v)===i; });

  var header = ['หมวดเงิน','เงินสด','เงินฝากธนาคาร','เงินฝากส่วนราชการผู้เบิก','รวม'];
  var colTotal = {เงินสด:0, เงินฝากธนาคาร:0, เงินฝากส่วนราชการผู้เบิก:0};

  var data = funds.map(function(fname){
    var row = pivot[fname];
    var rowTotal = 0;
    var cells = COLS.map(function(col){
      var v = row[col] || 0;
      rowTotal += v;
      colTotal[col] += v;
      return v;
    });
    return [fname].concat(cells).concat([rowTotal]);
  });

  var grandTotal = colTotal['เงินสด']+colTotal['เงินฝากธนาคาร']+colTotal['เงินฝากส่วนราชการผู้เบิก'];
  var totalRow   = ['รวมทั้งหมด', colTotal['เงินสด'], colTotal['เงินฝากธนาคาร'], colTotal['เงินฝากส่วนราชการผู้เบิก'], grandTotal];

  var filename = 'เงินคงเหลือ_ปี'+CYbe+'_'+_today()+'.csv';
  downloadCSV(filename, [header].concat(data).concat([totalRow]));
}

// ---------- helper ----------
function _today(){
  return new Date().toISOString().split('T')[0];
}
