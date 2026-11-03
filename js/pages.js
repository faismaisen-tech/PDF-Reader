'use strict';
/* ===== Page organizer: duplicate · reorder (drag or arrows) · rotate · delete · extract · insert images ===== */

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
/* Add an image as a new page. mode: 'a4' | 'letter' | 'orig' */
A.addImagePage = async (out, d, sz, mode = 'a4') => {
  const by = Uint8Array.from(atob(d.split(',')[1]), (c) => c.charCodeAt(0)); const im = d.startsWith('data:image/png') ? await out.embedPng(by) : await out.embedJpg(by);
  if (mode === 'orig') return out.addPage([sz.w * 0.75, sz.h * 0.75]).drawImage(im, { x: 0, y: 0, width: sz.w * 0.75, height: sz.h * 0.75 });
  const [a, b] = PAGE_SIZES[mode] || PAGE_SIZES.a4, land = sz.w > sz.h, pw = land ? b : a, ph = land ? a : b, m = 20, sc = Math.min((pw - 2 * m) / sz.w, (ph - 2 * m) / sz.h), w = sz.w * sc, h = sz.h * sc;
  out.addPage([pw, ph]).drawImage(im, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
};

/* Build a new PDF from items: {src, rot} for pages of the source file, {img, iw, ih} for inserted images. Shared resources are copied once. */
A.rebuildPdf = async (bytes, items) => {
  const { PDFDocument, degrees } = PDFLib; const src = await PDFDocument.load(bytes), out = await PDFDocument.create();
  const pdfItems = items.filter((i) => !i.img); const copied = pdfItems.length ? await out.copyPages(src, pdfItems.map((i) => i.src)) : []; let n = 0;
  for (const it of items) {
    if (it.img) { await A.addImagePage(out, it.img, { w: it.iw, h: it.ih }, 'a4'); continue; }
    const p = copied[n++]; p.setRotation(degrees((((p.getRotation().angle + it.rot) % 360) + 360) % 360)); out.addPage(p);
  }
  return out.save();
};

/* Save choice: replace / new file / download */
A.saveChoice = async ({ rec, blob, suffix, V, page }) => {
  const k = await A.sheet('Save result', [rec && { k: 'copy', label: 'Save as a new file (original stays untouched)', icon: 'copy' }, rec && !rec.enc && { k: 'rep', label: 'Replace the current file', icon: 'check' }, { k: 'dl', label: 'Download', icon: 'download' }]);
  if (!k) return false;
  if (k === 'dl') { A.download(rec ? baseOf(rec.name) + suffix : 'file.pdf', blob); return true; }
  if (k === 'copy') { const nr = await A.saveBlob(baseOf(rec.name) + suffix, blob, rec.dev ? null : rec.folder); if (V && A.V === V) { await V.switchTo(nr, blob, page); A.toast(`Saved as “${nr.name}” — you are now viewing the copy`, 3600); } else A.toast('Saved as a new file'); return true; }
  await A.updateBlob(rec, blob); A.toast('File replaced');
  if (V && A.V === V) { V.rfHtml = null; V.ann = {}; await V.open(blob, page || V.cur); }
  return true;
};

/* Duplicate dialog */
A.dupDlg = async (what) => {
  let where = 'after';
  const r = await A.modal({
    title: 'Duplicate pages', body: `<div style="line-height:1.7;color:var(--tx2);margin-bottom:4px">${esc(what)}</div>
    <label class="lbl">Copies of each page</label><div style="display:flex;align-items:center;gap:10px"><button class="btn" id="dm" style="flex:none;min-width:50px">−</button><input id="dn" type="number" min="1" max="50" value="1" style="text-align:center"><button class="btn" id="dp" style="flex:none;min-width:50px">+</button></div>
    <label class="lbl">Place copies</label><div class="seg" id="dw"><button data-w="after" class="on">After the original</button><button data-w="end">At the end</button></div>`,
    actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Duplicate', p: 1 }],
    onOpen: (o) => { const n = $('#dn', o); $('#dm', o).onclick = () => (n.value = Math.max(1, +n.value - 1)); $('#dp', o).onclick = () => (n.value = Math.min(50, +n.value + 1)); $('#dw', o).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; where = b.dataset.w; $$('#dw button', o).forEach((x) => x.classList.toggle('on', x === b)); }; },
    collect: (o) => ({ n: clamp(parseInt($('#dn', o).value) || 1, 1, 50), where }),
  });
  return r.k === 'ok' ? r.v : null;
};
A.applyDup = (items, selIds, n, where) => {
  const out = [], tail = [];
  for (const it of items) { out.push(it); if (selIds.has(it.id)) for (let c = 0; c < n; c++) { const cp = { ...it, id: uid(), dup: true }; (where === 'after' ? out : tail).push(cp); } }
  return out.concat(tail);
};

/* ======================= Organizer screen ======================= */
A.pageManager = async (rec, blob, V) => {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let pdf;
  try { pdf = await A.loadPdfJs(blob); } catch (e) { return A.toast('Could not open this file (it may be password protected)'); }
  let items = Array.from({ length: pdf.numPages }, (_, i) => ({ id: uid(), src: i, rot: 0 })); const sel = new Set(); let hist = [], dirty = false, supClick = false; const imgTh = {};
  const el = document.createElement('div'); el.className = 'screen';
  el.innerHTML = `<header class="top"><button class="ib" data-m="back">${A.ic('back')}</button><div class="ttl" style="font-size:18px">Organize <small id="cnt" style="color:var(--tx2);font-weight:500"></small></div><button class="ib" data-m="undo">${A.ic('undo')}</button><button class="ib" data-m="apply" style="color:var(--pri)">${A.ic('check')}</button></header>
  <div class="sbody" style="padding:0 10px"><div class="pgrid"></div></div>
  <footer class="hud" style="position:fixed"><div class="tools">
    <button data-m="all" id="allb">${A.ic('check')}<span>Select all</span></button><button data-m="dup" style="color:#34a86b">${A.ic('dup')}Duplicate</button><button data-m="rot">${A.ic('rotR')}Rotate</button><button data-m="del">${A.ic('trash')}Delete</button>
    <button data-m="img">${A.ic('image')}Insert image</button><button data-m="ext">${A.ic('file')}Extract</button><button data-m="up">${A.ic('chL')}Earlier</button><button data-m="down">${A.ic('chR')}Later</button></div></footer>`;
  const grid = $('.pgrid', el), body = $('.sbody', el), thumb = A.thumbCache(pdf);
  const io = new IntersectionObserver((es) => es.forEach(async (e) => { if (!e.isIntersecting) return; const cv = e.target; io.unobserve(cv); A.paintThumb(cv, await thumb(+cv.dataset.src)); }), { root: body, rootMargin: '300px' });
  const imgCanvas = async (it) => { if (imgTh[it.id]) return imgTh[it.id]; const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = it.img; }); const s = 150 / Math.max(im.width, im.height), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return (imgTh[it.id] = c); };
  const draw = () => {
    $('#cnt', el).textContent = `(${items.length})`; $('#allb span', el).textContent = sel.size && sel.size === items.length ? 'Deselect all' : 'Select all';
    grid.innerHTML = items.map((it, n) => `<div class="pt ${sel.has(it.id) ? 'sel' : ''}" data-id="${it.id}"><canvas data-src="${it.src ?? -1}" data-i="${it.id}" style="transform:rotate(${it.rot}deg)"></canvas><span class="n">${n + 1}</span>${it.dup ? '<span class="tg">Copy</span>' : ''}${it.img ? '<span class="tg" style="background:#8b5cf6">Image</span>' : ''}<span class="ck">${A.ic('check')}</span></div>`).join('');
    $$('canvas', grid).forEach(async (c) => { const it = items.find((x) => x.id === c.dataset.i); if (it.img) A.paintThumb(c, await imgCanvas(it)); else io.observe(c); });
  };
  const push = () => { hist.push(items.map((i) => ({ ...i }))); if (hist.length > 40) hist.shift(); dirty = true; };
  const need = () => { if (!sel.size) { A.toast('Select at least one page first'); return false; } return true; };

  /* --- drag to move (long-press a page, or a selected group) --- */
  let drag = null; const ghostOf = (t, n) => { const g = document.createElement('div'); g.className = 'ghost'; const c = $('canvas', t).cloneNode(); c.getContext('2d').drawImage($('canvas', t), 0, 0); c.style.transform = ''; g.appendChild(c); if (n > 1) g.insertAdjacentHTML('beforeend', `<b>${n}</b>`); document.body.appendChild(g); return g; };
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
  grid.addEventListener('touchmove', (e) => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
  const startDrag = () => {
    if (!drag || drag.active) return; const t = drag.t, id = t.dataset.id; const grp = sel.has(id) ? items.filter((i) => sel.has(i.id)).map((i) => i.id) : [id]; drag.active = true; drag.group = new Set(grp);
    drag.ghost = ghostOf(t, grp.length); drag.mark = document.createElement('div'); drag.mark.className = 'ins'; grid.appendChild(drag.mark); $$('.pt', grid).forEach((p) => p.classList.toggle('ghosted', drag.group.has(p.dataset.id)));
    if (navigator.vibrate) navigator.vibrate(15); place(drag.x, drag.y);
  };
  grid.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.pt'); if (!t || e.button > 0) return; drag = { t, x: e.clientX, y: e.clientY, active: false, id: e.pointerId, mouse: e.pointerType === 'mouse' };
    if (!drag.mouse) drag.timer = setTimeout(startDrag, 320); /* touch: press and hold — mouse: just press and drag */
  });
  const place = (cx, cy) => {
    drag.ghost.style.left = cx + 'px'; drag.ghost.style.top = cy + 'px'; const tiles = $$('.pt:not(.ghosted)', grid); if (!tiles.length) return; let best = null, bd = 1e9;
    tiles.forEach((p) => { const r = p.getBoundingClientRect(), d = Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)); if (d < bd) { bd = d; best = p; } });
    const r = best.getBoundingClientRect(), gr = grid.getBoundingClientRect(), after = cx > r.left + r.width / 2; drag.target = { id: best.dataset.id, after };
    Object.assign(drag.mark.style, { left: (after ? r.right + 3 : r.left - 6) - gr.left + 'px', top: r.top - gr.top + 'px', height: r.height + 'px' });
    const sb = body.getBoundingClientRect(); if (cy < sb.top + 70) body.scrollTop -= 14; else if (cy > sb.bottom - 120) body.scrollTop += 14;
  };
  document.addEventListener('pointermove', (drag_mv = (e) => { if (!drag || e.pointerId !== drag.id) return; if (!drag.active) { const mv = Math.hypot(e.clientX - drag.x, e.clientY - drag.y); if (drag.mouse) { if (mv > 4) { drag.x = e.clientX; drag.y = e.clientY; startDrag(); } return; } if (mv > 10) { clearTimeout(drag.timer); drag = null; } return; } place(e.clientX, e.clientY); }));
  const endDrag = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return; clearTimeout(drag.timer); const d = drag; drag = null; if (!d.active) return;
    d.ghost.remove(); d.mark.remove(); supClick = true; setTimeout(() => (supClick = false), 60);
    if (!cancel && d.target) { push(); const grp = items.filter((i) => d.group.has(i.id)), rest = items.filter((i) => !d.group.has(i.id)); let idx = rest.findIndex((i) => i.id === d.target.id); if (d.target.after) idx++; items = [...rest.slice(0, idx), ...grp, ...rest.slice(idx)]; }
    draw();
  };
  document.addEventListener('pointerup', (drag_up = (e) => endDrag(e, false))); document.addEventListener('pointercancel', (drag_cn = (e) => endDrag(e, true)));

  el.addEventListener('click', async (e) => {
    if (supClick) return; const tile = e.target.closest('.pt'); if (tile) { const id = tile.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); tile.classList.toggle('sel'); $('#allb span', el).textContent = sel.size && sel.size === items.length ? 'Deselect all' : 'Select all'; return; }
    const b = e.target.closest('[data-m]'); if (!b) return; const a = b.dataset.m;
    if (a === 'back') { if (dirty && !(await A.confirm('Discard your changes?', 'Discard', true))) return; A.pop(); }
    else if (a === 'all') { if (sel.size === items.length) sel.clear(); else items.forEach((i) => sel.add(i.id)); draw(); }
    else if (a === 'undo') { if (hist.length) { items = hist.pop(); draw(); } }
    else if (a === 'rot') { if (!need()) return; push(); items.forEach((i) => sel.has(i.id) && (i.rot = (i.rot + 90) % 360)); draw(); }
    else if (a === 'del') { if (!need()) return; if (sel.size >= items.length) return A.toast('You cannot delete every page'); push(); items = items.filter((i) => !sel.has(i.id)); sel.clear(); draw(); }
    else if (a === 'up' || a === 'down') {
      if (!need()) return; push(); const n = items.length;
      if (a === 'up') { for (let i = 1; i < n; i++) if (sel.has(items[i].id) && !sel.has(items[i - 1].id)) [items[i - 1], items[i]] = [items[i], items[i - 1]]; } else for (let i = n - 2; i >= 0; i--) if (sel.has(items[i].id) && !sel.has(items[i + 1].id)) [items[i + 1], items[i]] = [items[i], items[i + 1]];
      draw();
    }
    else if (a === 'dup') {
      if (!need()) return; const d = await A.dupDlg(`${sel.size} selected page(s) will be duplicated`); if (!d) return; push();
      const before = new Set(items.map((i) => i.id)); items = A.applyDup(items, new Set(sel), d.n, d.where); sel.clear(); items.forEach((i) => !before.has(i.id) && sel.add(i.id)); draw(); A.toast(`${sel.size} copies added`);
    }
    else if (a === 'img') {
      const fs = await A.pickFiles('image/*', true); if (!fs.length) return; const bz = A.busy('Adding images…'); const add = [];
      for (const f of fs) { const d = await A.shrink(f, 2200); if (!d) continue; const sz = await A.imgSize(d); add.push({ id: uid(), img: d, iw: sz.w, ih: sz.h, rot: 0 }); } bz.done(); if (!add.length) return;
      push(); let at = items.length; items.forEach((it, i) => sel.has(it.id) && (at = i + 1)); items.splice(at, 0, ...add); draw(); A.toast(`${add.length} image page(s) inserted`);
    }
    else if (a === 'ext') {
      if (!need()) return; const bz = A.busy('Extracting pages…');
      try { const out = new Blob([await A.rebuildPdf(bytes, items.filter((i) => sel.has(i.id)))], { type: 'application/pdf' }); bz.done(); await A.deliver(baseOf(rec.name) + '-extract.pdf', out); } catch (err) { bz.done(); A.toast('Extraction failed'); }
    }
    else if (a === 'apply') {
      if (!dirty) return A.toast('No changes yet'); const bz = A.busy('Building file…');
      try { const out = new Blob([await A.rebuildPdf(bytes, items)], { type: 'application/pdf' }); bz.done(); const ok = await A.saveChoice({ rec, blob: out, suffix: '-organized.pdf', V }); if (ok) { dirty = false; A.pop(); } } catch (err) { bz.done(); console.error(err); A.toast('Could not build the file'); }
    }
  });
  A.push(el, () => { io.disconnect(); document.removeEventListener('pointermove', drag_mv); document.removeEventListener('pointerup', drag_up); document.removeEventListener('pointercancel', drag_cn); pdf.destroy(); }); draw();
};
let drag_mv, drag_up, drag_cn;
