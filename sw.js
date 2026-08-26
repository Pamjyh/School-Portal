// =====================================================================
// Service Worker — โรงเรียนบ้านท่าชะอม
// v1.0 — cache-first static, network-only API
// =====================================================================
const CACHE_NAME = 'banthacha-om-v38'; // v38: ระบบลงเวลา ปิด stored XSS ใบลา + ลด persistence admin hash (P0-03, 2026-08-24)
// ⚠️ พบว่า sw.js ใช้ stale-while-revalidate ทุกไฟล์ same-origin (ยกเว้น NO_CACHE_PATHS/HOSTS) รวมถึง
// js/pdf-templates.js ด้วย — คืน cache เก่าทันทีเสมอ ค่อย update cache ใน background ไว้ใช้รอบถัดไป
// ทำให้ push โค้ดใหม่ขึ้น GitHub Pages ไม่พอ ต้อง hard refresh ก็ยังไม่เห็นของใหม่ในรอบเดียว (Pam เจอจริง
// 2026-07-10 — กด "1. ขอดำเนิน" ยังโหลด jsPDF เก่าอยู่ทั้งที่ push โค้ด HTML+print ไปแล้ว) ต้อง bump
// CACHE_NAME ทุกครั้งที่แก้ไฟล์ static (js/*, index.html ฯลฯ) ที่ต้องการให้ผู้ใช้เห็นทันที ไม่งั้น SW จะ
// เสิร์ฟของเก่าเงียบๆ ต่อไปเรื่อยๆ จนกว่า cache จะถูกล้าง

// ไฟล์ที่ pre-cache ตอน install
const PRE_CACHE = [
  './',
  './assets/school-logo.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './manifest.json',
  // subsystems
  './ระบบบริหารงาน/',
  './ระบบออมทรัพย์/',
  './ระบบค่ารถ/',
  './ระบบลงเวลา/',
  './ระบบสารบัญ/',
  './ทำเนียบบุคลากร/',
];

// domain ที่ไม่ cache (API calls)
const NO_CACHE_HOSTS = [
  'script.google.com',
  'supabase.co',
  'fonts.googleapis.com',  // โหลดสดเสมอ
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

// ไฟล์ในโดเมนตัวเองที่ต้องโหลดสดเสมอ ห้าม cache แม้จะ same-origin
// (system-status.js: ต้องเห็นผลทันทีตอน admin เปลี่ยนสถานะเปิด/ปิดระบบ)
const NO_CACHE_PATHS = [
  'system-status.js',
];

function isApiCall(url) {
  if (NO_CACHE_HOSTS.some(h => url.hostname.includes(h))) return true;
  if (NO_CACHE_PATHS.some(p => url.pathname.endsWith(p))) return true;
  return false;
}

// ─── INSTALL ─────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // ล้มเหลวแต่ละไฟล์ได้ — ไม่ให้ block install ทั้งหมด
      return Promise.allSettled(PRE_CACHE.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls → network only (ห้าม cache ข้อมูลสด)
  if (isApiCall(url)) return;

  // GET only
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      // Stale-while-revalidate: คืน cache ทันที + update ใน background
      const networkFetch = fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => null);

      return cached || networkFetch;
    })
  );
});
