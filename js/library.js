'use strict';
/* ===== Library: home screen, device folders, folders, favorites, bin, tools grid, settings ===== */
const L = (A.lib = { files: [], dev: [], src: [], folders: [], tab: 'files', filter: 'all', q: '', folder: null, needGrant: false, limit: 300, selMode: false, sel: new Set(), visAll: [] });
const TYPES = { pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel', csv: 'excel', ppt: 'ppt', pptx: 'ppt', txt: 'txt', md: 'txt' };
const TLAB = { pdf: 'PDF', word: 'DOC', excel: 'XLS', ppt: 'PPT', txt: 'TXT' };
A.typeOf = (ext) => TYPES[ext] || null;
A.ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md';
A.devSupported = () => 'showDirectoryPicker' in window && 'showOpenFilePicker' in window;

L.reload = async () => { L.files = await A.db.all('files'); L.folders = await A.db.all('folders'); L.src = await A.db.all('devsrc'); L.dev = await A.db.all('devfiles'); };
L.rec = (id) => L.files.find((f) => f.id === id) || L.dev.find((f) => f.id === id);
A.persist = (rec) => A.db.put(rec.dev ? 'devfiles' : 'files', rec);

/* ---------- device file access ---------- */
A.devPerm = async (h, write) => { const o = { mode: write ? 'readwrite' : 'read' }; try { if ((await h.queryPermission(o)) === 'granted') return true; return (await h.requestPermission(o)) === 'granted'; } catch (e) { return false; } };
A.getBlob = async (rec) => {
  if (!rec.dev) return rec.blob;
  if (!(await A.devPerm(rec.handle, false))) throw new Error('perm');
  return rec.handle.getFile();
};
L.scanSource = async (src) => {
  const out = []; let count = 0;
  const walk = async (dir, path, depth) => {
    for await (const [name, h] of dir.entries()) {
      if (count >= 5000) return;
      if (h.kind === 'directory') { if (depth < 5 && !name.startsWith('.')) await walk(h, path + name + '/', depth + 1); }
      else { const ext = extOf(name); if (!TYPES[ext]) continue; const f = await h.getFile(); out.push({ id: src.id + ':' + path + name, dev: true, src: src.id, name, ext, size: f.size, added: f.lastModified, path: src.name + '/' + path + name, handle: h, fav: 0, bm: [] }); count++; }
    }
  };
  await walk(src.handle, '', 0); return out;
};
L.refreshDev = async (busy) => {
  if (L.scanning) return; L.scanning = true; L.needGrant = false; const b = busy ? A.busy('Scanning device folders…') : null;
  try {
    for (const src of L.src.filter((s) => s.type === 'dir')) {
      let ok = false; try { ok = (await src.handle.queryPermission({ mode: 'read' })) === 'granted'; } catch (e) { /* ignore */ }
      if (!ok) { L.needGrant = true; continue; }
      try {
        const found = await L.scanSource(src), old = L.dev.filter((d) => d.src === src.id), om = new Map(old.map((d) => [d.id, d]));
        found.forEach((n) => { const o = om.get(n.id); if (o) { n.fav = o.fav; n.bm = o.bm; n.lastPage = o.lastPage; n.opened = o.opened; } });
        await A.db.delMany('devfiles', old.map((d) => d.id)); await A.db.putMany('devfiles', found); L.dev = L.dev.filter((d) => d.src !== src.id).concat(found);
      } catch (e) { console.warn('scan failed', e); }
    }
  } finally { L.scanning = false; b && b.done(); L.render(); }
};
L.grant = async () => { for (const src of L.src.filter((s) => s.type === 'dir')) { try { await src.handle.requestPermission({ mode: 'readwrite' }); } catch (e) { /* ignore */ } } await L.refreshDev(true); };
L.addFolder = async () => {
  let h; try { try { h = await showDirectoryPicker({ mode: 'readwrite', id: 'pdfreader-dir' }); } catch (e) { if (e.name === 'TypeError') h = await showDirectoryPicker(); else throw e; } } catch (e) { if (e.name !== 'AbortError') A.toast('Could not open that folder — choose a sub-folder (for example Download/Telegram)', 4200); return; }
  const src = { id: uid(), type: 'dir', name: h.name, handle: h }; await A.db.put('devsrc', src); L.src.push(src); await L.refreshDev(true); A.toast(`Linked “${h.name}”`);
};
L.addLinked = async () => {
  let hs; try { hs = await showOpenFilePicker({ multiple: true, id: 'pdfreader-files' }); } catch (e) { return; }
  const add = []; for (const h of hs) { const ext = extOf(h.name); if (!TYPES[ext]) { A.toast('Unsupported file: ' + h.name); continue; } const f = await h.getFile(); add.push({ id: 'f:' + uid(), dev: true, src: 'files', name: h.name, ext, size: f.size, added: f.lastModified, path: 'Linked file (no copy)', handle: h, fav: 0, bm: [] }); }
  if (add.length) { await A.db.putMany('devfiles', add); L.dev.push(...add); L.render(); A.toast(`${add.length} file(s) linked`); }
};
L.removeSrc = async (id) => {
  if (!(await A.confirm('Remove this source from the app? Your files on the device are not deleted.', 'Remove', true))) return;
  const gone = L.dev.filter((d) => d.src === id).map((d) => d.id); await A.db.delMany('devfiles', gone); await A.db.del('devsrc', id); L.dev = L.dev.filter((d) => d.src !== id); L.src = L.src.filter((s) => s.id !== id); L.render();
};

/* ---------- adding / saving files ---------- */
A.addFiles = async (files, folder = L.folder) => {
  const out = [];
  for (const f of files) {
    const ext = extOf(f.name); if (!TYPES[ext]) { A.toast('Unsupported file: ' + f.name); continue; }
    const r = { id: uid(), name: f.name, ext, size: f.size, blob: f, folder, fav: 0, del: 0, added: Date.now(), bm: [] };
    await A.db.put('files', r); L.files.push(r); out.push(r);
  }
  L.render(); return out;
};
A.uniqueName = (name, folder) => {
  const taken = new Set(L.files.filter((f) => !f.del && (f.folder || null) === (folder || null)).map((f) => f.name.toLowerCase())); if (!taken.has(name.toLowerCase())) return name;
  const e = extOf(name), base = e ? name.slice(0, -(e.length + 1)) : name; let n = 2; while (taken.has(`${base} (${n})${e ? '.' + e : ''}`.toLowerCase())) n++; return `${base} (${n})${e ? '.' + e : ''}`;
};
A.saveBlob = async (name, blob, folder = L.folder) => { name = A.uniqueName(name, folder); const r = { id: uid(), name, ext: extOf(name), size: blob.size, blob, folder, fav: 0, del: 0, added: Date.now(), bm: [] }; await A.db.put('files', r); L.files.push(r); L.render(); return r; };
A.updateBlob = async (rec, blob) => {
  if (rec.dev) {
    if (!(await A.devPerm(rec.handle, true))) throw new Error('No permission to write to the original file');
    const w = await rec.handle.createWritable(); await w.write(blob); await w.close(); rec.size = blob.size; rec.added = Date.now(); await A.persist(rec); L.render(); return;
  }
  rec.blob = blob; rec.size = blob.size; rec.added = Date.now(); rec._n = undefined; await A.db.put('files', rec); L.render();
};
L.save = async (r) => { await A.persist(r); L.render(); };

/* is this file protected? (locked in the app, or a PDF with its own password) */
A.isProtected = async (rec) => {
  if (rec.enc) return true; if (rec.ext !== 'pdf') return false; if (rec._n !== undefined) return rec._n;
  try {
    let b = rec.blob; if (rec.dev) { if ((await rec.handle.queryPermission({ mode: 'read' })) !== 'granted') return false; b = await rec.handle.getFile(); }
    const h = await b.slice(0, 4096).text(), t = await b.slice(Math.max(0, b.size - 8192)).text(); rec._n = /\/Encrypt\b/.test(h) || /\/Encrypt\b/.test(t);
  } catch (e) { rec._n = false; }
  return rec._n;
};

/* ---------- Layout ---------- */
L.build = () => {
  $('#app').innerHTML = `<div id="shell">
  <header class="top"><div class="ttl" id="ttl">PDF Reader</div>
    <button class="ib" data-a="search">${A.ic('search')}</button><button class="ib" data-a="view"></button><button class="ib" data-a="sort">${A.ic('more')}</button></header>
  <header class="top" id="selhdr" hidden><button class="ib" data-a="sx">${A.ic('x')}</button><div class="ttl" id="selttl">0 selected</div><button class="ib" data-a="sall">${A.ic('check')}</button><button class="ib" data-a="sdel" style="color:var(--danger)">${A.ic('trash')}</button><button class="ib" data-a="smore">${A.ic('more')}</button></header>
  <div class="sbar" id="sbar" hidden><input id="q" placeholder="Search files…"></div>
  <div class="chips" id="chips"></div>
  <main id="content"></main>
  <button class="fab" data-a="fab" aria-label="Add">${A.ic('plus')}</button>
  <nav class="bnav">${[['files', 'folder', 'Files'], ['tools', 'tools', 'Tools'], ['bin', 'trash', 'Bin'], ['set', 'set', 'Settings']].map(([k, i, t]) => `<button data-tab="${k}">${A.ic(i)}<span>${t}</span></button>`).join('')}</nav></div>`;
  $('#app').addEventListener('click', L.click);
  /* press and hold a file to start selecting several files */
  let lp = null;
  $('#content').addEventListener('pointerdown', (e) => { const row = e.target.closest('.fi[data-id]'); if (!row || L.selMode || e.button > 0 || e.target.closest('.ib')) return; lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { L.selMode = true; L.sel = new Set([row.dataset.id]); L.supClick = true; setTimeout(() => (L.supClick = false), 400); if (navigator.vibrate) navigator.vibrate(12); L.render(); }, 450) }; });
  const cancelLp = (e) => { if (lp && (!e.clientX || Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8 || e.type !== 'pointermove')) { clearTimeout(lp.t); lp = null; } };
  $('#content').addEventListener('pointermove', cancelLp); $('#content').addEventListener('pointerup', cancelLp); $('#content').addEventListener('pointercancel', cancelLp);
  $('#content').addEventListener('contextmenu', (e) => { if (e.target.closest('.fi')) e.preventDefault(); });
  $('#q').addEventListener('input', (e) => { L.q = e.target.value.trim().toLowerCase(); L.render(true); });
};

L.render = () => {
  if (!$('#content')) return;
  $$('.bnav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === L.tab));
  const files = L.tab === 'files'; if (!files) { L.selMode = false; L.sel.clear(); }
  $('#selhdr').hidden = !L.selMode; $('#app header.top:not(#selhdr)').hidden = L.selMode; if (L.selMode) $('#selttl').textContent = `${L.sel.size} selected`;
  $('#chips').hidden = !files; $('.fab').hidden = !files || L.selMode; $('#ttl').textContent = { files: 'PDF Reader', tools: 'Tools', bin: 'Bin', set: 'Settings' }[L.tab];
  ['view', 'search', 'sort'].forEach((k) => ($(`[data-a=${k}]`).hidden = !files));
  $('[data-a=view]').innerHTML = A.ic(A.set.view === 'list' ? 'grid' : 'list');
  if (!files) $('#sbar').hidden = true;
  if (files) $('#chips').innerHTML = [['all', 'All'], ['pdf', 'PDF'], ['word', 'Word'], ['excel', 'Excel'], ['ppt', 'PPT'], ['txt', 'TXT'], ['fav', 'Favorites'], ['folders', 'Folders'], ['device', 'Device']].map(([k, t]) => `<button class="chip ${L.filter === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('');
  const c = $('#content'); c.className = A.set.view === 'grid' && files ? 'grid' : '';
  ({ files: L.rFiles, tools: L.rTools, bin: L.rBin, set: L.rSet })[L.tab](c);
};

const rowHtml = (r) => `<div class="fi ${L.selMode && L.sel.has(r.id) ? 'sel' : ''}" data-id="${esc(r.id)}" data-a="open">
  ${L.selMode ? `<span class="ck2 ${L.sel.has(r.id) ? 'on' : ''}">${A.ic('check')}</span>` : ''}<div class="badge b-${TYPES[r.ext]}">${TLAB[TYPES[r.ext]]}</div>
  <div class="meta"><div class="nm">${r.enc ? '🔒 ' : ''}${esc(r.name)}</div><div class="sub">${fmtSize(r.size)} · ${fmtDate(r.added)}</div>${r.dev ? `<div class="sub path" dir="ltr">${esc(r.path)}</div>` : ''}</div>
  ${L.selMode ? '' : `<button class="ib ${r.fav ? 'fav-on' : ''}" data-a="fav" data-id="${esc(r.id)}">${A.ic('star')}</button><button class="ib" data-a="menu" data-id="${esc(r.id)}">${A.ic('more')}</button>`}</div>`;

L.devPanel = () => {
  const sup = A.devSupported();
  const srcs = L.src.map((s) => { const n = s.type === 'dir' ? L.dev.filter((d) => d.src === s.id).length : 0; return `<div class="srow"><span style="padding:8px 4px;color:var(--tx2)">${A.ic('folder')}</span><span class="sn"><b>${esc(s.name)}</b><br><small style="color:var(--tx2)">${n} files</small></span><button class="ib" data-a="rmsrc" data-id="${s.id}" style="color:var(--danger)">${A.ic('x')}</button></div>`; }).join('');
  return `<div class="card"><div class="ch"><span class="cn">Device folders</span></div>
    <div class="cs" style="line-height:1.7;margin-bottom:10px">${sup ? 'Link folders from your phone or computer (for example <b>Download/Telegram</b>) and their files appear here without uploading. Chrome does not allow the Downloads folder itself, so pick a sub-folder inside it. Android may ask for permission again each time you open the app.' : 'This browser cannot link device folders. Use the + button to add files instead.'}</div>
    ${L.src.length ? `<div style="margin-bottom:8px">${srcs}</div>` : ''}
    ${sup ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn p" data-a="addfolder" style="min-width:0">Add folder</button><button class="btn" data-a="addlinked" style="min-width:0">Add files</button>${L.src.some((s) => s.type === 'dir') ? '<button class="btn" data-a="rescan" style="min-width:0">Rescan</button>' : ''}</div>` : ''}</div>`;
};

L.rFiles = (c) => {
  const live = L.files.filter((f) => !f.del), q = L.q, f = L.filter, match = (x) => !q || x.name.toLowerCase().includes(q) || (x.path || '').toLowerCase().includes(q);
  let list = [];
  if (f === 'device') list = L.dev.filter(match);
  else if (f === 'fav') list = live.filter((x) => x.fav && match(x)).concat(L.dev.filter((x) => x.fav && match(x)));
  else if (f === 'folders') list = [];
  else {
    list = live.filter((x) => (q ? match(x) : x.folder === L.folder)); if (!L.folder || q) list = list.concat(L.dev.filter(match));
    if (f !== 'all') list = list.filter((x) => TYPES[x.ext] === f);
  }
  const s = A.set.sort; list.sort((a, b) => (s === 'name' ? a.name.localeCompare(b.name) : s === 'size' ? b.size - a.size : s === 'opened' ? (b.opened || 0) - (a.opened || 0) : b.added - a.added));
  const showFolders = (f === 'all' || f === 'folders') && !q; const folders = showFolders ? L.folders.filter((x) => x.parent === L.folder) : [];
  let top = '';
  if (L.needGrant && L.src.length && f !== 'folders') top += `<button class="addbtn" data-a="grant" style="margin:0 0 12px">${A.ic('device')}Allow access to your device folders</button>`;
  if (f === 'device') top += L.devPanel();
  if (L.folder && !q && f === 'all') { const path = []; let id = L.folder; while (id) { const x = L.folders.find((y) => y.id === id); if (!x) break; path.unshift(x); id = x.parent; } top += `<div class="crumbs"><b data-a="cd" data-id="">Home</b>${path.map((x) => ` › <b data-a="cd" data-id="${x.id}">${esc(x.name)}</b>`).join('')}</div>`; }
  if (q && $('#sbar').hidden) top += `<div class="qchip">Search: “${esc(L.q)}”<button class="ib" style="width:28px;height:28px" data-a="clearq">${A.ic('x')}</button></div>`;
  const fh = folders.map((x) => `<div class="fi" data-a="cd" data-id="${x.id}"><div class="badge b-fold">${A.ic('folder')}</div><div class="meta"><div class="nm">${esc(x.name)}</div><div class="sub">${live.filter((y) => y.folder === x.id).length} files</div></div><button class="ib" data-a="fmenu" data-id="${x.id}">${A.ic('more')}</button></div>`).join('');
  L.visAll = list; const shown = list.slice(0, L.limit), more = list.length - shown.length;
  const empty = f === 'device' ? '' : `<div class="empty">${A.ic(f === 'folders' ? 'folder' : 'file')}<br>${f === 'folders' ? 'No folders yet' : 'No files here'}<br>Tap <b>+</b> to add files or link device folders</div>`;
  c.innerHTML = top + (fh || shown.length ? `<div class="list">${fh}${shown.map(rowHtml).join('')}</div>${more > 0 ? `<button class="addbtn" data-a="more">Show ${more} more</button>` : ''}` : empty);
};

L.rBin = (c) => {
  const list = L.files.filter((f) => f.del).sort((a, b) => b.del - a.del);
  c.innerHTML = list.length
    ? `<button class="btn d" style="width:100%;margin:6px 0 12px" data-a="empty">Empty bin</button>` + list.map((r) => `<div class="fi"><div class="badge b-${TYPES[r.ext]}">${TLAB[TYPES[r.ext]]}</div><div class="meta"><div class="nm">${esc(r.name)}</div><div class="sub">${fmtSize(r.size)}</div></div><button class="ib" data-a="restore" data-id="${r.id}">${A.ic('rotR')}</button><button class="ib" data-a="kill" data-id="${r.id}" style="color:var(--danger)">${A.ic('trash')}</button></div>`).join('')
    : `<div class="empty">${A.ic('trash')}<br>The bin is empty</div>`;
};

const TOOLS = [
  ['editpdf', 'Edit PDF', 'edit', '#e5484d'], ['pages', 'Organize pages', 'pages', '#8b5cf6'], ['merge', 'Merge PDF', 'merge', '#ee7a2f'],
  ['split', 'Split PDF', 'split', '#d9468f'], ['compress', 'Compress PDF', 'zip', '#c99a06'], ['pdf2word', 'PDF to Word', 'word', '#3b7ddd'], ['pdf2text', 'PDF to Text / MD', 'reflow', '#5b6ee1'],
  ['word2pdf', 'Word to PDF', 'file', '#e5484d'], ['text2pdf', 'Text to PDF', 'text', '#14a89a'], ['txt2pdf', 'TXT to PDF', 'words', '#0ea5a5'],
  ['img2pdf', 'Images to PDF', 'image', '#34a86b'], ['pdf2img', 'PDF to Images', 'image', '#2ba3e0'], ['numbers', 'Page numbers', 'hash', '#6d8f1f'],
  ['watermark', 'Watermark', 'drop', '#0b8fb3'], ['unlock', 'Remove protection', 'unlock', '#64748b'], ['sigs', 'My signatures', 'sign', '#6366f1'],
];
L.rTools = (c) => { c.innerHTML = `<div class="tgrid">${TOOLS.map(([k, n, i, col]) => `<button class="tcard" data-a="tool" data-k="${k}"><div class="tic" style="background:${col}22;color:${col}">${A.ic(i)}</div><div class="tn">${n}</div></button>`).join('')}</div>`; };

L.rSet = async (c) => {
  const th = { auto: 'Automatic', light: 'Light', dark: 'Dark' }[A.set.theme];
  c.innerHTML = `<div class="sec">
    <button class="row" data-a="theme">${A.ic('moon')}<span class="g">Appearance<small>${th}</small></span></button>
    <button class="row" data-a="aisettings">${A.ic('ai')}<span class="g">AI text recognition<small>Optional API key for scanned books</small></span></button>
    <button class="row" data-a="devsettings">${A.ic('device')}<span class="g">Device folders<small>${L.src.length} linked · ${L.dev.length} files found</small></span></button>
    ${A.installEvt ? `<button class="row" data-a="install">${A.ic('download')}<span class="g">Install app on home screen</span></button>` : ''}</div>
    <div class="sec"><div class="row">${A.ic('info')}<span class="g">Storage<small id="stg">…</small></span></div>
    <div class="row">${A.ic('lock')}<span class="g">Privacy<small>Works fully offline. Your files stay on this device.</small></span></div>
    <div class="row">${A.ic('file')}<span class="g">Version ${A.VERSION}</span></div></div>`;
  if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); const s = $('#stg'); if (s) s.textContent = `${fmtSize(e.usage || 0)} used of ${fmtSize(e.quota || 0)}${A.persisted ? ' · protected from auto-cleanup' : ''}`; }
};

/* ---------- Events ---------- */
L.click = async (e) => {
  if (L.supClick) return;
  if (L.selMode) {
    const row = e.target.closest('.fi[data-id]'); if (row) { const id = row.dataset.id; L.sel.has(id) ? L.sel.delete(id) : L.sel.add(id); return L.render(); }
    const b = e.target.closest('#selhdr [data-a]'); if (b) return L.selAction(b.dataset.a); if (!e.target.closest('[data-tab]')) return;
  }
  const sb = $('#sbar'); if (sb && !sb.hidden && !e.target.closest('#sbar') && !e.target.closest('[data-a=search]')) { sb.hidden = true; L.render(); }
  const t = e.target.closest('[data-tab],[data-f],[data-a]'); if (!t) return;
  if (t.dataset.tab) { L.tab = t.dataset.tab; return L.render(); }
  if (t.dataset.f) { L.filter = t.dataset.f; L.limit = 300; return L.render(); }
  const a = t.dataset.a, id = t.dataset.id, r = id && L.rec(id);
  switch (a) {
    case 'open': return A.openFile(id);
    case 'fav': r.fav = r.fav ? 0 : 1; return L.save(r);
    case 'menu': return L.fileMenu(r);
    case 'cd': L.folder = id || null; return L.render();
    case 'fmenu': return L.folderMenu(L.folders.find((f) => f.id === id));
    case 'more': L.limit += 500; return L.render();
    case 'search': { const b = $('#sbar'); b.hidden = !b.hidden; if (!b.hidden) $('#q').focus(); L.render(); return; }
    case 'clearq': L.q = ''; $('#q').value = ''; return L.render();
    case 'view': A.set.view = A.set.view === 'list' ? 'grid' : 'list'; A.saveSet(); return L.render();
    case 'sort': { const k = await A.sheet('More', [{ k: 'select', label: 'Select files', icon: 'check' }, { k: 'date', label: 'Newest first', icon: 'clock' }, { k: 'opened', label: 'Recently opened', icon: 'eye' }, { k: 'name', label: 'Name', icon: 'az' }, { k: 'size', label: 'Size', icon: 'size' }]); if (k === 'select') { L.selMode = true; L.sel = new Set(); L.render(); } else if (k) { A.set.sort = k; A.saveSet(); L.render(); } return; }
    case 'fab': return L.fab();
    case 'tool': return A.runTool(t.dataset.k);
    case 'addfolder': return L.addFolder();
    case 'addlinked': return L.addLinked();
    case 'rescan': return L.refreshDev(true);
    case 'grant': return L.grant();
    case 'rmsrc': return L.removeSrc(id);
    case 'aisettings': return A.aiDlg();
    case 'devsettings': L.tab = 'files'; L.filter = 'device'; return L.render();
    case 'restore': r.del = 0; return L.save(r);
    case 'kill': if (await A.confirm('Delete this file permanently?', 'Delete', true)) { await A.db.del('files', id); L.files = L.files.filter((f) => f !== r); L.render(); } return;
    case 'empty': if (await A.confirm('Permanently delete everything in the bin?', 'Empty bin', true)) { for (const f of L.files.filter((x) => x.del)) await A.db.del('files', f.id); L.files = L.files.filter((x) => !x.del); L.render(); } return;
    case 'theme': { const k = await A.sheet('Appearance', [{ k: 'auto', label: 'Automatic', icon: 'auto' }, { k: 'light', label: 'Light', icon: 'sun' }, { k: 'dark', label: 'Dark', icon: 'moon' }]); if (k) { A.set.theme = k; A.saveSet(); A.applyTheme(); L.render(); } return; }
    case 'install': A.installEvt.prompt(); return;
  }
};

L.fab = async () => {
  const sup = A.devSupported();
  const k = await A.sheet('Add', [sup && { k: 'dfolder', label: 'Link a device folder (no upload)', icon: 'device' }, sup && { k: 'dfiles', label: 'Link device files (no copy)', icon: 'open' }, { k: 'files', label: 'Import files (copy into app)', icon: 'file' }, { k: 'folder', label: 'New folder', icon: 'folder' }, { k: 'img', label: 'Images to PDF', icon: 'image' }, { k: 'txt', label: 'Write text as PDF', icon: 'text' }]);
  if (k === 'dfolder') L.addFolder(); else if (k === 'dfiles') L.addLinked();
  else if (k === 'files') { const f = await A.pickFiles(A.ACCEPT, true); if (f.length) { await A.addFiles(f); A.toast(`${f.length} file(s) imported`); } }
  else if (k === 'folder') { const n = await A.prompt('Folder name'); if (n && n.trim()) { const f = { id: uid(), name: n.trim(), parent: L.folder }; await A.db.put('folders', f); L.folders.push(f); L.render(); } }
  else if (k === 'img') A.runTool('img2pdf'); else if (k === 'txt') A.runTool('text2pdf');
};

L.fileMenu = async (r) => {
  const pdf = r.ext === 'pdf', dev = !!r.dev;
  const k = await A.sheet(r.name, [
    { k: 'open', label: 'Open', icon: 'open' }, pdf && { k: 'edit', label: 'Edit PDF', icon: 'edit' }, pdf && { k: 'pages', label: 'Organize pages', icon: 'pages' },
    { k: 'fav', label: r.fav ? 'Remove from favorites' : 'Add to favorites', icon: 'star' }, !dev && { k: 'rename', label: 'Rename', icon: 'edit' }, !dev && { k: 'move', label: 'Move to folder', icon: 'folder' },
    !dev && { k: 'lock', label: r.enc ? 'Remove password lock' : 'Lock with password', icon: r.enc ? 'unlock' : 'lock' }, dev && { k: 'import', label: 'Save a copy in My Files', icon: 'copy' },
    { k: 'share', label: 'Share', icon: 'share' }, { k: 'dl', label: 'Download a copy', icon: 'download' }, pdf && !r.enc && { k: 'print', label: 'Print', icon: 'print' },
    { k: 'info', label: 'File info', icon: 'info' }, !dev && { k: 'del', label: 'Delete', icon: 'trash', danger: 1 }]);
  if (!k) return;
  const plain = async () => {
    if (dev) { try { return await A.getBlob(r); } catch (e) { A.toast('Access to this file was lost — open Files → Device and allow access'); return null; } }
    if (!r.enc) return r.blob; const pw = await A.prompt('Enter the password', '', { type: 'password' }); if (pw == null) return null; try { return await A.crypto.dec(r, pw); } catch (e) { A.toast('Wrong password'); return null; }
  };
  if (k === 'open') A.openFile(r.id);
  else if (k === 'edit') A.openFile(r.id, { edit: true });
  else if (k === 'pages') { const b = await plain(); b && A.pageManager(r, b); }
  else if (k === 'fav') { r.fav = r.fav ? 0 : 1; L.save(r); }
  else if (k === 'rename') { const n = await A.renameDlg(r.name); if (n) { r.name = n; L.save(r); } }
  else if (k === 'move') { const to = await A.sheet('Move to', [{ k: '_root', label: 'Home', icon: 'home' }, ...L.folders.map((f) => ({ k: f.id, label: f.name, icon: 'folder' }))]); if (to) { r.folder = to === '_root' ? null : to; L.save(r); } }
  else if (k === 'lock') {
    if (r.enc) { const b = await plain(); if (b) { r.blob = b; delete r.enc; r.size = b.size; r._n = undefined; L.save(r); A.toast('Lock removed'); } }
    else { const pw = await A.prompt('Choose a password (it cannot be recovered)', '', { type: 'password' }); if (pw) { const e = await A.crypto.enc(r.blob, pw); r.blob = e.blob; r.enc = e.enc; L.save(r); A.toast('File locked'); } }
  } else if (k === 'import') { const b = await plain(); if (b) { await A.saveBlob(r.name, b, null); A.toast('Copy saved in My Files'); } }
  else if (k === 'share') { const b = await plain(); b && A.share(r.name, b); }
  else if (k === 'dl') { const b = await plain(); b && A.download(r.name, b); }
  else if (k === 'print') { const b = await plain(); b && A.printPdfBlob(b); }
  else if (k === 'info') A.modal({ title: 'File info', body: `<div style="line-height:2;overflow-wrap:anywhere">Name: ${esc(r.name)}<br>Size: ${fmtSize(r.size)}<br>Type: ${r.ext.toUpperCase()}<br>${dev ? `Location: <span dir="ltr">${esc(r.path)}</span><br>` : 'Stored inside the app<br>'}Modified: ${fmtDate(r.added)}<br>Locked: ${r.enc ? 'Yes' : 'No'}</div>` });
  else if (k === 'del') { r.del = Date.now(); L.save(r); A.toast('Moved to bin'); }
};

L.folderMenu = async (f) => {
  const k = await A.sheet(f.name, [{ k: 'rename', label: 'Rename', icon: 'edit' }, { k: 'del', label: 'Delete folder (files move out)', icon: 'trash', danger: 1 }]);
  if (k === 'rename') { const n = await A.prompt('Folder name', f.name); if (n && n.trim()) { f.name = n.trim(); await A.db.put('folders', f); L.render(); } }
  else if (k === 'del') {
    for (const r of L.files.filter((x) => x.folder === f.id)) { r.folder = f.parent; await A.db.put('files', r); }
    for (const s of L.folders.filter((x) => x.parent === f.id)) { s.parent = f.parent; await A.db.put('folders', s); }
    await A.db.del('folders', f.id); L.folders = L.folders.filter((x) => x !== f); L.render();
  }
};

/* ---------- multi-select actions ---------- */
L.selAction = async (a) => {
  const recs = [...L.sel].map((id) => L.rec(id)).filter(Boolean), lib = recs.filter((r) => !r.dev), dev = recs.length - lib.length;
  if (a === 'sx') { L.selMode = false; L.sel.clear(); return L.render(); }
  if (a === 'sall') { if (L.visAll.length && L.visAll.every((r) => L.sel.has(r.id))) L.sel.clear(); else L.visAll.forEach((r) => L.sel.add(r.id)); return L.render(); }
  if (!recs.length) return A.toast('Select at least one file');
  if (a === 'sdel') {
    if (!lib.length) return A.toast("Files from your device folders can't be deleted here");
    if (!(await A.confirm(`Move ${lib.length} file(s) to the bin?${dev ? ` (${dev} device file(s) will be skipped)` : ''}`, 'Move to bin', true))) return;
    const now = Date.now(); lib.forEach((r) => (r.del = now)); await A.db.putMany('files', lib); L.selMode = false; L.sel.clear(); L.render(); return A.toast(`${lib.length} file(s) moved to the bin`);
  }
  if (a === 'smore') {
    const k = await A.sheet(`${recs.length} selected`, [{ k: 'fav', label: recs.every((r) => r.fav) ? 'Remove from favorites' : 'Add to favorites', icon: 'star' }, lib.length && { k: 'move', label: 'Move to folder', icon: 'folder' }]); if (!k) return;
    if (k === 'fav') { const v = recs.every((r) => r.fav) ? 0 : 1; recs.forEach((r) => (r.fav = v)); await A.db.putMany('files', lib); await A.db.putMany('devfiles', recs.filter((r) => r.dev)); }
    if (k === 'move') { const to = await A.sheet('Move to', [{ k: '_root', label: 'Home', icon: 'home' }, ...L.folders.map((f) => ({ k: f.id, label: f.name, icon: 'folder' }))]); if (!to) return; lib.forEach((r) => (r.folder = to === '_root' ? null : to)); await A.db.putMany('files', lib); }
    L.selMode = false; L.sel.clear(); L.render();
  }
};
