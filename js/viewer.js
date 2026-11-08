'use strict';
/* ===== Document viewer ===== */

A.openFile = async (id, o = {}) => {
  const rec = A.lib.rec(id); if (!rec) return; let blob;
  try { blob = await A.getBlob(rec); } catch (e) { return A.toast('Access to this file was lost — open Files → Device and allow access', 3600); }
  if (rec.enc) { const pw = await A.prompt('This file is locked — enter the password', '', { type: 'password' }); if (pw == null) return; try { blob = await A.crypto.dec(rec, pw); } catch (e) { return A.toast('Wrong password'); } }
  rec.opened = Date.now(); A.persist(rec).catch(() => {});
  if (rec.ext === 'pdf') return A.viewPdf(rec, blob, o);
  return A.viewDoc(rec, blob);
};

/* Extract paragraphs from a page (used by Text view and PDF to Word) */
A.pageParas = async (pdf, n) => {
  const page = await pdf.getPage(n); const tc = await page.getTextContent(); const lines = []; let cur = null;
  for (const it of tc.items) {
    if (it.str === undefined) continue;
    const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]) || it.height || 10;
    if (!cur || Math.abs(y - cur.y) > h * 0.5) { cur = { y, h, t: '', endX: null }; lines.push(cur); }
    const gap = cur.endX == null ? 0 : x - cur.endX;
    if (cur.t && !cur.t.endsWith(' ') && !it.str.startsWith(' ') && gap > h * 0.12) cur.t += ' ';
    cur.t += it.str; cur.endX = x + it.width; cur.h = Math.max(cur.h, h); if (it.hasEOL) cur = null;
  }
  const ls = lines.filter((l) => l.t.trim()); if (!ls.length) return [];
  const hs = ls.map((l) => l.h).sort((a, b) => a - b); const med = hs[Math.floor(hs.length / 2)]; const paras = []; let prev = null;
  for (const l of ls) {
    const gap = prev ? prev.y - l.y : 0;
    if (!prev || gap < 0 || gap > prev.h * 1.7 || Math.abs(l.h - prev.h) > 1.5) paras.push({ t: l.t.trim(), h: l.h, head: l.h > med * 1.25 }); else paras[paras.length - 1].t += ' ' + l.t.trim();
    prev = l;
  }
  return paras;
};

A.printPdfDoc = async (pdf) => {
  const b = A.busy('Preparing to print…'); const urls = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      b.set(`Page ${i} of ${pdf.numPages}`, i / pdf.numPages); const p = await pdf.getPage(i), vp = p.getViewport({ scale: 1.6 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; urls.push(c.toDataURL('image/jpeg', 0.9));
    }
  } finally { b.done(); }
  A.printImages(urls);
};
A.loadPdfJs = async (blob, pw) => pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), password: pw, cMapUrl: 'lib/cmaps/', cMapPacked: true, standardFontDataUrl: 'lib/standard_fonts/' }).promise;
A.printPdfBlob = async (blob) => A.printPdfDoc(await A.loadPdfJs(blob));

/* ---------- Non-PDF documents ---------- */
A.viewDoc = async (rec, blob) => {
  const el = document.createElement('div'); el.className = 'screen';
  el.innerHTML = `<header class="top"><button class="ib" data-x="back">${A.ic('back')}</button><div class="ttl" style="font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rec.name)}</div><button class="ib" data-x="minus" style="font-weight:800">A-</button><button class="ib" data-x="plus" style="font-weight:800">A+</button></header><div class="sbody"></div>`;
  const body = $('.sbody', el); let fs = 16; const b = A.busy('Opening file…');
  try {
    const ab = await blob.arrayBuffer(); const e = rec.ext; let html = '';
    if (e === 'docx') { const r = await mammoth.convertToHtml({ arrayBuffer: ab }); html = `<div class="doc-html" dir="auto">${r.value.replace(/href="\s*javascript:[^"]*"/gi, '')}</div>`; }
    else if (['xlsx', 'xls', 'csv'].includes(e)) {
      const wb = XLSX.read(ab, { type: 'array' }); const tabs = wb.SheetNames;
      body.innerHTML = `<div class="stabs">${tabs.map((n, i) => `<button class="chip ${i ? '' : 'on'}" data-s="${i}">${esc(n)}</button>`).join('')}</div><div class="doc-html" id="sh" dir="auto"></div>`;
      const show = (i) => { $('#sh', el).innerHTML = XLSX.utils.sheet_to_html(wb.Sheets[tabs[i]], { header: '', footer: '' }); $$('[data-s]', el).forEach((c) => c.classList.toggle('on', +c.dataset.s === i)); };
      show(0); $$('[data-s]', el).forEach((c) => (c.onclick = () => show(+c.dataset.s))); html = null;
    } else if (e === 'pptx') {
      const z = await JSZip.loadAsync(ab); const names = Object.keys(z.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, c) => parseInt(a.match(/\d+/)) - parseInt(c.match(/\d+/))); const parts = [];
      for (const [i, n] of names.entries()) {
        const xml = await z.files[n].async('string'); const ps = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('')).filter(Boolean);
        parts.push(`<div class="doc-html" style="margin-bottom:12px" dir="auto"><b style="color:var(--pri)">Slide ${i + 1}</b>${ps.map((p) => `<p>${esc(p).replace(/&amp;(amp|lt|gt|quot);/g, '&$1;')}</p>`).join('') || '<p style="color:var(--tx2)">No text</p>'}</div>`);
      }
      html = parts.join('') + '<div class="empty" style="padding:10px">Text only is shown for slides</div>';
    } else if (e === 'txt' || e === 'md') {
      let t = new TextDecoder('utf-8').decode(ab); if (t.includes('\uFFFD')) t = new TextDecoder('windows-1256').decode(ab);
      html = `<div class="doc-html" dir="auto" style="white-space:pre-wrap">${esc(t)}</div>`;
    } else { b.done(); return A.toast(`Old .${e} files can't be previewed — convert to ${e === 'doc' ? 'docx' : 'pptx'} first`); }
    if (html !== null) body.innerHTML = html;
  } catch (err) { b.done(); console.error(err); return A.toast('Could not open this file'); }
  b.done();
  el.addEventListener('click', (ev) => { const x = ev.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'back') A.pop(); else { fs = clamp(fs + (x.dataset.x === 'plus' ? 2 : -2), 10, 34); body.style.fontSize = fs + 'px'; } });
  A.push(el);
};

/* ======================= PDF viewer ======================= */
A.viewPdf = async (rec, blob, o = {}) => {
  const V = (A.V = { rec, blob, zoom: 1, dir: A.set.dir, snap: A.set.snap, rev: A.set.rev, spread: false, cover: A.set.cover, rot: 0, cur: 1, edit: false, ann: {}, tasks: {}, texts: {}, hits: [], hi: -1, els: [], sz: [], vps: [], protectedDoc: false });
  const el = (V.el = document.createElement('div')); el.className = 'screen viewer';
  el.innerHTML = `
  <header class="top vtop"><button class="ib" data-v="back">${A.ic('back')}</button><div class="ttl">${esc(rec.name)}</div>
    <button class="ib" data-v="save" hidden>${A.ic('check')}</button><button class="ib" data-v="search">${A.ic('search')}</button><button class="ib" data-v="more">${A.ic('more')}</button></header>
  <div class="vsearch" hidden><input placeholder="Search in file…" dir="auto"><span>0/0</span><button class="ib" data-v="sprev">${A.ic('chL')}</button><button class="ib" data-v="snext">${A.ic('chR')}</button><button class="ib" data-v="sclose">${A.ic('x')}</button></div>
  <div class="vscroll" dir="ltr"><div class="vpages"></div></div>
  <div class="reflow" hidden></div><div class="eyec" hidden></div><button class="vbadge" data-v="goto">1 / 1</button>
  <div class="zbar" hidden><span>${A.ic('zoom')}</span><input type="range" min="50" max="500" value="100"><b>100%</b><button class="ib" data-v="zclose">${A.ic('x')}</button></div>
  <div class="selbar" hidden><button data-v="selEdit">${A.ic('edit')}Edit</button><button data-v="selDel" style="color:#ff8a8a">${A.ic('trash')}Delete</button><button data-v="selDone">${A.ic('check')}Done</button></div>
  <footer class="vbot">
    <button data-v="tools">${A.ic('tools')}Tools</button><button data-v="organize">${A.ic('pages')}Organize</button><button data-v="two">${A.ic('two')}Two Pages</button><button data-v="edit">${A.ic('edit')}Edit</button><button data-v="view">${A.ic('eye')}View</button></footer>
  <footer class="hud" hidden></footer>`;
  V.sc = $('.vscroll', el); V.vp = $('.vpages', el); V.sc.style.touchAction = 'pan-x pan-y';

  /* --- opening --- */
  V.measure = async () => {
    V.vps = []; V.sz = [];
    for (let s = 1; s <= V.N; s += 24) {
      const ps = await Promise.all(Array.from({ length: Math.min(24, V.N - s + 1) }, (_, k) => V.pdf.getPage(s + k)));
      ps.forEach((p) => { const vp = p.getViewport({ scale: 1, rotation: (p.rotate + V.rot) % 360 }); V.vps.push(vp); V.sz.push({ w: vp.width, h: vp.height }); });
    }
  };
  V.open = async (bl, page) => {
    const bytes = new Uint8Array(await bl.arrayBuffer());
    const task = pdfjsLib.getDocument({ data: bytes.slice(), cMapUrl: 'lib/cmaps/', cMapPacked: true, standardFontDataUrl: 'lib/standard_fonts/' });
    task.onPassword = (cb, reason) => { V.protectedDoc = true; A.prompt(reason === 2 ? 'Wrong password, try again' : 'This file is password protected', '', { type: 'password' }).then((pw) => (pw == null ? task.destroy() : cb(pw))); };
    const b = A.busy('Opening file…'); let pdf;
    try { pdf = await task.promise; } catch (e) { b.done(); if (!V.protectedDoc) { console.error(e); A.toast('Could not open this file'); } return false; }
    if (V.pdf) V.pdf.destroy();
    V.pdf = pdf; V.bytes = bytes; V.blob = bl; V.N = pdf.numPages; V.texts = {}; V.hits = []; V.tasks = {};
    b.set('Preparing pages…', 0.5); await V.measure();
    V.els = []; for (let i = 0; i < V.N; i++) { const d = document.createElement('div'); d.className = 'pg'; d.dataset.i = i; V.els.push(d); }
    b.done(); V.relayout(page || 1); return true;
  };
  V.arrange = () => {
    V.vp.innerHTML = ''; let groups;
    if (V.spread && V.N > 1) { groups = []; let i0 = 0; if (V.cover) { groups.push([0]); i0 = 1; } for (let i = i0; i < V.N; i += 2) groups.push(i + 1 < V.N ? [i, i + 1] : [i]); } else groups = V.els.map((_, i) => [i]);
    V.groups = groups; const nodes = groups.map((g) => { if (!V.spread) return V.els[g[0]]; const s = document.createElement('div'); s.className = 'spread'; (V.rev && g.length > 1 ? [...g].reverse() : g).forEach((i) => s.appendChild(V.els[i])); return s; });
    if (V.rev && V.dir === 'h') nodes.reverse(); nodes.forEach((n) => V.vp.appendChild(n));
    V.sc.classList.toggle('h', V.dir === 'h'); V.applySnap();
  };
  V.applySnap = () => { const fit = V.zoom <= 1.08; V.sc.classList.toggle('snapx', V.snap && V.dir === 'h' && fit); V.sc.classList.toggle('snapy', V.snap && V.dir === 'v' && fit); };
  V.relayout = (page) => { const p = page || V.cur; V.arrange(); V.layout(); V.go(p); setTimeout(V.vis, 40); };
  V.fit = () => { const cw = V.sc.clientWidth - 24, ch = V.sc.clientHeight - 150, s = V.sz[0], byW = cw / (V.spread ? s.w * 2 + 2 : s.w); return V.snap || V.dir === 'h' ? Math.min(byW, ch / s.h) : byW; };
  V.key = () => V.s.toFixed(3) + 'r' + V.rot;
  V.layout = () => {
    V.s = V.fit() * V.zoom;
    V.els.forEach((pg, i) => { pg.style.width = V.sz[i].w * V.s + 'px'; pg.style.height = V.sz[i].h * V.s + 'px'; if (pg.dataset.r && pg.dataset.r !== V.key()) { pg.dataset.r = ''; $$('canvas.pc, .textLayer', pg).forEach((c) => c.remove()); V.tasks[i] && V.tasks[i].cancel(); } });
  };
  V.render = async (i) => {
    const pg = V.els[i], key = V.key(); if (pg.dataset.r === key) return; pg.dataset.r = key; const pdf = V.pdf; let page;
    try { page = await pdf.getPage(i + 1); } catch (e) { return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2); let k = V.s * dpr; if (V.sz[i].w * V.sz[i].h * k * k > 14e6) k = Math.sqrt(14e6 / (V.sz[i].w * V.sz[i].h));
    const vp = page.getViewport({ scale: k, rotation: (page.rotate + V.rot) % 360 }); const c = document.createElement('canvas'); c.className = 'pc'; c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    V.tasks[i] && V.tasks[i].cancel(); const t = page.render({ canvasContext: c.getContext('2d'), viewport: vp }); V.tasks[i] = t;
    try { await t.promise; } catch (e) { if (pg.dataset.r === key) pg.dataset.r = ''; return; }
    if (pdf !== V.pdf || pg.dataset.r !== key) return; const old = $('canvas.pc', pg); pg.insertBefore(c, pg.firstChild); old && old.remove();
    /* selectable / copyable text over the page */
    try { const tc = await page.getTextContent(); if (pdf === V.pdf && pg.dataset.r === key) { $$('.textLayer', pg).forEach((x) => x.remove()); const tl = document.createElement('div'); tl.className = 'textLayer'; tl.style.setProperty('--scale-factor', V.s); pg.insertBefore(tl, $('canvas.ov', pg)); pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: page.getViewport({ scale: V.s, rotation: (page.rotate + V.rot) % 360 }), textDivs: [] }); } } catch (e) { /* page without text */ }
    V.drawOv(i);
  };
  V.vis = () => {
    if (!V.els.length) return; const r = V.sc.getBoundingClientRect(), hz = V.dir === 'h', m = hz ? r.width : r.height * 1.2, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; let best = 0, bd = 1e12;
    V.els.forEach((pg, i) => {
      const b = pg.getBoundingClientRect(); const near = hz ? b.right > r.left - m && b.left < r.right + m : b.bottom > r.top - m && b.top < r.bottom + m;
      if (near) { V.render(i); const d = hz ? Math.abs((b.left + b.right) / 2 - cx) : Math.abs((b.top + b.bottom) / 2 - cy); if (d < bd) { bd = d; best = i; } }
      else if (pg.dataset.r) { pg.dataset.r = ''; $$('canvas.pc, .textLayer', pg).forEach((c) => c.remove()); V.tasks[i] && V.tasks[i].cancel(); }
    });
    V.cur = best + 1; $('.vbadge', el).textContent = `${V.cur} / ${V.N}`;
  };
  V.go = (n, smooth) => {
    n = clamp(n, 1, V.N); const pg = V.els[n - 1]; if (!pg) return; const t = pg.parentElement.classList.contains('spread') ? pg.parentElement : pg, b = smooth ? 'smooth' : 'auto';
    if (V.dir === 'h') V.sc.scrollTo({ left: t.offsetLeft - (V.sc.clientWidth - t.offsetWidth) / 2, behavior: b });
    else V.sc.scrollTo({ top: V.snap ? t.offsetTop - (V.sc.clientHeight - t.offsetHeight) / 2 : t.offsetTop - 70, behavior: b });
  };
  V.switchTo = async (newRec, bl, page) => { rec = newRec; V.rec = newRec; $('.ttl', el).textContent = newRec.name; V.ann = {}; V.undo = []; V.redo = []; V.dirty = false; V.sel = null; V.rfHtml = null; await V.open(bl, page || V.cur); };
  V.setZoom = (z, cx = V.sc.clientWidth / 2, cy = V.sc.clientHeight / 2) => {
    z = clamp(z, 0.5, 5); if (Math.abs(z - 1) < 0.08) z = 1; const r = z / V.zoom; if (Math.abs(r - 1) < 0.001) return; const sx = V.sc.scrollLeft + cx, sy = V.sc.scrollTop + cy; V.zoom = z; V.layout();
    V.sc.scrollLeft = sx * r - cx; V.sc.scrollTop = sy * r - cy; V.applySnap(); if (V.zoom === 1 && (V.snap || V.dir === 'h')) V.go(V.cur); V.vis(); const zb = $('.zbar', el); $('input', zb).value = Math.round(z * 100); $('b', zb).textContent = Math.round(z * 100) + '%';
  };
  V.setRot = async (d) => {
    if (V.dirty || Object.values(V.ann).some((l) => l.length)) return A.toast('Save or discard your edits before rotating');
    V.rot = (V.rot + d + 360) % 360; await V.measure(); V.texts = {}; V.hits = []; V.els.forEach((p) => { p.dataset.r = ''; $$('canvas, .textLayer', p).forEach((c) => c.remove()); }); V.relayout(V.cur);
  };
  V.applyRead = () => { el.classList.toggle('night', A.set.read === 'night'); $('.eyec', el).hidden = A.set.read !== 'eye'; };
  V.wake = async () => {
    try { if (A.set.keepOn && 'wakeLock' in navigator && !V.wl) { V.wl = await navigator.wakeLock.request('screen'); V.wl.addEventListener('release', () => (V.wl = null)); } else if (!A.set.keepOn && V.wl) { await V.wl.release(); V.wl = null; } } catch (e) { /* not supported */ }
  };

  /* --- overlay canvas (search hits + annotations) --- */
  V.ov = (i) => {
    const pg = V.els[i]; let c = $('canvas.ov', pg); const k = Math.min(window.devicePixelRatio || 1, 2) * V.s;
    if (!c) { c = document.createElement('canvas'); c.className = 'ov'; pg.appendChild(c); }
    const w = Math.round(V.sz[i].w * k), h = Math.round(V.sz[i].h * k); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c;
  };
  V.drawOv = (i) => {
    const c = V.ov(i), ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.setTransform(c.width / V.sz[i].w, 0, 0, c.width / V.sz[i].w, 0, 0);
    V.hits.forEach((h, n) => { if (h.p !== i) return; ctx.fillStyle = n === V.hi ? 'rgba(255,140,0,.55)' : 'rgba(255,230,0,.45)'; ctx.fillRect(h.x, h.y, h.w, h.h); });
    A.edDraw && A.edDraw(V, i, ctx);
  };
  V.redraw = (i) => { if (i == null) V.els.forEach((p, n) => p.dataset.r && V.drawOv(n)); else V.els[i] && V.els[i].dataset.r && V.drawOv(i); };

  /* --- page text (search & text editing) --- */
  V.text = async (i) => {
    if (V.texts[i]) return V.texts[i]; const pdf = V.pdf, page = await pdf.getPage(i + 1), tc = await page.getTextContent(), vp = V.vps[i], out = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue; const t = pdfjsLib.Util.transform(vp.transform, it.transform), fh = Math.hypot(t[2], t[3]), horiz = Math.abs(t[1]) < 0.02 * Math.abs(t[0]) + 0.01;
      out.push({ s: it.str, x: t[4], y: t[5] - fh * 0.85, w: it.width * Math.hypot(vp.transform[0], vp.transform[1]), h: fh * 1.15, fh, hz: horiz });
    }
    return (V.texts[i] = out);
  };
  const nAr = (x) => x.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
  V.doSearch = async (q) => {
    const nq = nAr(q.trim()); V.hits = []; V.hi = -1; const info = $('.vsearch span', el); if (!nq) { info.textContent = '0/0'; return V.redraw(); }
    for (let i = 0; i < V.N && V.hits.length < 800; i++) {
      info.textContent = `… ${i + 1}/${V.N}`;
      for (const it of await V.text(i)) {
        if (!it.hz) continue; const ns = nAr(it.s), len = ns.length || 1; let found = false, idx = ns.indexOf(nq);
        while (idx >= 0) { found = true; const x = it.x + it.w * (isRTL(ns) ? 1 - (idx + nq.length) / len : idx / len); V.hits.push({ p: i, x, y: it.y, w: Math.max((it.w * nq.length) / len, 4), h: it.h }); idx = ns.indexOf(nq, idx + nq.length); }
        if (!found && isRTL(ns)) { /* some PDFs store Arabic in visual (reversed) order */ const rs = [...ns].reverse().join(''); idx = rs.indexOf(nq); while (idx >= 0) { const vi = len - idx - nq.length; V.hits.push({ p: i, x: it.x + (it.w * vi) / len, y: it.y, w: Math.max((it.w * nq.length) / len, 4), h: it.h }); idx = rs.indexOf(nq, idx + nq.length); } }
      }
    }
    V.hi = V.hits.length ? 0 : -1; if (!V.hits.length) A.toast('No results'); V.showHit();
  };
  V.endSearch = () => { $('.vsearch', el).hidden = true; V.hits = []; V.hi = -1; V.redraw(); };
  V.showHit = () => {
    const h = V.hits[V.hi]; $('.vsearch span', el).textContent = `${V.hits.length ? V.hi + 1 : 0}/${V.hits.length}`; if (!h) return V.redraw(); const pg = V.els[h.p], t = pg.parentElement.classList.contains('spread') ? pg.parentElement : pg;
    if (V.dir === 'h') V.sc.scrollTo({ left: t.offsetLeft - (V.sc.clientWidth - t.offsetWidth) / 2, behavior: 'smooth' }); else V.sc.scrollTo({ top: t.offsetTop + h.y * V.s - V.sc.clientHeight / 3, behavior: 'smooth' });
    setTimeout(() => V.redraw(), 350); V.redraw();
  };

  /* --- Text view (reflow) --- */
  V.reflow = async () => {
    const rf = $('.reflow', el); if (!rf.hidden) { rf.hidden = true; return; }
    if (!V.rfHtml) {
      const b = A.busy('Extracting text…'); let h = '';
      for (let n = 1; n <= V.N; n++) { b.set(`Page ${n} / ${V.N}`, n / V.N); const ps = await A.pageParas(V.pdf, n); h += ps.map((p) => (p.head ? `<h4 dir="auto">${esc(p.t)}</h4>` : `<p dir="auto">${esc(p.t)}</p>`)).join('') + (n < V.N ? '<hr>' : ''); }
      b.done(); V.rfHtml = h || '<div class="empty">No extractable text (the file may be a scan)</div>';
    }
    rf.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn" data-v="rf-">A-</button><button class="btn" data-v="rf+">A+</button></div>${V.rfHtml}`; rf.style.fontSize = (V.rfs || 17) + 'px'; rf.hidden = false;
  };

  /* --- menus --- */
  V.bms = () => { rec.bm = (rec.bm || []).map((b) => (typeof b === 'number' ? { p: b, name: '' } : b)); return rec.bm; };
  V.bmToggle = async () => {
    const l = V.bms(), i = l.findIndex((b) => b.p === V.cur); if (i >= 0) { l.splice(i, 1); await A.persist(rec); return A.toast('Bookmark removed'); }
    const n = await A.prompt(`Name this bookmark (page ${V.cur} is added automatically)`, '', { ph: 'Optional name, e.g. Chapter 2', ok: 'Add' }); if (n === null) return;
    l.push({ p: V.cur, name: n.trim() }); l.sort((a, b) => a.p - b.p); await A.persist(rec); A.toast(`Bookmarked page ${V.cur}`);
  };
  V.bmList = async () => {
    for (;;) {
      const l = V.bms(); if (!l.length) return A.toast('No bookmarks yet');
      const r = await A.modal({ title: 'Bookmarks', mid: false, body: `<div class="lst">${l.map((b, i) => `<div class="srow" data-i="${i}"><span class="badge b-pdf" style="width:46px;height:36px;border-radius:12px;font-size:12px">p.${b.p}</span><button class="sn" data-bm="go" style="text-align:start;font-size:15px">${esc(b.name || 'Page ' + b.p)}</button><button class="ib" data-bm="ren">${A.ic('edit')}</button><button class="ib" data-bm="del" style="color:var(--danger)">${A.ic('trash')}</button></div>`).join('')}</div>`, actions: [{ k: 'ok', label: 'Close', p: 1 }], onOpen: (o, close) => o.addEventListener('click', (e) => { const b = e.target.closest('[data-bm]'); if (!b) return; o.dataset.i = b.closest('.srow').dataset.i; o.dataset.a = b.dataset.bm; close('act'); }), collect: (o) => ({ i: +o.dataset.i, a: o.dataset.a }) });
      if (r.k !== 'act') return; const bm = l[r.v.i];
      if (r.v.a === 'go') { V.go(bm.p, true); return; }
      if (r.v.a === 'del') { l.splice(r.v.i, 1); await A.persist(rec); continue; }
      const n = await A.prompt('Bookmark name', bm.name || '', { ph: `Name (page ${bm.p} stays fixed)` }); if (n !== null) { bm.name = n.trim(); await A.persist(rec); }
    }
  };
  V.more = async () => {
    const has = V.bms().some((b) => b.p === V.cur);
    const k = await A.sheet('More', [
      { k: 'goto', label: 'Go to page', icon: 'file' }, { k: 'zoom', label: 'Zoom', icon: 'zoom' }, { k: 'text', label: $('.reflow', el).hidden ? 'Text view' : 'Close text view', icon: 'reflow' }, { k: 'copy', label: 'Copy page text', icon: 'copy' },
      { k: 'bm', label: has ? 'Remove bookmark' : 'Bookmark this page', icon: 'bookmark' }, { k: 'bms', label: 'Bookmarks', icon: 'list' },
      { k: 'print', label: 'Print', icon: 'print' }, { k: 'share', label: 'Share', icon: 'share' }, { k: 'dl', label: 'Download', icon: 'download' }]);
    if (k === 'goto') V.gotoDlg(); else if (k === 'zoom') { $('.zbar', el).hidden = false; }
    else if (k === 'text') V.reflow(); else if (k === 'bm') V.bmToggle();
    else if (k === 'bms') V.bmList();
    else if (k === 'copy') { const ps = await A.pageParas(V.pdf, V.cur); try { await navigator.clipboard.writeText(ps.map((p) => p.t).join('\n\n')); A.toast('Text copied'); } catch (e) { A.toast('Copy failed'); } }
    else if (k === 'print') A.printPdfDoc(V.pdf); else if (k === 'share') A.share(rec.name, V.blob); else if (k === 'dl') A.download(rec.name, V.blob);
  };
  V.gotoDlg = async () => { const n = await A.prompt(`Go to page (1 – ${V.N})`, String(V.cur), { type: 'number', ok: 'Go' }); n && V.go(parseInt(n), true); };
  V.toolsMenu = async () => {
    const k = await A.sheet('Tools for this file', [{ k: 'pdf2word', label: 'PDF to Word', icon: 'word' }, { k: 'pdf2img', label: 'PDF to Images', icon: 'image' }, { k: 'compress', label: 'Compress PDF', icon: 'zip' }, { k: 'split', label: 'Split PDF', icon: 'split' }, { k: 'merge', label: 'Merge with other PDFs', icon: 'merge' }]);
    k && A.tools[k]({ name: rec.name, blob: V.blob, rec });
  };
  V.viewMenu = async () => {
    const st = () => ({ day: A.set.read === 'day', night: A.set.read === 'night', eye: A.set.read === 'eye' });
    const html = () => `<label class="lbl" style="margin-top:0">Reading mode</label><div class="seg" id="vr">${[['day', 'Day'], ['night', 'Night'], ['eye', 'Eye comfort']].map(([k, t]) => `<button data-r="${k}" class="${st()[k] ? 'on' : ''}">${t}</button>`).join('')}</div>
      <label class="lbl">Page direction</label><div class="seg" id="vd"><button data-d="v" class="${V.dir === 'v' ? 'on' : ''}">Vertical</button><button data-d="h" class="${V.dir === 'h' ? 'on' : ''}">Horizontal</button></div>
      <button class="sw ${V.snap ? 'on' : ''}" data-s="snap"><span class="g">Page by page<small>Flip one page at a time</small></span><i></i></button>
      <button class="sw ${V.rev ? 'on' : ''}" data-s="rev"><span class="g">Reverse book direction<small>Right to left — for Arabic books and manga</small></span><i></i></button>
      <button class="sw ${V.cover ? 'on' : ''}" data-s="cover"><span class="g">Cover on its own page<small>For Two Pages: show page 1 alone, then pairs 2-3, 4-5…</small></span><i></i></button>
      <button class="sw ${A.set.keepOn ? 'on' : ''}" data-s="keepOn"><span class="g">Keep screen on</span><i></i></button>
      <label class="lbl">Rotate document · now ${V.rot}° (use instead of rotating your device)</label><div class="seg" id="vrot"><button data-rot="-90">${A.ic('rotL', 'style="vertical-align:middle"')} Left</button><button data-rot="90">${A.ic('rotR', 'style="vertical-align:middle"')} Right</button></div>`;
    await A.modal({
      title: 'View mode', mid: false, body: html(), actions: [{ k: 'ok', label: 'Done', p: 1 }],
      onOpen: (o) => {
        const mb = $('.mb', o); const re = () => (mb.innerHTML = html());
        mb.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.r) { A.set.read = b.dataset.r; V.applyRead(); } else if (b.dataset.d) { V.dir = b.dataset.d; A.set.dir = V.dir; V.relayout(); }
          else if (b.dataset.s === 'snap') { V.snap = !V.snap; A.set.snap = V.snap; V.relayout(); } else if (b.dataset.s === 'rev') { V.rev = !V.rev; A.set.rev = V.rev; V.relayout(); }
          else if (b.dataset.s === 'cover') { V.cover = !V.cover; A.set.cover = V.cover; V.relayout(); }
          else if (b.dataset.s === 'keepOn') { A.set.keepOn = !A.set.keepOn; V.wake(); } else if (b.dataset.rot) { V.setRot(+b.dataset.rot); return; }
          A.saveSet(); re();
        });
      },
    });
  };
  V.toggleTwo = () => { V.spread = !V.spread; $('[data-v=two]', el).classList.toggle('on', V.spread); V.zoom = 1; V.relayout(); };

  /* --- events --- */
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-v]'); if (!t) return; const a = t.dataset.v;
    if (a === 'back') { if (V.edit && V.dirty && !(await A.confirm('You have unsaved edits. Leave without saving?', 'Leave', true))) return; A.pop(); }
    else if (a === 'search') { const b = $('.vsearch', el); if (b.hidden) { b.hidden = false; $('input', b).focus(); } else V.endSearch(); }
    else if (a === 'sclose') V.endSearch();
    else if (a === 'snext' || a === 'sprev') { if (V.hits.length) { const n = V.hits.length, nx = (V.hi + (a === 'snext' ? 1 : -1) + n) % n; if (n > 1 && ((a === 'snext' && nx === 0) || (a === 'sprev' && nx === n - 1))) A.toast(a === 'snext' ? 'Back to the first result' : 'Jumped to the last result'); V.hi = nx; V.showHit(); } }
    else if (a === 'goto') V.gotoDlg(); else if (a === 'zclose') $('.zbar', el).hidden = true;
    else if (a === 'more') V.more(); else if (a === 'tools') V.toolsMenu(); else if (a === 'view') V.viewMenu(); else if (a === 'two') V.toggleTwo();
    else if (a === 'organize') { if (V.protectedDoc) return A.toast('Remove the file protection first (Tools → Remove protection)'); A.pageManager(rec, V.blob, V); }
    else if (a === 'rf+' || a === 'rf-') { V.rfs = clamp((V.rfs || 17) + (a === 'rf+' ? 2 : -2), 11, 36); $('.reflow', el).style.fontSize = V.rfs + 'px'; }
    else if (a === 'edit' || a === 'save') A.edToggle && A.edToggle(V, a);
    else if (a === 'selEdit' || a === 'selDel' || a === 'selDone') A.edSel && A.edSel(V, a);
  });
  $('.vsearch input', el).addEventListener('keydown', (e) => e.key === 'Enter' && V.doSearch(e.target.value));
  $('.zbar input', el).addEventListener('input', (e) => V.setZoom(+e.target.value / 100));

  let ly = 0, raf = 0;
  V.sc.addEventListener('scroll', () => {
    const y = V.sc.scrollTop; if (!V.edit && V.dir === 'v' && !V.snap && Math.abs(y - ly) > 12) { el.classList.toggle('hide', y > ly && y > 80); ly = y; }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; V.vis(); });
  }, { passive: true });
  /* tap: hide search bar / toggle bars — double tap: zoom — two fingers: pinch */
  let tap = null, last = 0, pinch = null;
  const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  V.sc.addEventListener('pointerdown', (e) => { tap = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  V.sc.addEventListener('pointerup', (e) => {
    if (!tap || V.edit || pinch) return; const mv = Math.hypot(e.clientX - tap.x, e.clientY - tap.y), dt = Date.now() - tap.t; tap = null; if (mv > 10 || dt > 450) return;
    const sb = $('.vsearch', el); if (!sb.hidden) { V.endSearch(); return; } const zb = $('.zbar', el); if (!zb.hidden) { zb.hidden = true; return; }
    const now = Date.now(), r = V.sc.getBoundingClientRect();
    if (now - last < 320) { last = 0; clearTimeout(V.tt); V.setZoom(V.zoom > 1.3 ? 1 : 2.4, e.clientX - r.left, e.clientY - r.top); } else { last = now; V.tt = setTimeout(() => el.classList.toggle('hide'), 260); }
  });
  V.sc.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { V.pinching = true; pinch = { d: dist(e), z: V.zoom, nz: V.zoom }; const r = V.sc.getBoundingClientRect(); pinch.mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left; pinch.my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top; } }, { passive: true });
  V.sc.addEventListener('touchmove', (e) => { if (!pinch || e.touches.length !== 2) return; e.preventDefault(); pinch.nz = clamp((pinch.z * dist(e)) / pinch.d, 0.5, 5); V.vp.style.transformOrigin = `${V.sc.scrollLeft + pinch.mx}px ${V.sc.scrollTop + pinch.my}px`; V.vp.style.transform = `scale(${pinch.nz / V.zoom})`; }, { passive: false });
  V.sc.addEventListener('touchend', (e) => { if (pinch && e.touches.length < 2) { V.vp.style.transform = ''; const p = pinch; pinch = null; V.setZoom(p.nz, p.mx, p.my); setTimeout(() => (V.pinching = false), 150); } });
  V.flip = (sign) => { const g = V.groups || V.els.map((_, i) => [i]), idx = g.findIndex((x) => x.includes(V.cur - 1)); V.go(g[clamp(idx + sign, 0, g.length - 1)][0] + 1, true); };
  V.sc.addEventListener('wheel', (e) => {
    if (e.ctrlKey) { e.preventDefault(); const r = V.sc.getBoundingClientRect(); return V.setZoom(V.zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top); }
    if (V.edit && V.tool !== 'hand') return; const d = e.deltaY || e.deltaX; if (!d) return;
    if (V.snap && V.zoom <= 1.08) { e.preventDefault(); if (V.wlock) return; V.wlock = true; setTimeout(() => (V.wlock = false), 400); V.flip(d > 0 ? 1 : -1); return; }
    if (V.dir === 'h' && V.zoom <= 1.08) { e.preventDefault(); V.sc.scrollLeft += (V.rev ? -1 : 1) * (e.deltaY + e.deltaX); }
  }, { passive: false });
  /* mouse: drag the page like a finger (scroll, or flip pages in page-by-page mode) */
  let pan = null; V.sc.style.cursor = 'grab';
  V.sc.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0 || V.edit || e.target.closest('button') || e.target.closest('.textLayer span')) return; pan = { x: e.clientX, y: e.clientY, sl: V.sc.scrollLeft, st: V.sc.scrollTop, moved: false }; });
  V.onPm = (e) => { if (!pan) return; const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (!pan.moved && Math.hypot(dx, dy) > 5) { pan.moved = true; V.sc.style.cursor = 'grabbing'; V.sc.style.scrollSnapType = 'none'; V.sc.style.userSelect = 'none'; } if (pan.moved) { V.sc.scrollLeft = pan.sl - dx; V.sc.scrollTop = pan.st - dy; } };
  V.onPu = (e) => {
    if (!pan) return; const p = pan, dx = e.clientX - p.x, dy = e.clientY - p.y; pan = null; if (!p.moved) return; V.sc.style.cursor = 'grab'; V.sc.style.scrollSnapType = ''; V.sc.style.userSelect = '';
    if (V.snap && V.zoom <= 1.08) { if (V.dir === 'h' && Math.abs(dx) > 70) V.flip(dx < 0 ? (V.rev ? -1 : 1) : V.rev ? 1 : -1); else if (V.dir === 'v' && Math.abs(dy) > 70) V.flip(dy < 0 ? 1 : -1); else V.go(V.cur, true); }
  };
  V.onKey = (e) => {
    if (A.stack[A.stack.length - 1] !== undefined && A.stack[A.stack.length - 1].el !== el) return; if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return; if (!(V.snap || V.dir === 'h')) return;
    const k = e.key, f = k === 'ArrowRight' ? (V.rev ? -1 : 1) : k === 'ArrowLeft' ? (V.rev ? 1 : -1) : k === 'ArrowDown' || k === 'PageDown' || k === ' ' ? 1 : k === 'ArrowUp' || k === 'PageUp' ? -1 : 0; if (f) { e.preventDefault(); V.flip(f); }
  };
  document.addEventListener('pointermove', V.onPm); document.addEventListener('pointerup', V.onPu); document.addEventListener('keydown', V.onKey);
  V.onResize = () => { if (A.V === V && V.pdf) { V.layout(); V.vis(); } }; window.addEventListener('resize', V.onResize);
  V.onVis = () => { if (document.visibilityState === 'visible') V.wake(); }; document.addEventListener('visibilitychange', V.onVis);

  A.push(el, () => { document.removeEventListener('pointermove', V.onPm); document.removeEventListener('pointerup', V.onPu); document.removeEventListener('keydown', V.onKey); if (V.pdf && !V.edit) { rec.lastPage = V.cur >= V.N ? 1 : V.cur; A.persist(rec).catch(() => {}); } window.removeEventListener('resize', V.onResize); document.removeEventListener('visibilitychange', V.onVis); Object.values(V.tasks).forEach((t) => t && t.cancel && t.cancel()); V.pdf && V.pdf.destroy(); if (V.wl) V.wl.release().catch(() => {}); if (A.V === V) A.V = null; });
  V.applyRead(); V.wake();
  const resume = !o.page && rec.lastPage > 1 ? rec.lastPage : 0; const ok = await V.open(blob, o.page || resume || 1); if (!ok) return A.pop(); if (resume && V.N >= resume) A.toast(`Continued from page ${resume}`);
  if (o.edit) A.edToggle && A.edToggle(V, 'edit');
};
