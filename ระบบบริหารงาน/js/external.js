// =====================================================================
// EXTERNAL EXPENSES — ค่าใช้จ่าย (เงินนอก)
// =====================================================================

var EXT_CHART_BAR  = null;
var EXT_CHART_PIE  = null;
var EXT_CHART_LINE = null;
var EXT_TAB = 'list'; // 'list' | 'monthly' | 'charts'

var EXT_MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                     'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var EXT_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                       'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ---------- PALETTE ----------
var EXT_PALETTE = [
  '#3860BE','#CF4500','#2d9c5c','#f59e0b','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#a78bfa'
];

// ---------- LOAD ----------
async function loadExternalData(){
  show('loadingOverlay','flex');
  var errEl = document.getElementById('extError');
  if(errEl){ errEl.style.display='none'; errEl.textContent=''; }
  try{
    [EXT_CATEGORIES, EXT_TRANSACTIONS] = await Promise.all([
      GET('external_categories','select=*&order=sort_order'),
      GET('external_transactions','select=*,external_categories(name)&order=transaction_date.desc,id.desc')
    ]);
    EXT_CATEGORIES   = EXT_CATEGORIES   || [];
    EXT_TRANSACTIONS = EXT_TRANSACTIONS || [];
    EXT_LOADED = true;
    hide('loadingOverlay');
    renderExternal();
  }catch(e){
    hide('loadingOverlay');
    EXT_LOADED = false;
    if(errEl){
      errEl.style.display = 'block';
      errEl.textContent = 'โหลดไม่ได้: '+e.message+' — กรุณารัน supabase/external_schema.sql ก่อน';
    }
    var tbody = document.getElementById('ext-tbody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="no-data">ยังไม่ได้สร้างตาราง — รัน supabase/external_schema.sql ใน Supabase SQL Editor</td></tr>';
  }
}

// ---------- FILTER HELPERS ----------
function getExtFiltered(){
  var fyear  = document.getElementById('ext-fyear')?.value  || '';
  var fmonth = document.getElementById('ext-fmonth')?.value || '';
  var ftype  = document.getElementById('ext-ftype')?.value  || '';
  var fcat   = document.getElementById('ext-fcat')?.value   || '';
  return EXT_TRANSACTIONS.filter(function(t){
    var d = t.transaction_date || '';
    if(fyear  && !d.startsWith(fyear))           return false;
    if(fmonth && d.slice(5,7) !== fmonth)        return false;
    if(ftype  && t.type !== ftype)               return false;
    if(fcat   && String(t.category_id) !== fcat) return false;
    return true;
  });
}

function filterExtData(){
  if(!EXT_LOADED) return;
  EXT_PAGE = 1; // reset เมื่อ filter เปลี่ยน
  renderExternal();
}

// ---------- RENDER MAIN ----------
function renderExternal(){
  fillExtYearSel();
  fillExtCatFilterSel();
  var list = getExtFiltered();

  var totalIn  = 0;
  var totalOut = 0;
  list.forEach(function(t){
    if(t.type === 'รายรับ') totalIn  += Number(t.amount||0);
    else                    totalOut += Number(t.amount||0);
  });
  var net = totalIn - totalOut;

  // stat cards
  var inEl  = document.getElementById('ext-in');
  var outEl = document.getElementById('ext-out');
  var netEl = document.getElementById('ext-net');
  var cntEl = document.getElementById('ext-count');
  if(inEl)  inEl.textContent  = numFull(totalIn);
  if(outEl) outEl.textContent = numFull(totalOut);
  if(netEl){
    netEl.textContent   = numFull(Math.abs(net));
    netEl.style.color   = net >= 0 ? 'var(--up)' : 'var(--signal)';
    var netSub = document.getElementById('ext-net-sub');
    if(netSub) netSub.textContent = net >= 0 ? 'บาท (บวก)' : 'บาท (ติดลบ)';
  }
  if(cntEl) cntEl.textContent = list.length;

  var info = document.getElementById('ext-info');
  if(info) info.textContent = 'แสดง '+list.length+' รายการ';

  // render ตาม tab ปัจจุบัน
  if(EXT_TAB === 'list')    renderExtTable(list);
  if(EXT_TAB === 'monthly') renderExtMonthly(list);
  if(EXT_TAB === 'charts')  renderExtCharts(list);
}

// ---------- YEAR DROPDOWN ----------
function fillExtYearSel(){
  var sel = document.getElementById('ext-fyear');
  if(!sel) return;
  var cur = sel.value;
  var years = new Set();
  var thisYear = new Date().getFullYear();
  years.add(String(thisYear));
  EXT_TRANSACTIONS.forEach(function(t){
    if(t.transaction_date) years.add(t.transaction_date.substring(0,4));
  });
  var sorted = Array.from(years).sort().reverse();
  sel.innerHTML = '<option value="">ทุกปี</option>'+sorted.map(function(y){
    return '<option value="'+y+'">'+(Number(y)+543)+'</option>';
  }).join('');
  if(cur) sel.value = cur;
  else if(sorted.includes(String(thisYear))) sel.value = String(thisYear);
}

function fillExtCatFilterSel(){
  var sel = document.getElementById('ext-fcat');
  if(!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">หมวดทั้งหมด</option>';
  EXT_CATEGORIES.forEach(function(c){
    sel.innerHTML += '<option value="'+c.id+'">'+c.name+'</option>';
  });
  if(cur) sel.value = cur;
}

// ---------- TAB SWITCH ----------
function switchExtTab(tab){
  EXT_TAB = tab;
  document.querySelectorAll('[data-etab]').forEach(function(btn){
    btn.classList.toggle('active', btn.dataset.etab === tab);
  });
  var tabIds = ['ext-tab-list','ext-tab-monthly','ext-tab-charts'];
  tabIds.forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
  var activeId = tab === 'list' ? 'ext-tab-list' : tab === 'monthly' ? 'ext-tab-monthly' : 'ext-tab-charts';
  var activeEl = document.getElementById(activeId);
  if(activeEl) activeEl.style.display = 'block';

  var list = getExtFiltered();
  if(tab === 'list')    renderExtTable(list);
  if(tab === 'monthly') renderExtMonthly(list);
  if(tab === 'charts')  renderExtCharts(list);
}

// ---------- TABLE ----------
function renderExtTable(list){
  var tbody = document.getElementById('ext-tbody');
  var tfoot = document.getElementById('ext-tfoot');
  if(!tbody) return;

  if(!list.length){
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">ยังไม่มีรายการ กด "+ เพิ่มรายการ" เพื่อเริ่มบันทึก</td></tr>';
    if(tfoot) tfoot.innerHTML = '';
    renderExtPagination(0, 0);
    return;
  }

  // Pagination
  var totalPages = Math.ceil(list.length / PAGE_SIZE);
  if(EXT_PAGE > totalPages) EXT_PAGE = totalPages;
  if(EXT_PAGE < 1) EXT_PAGE = 1;
  var start    = (EXT_PAGE - 1) * PAGE_SIZE;
  var pageList = list.slice(start, start + PAGE_SIZE);

  var info = document.getElementById('ext-info');
  if(info) info.textContent = 'แสดง '+(start+1)+'–'+(start+pageList.length)+' จาก '+list.length+' รายการ';

  var totalIn = 0, totalOut = 0;
  // คำนวณ total จาก list ทั้งหมด (ไม่ใช่แค่หน้านี้)
  list.forEach(function(t){
    if(t.type === 'รายรับ') totalIn  += Number(t.amount||0);
    else                    totalOut += Number(t.amount||0);
  });

  tbody.innerHTML = pageList.map(function(t){
    var isIn  = t.type === 'รายรับ';
    var tc    = isIn ? 'var(--up)' : 'var(--signal)';
    var cname = (t.external_categories && t.external_categories.name) ? t.external_categories.name : '—';
    return '<tr>'+
      '<td style="white-space:nowrap">'+fmtDate(t.transaction_date)+'</td>'+
      '<td><span style="font-size:11px;font-weight:700;color:'+tc+'">'+t.type+'</span></td>'+
      '<td class="ink">'+cname+'</td>'+
      '<td style="color:var(--slate);font-size:13px">'+(t.note||'—')+'</td>'+
      '<td class="r" style="color:'+tc+';font-family:var(--mono)">'+fmt(t.amount)+'</td>'+
      '<td><div class="act-group">'+
        '<button class="act-btn admin-only" onclick="openExtForm(\''+t.id+'\')" title="แก้ไข">✏️</button>'+
        '<button class="act-btn del admin-only" onclick="deleteExtTransaction(\''+t.id+'\')" title="ลบ">🗑️</button>'+
      '</div></td></tr>';
  }).join('');

  if(tfoot){
    tfoot.innerHTML = '<tr class="sum-row">'+
      '<td colspan="4"><strong>รวมทั้งหมด '+list.length+' รายการ</strong></td>'+
      '<td class="r"><strong style="color:var(--up);font-family:var(--mono)">'+fmt(totalIn)+
      '</strong> / <strong style="color:var(--signal);font-family:var(--mono)">'+fmt(totalOut)+'</strong></td>'+
      '<td></td></tr>';
  }

  renderExtPagination(EXT_PAGE, totalPages);
}

function renderExtPagination(page, total){
  var el = document.getElementById('ext-pagination');
  if(!el) return;
  if(total <= 1){ el.innerHTML=''; return; }
  el.innerHTML = paginationHTML(page, total, 'goExtPage');
}

function goExtPage(n){
  EXT_PAGE = n;
  var list = getExtFiltered();
  renderExtTable(list);
  document.getElementById('page-external')?.scrollIntoView({behavior:'smooth', block:'start'});
}

// ---------- MONTHLY SUMMARY ----------
function renderExtMonthly(list){
  var tbody = document.getElementById('ext-monthly-tbody');
  var tfoot = document.getElementById('ext-monthly-tfoot');
  if(!tbody) return;

  // สรุปรายเดือน
  var monthData = {};
  for(var m=0;m<12;m++) monthData[m] = { in:0, out:0, count:0 };

  list.forEach(function(t){
    var mo = parseInt((t.transaction_date||'').slice(5,7)) - 1;
    if(mo < 0 || mo > 11) return;
    var amt = Number(t.amount||0);
    if(t.type === 'รายรับ') monthData[mo].in  += amt;
    else                    monthData[mo].out += amt;
    monthData[mo].count++;
  });

  var grandIn=0, grandOut=0, grandCount=0;
  tbody.innerHTML = '';

  for(var i=0;i<12;i++){
    var d   = monthData[i];
    var net = d.in - d.out;
    var nc  = net >= 0 ? 'var(--up)' : 'var(--signal)';
    grandIn    += d.in;
    grandOut   += d.out;
    grandCount += d.count;
    if(!d.count) continue; // ข้ามเดือนที่ไม่มีข้อมูล
    tbody.innerHTML += '<tr>'+
      '<td class="ink">'+EXT_MONTHS_FULL[i]+'</td>'+
      '<td class="r" style="color:var(--up);font-family:var(--mono)">'+fmt(d.in)+'</td>'+
      '<td class="r" style="color:var(--signal);font-family:var(--mono)">'+fmt(d.out)+'</td>'+
      '<td class="r" style="font-family:var(--mono);font-weight:600;color:'+nc+'">'+fmt(Math.abs(net))+
        '<span style="font-size:10px;margin-left:3px">'+(net>=0?'▲':'▼')+'</span></td>'+
      '<td class="r" style="color:var(--muted)">'+d.count+'</td>'+
      '</tr>';
  }

  if(!tbody.innerHTML){
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>';
    if(tfoot) tfoot.innerHTML = '';
    return;
  }

  var grandNet = grandIn - grandOut;
  var gnc = grandNet >= 0 ? 'var(--up)' : 'var(--signal)';
  if(tfoot){
    tfoot.innerHTML = '<tr class="sum-row">'+
      '<td><strong>รวมทั้งหมด</strong></td>'+
      '<td class="r"><strong style="color:var(--up);font-family:var(--mono)">'+fmt(grandIn)+'</strong></td>'+
      '<td class="r"><strong style="color:var(--signal);font-family:var(--mono)">'+fmt(grandOut)+'</strong></td>'+
      '<td class="r"><strong style="font-family:var(--mono);color:'+gnc+'">'+fmt(Math.abs(grandNet))+'</strong></td>'+
      '<td class="r"><strong>'+grandCount+'</strong></td></tr>';
  }

  // Category breakdown (เฉพาะรายจ่าย)
  renderExtCatBreakdown(list);
}

function renderExtCatBreakdown(list){
  var wrap = document.getElementById('ext-cat-breakdown');
  if(!wrap) return;

  var catMap = {};
  list.forEach(function(t){
    if(t.type !== 'รายจ่าย') return;
    var cname = (t.external_categories && t.external_categories.name) ? t.external_categories.name : 'ไม่ระบุ';
    if(!catMap[cname]) catMap[cname] = 0;
    catMap[cname] += Number(t.amount||0);
  });

  var entries = Object.entries(catMap).sort(function(a,b){ return b[1]-a[1]; });
  if(!entries.length){
    wrap.innerHTML = '<p style="color:var(--muted);font-size:13px">ยังไม่มีรายจ่ายในช่วงนี้</p>';
    return;
  }

  var total = entries.reduce(function(s,e){ return s+e[1]; },0);
  wrap.innerHTML = entries.map(function(e, idx){
    var pct = total > 0 ? (e[1]/total*100).toFixed(1) : 0;
    var color = EXT_PALETTE[idx % EXT_PALETTE.length];
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'+
      '<div style="width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0"></div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'+
          '<span style="font-size:13px;color:var(--ink)">'+e[0]+'</span>'+
          '<span style="font-size:13px;font-family:var(--mono);color:var(--signal)">'+fmt(e[1])+' <span style="color:var(--muted);font-size:11px">('+pct+'%)</span></span>'+
        '</div>'+
        '<div style="height:4px;background:var(--dust);border-radius:2px">'+
          '<div style="height:4px;background:'+color+';border-radius:2px;width:'+pct+'%"></div>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

// ---------- CHARTS ----------
function renderExtCharts(list){
  if(typeof Chart === 'undefined'){
    var el = document.getElementById('ext-chart-msg');
    if(el) el.textContent = 'กำลังโหลด Chart.js...';
    setTimeout(function(){ if(typeof Chart !== 'undefined') renderExtCharts(list); }, 500);
    return;
  }

  // สีชุดกราฟต้องอ่านจาก CSS custom property สดๆ ทุกครั้งที่ render (ไม่ hardcode hex ของโหมดสว่างค้างไว้
  // เหมือนเดิม) เพราะ canvas วาดสีตรงๆ ไม่รับ var() แบบ CSS — --up/--signal มีค่า dark mode ของตัวเองอยู่แล้ว
  // ใน css/styles.css แต่โค้ดกราฟเดิมไม่เคยอ่าน ทำให้กราฟค้างโทนสว่างไว้แม้สลับ dark mode แล้ว
  function extCssVar(name, fallback){
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  var upColor      = extCssVar('--up',      '#2d9c5c');
  var upRgb        = extCssVar('--up-rgb',  '45,156,92');
  var signalColor  = extCssVar('--signal',  '#CF4500');
  var signalRgb    = extCssVar('--signal-rgb', '207,69,0');
  var whiteColor   = extCssVar('--white',   '#fff');   // เดิม hardcode '#fff' เป็นเส้นขอบ/จุด "cutout ตัดกับพื้นการ์ด" — พื้นการ์ดมืดแล้วเลยต้องตามให้ทัน กันเป็นวงแหวน/จุดขาวจ้าลอยบนพื้นเข้ม
  var slateColor   = extCssVar('--slate',   '#696969');
  var accentColor  = extCssVar('--chart-accent',     '#3860BE');
  var accentRgb    = extCssVar('--chart-accent-rgb', '56,96,190');

  // 1. Bar chart — monthly income vs expense
  var barIn  = Array(12).fill(0);
  var barOut = Array(12).fill(0);
  list.forEach(function(t){
    var m = parseInt((t.transaction_date||'').slice(5,7)) - 1;
    if(m < 0 || m > 11) return;
    if(t.type === 'รายรับ') barIn[m]  += Number(t.amount||0);
    else                    barOut[m] += Number(t.amount||0);
  });

  var ctxBar = document.getElementById('ext-chart-bar');
  if(ctxBar){
    if(EXT_CHART_BAR){ EXT_CHART_BAR.destroy(); EXT_CHART_BAR=null; }
    EXT_CHART_BAR = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: EXT_MONTHS_TH,
        datasets: [
          { label:'รายรับ',  data: barIn,  backgroundColor:'rgba('+upRgb+',0.75)',     borderColor:upColor,     borderWidth:1, borderRadius:3 },
          { label:'รายจ่าย', data: barOut, backgroundColor:'rgba('+signalRgb+',0.75)', borderColor:signalColor, borderWidth:1, borderRadius:3 }
        ]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:14 } } },
        scales:{
          y:{ beginAtZero:true, ticks:{ font:{size:10}, callback:function(v){ return v>=1000?(v/1000)+'K':v; } } },
          x:{ ticks:{ font:{size:10} } }
        }
      }
    });
  }

  // 2. Donut — expense by category
  var catMap = {};
  list.forEach(function(t){
    if(t.type !== 'รายจ่าย') return;
    var cname = (t.external_categories && t.external_categories.name) ? t.external_categories.name : 'ไม่ระบุ';
    catMap[cname] = (catMap[cname]||0) + Number(t.amount||0);
  });
  var catLabels = Object.keys(catMap);
  var catData   = catLabels.map(function(k){ return catMap[k]; });

  var ctxPie = document.getElementById('ext-chart-pie');
  if(ctxPie){
    if(EXT_CHART_PIE){ EXT_CHART_PIE.destroy(); EXT_CHART_PIE=null; }
    if(catLabels.length){
      EXT_CHART_PIE = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
          labels: catLabels,
          datasets: [{
            data: catData,
            backgroundColor: EXT_PALETTE.slice(0, catLabels.length),
            borderWidth: 2,
            borderColor: whiteColor
          }]
        },
        options:{
          responsive:true,
          plugins:{
            legend:{ position:'bottom', labels:{ font:{size:10}, boxWidth:12 } },
            tooltip:{ callbacks:{ label:function(ctx){
              var total = ctx.dataset.data.reduce(function(a,b){return a+b;},0);
              var pct   = total > 0 ? (ctx.parsed/total*100).toFixed(1) : 0;
              return ctx.label+': '+ctx.parsed.toLocaleString()+' บาท ('+pct+'%)';
            }}}
          },
          cutout: '60%'
        }
      });
    } else {
      var c = ctxPie.getContext('2d');
      c.clearRect(0,0,ctxPie.width,ctxPie.height);
      c.fillStyle = slateColor;
      c.font = '13px Sarabun';
      c.textAlign = 'center';
      c.fillText('ยังไม่มีรายจ่าย', ctxPie.width/2, ctxPie.height/2);
    }
  }

  // 3. Line chart — cumulative net monthly
  var cumulNet = Array(12).fill(0);
  list.forEach(function(t){
    var m = parseInt((t.transaction_date||'').slice(5,7)) - 1;
    if(m < 0 || m > 11) return;
    if(t.type === 'รายรับ') cumulNet[m] += Number(t.amount||0);
    else                    cumulNet[m] -= Number(t.amount||0);
  });
  var running = 0;
  var cumulData = cumulNet.map(function(v){ running+=v; return running; });

  var ctxLine = document.getElementById('ext-chart-line');
  if(ctxLine){
    if(EXT_CHART_LINE){ EXT_CHART_LINE.destroy(); EXT_CHART_LINE=null; }
    EXT_CHART_LINE = new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: EXT_MONTHS_TH,
        datasets: [{
          label: 'ยอดสะสม (บาท)',
          data: cumulData,
          borderColor: accentColor,
          backgroundColor: 'rgba('+accentRgb+',0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointBackgroundColor: cumulData.map(function(v){ return v>=0?accentColor:signalColor; }),
          pointBorderColor: whiteColor,
          pointBorderWidth: 2
        }]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, boxWidth:14 } } },
        scales:{
          y:{ ticks:{ font:{size:10}, callback:function(v){ return v>=1000?(v/1000)+'K':v; } } },
          x:{ ticks:{ font:{size:10} } }
        }
      }
    });
  }
}

// ---------- FORM OPEN/CLOSE ----------
function openExtForm(id){
  var overlay = document.getElementById('extOverlay');
  if(!overlay) return;

  // เติม category dropdown
  var sel = document.getElementById('extCat');
  sel.innerHTML = '<option value="">— เลือกหมวด —</option>';
  EXT_CATEGORIES.forEach(function(c){
    sel.innerHTML += '<option value="'+c.id+'">'+c.name+'</option>';
  });

  document.getElementById('extEditId').value = '';

  if(id){
    document.getElementById('extFormTitle').textContent = 'แก้ไขรายการ';
    var tx = EXT_TRANSACTIONS.find(function(t){ return String(t.id) === String(id); });
    if(tx){
      document.getElementById('extEditId').value = tx.id;
      document.getElementById('extDate').value   = tx.transaction_date || '';
      setExtType(tx.type || 'รายจ่าย');
      document.getElementById('extCat').value    = tx.category_id || '';
      document.getElementById('extAmount').value = tx.amount || '';
      document.getElementById('extNote').value   = tx.note || '';
    }
  } else {
    document.getElementById('extFormTitle').textContent = 'เพิ่มรายการ';
    document.getElementById('extDate').value    = new Date().toISOString().split('T')[0];
    setExtType('รายจ่าย');
    document.getElementById('extCat').value     = '';
    document.getElementById('extAmount').value  = '';
    document.getElementById('extNote').value    = '';
  }

  overlay.classList.add('open');
  setTimeout(function(){ document.getElementById('extAmount').focus(); }, 100);
}

function closeExtForm(){
  document.getElementById('extOverlay')?.classList.remove('open');
}

function setExtType(val){
  document.getElementById('extTypeHidden').value = val;
  var colors = { รายรับ:'var(--up)', รายจ่าย:'var(--signal)' };
  var bgs    = { รายรับ:'rgba(var(--up-rgb),.12)', รายจ่าย:'rgba(var(--signal-rgb),.1)' }; // ใช้ตัวแปร CSS ไม่ hardcode ตรงๆ กันพื้นหลังจางหายตอน dark mode
  document.querySelectorAll('.ext-type-btn').forEach(function(btn){
    var v = btn.dataset.val;
    var active = (v === val);
    btn.style.border     = '1.5px solid '+(active ? colors[v] : 'var(--dust)');
    btn.style.background = active ? bgs[v] : 'transparent';
    btn.style.color      = active ? colors[v] : 'var(--slate)';
    btn.style.fontWeight = active ? '600' : '400';
  });
}

// ---------- SAVE ----------
async function saveExtTransaction(){
  if(!adminGuard()) return;
  if(!canEditModule('finance')){ alert('คุณไม่มีสิทธิ์แก้ไขหน้าเงินนอก'); return; }
  var editId = document.getElementById('extEditId').value;
  var date   = document.getElementById('extDate').value;
  var type   = document.getElementById('extTypeHidden').value;
  var catId  = document.getElementById('extCat').value;
  var amount = parseFloat(document.getElementById('extAmount').value);
  var note   = document.getElementById('extNote').value.trim();

  if(!date)                      return alert('กรุณาเลือกวันที่');
  if(!catId)                     return alert('กรุณาเลือกหมวด');
  if(isNaN(amount)||amount <= 0) return alert('กรุณาระบุจำนวนเงินที่ถูกต้อง');

  var payload = {
    transaction_date: date,
    type:             type,
    category_id:      catId,
    amount:           amount,
    note:             note || null
  };

  show('loadingOverlay','flex');
  try{
    await RPC('fn_save_external_transaction', {
      p_id: editId || null, ...currentAuthParams(),
      p_transaction_date: payload.transaction_date, p_type: payload.type,
      p_category_id: payload.category_id, p_amount: payload.amount, p_note: payload.note
    });
    EXT_LOADED = false;
    await loadExternalData();
    closeExtForm();
  }catch(e){
    hide('loadingOverlay');
    alert('บันทึกไม่สำเร็จ: '+e.message);
  }
}

// ---------- DELETE ----------
function deleteExtTransaction(id){
  PENDING_DEL = { type:'external_transaction', id: id };
  document.getElementById('confirmMsg').textContent = 'ต้องการลบรายการนี้ออกจากระบบ?';
  document.getElementById('confirmOverlay').classList.add('open');
}

// ---------- EXPORT CSV ----------
function exportExtCSV(){
  var list = getExtFiltered();
  if(!list.length){ alert('ไม่มีข้อมูลให้ Export'); return; }
  var rows = [['วันที่','ประเภท','หมวด','หมายเหตุ','จำนวน (บาท)']];
  list.forEach(function(t){
    var cname = (t.external_categories && t.external_categories.name) ? t.external_categories.name : '';
    rows.push([t.transaction_date, t.type, cname, t.note||'', t.amount]);
  });
  // ป้องกัน CSV/Formula Injection (OWASP): ถ้าค่าขึ้นต้นด้วย = + - @ tab หรือ CR
  // Excel/Sheets อาจตีความเป็นสูตรได้แม้ครอบด้วย "" แล้วก็ตาม ยกเว้นตัวเลขล้วน
  // (รวมติดลบ/ทศนิยม) เพื่อไม่ให้จำนวนเงินติดลบที่ถูกต้องกลายเป็นข้อความ
  function csvGuard(s){
    if(/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)){
      s = "'" + s;
    }
    return s;
  }
  var csv = rows.map(function(r){
    return r.map(function(v){ return '"'+csvGuard(String(v||'')).replace(/"/g,'""')+'"'; }).join(',');
  }).join('\n');
  var blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'external_expenses.csv';
  a.click();
}

// ---------- CATEGORY MANAGEMENT ----------
function openExtCatModal(){
  renderExtCatList();
  document.getElementById('extCatName').value = '';
  document.getElementById('extCatType').value = 'รายจ่าย';
  document.getElementById('extCatOverlay')?.classList.add('open');
}

function closeExtCatModal(){
  document.getElementById('extCatOverlay')?.classList.remove('open');
}

function renderExtCatList(){
  var ul = document.getElementById('ext-cat-list');
  if(!ul) return;
  if(!EXT_CATEGORIES.length){
    ul.innerHTML = '<li style="color:var(--muted);font-size:13px;padding:8px 0">ยังไม่มีหมวด</li>';
    return;
  }
  ul.innerHTML = EXT_CATEGORIES.map(function(c){
    var tc = c.type === 'รายรับ' ? 'var(--up)' : c.type === 'รายจ่าย' ? 'var(--signal)' : 'var(--slate)';
    return '<li style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--dust)">'+
      '<div>'+
        '<span style="font-size:14px;color:var(--ink)">'+c.name+'</span>'+
        '<span style="font-size:11px;color:'+tc+';margin-left:8px;font-weight:600">'+c.type+'</span>'+
      '</div>'+
      '<button class="act-btn del admin-only" onclick="deleteExtCategory(\''+c.id+'\')">🗑️</button>'+
    '</li>';
  }).join('');
}

async function saveExtCategory(){
  if(!adminGuard()) return;
  if(!canEditModule('finance')){ alert('คุณไม่มีสิทธิ์จัดการหมวดเงินนอก'); return; }
  var name = document.getElementById('extCatName').value.trim();
  var type = document.getElementById('extCatType').value;
  if(!name) return alert('กรุณาใส่ชื่อหมวด');

  show('loadingOverlay','flex');
  try{
    await RPC('fn_save_external_category', { ...currentAuthParams(), p_name: name, p_type: type, p_sort_order: EXT_CATEGORIES.length+1 });
    EXT_CATEGORIES = await GET('external_categories','select=*&order=sort_order') || [];
    hide('loadingOverlay');
    renderExtCatList();
    document.getElementById('extCatName').value = '';
    fillExtCatFilterSel();
  }catch(e){
    hide('loadingOverlay');
    alert('บันทึกไม่สำเร็จ: '+e.message);
  }
}

async function deleteExtCategory(id){
  if(!adminGuard()) return;
  if(!canEditModule('finance')){ alert('คุณไม่มีสิทธิ์จัดการหมวดเงินนอก'); return; }
  if(!confirm('ต้องการลบหมวดนี้?\n(รายการที่อยู่ในหมวดนี้จะยังคงอยู่ แต่ไม่มีหมวด)')) return;
  show('loadingOverlay','flex');
  try{
    await RPC('fn_delete_external_category', { p_id: id, ...currentAuthParams() });
    EXT_CATEGORIES = await GET('external_categories','select=*&order=sort_order') || [];
    hide('loadingOverlay');
    renderExtCatList();
    fillExtCatFilterSel();
  }catch(e){
    hide('loadingOverlay');
    alert('ลบไม่สำเร็จ: '+e.message);
  }
}
