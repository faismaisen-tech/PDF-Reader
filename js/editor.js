'use strict';
/* ===== PDF editor: annotations are stored in page coordinates (points) and merged into the file with pdf-lib on save ===== */

const FONTS = { sans: 'Inter,"Segoe UI",Roboto,"Noto Sans Arabic",Tahoma,Arial,sans-serif', serif: '"Noto Naskh Arabic","Times New Roman",Georgia,serif', mono: '"Courier New",monospace' };
const PAL = ['#f4d35e', '#f6a56e', '#ee8a8a', '#8cc9a5', '#8db6ea', '#b7a0e6', '#4a5568']; /* soft, calm colors */
const nid = () => uid().slice(0, 8);
A.imgs = {}; A.imgData = {};

const measure = document.createElement('canvas').getContext('2d');
const fitText = (a) => { measure.font = `${a.bold ? 'bold ' : ''}${a.size}px ${FONTS[a.font || 'sans']}`; const ls = a.text.split('\n'); a.w = Math.max(10, ...ls.map((l) => measure.measureText(l).width)) + 4; a.h = ls.length * a.size * 1.3 + 2; };
const drawText = (ctx, a, ox, oy) => {
  ctx.save(); ctx.font = `${a.bold ? 'bold ' : ''}${a.size}px ${FONTS[a.font || 'sans']}`; ctx.fillStyle = a.c; ctx.textBaseline = 'top';
  a.text.split('\n').forEach((ln, n) => {
    const rtl = isRTL(ln); ctx.direction = rtl ? 'rtl' : 'ltr'; const al = a.align || 'auto'; let x = 0, ta = 'left';
    if (al === 'center') { ta = 'center'; x = a.w / 2; } else if (al === 'right' || (al === 'auto' && rtl)) { ta = 'right'; x = a.w; }
    ctx.textAlign = ta; ctx.fillText(ln, ox + x, oy + n * a.size * 1.3 + 1);
  });
  ctx.restore();
};
const loadImg = (k, cb) => { if (A.imgs[k]) return A.imgs[k]; const im = new Image(); im.onload = cb; im.src = A.imgData[k]; A.imgs[k] = im; return im; };

A.edDraw = (V, i, ctx) => {
  const one = (a) => {
    if (a.t === 'cover') { ctx.fillStyle = a.c; a.rects.forEach((r) => ctx.fillRect(r[0], r[1], r[2], r[3])); }
    else if (a.t === 'hl') { ctx.fillStyle = a.c; ctx.globalAlpha = 0.45; a.rects.forEach((r) => ctx.fillRect(r[0], r[1], r[2], r[3])); ctx.globalAlpha = 1; }
    else if (a.t === 'ul') { ctx.strokeStyle = a.c; ctx.lineWidth = a.w; ctx.lineCap = 'round'; a.rects.forEach((r) => { const y = r[1] + r[3] * 0.94; ctx.beginPath(); ctx.moveTo(r[0], y); ctx.lineTo(r[0] + r[2], y); ctx.stroke(); }); }
    else if (a.t === 'ink') { ctx.strokeStyle = a.c; ctx.lineWidth = a.w; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath(); a.pts.forEach((p, n) => (n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); if (a.pts.length === 1) ctx.lineTo(a.pts[0][0] + 0.1, a.pts[0][1]); ctx.stroke(); }
    else if (a.t === 'tx') drawText(ctx, a, a.x, a.y);
    else if (a.t === 'img') { const im = loadImg(a.k, () => V.redraw(a.p)); if (im.complete && im.naturalWidth) ctx.drawImage(im, a.x, a.y, a.w, a.h); }
  };
  (V.ann[i] || []).forEach(one); if (V.prev && V.prev.p === i) one(V.prev);
  const s = V.sel; if (s && s.p === i && V.edit) {
    ctx.save(); ctx.strokeStyle = '#5b7cfa'; ctx.lineWidth = 2 / V.s; ctx.setLineDash([6 / V.s, 4 / V.s]); ctx.strokeRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
    ctx.setLineDash([]); ctx.fillStyle = '#5b7cfa'; const hs = 14 / V.s; ctx.beginPath(); ctx.arc(s.x + s.w, s.y + s.h, hs / 1.6, 0, 7); ctx.fill(); ctx.restore();
  }
};

/* ---------- enter / leave edit mode ---------- */
const ED_TOOLS = [['hand', 'hand', 'Scroll'], ['hl', 'hl', 'Highlight'], ['ul', 'ul', 'Underline'], ['ink', 'pen', 'Draw'], ['tx', 'type', 'Text'], ['edtx', 'edit', 'Edit text'], ['sig', 'sign', 'Signature'], ['img', 'image', 'Image'], ['er', 'eraser', 'Eraser']];
A.edToggle = async (V, act) => {
  if (act === 'save') return A.edSave(V);
  if (V.protectedDoc) return A.toast('Remove the file protection first (Tools → Remove protection)');
  const el = V.el, hud = $('.hud', el);
  if (V.edit) {
    if (V.dirty && !(await A.confirm('Discard unsaved edits?', 'Discard', true))) return;
    V.edit = false; V.dirty = false; V.ann = {}; V.sel = null; V.prev = null; el.classList.remove('editing'); V.sc.classList.remove('edit-draw', 'edit-tap'); $('.selbar', el).hidden = true;
    hud.hidden = true; $('.vbot', el).hidden = false; $('[data-v=save]', el).hidden = true; $('[data-v=search]', el).hidden = false; $('[data-v=more]', el).hidden = false; V.redraw(); return;
  }
  V.edit = true; V.tool = 'hand'; V.undo = []; V.redo = []; V.ann = {}; V.sel = null;
  V.colors = V.colors || { hl: PAL[0], ul: PAL[2], ink: PAL[6] }; V.sizes = V.sizes || { hl: 100, ul: 1.6, ink: 3 };
  el.classList.remove('hide'); el.classList.add('editing'); $('.vbot', el).hidden = true; hud.hidden = false; $('.vsearch', el).hidden = true;
  $('[data-v=save]', el).hidden = false; $('[data-v=search]', el).hidden = true; $('[data-v=more]', el).hidden = true;
  hud.innerHTML = `<div class="opts" id="eopts"></div><div class="tools">${ED_TOOLS.map(([k, i, t]) => `<button data-t="${k}">${A.ic(i)}${t}</button>`).join('')}<button data-t="_undo">${A.ic('undo')}Undo</button><button data-t="_redo">${A.ic('redo')}Redo</button><button data-t="_close">${A.ic('x')}Close</button></div>`;
  hud.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) return edTool(V, b.dataset.t); const c = e.target.closest('[data-c]'); if (c) { V.colors[c.dataset.g] = c.dataset.c; edOpts(V); } };
  hud.oninput = (e) => { if (e.target.dataset.sz) V.sizes[e.target.dataset.sz] = +e.target.value; };
  edTool(V, 'hand'); bindPointers(V);
};

const snapshot = (V) => { V.undo.push(JSON.stringify(V.ann)); if (V.undo.length > 60) V.undo.shift(); V.redo = []; V.dirty = true; };
const restore = (V, s) => { V.ann = JSON.parse(s); V.sel = null; $('.selbar', V.el).hidden = true; V.dirty = true; V.redraw(); edTool(V, V.tool, true); };

function edOpts(V) {
  const g = ['hl', 'ul', 'ink'].includes(V.tool) ? V.tool : null; const o = $('#eopts', V.el);
  if (!g) { o.innerHTML = `<small>${{ hand: 'Tap text, signatures or images to edit them', tx: 'Tap the page to add text', edtx: 'Tap an existing line of text to change it', sig: 'Tap where the signature should go', er: 'Tap near anything to erase it' }[V.tool] || ''}</small>`; return; }
  const cfg = { hl: ['Size', 40, 220, 5], ul: ['Thickness', 0.6, 5, 0.2], ink: ['Size', 1, 24, 0.5] }[g];
  o.innerHTML = PAL.map((c) => `<button class="clr ${V.colors[g] === c ? 'on' : ''}" style="background:${c}" data-c="${c}" data-g="${g}"></button>`).join('') + `<small>${cfg[0]}</small><input type="range" data-sz="${g}" min="${cfg[1]}" max="${cfg[2]}" step="${cfg[3]}" value="${V.sizes[g]}">`;
}
function setClass(V) { V.sc.classList.remove('edit-draw', 'edit-tap'); V.sc.classList.add(V.sel || ['hl', 'ul', 'ink'].includes(V.tool) ? 'edit-draw' : 'edit-tap'); }
function edTool(V, t, keep) {
  if (t === '_undo') { if (V.undo.length) { V.redo.push(JSON.stringify(V.ann)); restore(V, V.undo.pop()); } return; }
  if (t === '_redo') { if (V.redo.length) { V.undo.push(JSON.stringify(V.ann)); restore(V, V.redo.pop()); } return; }
  if (t === '_close') return A.edToggle(V, 'edit');
  if (!keep) deselect(V, true);
  if (t === 'img') { V.tool = 'hand'; $$('[data-t]', V.el).forEach((b) => b.classList.toggle('on', b.dataset.t === 'hand')); setClass(V); edOpts(V); insertImage(V); return; }
  V.tool = t; $$('[data-t]', V.el).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); setClass(V); edOpts(V); V.redraw();
}
function select(V, a) { V.sel = a; const sb = $('.selbar', V.el); sb.hidden = false; $('[data-v=selEdit]', sb).hidden = a.t !== 'tx'; setClass(V); V.redraw(a.p); }
function deselect(V, quiet) { const p = V.sel && V.sel.p; V.sel = null; $('.selbar', V.el).hidden = true; setClass(V); if (!quiet && p != null) V.redraw(p); }
A.edSel = async (V, act) => {
  const s = V.sel; if (!s) return;
  if (act === 'selDone') return deselect(V);
  if (act === 'selDel') { snapshot(V); V.ann[s.p] = V.ann[s.p].filter((a) => a.id !== s.id && !(s.g && a.g === s.g)); deselect(V); return; }
  if (act === 'selEdit') { const r = await textDlg({ text: s.text, size: s.size, c: s.c, font: s.font, bold: s.bold, align: s.align }); if (!r) return; if (!r.text.trim()) return A.edSel(V, 'selDel'); snapshot(V); Object.assign(s, r); fitText(s); V.redraw(s.p); }
};

/* ---------- hit testing ---------- */
const dRect = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - (r[0] + r[2])), Math.max(r[1] - y, 0, y - (r[1] + r[3])));
const dSeg = (x, y, p, q) => { const vx = q[0] - p[0], vy = q[1] - p[1], l = vx * vx + vy * vy; const t = l ? clamp(((x - p[0]) * vx + (y - p[1]) * vy) / l, 0, 1) : 0; return Math.hypot(x - (p[0] + t * vx), y - (p[1] + t * vy)); };
const distAnn = (a, x, y) => (a.t === 'tx' || a.t === 'img' ? dRect(x, y, [a.x, a.y, a.w, a.h]) : a.t === 'ink' ? Math.max(0, Math.min(...a.pts.map((p, i) => (i ? dSeg(x, y, a.pts[i - 1], p) : Math.hypot(x - p[0], y - p[1])))) - a.w / 2) : Math.min(...a.rects.map((r) => dRect(x, y, r))));
const snapRects = (items, b, kind, scale) => {
  let rs = [];
  for (const it of items) { if (!it.hz) continue; const ov = Math.min(it.y + it.h, b.b) - Math.max(it.y, b.t); if (ov < it.h * 0.35) continue; const xl = Math.max(it.x, b.l), xr = Math.min(it.x + it.w, b.r); if (xr - xl < 2) continue; rs.push([xl, it.y, xr - xl, it.h]); }
  rs.sort((p, q) => p[1] - q[1] || p[0] - q[0]); const m = [];
  for (const r of rs) { const l = m[m.length - 1]; if (l && Math.abs(l[1] - r[1]) < 2 && r[0] - (l[0] + l[2]) < r[3] * 0.7) { l[2] = r[0] + r[2] - l[0]; l[3] = Math.max(l[3], r[3]); } else m.push(r.slice()); }
  const out = m.length ? m : [[b.l, b.t, b.r - b.l, kind === 'hl' ? b.b - b.t : Math.min(b.b - b.t, 16)]];
  return kind === 'hl' ? out.map((r) => { const h = r[3] * scale, dy = (h - r[3]) / 2; return [r[0], r[1] - dy, r[2], h]; }) : out;
};

async function insertImage(V) {
  const f = (await A.pickFiles('image/*', false))[0]; if (!f) return; const k = 'i' + nid(); A.imgData[k] = await A.shrink(f, 1600); const im = await A.imgSize(A.imgData[k]);
  const i = clamp(V.cur - 1, 0, V.N - 1), w = Math.min(220, V.sz[i].w * 0.5), h = w * (im.h / im.w); snapshot(V);
  const a = { id: nid(), t: 'img', p: i, x: (V.sz[i].w - w) / 2, y: (V.sz[i].h - h) / 2, w, h, k }; (V.ann[i] = V.ann[i] || []).push(a); select(V, a);
}

function bindPointers(V) {
  if (V._bound) return; V._bound = true; let D = null;
  const pt = (e, pg) => { const r = pg.getBoundingClientRect(), i = +pg.dataset.i; return [((e.clientX - r.left) / r.width) * V.sz[i].w, ((e.clientY - r.top) / r.height) * V.sz[i].h]; };
  const movableAt = (i, x, y) => [...(V.ann[i] || [])].reverse().find((a) => (a.t === 'tx' || a.t === 'img') && distAnn(a, x, y) <= 6 / V.s);
  V.vp.addEventListener('pointerdown', async (e) => {
    if (!V.edit || V.pinching) return; const c = e.target.closest('canvas.ov'); if (!c) return; const pg = c.parentNode, i = +pg.dataset.i, [x, y] = pt(e, pg), t = V.tool;
    const base = { i, pg, x0: x, y0: y, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId, sn: false }; D = null;
    if (V.sel) {
      const s = V.sel, hs = 24 / V.s;
      if (s.p === i && Math.abs(x - (s.x + s.w)) < hs && Math.abs(y - (s.y + s.h)) < hs) D = { ...base, k: 'resize', o: { w: s.w, h: s.h, size: s.size } };
      else if (s.p === i && distAnn(s, x, y) <= 6 / V.s) D = { ...base, k: 'move', o: { x: s.x, y: s.y } };
      else { const m = movableAt(i, x, y); if (m) { select(V, m); D = { ...base, k: 'move', o: { x: m.x, y: m.y } }; } else { deselect(V); return; } }
    } else if (['hand', 'tx', 'sig', 'edtx'].includes(t) && movableAt(i, x, y)) { const m = movableAt(i, x, y); select(V, m); D = { ...base, k: 'move', o: { x: m.x, y: m.y } }; }
    else if (['hl', 'ul'].includes(t)) { D = { ...base, k: 'sel' }; await V.text(i); }
    else if (t === 'ink') { D = { ...base, k: 'ink', pts: [[x, y]] }; V.prev = { t: 'ink', p: i, pts: D.pts, c: V.colors.ink, w: V.sizes.ink }; }
    else if (t === 'hand') return; else D = { ...base, k: 'tap' };
    try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });
  V.vp.addEventListener('pointermove', (e) => {
    if (!D || e.pointerId !== D.id) return; const [x, y] = pt(e, D.pg); if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > 8) D.moved = true;
    if (D.k === 'sel') { const b = { l: Math.min(D.x0, x), r: Math.max(D.x0, x), t: Math.min(D.y0, y), b: Math.max(D.y0, y) }; V.prev = { t: V.tool, p: D.i, rects: snapRects(V.texts[D.i] || [], b, V.tool, V.sizes.hl / 100), c: V.colors[V.tool], w: V.sizes.ul }; V.redraw(D.i); }
    else if (D.k === 'ink') { D.pts.push([x, y]); V.redraw(D.i); }
    else if (D.k === 'move' && V.sel && D.moved) { if (!D.sn) { snapshot(V); D.sn = true; } V.sel.x = D.o.x + (x - D.x0); V.sel.y = D.o.y + (y - D.y0); V.redraw(D.i); }
    else if (D.k === 'resize' && V.sel) { if (!D.sn) { snapshot(V); D.sn = true; } const s = V.sel, w = Math.max(16, x - s.x); if (s.t === 'img') { s.w = w; s.h = w * (D.o.h / D.o.w); } else { s.size = clamp(D.o.size * (w / D.o.w), 6, 200); fitText(s); } V.redraw(D.i); }
  });
  const up = async (e) => {
    if (!D || e.pointerId !== D.id) return; const d = D; D = null; const [x, y] = pt(e, d.pg), i = d.i, t = V.tool; const list = () => (V.ann[i] = V.ann[i] || []);
    if (d.k === 'sel') { const p = V.prev; V.prev = null; if (d.moved && p) { snapshot(V); list().push({ id: nid(), t: p.t, p: i, rects: p.rects, c: p.c, w: p.w }); } V.redraw(i); }
    else if (d.k === 'ink') { const p = V.prev; V.prev = null; if (p.pts.length > 1 || !d.moved) { snapshot(V); list().push({ id: nid(), ...p }); } V.redraw(i); }
    else if (d.k === 'move' || d.k === 'resize') V.redraw(i);
    else if (d.k === 'tap' && !d.moved) {
      if (t === 'er') {
        const tol = 28 / V.s; let best = null, bd = 1e9; list().forEach((a) => { const dd = distAnn(a, x, y); if (dd <= bd) { bd = dd; best = a; } });
        if (best && bd <= tol) { snapshot(V); V.ann[i] = list().filter((a) => !(a === best || (best.g && a.g === best.g))); V.redraw(i); }
      }
      else if (t === 'tx') { const r = await textDlg({ text: '', size: 16, c: '#1f2937' }); if (r && r.text.trim()) { snapshot(V); const a = { id: nid(), t: 'tx', p: i, x, y, ...r }; fitText(a); list().push(a); select(V, a); } }
      else if (t === 'edtx') {
        const items = await V.text(i); const c = items.filter((it) => it.hz && x >= it.x - 3 && x <= it.x + it.w + 3 && y >= it.y - 3 && y <= it.y + it.h + 3).sort((p, q) => p.w * p.h - q.w * q.h)[0];
        if (!c) return A.toast('Tap directly on a line of text'); const r = await textDlg({ text: c.s, size: Math.max(6, Math.round(c.fh)), c: '#1f2937' }); if (!r) return;
        snapshot(V); const g = nid(); list().push({ id: nid(), g, t: 'cover', p: i, rects: [[c.x - 1, c.y + c.h * 0.05, c.w + 2, c.h * 0.95]], c: '#ffffff' });
        if (r.text.trim()) { const a = { id: nid(), g, t: 'tx', p: i, x: c.x, y: c.y + c.h * 0.5 - r.size * 0.65, ...r }; fitText(a); if (isRTL(a.text)) a.x = c.x + c.w - a.w; list().push(a); }
        V.redraw(i); A.toast('Done — the original text is covered with a white box');
      }
      else if (t === 'sig') { const k = await A.sigPicker(); if (!k) return; const im = await A.imgSize(A.imgData[k]); const w = Math.min(160, V.sz[i].w * 0.4), h = w * (im.h / im.w); snapshot(V); const a = { id: nid(), t: 'img', p: i, x: x - w / 2, y: y - h / 2, w, h, k }; list().push(a); select(V, a); }
    }
  };
  V.vp.addEventListener('pointerup', up); V.vp.addEventListener('pointercancel', (e) => { if (D && e.pointerId === D.id) { D = null; V.prev = null; V.redraw(); } });
}
A.imgSize = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 }); i.onerror = () => r({ w: 1, h: 1 }); i.src = src; });
A.shrink = (file, max) => new Promise((res) => {
  const u = URL.createObjectURL(file), im = new Image();
  im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9)); };
  im.onerror = () => { URL.revokeObjectURL(u); res(''); }; im.src = u;
});

/* ---------- Text dialog ---------- */
async function textDlg(d) {
  let col = d.c || '#1f2937', al = d.align || 'auto', font = d.font || 'sans', bold = !!d.bold; const cols = ['#1f2937', '#ee8a8a', '#6b8fd6', '#6dbb8f', '#b7a0e6', '#ffffff'];
  const r = await A.modal({
    title: 'Text', body: `<textarea id="tt" rows="3" dir="auto" placeholder="Type here…">${esc(d.text)}</textarea>
    <label class="lbl">Size: <b id="szv">${Math.round(d.size)}</b></label><input id="sz" type="range" min="6" max="96" value="${Math.round(d.size)}">
    <label class="lbl">Font</label><div class="seg" id="fn">${[['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']].map(([k, t]) => `<button data-f="${k}" class="${font === k ? 'on' : ''}">${t}</button>`).join('')}<button data-f="b" class="${bold ? 'on' : ''}"><b>Bold</b></button></div>
    <label class="lbl">Alignment</label><div class="seg" id="al">${[['auto', 'Auto'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([k, t]) => `<button data-a="${k}" class="${al === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <label class="lbl">Color</label><div style="display:flex;gap:10px" id="cl">${cols.map((c) => `<button class="clr ${c === col ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>`,
    actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Done', p: 1 }],
    onOpen: (o) => {
      $('#sz', o).oninput = (e) => ($('#szv', o).textContent = e.target.value);
      $('#fn', o).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.f === 'b') { bold = !bold; b.classList.toggle('on', bold); } else { font = b.dataset.f; $$('#fn button:not([data-f=b])', o).forEach((x) => x.classList.toggle('on', x === b)); } };
      $('#al', o).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; al = b.dataset.a; $$('#al button', o).forEach((x) => x.classList.toggle('on', x === b)); };
      $('#cl', o).onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; col = b.dataset.c; $$('#cl .clr', o).forEach((x) => x.classList.toggle('on', x === b)); };
    },
    collect: (o) => ({ text: $('#tt', o).value, size: +$('#sz', o).value, font, bold, align: al, c: col }),
  });
  return r.k === 'ok' ? r.v : null;
}

/* ---------- Signatures ---------- */
A.sigs = { all: () => A.db.all('sigs'), add: (d) => A.db.put('sigs', { id: uid(), d, t: Date.now() }), del: (id) => A.db.del('sigs', id) };
A.sigPad = () => new Promise(async (res) => {
  const o = await A.modal({
    title: 'Draw your signature', body: `<canvas class="sigbox" id="sp" width="700" height="340"></canvas><label class="pk"><input type="checkbox" id="ssv" checked><span>Save this signature for later</span></label>`,
    actions: [{ k: 'c', label: 'Cancel' }, { k: 'clr', label: 'Clear' }, { k: 'ok', label: 'Done', p: 1 }],
    onOpen: (m) => {
      const c = $('#sp', m), x = c.getContext('2d'); x.lineWidth = 5; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = '#1e3a8a'; let dr = false;
      const p = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
      c.onpointerdown = (e) => { dr = true; const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); x.lineTo(a + 0.1, b); x.stroke(); c.setPointerCapture(e.pointerId); };
      c.onpointermove = (e) => { if (!dr) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); }; c.onpointerup = () => (dr = false);
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b && b.dataset.k === 'clr') { e.stopPropagation(); x.clearRect(0, 0, c.width, c.height); } }, true);
    },
    collect: (m) => { const c = $('#sp', m), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let l = c.width, t = c.height, r = 0, b = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); } if (r <= l) return null; const oc = document.createElement('canvas'); oc.width = r - l + 12; oc.height = b - t + 12; oc.getContext('2d').drawImage(c, l - 6, t - 6, oc.width, oc.height, 0, 0, oc.width, oc.height); return { d: oc.toDataURL('image/png'), save: $('#ssv', m).checked }; },
  });
  if (o.k !== 'ok' || !o.v) return res(null); if (o.v.save) await A.sigs.add(o.v.d); res(o.v.d);
});
A.sigPicker = async () => {
  const list = await A.sigs.all(); const mk = async () => { const d = await A.sigPad(); if (!d) return null; const k = 's' + uid().slice(0, 8); A.imgData[k] = d; return k; };
  if (!list.length) return mk();
  const r = await A.modal({ title: 'Choose a signature', body: `<div class="sigs">${list.map((s) => `<img src="${s.d}" data-s="${s.id}">`).join('')}</div>`, actions: [{ k: 'c', label: 'Cancel' }, { k: 'new', label: 'New signature', p: 1 }], onOpen: (m, close) => m.addEventListener('click', (e) => { const i = e.target.closest('[data-s]'); if (i) { m.dataset.pick = i.dataset.s; close('pick'); } }), collect: (m) => m.dataset.pick });
  if (r.k === 'pick') { const s = list.find((x) => x.id === r.v); const k = 's' + s.id.slice(0, 8); A.imgData[k] = s.d; return k; }
  return r.k === 'new' ? mk() : null;
};

/* ---------- Save: merge the annotations into the PDF ---------- */
A.edBuild = async (V) => {
  const { PDFDocument, rgb, degrees, LineCapStyle, BlendMode } = PDFLib; const doc = await PDFDocument.load(V.bytes);
  const col = (h) => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const toBytes = (d) => Uint8Array.from(atob(d.split(',')[1]), (c) => c.charCodeAt(0));
  for (const [pi, list] of Object.entries(V.ann)) {
    if (!list.length) continue; const i = +pi, page = doc.getPage(i), vp = V.vps[i], R = ((vp.rotation % 360) + 360) % 360;
    const P = (x, y) => { const q = vp.convertToPdfPoint(x, y); return { x: q[0], y: q[1] }; };
    const box = (r) => { const a = P(r[0], r[1]), b = P(r[0] + r[2], r[1] + r[3]); return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }; };
    for (const a of list) {
      if (a.t === 'cover') a.rects.forEach((r) => page.drawRectangle({ ...box(r), color: rgb(1, 1, 1) }));
      else if (a.t === 'hl') a.rects.forEach((r) => page.drawRectangle({ ...box(r), color: col(a.c), opacity: 0.5, blendMode: BlendMode.Multiply }));
      else if (a.t === 'ul') a.rects.forEach((r) => { const y = r[1] + r[3] * 0.94; page.drawLine({ start: P(r[0], y), end: P(r[0] + r[2], y), thickness: a.w || 1.5, color: col(a.c), lineCap: LineCapStyle.Round }); });
      else if (a.t === 'ink') { const pts = a.pts.length === 1 ? [a.pts[0], [a.pts[0][0] + 0.1, a.pts[0][1]]] : a.pts; for (let n = 1; n < pts.length; n++) page.drawLine({ start: P(...pts[n - 1]), end: P(...pts[n]), thickness: a.w, color: col(a.c), lineCap: LineCapStyle.Round }); }
      else if (a.t === 'tx' || a.t === 'img') {
        let d; if (a.t === 'tx') { const k = 4, c = document.createElement('canvas'); c.width = Math.ceil(a.w * k); c.height = Math.ceil(a.h * k); const x = c.getContext('2d'); x.scale(k, k); drawText(x, a, 0, 0); d = c.toDataURL('image/png'); } else d = A.imgData[a.k];
        const img = d.startsWith('data:image/png') ? await doc.embedPng(toBytes(d)) : await doc.embedJpg(toBytes(d)); const o = P(a.x, a.y + a.h);
        page.drawImage(img, { x: o.x, y: o.y, width: a.w, height: a.h, rotate: degrees(R) });
      }
    }
  }
  return doc.save();
};
A.edSave = async (V) => {
  if (!Object.values(V.ann).some((l) => l.length)) return A.toast('Nothing to save yet');
  const rec = V.rec; const k = await A.sheet('Save changes', [!rec.enc && { k: 'rep', label: 'Save (replace this file)', icon: 'check' }, { k: 'copy', label: 'Save as a new copy', icon: 'copy' }, { k: 'dl', label: 'Download', icon: 'download' }]); if (!k) return;
  const b = A.busy('Saving…');
  try {
    const blob = new Blob([await A.edBuild(V)], { type: 'application/pdf' });
    if (k === 'dl') A.download(rec.name, blob); else if (k === 'copy') { await A.saveBlob(baseOf(rec.name) + '-edited.pdf', blob); A.toast('Saved as a new copy'); } else { await A.updateBlob(rec, blob); A.toast('Changes saved'); }
    if (k !== 'dl') { V.ann = {}; V.undo = []; V.redo = []; V.dirty = false; deselect(V, true); if (k === 'rep') { V.rfHtml = null; await V.open(blob, V.cur); } }
  } catch (e) { console.error(e); A.toast('Saving failed'); }
  b.done();
};
