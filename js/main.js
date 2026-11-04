'use strict';
/* ===== نقطة التشغيل ===== */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
A.applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', A.applyTheme);

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); A.installEvt = e; if (A.lib.tab === 'set') A.lib.render(); });
window.addEventListener('appinstalled', () => { A.installEvt = null; A.toast('App installed'); });

// منع المتصفح من فتح الملفات المسقطة بدل التطبيق + إضافتها للمكتبة (سطح المكتب)
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => { e.preventDefault(); const f = [...(e.dataTransfer.files || [])]; if (f.length) { await A.addFiles(f); A.toast(`${f.length} file(s) added`); } });

// الملفات المشاركة من تطبيقات أخرى (share_target) عبر الـ Service Worker
async function importShared() {
  if (!('caches' in window)) return; const c = await caches.open('pdfreader-share'); const keys = await c.keys(); const out = [];
  for (const k of keys) { const r = await c.match(k); const b = await r.blob(); out.push(new File([b], decodeURIComponent(k.url.split('/').pop()), { type: b.type })); await c.delete(k); }
  if (out.length) { const rs = await A.addFiles(out, null); A.toast(`Received ${rs.length} file(s)`); if (rs.length === 1) A.openFile(rs[0].id); }
}

// ask the browser not to auto-delete the app's stored files
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then((ok) => (A.persisted = ok)).catch(() => {});
// tell the user when a new version of the app has been installed
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', async () => { if (!had) return; if (A.V && A.V.dirty) return A.toast('Update installed — it applies next time you open the app', 4200); if (await A.confirm('A new version of the app is ready. Reload now?', 'Reload')) location.reload(); });
}
// look for a new version of the app now and then (on start, and whenever the app comes back to the screen)
A.checkUpdate = async (manual) => {
  if (!('serviceWorker' in navigator)) return; const r = await navigator.serviceWorker.getRegistration(); if (!r) return manual && A.toast('Offline mode is not active yet — reload the page once');
  try { await r.update(); } catch (e) { return manual && A.toast('Could not check for updates'); }
  if (manual) A.toast(r.installing || r.waiting ? 'New version found — downloading it now. Reopen the app when asked.' : `You already have the latest version (${A.VERSION})`, 4200);
};
window.addEventListener('load', () => setTimeout(() => A.checkUpdate(false), 3000));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') A.checkUpdate(false); });
// pick up newly downloaded files in linked device folders whenever the app comes back to the screen
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && A.lib.src && A.lib.src.length && Date.now() - (A.lib.lastScan || 0) > 15000) { A.lib.lastScan = Date.now(); A.lib.refreshDev(); } });

(async function init() {
  await A.lib.reload(); A.lib.build(); A.lib.render(); A.lib.lastScan = Date.now(); A.lib.refreshDev();
  history.replaceState({ d: 0 }, '');
  // فتح الملفات من نظام التشغيل (File Handling API)
  if ('launchQueue' in window) launchQueue.setConsumer(async (p) => { if (!p.files || !p.files.length) return; const fs = []; for (const h of p.files) fs.push(await h.getFile()); const rs = await A.addFiles(fs, null); if (rs[0]) A.openFile(rs[0].id); });
  const q = new URLSearchParams(location.search);
  if (q.get('share')) { await importShared(); history.replaceState({ d: 0 }, '', location.pathname); }
  if (q.get('tool')) { A.lib.tab = 'tools'; A.lib.render(); setTimeout(() => A.runTool(q.get('tool')), 300); }
  // إخفاء شاشة البداية: تظهر الأيقونة فقط ثم تختفي
  const boot = $('#boot'); setTimeout(() => { boot.classList.add('out'); setTimeout(() => boot.remove(), 300); }, 250);
})();
