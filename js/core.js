'use strict';
/* ===== Core utilities — no network access anywhere in this code ===== */
const A = (window.A = {});
/* App version: a single number. Increase it by 1 on every update round. */
A.VERSION = 3;
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extOf = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
const baseOf = (n) => n.replace(/\.[^.]+$/, '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const fmtDate = (t) => new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const isRTL = (s) => /[\u0590-\u08FF]/.test(s);
A.$ = $; A.$$ = $$; A.esc = esc; A.uid = uid; A.sleep = sleep; A.extOf = extOf; A.baseOf = baseOf; A.clamp = clamp; A.fmtSize = fmtSize; A.fmtDate = fmtDate; A.isRTL = isRTL;

/* ---------- Icons ---------- */
const IC = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 13l4 4L19 7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 010 18" fill="currentColor"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>', reflow: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>', download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  undo: '<path d="M4 12l5-5M4 12l5 5M4 12h11a5 5 0 010 9h-3"/>', redo: '<path d="M20 12l-5-5M20 12l-5 5M20 12H9a5 5 0 000 9h3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  rotL: '<path d="M4 12a8 8 0 112.5 5.8M4 4v5h5"/>', rotR: '<path d="M20 12a8 8 0 10-2.5 5.8M20 4v5h-5"/>',
  merge: '<path d="M6 4v6a4 4 0 004 4h4M18 4v6a4 4 0 01-4 4M12 14v6M9 17l3 3 3-3"/>',
  split: '<path d="M12 3v7M12 10L5 20M12 10l7 10"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  type: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', pen: '<path d="M4 20c4-1 5-6 8-6s1 4 4 4 3-3 4-5"/>',
  sign: '<path d="M3 16c3-6 5-6 6-2s3 2 5-3 3-1 7 0M3 21h18"/>', hl: '<path d="M9 16l-4 4h5l2-2M15 4l5 5-8 8-5-5z"/>',
  ul: '<path d="M7 4v7a5 5 0 0010 0V4M5 21h14"/>', hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5V4.5a1.5 1.5 0 013 0V11V6a1.5 1.5 0 013 0v9a6 6 0 01-6 6h-1a6 6 0 01-5-3l-3-5a1.5 1.5 0 012.5-1.5L8 15z"/>',
  eraser: '<path d="M4 16l9-9 6 6-6 6H8zM9 21h11"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017-2"/>',
  file: '<path d="M6 3h8l5 5v13H6zM14 3v5h5"/>', tools: '<path d="M15 5a4 4 0 00-3.5 5.5L4 18l2 2 7.5-7.5A4 4 0 0019 9l-2.5 2.5-2-2L17 7a4 4 0 00-2-2z"/>',
  set: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', chL: '<path d="M15 6l-6 6 6 6"/>', chR: '<path d="M9 6l6 6-6 6"/>', chU: '<path d="M6 15l6-6 6 6"/>', chD: '<path d="M6 9l6 6 6-6"/>',
  dup: '<rect x="3" y="7" width="12" height="14" rx="2"/><path d="M9 3h10a2 2 0 012 2v12"/><path d="M9 11v6M6 14h6"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/>', pages: '<rect x="4" y="3" width="10" height="14" rx="1.5"/><path d="M8 21h10a2 2 0 002-2V7"/>',
  book: '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/>',
  text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>', word: '<path d="M4 5l3 14 3-9 3 9 3-14"/>', zip: '<path d="M12 3v4M12 9v2M12 13v2M6 3h12v18H6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', az: '<path d="M4 18l4-12 4 12M5.5 14h5M15 6h5l-5 6h5"/>', size: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>', wake: '<path d="M12 3a6 6 0 00-3.5 10.9V17h7v-3.1A6 6 0 0012 3zM9 20h6"/>', two: '<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/>',
  rev: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>', vert: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>', horiz: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>', snap: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M3 9v6M21 9v6"/>',
  words: '<path d="M4 7h16M4 12h10M4 17h13"/>', line: '<path d="M4 19L20 5"/>', ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>', hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>', drop: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>', device: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>', refresh: '<path d="M20 11a8 8 0 00-14.5-4M4 4v4h4M4 13a8 8 0 0014.5 4M20 20v-4h-4"/>', open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
};
A.ic = (n, extra = '') => `<svg class="i" viewBox="0 0 24 24" ${extra}>${IC[n] || ''}</svg>`;

/* ---------- Settings ---------- */
A.set = Object.assign({ theme: 'auto', dir: 'v', snap: false, rev: false, read: 'day', keepOn: false, sort: 'date', view: 'list' }, JSON.parse(localStorage.getItem('prs2') || '{}'));
A.saveSet = () => localStorage.setItem('prs2', JSON.stringify(A.set));
A.applyTheme = () => {
  const dark = A.set.theme === 'dark' || (A.set.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = $('meta[name=theme-color]'); if (m) m.content = dark ? '#121317' : '#f6f7fb';
};

/* ---------- Local database (IndexedDB) ---------- */
A.db = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('pdfreader', 2);
    r.onupgradeneeded = () => { ['files', 'folders', 'sigs', 'devsrc', 'devfiles'].forEach((s) => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (s, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => { const t = d.transaction(s, mode); const rq = fn(t.objectStore(s)); t.oncomplete = () => res(rq && rq.result); t.onerror = t.onabort = () => rej(t.error); });
  };
  return { all: (s) => run(s, 'readonly', (st) => st.getAll()), get: (s, id) => run(s, 'readonly', (st) => st.get(id)), put: (s, o) => run(s, 'readwrite', (st) => st.put(o)), del: (s, id) => run(s, 'readwrite', (st) => st.delete(id)),
    putMany: (s, arr) => run(s, 'readwrite', (st) => { arr.forEach((o) => st.put(o)); return null; }), delMany: (s, ids) => run(s, 'readwrite', (st) => { ids.forEach((i) => st.delete(i)); return null; }) };
})();

/* ---------- Dialogs ---------- */
A.toast = (m, ms = 2400) => {
  $$('.toast').forEach((t) => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), ms);
};
A.modal = ({ title = '', body = '', actions = [{ k: 'ok', label: 'OK', p: 1 }], collect, onOpen, mid = true }) =>
  new Promise((res) => {
    const o = document.createElement('div'); o.className = 'ovl' + (mid ? ' mid' : '');
    o.innerHTML = `<div class="dlg">${title ? `<h3>${esc(title)}</h3>` : ''}<div class="mb">${body}</div>${actions.length ? `<div class="acts">${actions.map((a) => `<button class="btn ${a.p ? 'p' : ''} ${a.d ? 'd' : ''}" data-k="${a.k}">${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`;
    document.body.appendChild(o);
    const close = (k) => { const v = collect ? collect(o) : null; o.remove(); res({ k, v }); };
    o.addEventListener('click', (e) => { if (e.target === o) return close(null); const b = e.target.closest('[data-k]'); if (b && o.contains(b)) close(b.dataset.k); });
    onOpen && onOpen(o, close);
    const f = $('input:not([type=range]):not([type=checkbox]),textarea', o); f && !f.readOnly && setTimeout(() => f.focus(), 80);
  });
A.prompt = async (title, value = '', o = {}) => {
  const r = await A.modal({ title, body: `<input id="pi" type="${o.type || 'text'}" value="${esc(value)}" placeholder="${esc(o.ph || '')}">`, actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: o.ok || 'OK', p: 1 }], collect: (e) => $('#pi', e).value, onOpen: (e, close) => $('#pi', e).addEventListener('keydown', (ev) => ev.key === 'Enter' && close('ok')) });
  return r.k === 'ok' ? r.v : null;
};
A.confirm = async (msg, ok = 'Confirm', danger = false) => (await A.modal({ body: `<div style="line-height:1.7;font-size:15px">${esc(msg)}</div>`, actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: ok, p: !danger, d: danger }] })).k === 'ok';
A.sheet = (title, items) =>
  new Promise((res) => {
    const o = document.createElement('div'); o.className = 'ovl';
    o.innerHTML = `<div class="dlg">${title ? `<h3>${esc(title)}</h3>` : ''}${items.filter(Boolean).map((i) => `<button class="shi ${i.danger ? 'danger' : ''}" data-k="${i.k}">${A.ic(i.icon || 'chR')}<span>${esc(i.label)}</span></button>`).join('')}</div>`;
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b || e.target === o) { o.remove(); res(b ? b.dataset.k : null); } });
  });
A.busy = (msg = 'Working…', cancellable = false) => {
  const o = document.createElement('div'); o.className = 'busy'; let cancelled = false;
  o.innerHTML = `<div><div class="spin"></div><div class="bm">${esc(msg)}</div><div class="pbar"><i></i></div>${cancellable ? '<button class="btn" data-cx style="margin-top:14px;width:100%">Cancel</button>' : ''}</div>`; document.body.appendChild(o);
  if (cancellable) $('[data-cx]', o).onclick = () => { cancelled = true; $('.bm', o).textContent = 'Cancelling…'; };
  return { set: (m, pct) => { $('.bm', o).textContent = cancelled ? 'Cancelling…' : m; if (pct != null) $('.pbar i', o).style.width = Math.round(pct * 100) + '%'; }, done: () => o.remove(), get cancelled() { return cancelled; } };
};

/* ---------- Screen stack (Android back button closes the top screen) ---------- */
A.stack = [];
A.push = (el, onClose) => { document.body.appendChild(el); A.stack.push({ el, onClose }); history.pushState({ d: A.stack.length }, ''); };
A.pop = () => { if (A.stack.length) history.back(); };
window.addEventListener('popstate', (e) => {
  const d = (e.state && e.state.d) || 0;
  while (A.stack.length > d) { const s = A.stack.pop(); s.onClose && s.onClose(); s.el.remove(); }
});

/* ---------- File picking / download / share / print ---------- */
A.pickFiles = (accept, multiple = true) =>
  new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.multiple = multiple; i.style.display = 'none'; document.body.appendChild(i);
    i.onchange = () => { res([...i.files]); i.remove(); }; i.addEventListener('cancel', () => { res([]); i.remove(); }); i.click();
  });
A.download = (name, blob) => {
  const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 20000);
};
A.share = async (name, blob) => {
  const f = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  A.download(name, blob); A.toast('Sharing is not supported here — file downloaded');
};
A.printImages = (urls) => {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.srcdoc = `<html><head><style>@page{margin:0}body{margin:0}img{display:block;width:100%;page-break-after:always}</style></head><body>${urls.map((u) => `<img src="${u}">`).join('')}</body></html>`;
  f.onload = () => setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 400);
};

/* ---------- Password lock for files (AES-GCM, inside the app) ---------- */
A.crypto = {
  async key(pw, salt) { const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
  async enc(blob, pw) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(pw, salt), await blob.arrayBuffer()); return { blob: new Blob([ct]), enc: { salt, iv, type: blob.type } }; },
  async dec(rec, pw) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.enc.iv }, await this.key(pw, rec.enc.salt), await rec.blob.arrayBuffer()); return new Blob([pt], { type: rec.enc.type }); },
};

/* ---------- Reorderable list dialog (drag handle + up/down arrows + remove + add more) ---------- */
A.listDlg = async ({ title, items, add, name, nameLabel = 'File name', extraBody = '', extra = () => null, saveLabel = 'Save' }) => {
  let arr = items.map((it) => ({ id: uid().slice(0, 8), ...it }));
  const r = await A.modal({
    title, body: `${name != null ? `<label class="lbl" style="margin-top:0">${esc(nameLabel)}</label><input id="ln" value="${esc(name)}" style="margin-bottom:12px">` : ''}<div class="lst" id="sl"></div>${add ? `<button class="addbtn" id="sadd">${A.ic('plus')}Add more</button>` : ''}${extraBody}`,
    actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: saveLabel, p: 1 }],
    collect: (o) => { const L = $('#sl', o); const ord = $$('.srow', L).map((r) => arr.find((a) => a.id === r.dataset.id)).filter(Boolean); return { items: ord, name: name != null ? $('#ln', o).value.trim() : null, extra: extra(o) }; },
    onOpen: (o) => {
      const L = $('#sl', o);
      const rd = () => (L.innerHTML = arr.map((it) => `<div class="srow" data-id="${it.id}"><span class="gp" data-grip>${A.ic('grip')}</span>${it.thumb ? `<img src="${it.thumb}" alt="">` : ''}<span class="sn">${esc(it.label)}</span><button class="ib" data-a="up">${A.ic('chU')}</button><button class="ib" data-a="dn">${A.ic('chD')}</button><button class="ib" data-a="rm" style="color:var(--danger)">${A.ic('x')}</button></div>`).join('')); rd();
      const sync = () => { arr = $$('.srow', L).map((r) => arr.find((a) => a.id === r.dataset.id)).filter(Boolean); };
      L.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return; const row = b.closest('.srow'); sync(); const i = arr.findIndex((a) => a.id === row.dataset.id);
        if (b.dataset.a === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; else if (b.dataset.a === 'dn' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        else if (b.dataset.a === 'rm') { if (arr.length > 1) arr.splice(i, 1); else A.toast('At least one item is required'); } rd();
      });
      A.dragList(L, '.srow', '[data-grip]');
      $$('.seg', o).forEach((sg) => sg.addEventListener('click', (e) => { const x = e.target.closest('button'); if (x) $$('button', sg).forEach((y) => y.classList.toggle('on', y === x)); }));
      add && ($('#sadd', o).onclick = async () => { sync(); const more = await add(arr); if (more && more.length) { arr.push(...more.map((it) => ({ id: uid().slice(0, 8), ...it }))); rd(); } });
    },
  });
  return r.k === 'ok' && r.v.items.length ? r.v : null;
};
/* vertical drag-to-reorder for rows (grab the handle and move) */
A.dragList = (list, rowSel, gripSel) => {
  list.addEventListener('pointerdown', (e) => {
    const g = e.target.closest(gripSel); if (!g) return; const row = g.closest(rowSel); e.preventDefault(); row.classList.add('drag'); g.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const y = ev.clientY; const sibs = [...list.children].filter((r) => r !== row); let before = null;
      for (const s of sibs) { const b = s.getBoundingClientRect(); if (y < b.top + b.height / 2) { before = s; break; } }
      if (before) { if (row.nextSibling !== before) list.insertBefore(row, before); } else if (list.lastChild !== row) list.appendChild(row);
      const lr = list.getBoundingClientRect(); if (y < lr.top + 30) list.scrollTop -= 10; else if (y > lr.bottom - 30) list.scrollTop += 10;
    };
    const up = () => { row.classList.remove('drag'); g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  });
};

/* ---------- Page thumbnails cache (pdf.js) ---------- */
A.thumbCache = (pdf, size = 150) => {
  const th = {};
  return async (src) => {
    if (th[src]) return th[src];
    const p = await pdf.getPage(src + 1), v1 = p.getViewport({ scale: 1 }), s = (size / Math.max(v1.width, v1.height)) * Math.min(window.devicePixelRatio || 1, 2), vp = p.getViewport({ scale: s });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; return (th[src] = c);
  };
};
A.paintThumb = (cv, t) => { cv.width = t.width; cv.height = t.height; cv.getContext('2d').drawImage(t, 0, 0); const ar = t.width / t.height; cv.style.width = ar >= 1 ? '86%' : 'auto'; cv.style.height = ar >= 1 ? 'auto' : '86%'; };

/* ---------- Rename dialog: the file extension is fixed and cannot be edited ---------- */
A.renameDlg = async (fullName, title = 'Rename file') => {
  const ext = extOf(fullName), base = ext ? fullName.slice(0, -(ext.length + 1)) : fullName;
  const r = await A.modal({
    title, body: `<div style="display:flex;align-items:center;gap:8px"><input id="rn" value="${esc(base)}" style="flex:1">${ext ? `<span style="background:var(--bg);color:var(--tx2);padding:11px 14px;border-radius:14px;font-weight:600">.${esc(ext)}</span>` : ''}</div><div style="font-size:12px;color:var(--tx2);margin-top:8px">The extension stays .${esc(ext)} and can't be changed.</div>`,
    actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Save', p: 1 }], collect: (o) => $('#rn', o).value, onOpen: (o, close) => $('#rn', o).addEventListener('keydown', (e) => e.key === 'Enter' && close('ok')),
  });
  if (r.k !== 'ok') return null;
  let n = r.v.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim(); if (ext && n.toLowerCase().endsWith('.' + ext)) n = n.slice(0, -(ext.length + 1)).trim(); n = n.replace(/[. ]+$/, '');
  if (!n) { A.toast('The name cannot be empty'); return null; }
  return ext ? n + '.' + ext : n;
};
