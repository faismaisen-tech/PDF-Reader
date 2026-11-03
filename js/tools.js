'use strict';
/* ===== Tools: conversion, merge, split, compress, unlock, signatures ===== */

/* ---------- helpers ---------- */
A.deliver = async (name, blob, o = {}) => {
  for (;;) {
    const k = await A.sheet('Ready: ' + name + ' (' + fmtSize(blob.size) + ')', [!o.noSave && { k: 'save', label: 'Save to My Files', icon: 'check' }, { k: 'dl', label: 'Download', icon: 'download' }, { k: 'share', label: 'Share', icon: 'share' }]);
    if (k === 'save') { const r = await A.saveBlob(name, blob); A.toast('Saved to My Files'); return r; }
    if (k === 'dl') { A.download(name, blob); return true; }
    if (k === 'share') { await A.share(name, blob); return true; }
    if (!(await A.confirm('Discard the result without saving?', 'Discard', true))) continue; return null;
  }
};
const pdfName = (n, fb) => { n = (n || '').trim() || fb; return /\.pdf$/i.test(n) ? n : n + '.pdf'; };
/* choose files from My Files (or the device). opts.list overrides the library list. */
A.pickLib = async ({ multiple, title, exts, accept, list }) => {
  const lst = list || A.lib.files.filter((f) => !f.del && !f.enc && exts.includes(f.ext)).concat(A.lib.dev.filter((f) => exts.includes(f.ext))); const order = [];
  const r = await A.modal({
    title, body: lst.length ? `<div class="lst">${lst.map((f) => `<label class="pk"><input type="${multiple ? 'checkbox' : 'radio'}" name="pk" value="${f.id}"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.enc ? '🔒 ' : ''}${esc(f.name)}</span><small style="color:var(--tx2)">${f.dev ? 'device · ' : ''}${fmtSize(f.size)}</small></label>`).join('')}</div>` : '<div class="empty" style="padding:24px">No matching files in My Files</div>',
    actions: [{ k: 'c', label: 'Cancel' }, { k: 'dev', label: 'From device' }, { k: 'ok', label: 'Select', p: 1 }], collect: () => order.slice(),
    onOpen: (o) => o.addEventListener('change', (e) => { const i = e.target; if (i.name !== 'pk') return; if (i.type === 'checkbox') { i.checked ? order.push(i.value) : order.splice(order.indexOf(i.value), 1); } else { order.length = 0; order.push(i.value); } }),
  });
  if (r.k === 'dev') return (await A.pickFiles(accept, multiple)).map((f) => ({ name: f.name, blob: f }));
  if (r.k !== 'ok') return []; const out = []; for (const id of r.v) { const f = A.lib.rec(id); try { out.push({ name: f.name, blob: await A.getBlob(f), rec: f }); } catch (e) { A.toast(`No access to ${f.name} — allow device access first`); } } return out;
};
A.pickPdfs = (multiple, title) => A.pickLib({ multiple, title, exts: ['pdf'], accept: '.pdf,application/pdf' });
A.openPw = async (blob) => {
  let prot = false; const task = pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: 'lib/cmaps/', cMapPacked: true, standardFontDataUrl: 'lib/standard_fonts/' });
  task.onPassword = (cb, reason) => { prot = true; A.prompt(reason === 2 ? 'Wrong password' : 'Enter the file password', '', { type: 'password' }).then((pw) => (pw == null ? task.destroy() : cb(pw))); };
  try { const pdf = await task.promise; return { pdf, prot }; } catch (e) { return null; }
};
/* render PDF pages to JPEG and rebuild a PDF (used for strong compression / removing a password) */
A.rasterize = async (pdf, scale, q, prog) => {
  const out = await PDFLib.PDFDocument.create();
  for (let i = 1; i <= pdf.numPages; i++) { prog && prog(`Page ${i} of ${pdf.numPages}`, i / pdf.numPages); await A.rasterPage(out, pdf, i, scale, q); }
  return out.save();
};
A.rasterPage = async (out, pdf, n, scale, q) => {
  const p = await pdf.getPage(n), v1 = p.getViewport({ scale: 1 }), v = p.getViewport({ scale }); const c = document.createElement('canvas'); c.width = Math.floor(v.width); c.height = Math.floor(v.height);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: x, viewport: v }).promise;
  const jb = await new Promise((r) => c.toBlob(r, 'image/jpeg', q)); const im = await out.embedJpg(await jb.arrayBuffer()); out.addPage([v1.width, v1.height]).drawImage(im, { x: 0, y: 0, width: v1.width, height: v1.height }); c.width = c.height = 0;
};

/* ---------- Arabic text fix for PDF → Word ---------- */
const AR = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const revKeepLatin = (s) => [...s].reverse().join('').replace(/[A-Za-z0-9][A-Za-z0-9.,:/\-]*/g, (m) => [...m].reverse().join(''));
const looksReversed = (t) => { const a = (t.match(/(^|\s)ال/g) || []).length, b = (t.match(/\S{2,}لا(?=\s|$)/g) || []).length; return b >= 3 && b > a * 1.5; };
const fixAr = (s, rev) => (AR.test(s) ? (rev ? revKeepLatin(s.normalize('NFKC')) : s.normalize('NFKC')) : s);

/* ---------- HTML → PDF (keeps Arabic and formatting; pages are saved as high-quality images) ---------- */
A.htmlToPdf = async (inner, prog) => {
  const W = 794, H = 1123, M = 56, CW = W - 2 * M, CH = H - 2 * M, LH = 26;
  const css = `.d{position:relative;font-family:Inter,"Segoe UI",Roboto,"Noto Sans Arabic",Tahoma,Arial,sans-serif;font-size:15px;line-height:${LH}px;color:#111;width:${CW}px;overflow-wrap:anywhere}.d p{margin:0 0 ${LH / 2}px}.d h1,.d h2,.d h3,.d h4{line-height:1.5;margin:0 0 12px}.d table{border-collapse:collapse;width:100%}.d td,.d th{border:1px solid #999;padding:4px 6px;vertical-align:top}.d img{max-width:100%;height:auto}.d ul,.d ol{margin:0 0 13px;padding-inline-start:28px}`;
  const host = document.createElement('div'); host.style.cssText = `position:fixed;left:-20000px;top:0;width:${CW}px;visibility:hidden`; host.innerHTML = `<style>${css}</style><div class="d" dir="auto">${inner}</div>`; document.body.appendChild(host); const d = $('.d', host);
  try {
    await Promise.all($$('img', d).map((i) => (i.complete ? 1 : new Promise((r) => (i.onload = i.onerror = r)))));
    const total = d.scrollHeight, blocks = [...d.children].map((c) => ({ b: c.offsetTop + c.offsetHeight })); const cuts = []; let s = 0;
    while (s < total - 1) { let e = s + CH; if (e >= total) e = total; else { const fit = blocks.filter((b) => b.b <= e && b.b > s + CH * 0.3); e = fit.length ? Math.min(s + CH, fit[fit.length - 1].b + 4) : s + Math.floor(CH / LH) * LH; } cuts.push([s, e]); s = e; }
    if (!cuts.length) cuts.push([0, CH]);
    const xml = new XMLSerializer().serializeToString(d); const out = await PDFLib.PDFDocument.create();
    for (const [n, [a, b]] of cuts.entries()) {
      prog && prog(`Page ${n + 1} of ${cuts.length}`, (n + 1) / cuts.length);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;background:#fff;position:relative;overflow:hidden"><style>${css}</style><div style="position:absolute;left:${M}px;top:${M}px;width:${CW}px;height:${b - a}px;overflow:hidden"><div style="position:relative;top:${-a}px;width:${CW}px">${xml}</div></div></div></foreignObject></svg>`;
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; c.getContext('2d').drawImage(im, 0, 0, W * 2, H * 2);
      const jb = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)); if (!jb) throw new Error('canvas tainted');
      const emb = await out.embedJpg(await jb.arrayBuffer()); out.addPage([595.28, 841.89]).drawImage(emb, { x: 0, y: 0, width: 595.28, height: 841.89 });
    }
    return new Blob([await out.save()], { type: 'application/pdf' });
  } finally { host.remove(); }
};
const textToHtml = (t) => t.replace(/\r\n?/g, '\n').split('\n').map((l) => `<p dir="auto" style="white-space:pre-wrap;margin:0">${l ? esc(l) : '&nbsp;'}</p>`).join('');

/* ---------- Safe merge: after building, every page is checked; a page that came out blank is replaced by a rendered image of the original ---------- */
const ink = async (pdf, n) => { const p = await pdf.getPage(n), vp = p.getViewport({ scale: 0.3 }); const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: x, viewport: vp }).promise; const d = x.getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) k++; return k / (c.width * c.height); };
A.mergeSafe = async (files, prog) => {
  const { PDFDocument } = PDFLib; const out = await PDFDocument.create(), docs = [], map = [];
  for (const f of files) docs.push(await PDFDocument.load(await f.blob.arrayBuffer()));
  for (const [k, d] of docs.entries()) (await out.copyPages(d, d.getPageIndices())).forEach((p, j) => { out.addPage(p); map.push([k, j]); });
  let bytes = await out.save(), fixed = 0;
  try {
    const outJs = await pdfjsLib.getDocument({ data: bytes.slice(), cMapUrl: 'lib/cmaps/', cMapPacked: true, standardFontDataUrl: 'lib/standard_fonts/' }).promise; const srcJs = []; const bad = new Set();
    for (let i = 0; i < map.length; i++) { prog && prog(`Checking page ${i + 1} of ${map.length}`, (i + 1) / map.length); const [k, j] = map[i]; if ((await ink(outJs, i + 1)) < 0.0005) { srcJs[k] = srcJs[k] || (await A.loadPdfJs(files[k].blob)); if ((await ink(srcJs[k], j + 1)) > 0.002) bad.add(i); } }
    if (bad.size) {
      const o2 = await PDFDocument.create(); for (let i = 0; i < map.length; i++) { const [k, j] = map[i]; if (bad.has(i)) await A.rasterPage(o2, srcJs[k], j + 1, 2, 0.9); else { const [p] = await o2.copyPages(docs[k], [j]); o2.addPage(p); } }
      bytes = await o2.save(); fixed = bad.size;
    }
  } catch (e) { console.warn('merge check skipped', e); }
  return { bytes, fixed };
};

/* ---------- text extraction: embedded text first, OCR (offline or AI) when a page is scanned or garbled ---------- */
const ocrParas = (t) => t.split(/\n\s*\n/).map((x) => x.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).filter(Boolean).map((x) => ({ t: x, h: 12, head: false }));
A.convDlg = async (title, f, o = {}) => {
  const r = await A.modal({
    title, body: `<label class="lbl" style="margin-top:0">File name</label><input id="cn" value="${esc(baseOf(f.name))}">
    ${o.fmt ? '<label class="lbl">Format</label><div class="seg" id="cf"><button data-v="txt" class="on">Text (.txt)</button><button data-v="md">Markdown (.md)</button></div>' : ''}
    <label class="lbl">Text source</label><div class="seg" id="cm"><button data-v="auto" class="on">Auto</button><button data-v="text">File text</button><button data-v="ocr">Scan (OCR)</button></div>
    <div style="font-size:12px;color:var(--tx2);margin-top:6px;line-height:1.6">Auto reads the file's own text and runs OCR only on scanned or garbled pages.</div>
    <label class="lbl">OCR engine</label><div class="seg" id="ce"><button data-v="local" class="on">Offline</button><button data-v="ai">AI (API key)</button></div>
    <button class="addbtn" id="caic">${A.ic('ai')}AI settings</button>
    <label class="lbl">OCR language</label><div class="seg" id="cl"><button data-v="ara+eng" class="on">Arabic + English</button><button data-v="ara">Arabic</button><button data-v="eng">English</button></div>
    <label class="lbl">Arabic order in file text</label><div class="seg" id="ca"><button data-v="auto" class="on">Auto</button><button data-v="off">Keep</button><button data-v="rev">Reverse letters</button></div>`,
    actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Save', p: 1 }],
    onOpen: (m) => { ['#cm', '#ce', '#cl', '#ca', '#cf'].forEach((i) => $(i, m) && segSet(m, i)); $('#caic', m).onclick = () => A.aiDlg(); },
    collect: (m) => ({ n: $('#cn', m).value.trim(), fmt: $('#cf .on', m) ? $('#cf .on', m).dataset.v : null, mode: $('#cm .on', m).dataset.v, engine: $('#ce .on', m).dataset.v, langs: $('#cl .on', m).dataset.v, ar: $('#ca .on', m).dataset.v }),
  });
  if (r.k !== 'ok') return null; const v = r.v;
  if (v.mode !== 'text' && v.engine === 'ai' && !A.ai.get().key) { if (!(await A.aiDlg())) { A.toast('AI needs an API key — use the Offline engine or add a key'); return null; } }
  return v;
};
A.extractText = async (pdf, o, b) => {
  const N = pdf.numPages, pages = [];
  for (let n = 1; n <= N; n++) {
    if (b.cancelled) return null; b.set(`Page ${n} of ${N}`, (n - 1) / N); let paras = [], src = 'text', md = '';
    if (o.mode !== 'ocr') paras = await A.pageParas(pdf, n);
    const txt = paras.map((p) => p.t).join(' ');
    if (o.mode === 'ocr' || (o.mode === 'auto' && (!txt.trim() || A.isGarbled(txt)))) {
      const c = await A.pageCanvas(pdf, n, o.engine === 'ai' ? 1800 : 2000);
      try {
        if (o.engine === 'ai') { b.set(`AI reading page ${n} of ${N}`, (n - 1) / N); md = await A.aiOcr(c); paras = A.mdToParas(md); src = 'ai'; }
        else { b.set(`OCR page ${n} of ${N}`, (n - 1) / N); paras = ocrParas(await A.ocrLocal(c, o.langs)); src = 'ocr'; }
      } finally { c.width = c.height = 0; }
    }
    pages.push({ paras, src, md });
  }
  const all = pages.filter((p) => p.src === 'text').map((p) => p.paras.map((x) => x.t.normalize('NFKC')).join(' ')).join(' ');
  const rev = o.ar === 'rev' || (o.ar === 'auto' && looksReversed(all));
  if (o.ar !== 'off') pages.forEach((pg) => { if (pg.src === 'text') pg.paras.forEach((p) => (p.t = fixAr(p.t, rev))); });
  return { pages, rev, ocr: pages.filter((p) => p.src !== 'text').length };
};
const textOut = async (f, title, fmt) => {
  const o = await A.convDlg(title, f, { fmt }); if (!o) return; const b = A.busy('Reading…', true);
  try {
    const op = await A.openPw(f.blob); if (!op) { b.done(); return; } let res;
    try { res = await A.extractText(op.pdf, o, b); } catch (e) { b.done(); console.error(e); return A.toast('Recognition failed: ' + (e.message || e), 5000); }
    if (!res) { b.done(); return A.toast('Cancelled'); } const { pages } = res;
    if (!pages.some((p) => p.paras.length)) { b.done(); return A.toast('No text could be found'); }
    b.set('Building file…', 0.97); let blob, name; const base = (o.n || baseOf(f.name)).replace(/\.(docx|txt|md)$/i, '');
    if (!fmt) {
      const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx; const kids = [];
      pages.forEach((pg, pi) => {
        if (!pg.paras.length) { kids.push(new Paragraph({ pageBreakBefore: pi > 0, children: [new TextRun({ text: `[Page ${pi + 1}: no text found]`, italics: true, color: '888888' })] })); return; }
        pg.paras.forEach((p, j) => { const rtl = isRTL(p.t); kids.push(new Paragraph({ pageBreakBefore: pi > 0 && j === 0, bidirectional: rtl, alignment: AlignmentType.START, spacing: { after: 160 }, children: [new TextRun({ text: p.t, bold: p.head, rightToLeft: rtl, size: Math.round(clamp(p.h, 9, p.head ? 30 : 16) * 2) })] })); });
      });
      blob = new Blob([await Packer.toBlob(new Document({ sections: [{ children: kids }] }))], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); name = base + '.docx';
    } else if (o.fmt === 'md') {
      blob = new Blob(['\uFEFF' + pages.map((pg) => (pg.src === 'ai' && pg.md ? pg.md.trim() : pg.paras.map((p) => (p.head ? '## ' + p.t : p.t)).join('\n\n'))).join('\n\n---\n\n')], { type: 'text/markdown;charset=utf-8' }); name = base + '.md';
    } else { blob = new Blob(['\uFEFF' + pages.map((pg) => pg.paras.map((p) => p.t).join('\n\n')).join('\n\n')], { type: 'text/plain;charset=utf-8' }); name = base + '.txt'; }
    b.done(); await A.saveBlob(name, blob); A.toast(`Saved “${name}” to My Files${res.ocr ? ` · ${res.ocr} page(s) read with OCR/AI` : ''}${res.rev ? ' · Arabic order fixed' : ''}`, 4200);
  } finally { b.done(); A.ocrDone(); }
};

const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); A.toast('Something went wrong'); } };
const segSet = (o, id, attr) => ($(id, o).onclick = (e) => { const x = e.target.closest('button'); if (x) $$(id + ' button', o).forEach((y) => y.classList.toggle('on', y === x)); });

A.tools = {
  /* ----- PDF → Word (with OCR for scans / garbled text) ----- */
  pdf2word: guard(async (pre) => { const f = pre || (await A.pickPdfs(false, 'Choose a PDF'))[0]; if (f) await textOut(f, 'PDF to Word', null); }),
  /* ----- PDF → TXT / Markdown ----- */
  pdf2text: guard(async (pre) => { const f = pre || (await A.pickPdfs(false, 'Choose a PDF'))[0]; if (f) await textOut(f, 'PDF to Text / Markdown', true); }),
  /* ----- Word → PDF ----- */
  word2pdf: guard(async () => {
    const [f] = await A.pickLib({ multiple: false, title: 'Choose a Word file (.docx)', exts: ['docx'], accept: '.docx' }); if (!f) return; const b = A.busy('Converting…');
    try { const r = await mammoth.convertToHtml({ arrayBuffer: await f.blob.arrayBuffer() }); const blob = await A.htmlToPdf(r.value.replace(/href="\s*javascript:[^"]*"/gi, ''), (m, p) => b.set(m, p)); b.done(); await A.deliver(baseOf(f.name) + '.pdf', blob); } finally { b.done(); }
  }),
  /* ----- Text → PDF (type or paste) ----- */
  text2pdf: guard(async () => {
    const r = await A.modal({ title: 'Text to PDF', body: '<input id="tn" placeholder="File name (optional)" style="margin-bottom:10px"><textarea id="tx" rows="9" dir="auto" placeholder="Type or paste your text here…"></textarea>', actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Save', p: 1 }], collect: (o) => ({ t: $('#tx', o).value, n: $('#tn', o).value.trim() }) });
    if (r.k !== 'ok' || !r.v.t.trim()) return; const b = A.busy('Creating PDF…');
    try { const blob = await A.htmlToPdf(textToHtml(r.v.t), (m, p) => b.set(m, p)); b.done(); const name = pdfName(r.v.n || r.v.t.trim().slice(0, 24).replace(/[\\/:*?"<>|\n]/g, ' '), 'note'); await A.saveBlob(name, blob); A.toast(`Saved “${name}” to My Files`); } finally { b.done(); }
  }),
  /* ----- TXT file → PDF ----- */
  txt2pdf: guard(async () => {
    const fs = await A.pickLib({ multiple: true, title: 'Choose TXT files', exts: ['txt', 'md'], accept: '.txt,.md,text/plain,text/markdown' }); if (!fs.length) return; const b = A.busy('Converting…'); let n = 0;
    try {
      for (const [i, f] of fs.entries()) {
        b.set(`${f.name} (${i + 1}/${fs.length})`, i / fs.length); const ab = await f.blob.arrayBuffer(); let t = new TextDecoder('utf-8').decode(ab); if (t.includes('\uFFFD')) t = new TextDecoder('windows-1256').decode(ab);
        await A.saveBlob(pdfName(baseOf(f.name)), await A.htmlToPdf(textToHtml(t))); n++;
      }
      b.done(); A.toast(`${n} PDF file(s) saved to My Files`, 3000);
    } finally { b.done(); }
  }),
  /* ----- Images → PDF ----- */
  img2pdf: guard(async () => {
    const files = await A.pickFiles('image/*', true); if (!files.length) return; const toItem = (f) => ({ label: f.name, file: f, thumb: URL.createObjectURL(f) });
    const r = await A.listDlg({
      title: 'Images to PDF', items: files.map(toItem), name: 'images', add: async () => (await A.pickFiles('image/*', true)).map(toItem),
      extraBody: '<label class="lbl">Page size</label><div class="seg" id="ps"><button data-p="a4" class="on">A4</button><button data-p="letter">Letter</button><button data-p="orig">Image size</button></div>', extra: (o) => $('#ps .on', o).dataset.p,
    });
    if (!r) return; const b = A.busy('Creating PDF…');
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const [n, it] of r.items.entries()) { b.set(`Image ${n + 1} of ${r.items.length}`, (n + 1) / r.items.length); const d = await A.shrink(it.file, 2600); if (!d) continue; await A.addImagePage(out, d, await A.imgSize(d), r.extra); }
      const blob = new Blob([await out.save()], { type: 'application/pdf' }); b.done(); const name = pdfName(r.name, 'images'); await A.saveBlob(name, blob); A.toast(`Saved “${name}” to My Files`);
    } finally { b.done(); }
  }),
  /* ----- PDF → Images ----- */
  pdf2img: guard(async (pre) => {
    const f = pre || (await A.pickPdfs(false, 'Choose a PDF'))[0]; if (!f) return;
    const r = await A.modal({ title: 'PDF to Images', body: `<label class="lbl" style="margin-top:0">Image format</label><div class="seg" id="fm"><button data-f="png" class="on">PNG</button><button data-f="jpeg">JPG</button><button data-f="webp">WebP</button></div>
      <label class="lbl">Quality: <b id="qv">90</b>% <small>(JPG / WebP only)</small></label><input type="range" id="q" min="40" max="100" value="90"><label class="lbl">Resolution</label><div class="seg" id="sc"><button data-s="1.5">Normal</button><button data-s="2.5" class="on">High</button><button data-s="4">Ultra</button></div>`,
      actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Save', p: 1 }], onOpen: (o) => { segSet(o, '#fm'); segSet(o, '#sc'); $('#q', o).oninput = (e) => ($('#qv', o).textContent = e.target.value); }, collect: (o) => ({ f: $('#fm .on', o).dataset.f, q: +$('#q', o).value / 100, s: +$('#sc .on', o).dataset.s }) });
    if (r.k !== 'ok') return; const b = A.busy('Converting…'); const ext = r.v.f === 'jpeg' ? 'jpg' : r.v.f;
    try {
      const o = await A.openPw(f.blob); if (!o) { b.done(); return; } const pdf = o.pdf, zip = new JSZip(); let probe = await new Promise((rs) => { const c = document.createElement('canvas'); c.width = c.height = 2; c.toBlob(rs, 'image/' + r.v.f); });
      if (r.v.f === 'webp' && probe && probe.type !== 'image/webp') { b.done(); return A.toast('WebP is not supported by this browser — choose PNG or JPG'); }
      for (let i = 1; i <= pdf.numPages; i++) {
        b.set(`Page ${i} of ${pdf.numPages}`, i / pdf.numPages); const p = await pdf.getPage(i); let sc = r.v.s; const v0 = p.getViewport({ scale: 1 }); if (v0.width * v0.height * sc * sc > 20e6) sc = Math.sqrt(20e6 / (v0.width * v0.height));
        const v = p.getViewport({ scale: sc }), c = document.createElement('canvas'); c.width = Math.floor(v.width); c.height = Math.floor(v.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        await p.render({ canvasContext: x, viewport: v }).promise; zip.file(`page-${String(i).padStart(3, '0')}.${ext}`, await new Promise((rs) => c.toBlob(rs, 'image/' + r.v.f, r.v.q))); c.width = c.height = 0;
      }
      b.set('Packing files…', 1); const blob = await zip.generateAsync({ type: 'blob' }); b.done(); A.download(baseOf(f.name) + '-images.zip', blob); A.toast('Images saved as a ZIP file');
    } finally { b.done(); }
  }),
  /* ----- Merge ----- */
  merge: guard(async (pre) => {
    const toItem = (f) => ({ label: f.name, file: f }); const first = pre ? [pre] : await A.pickPdfs(true, 'Choose PDFs to merge'); if (!first.length) return;
    const r = await A.listDlg({ title: 'Merge PDF', items: first.map(toItem), name: 'merged', add: async () => (await A.pickPdfs(true, 'Add more PDFs')).map(toItem) });
    if (!r) return; if (r.items.length < 2) return A.toast('Choose at least two files to merge'); const b = A.busy('Merging…');
    try {
      let res; try { res = await A.mergeSafe(r.items.map((i) => i.file), (m, p) => b.set(m, p)); } catch (e) { b.done(); console.error(e); return A.toast('One of the files could not be read (it may be protected)'); }
      b.done(); const name = pdfName(r.name, 'merged'); await A.saveBlob(name, new Blob([res.bytes], { type: 'application/pdf' })); A.toast(`Saved “${name}” to My Files${res.fixed ? ` (${res.fixed} blank page(s) repaired)` : ''}`, 3200);
    } finally { b.done(); }
  }),
  /* ----- Split: choose a file → choose its pages → add more result files → split everything ----- */
  split: guard(async (pre) => {
    const jobs = [], opened = [];
    const el = document.createElement('div'); el.className = 'screen';
    el.innerHTML = `<header class="top"><button class="ib" data-s="back">${A.ic('back')}</button><div class="ttl" style="font-size:18px">Split PDF</div><button class="ib" data-s="add" style="color:var(--pri)">${A.ic('plus')}</button></header><div class="sbody" style="padding-bottom:110px"></div><div style="position:absolute;left:0;right:0;bottom:0;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:var(--bg)"><button class="btn p" data-s="go" style="width:100%;padding:15px">Split</button></div>`;
    const body = $('.sbody', el), goBtn = $('[data-s=go]', el);
    const render = () => {
      body.innerHTML = jobs.length ? jobs.map((j, i) => `<div class="card" data-j="${j.id}"><div class="ch"><span class="badge b-pdf" style="width:38px;height:38px;border-radius:12px;margin-right:6px">PDF</span><span class="cn">${esc(j.name)}</span><button class="ib" data-s="rename">${A.ic('edit')}</button><button class="ib" data-s="pick">${A.ic('pages')}</button><button class="ib" data-s="remove" style="color:var(--danger)">${A.ic('trash')}</button></div><div class="cs">${j.sel.size} page(s) from ${esc(j.src.name)}</div></div>`).join('') : `<div class="empty">${A.ic('split')}<br>Tap <b>+</b> to choose a file and its pages</div>`;
      goBtn.textContent = jobs.length ? `Split ${jobs.length} file${jobs.length > 1 ? 's' : ''}` : 'Split'; goBtn.disabled = !jobs.length; goBtn.style.opacity = jobs.length ? 1 : 0.5;
    };
    const pickPages = (src, init, title) => new Promise((resolve) => {
      const sel = new Set(init || []); let done = false; const pe = document.createElement('div'); pe.className = 'screen';
      pe.innerHTML = `<header class="top"><button class="ib" data-p="back">${A.ic('back')}</button><div class="ttl" style="font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</div><button class="btn p" data-p="done" style="flex:none;min-width:0;padding:10px 20px">Done</button></header><div class="sbody" style="padding-top:0"><div style="display:flex;align-items:center;gap:10px;padding:4px 4px 8px"><button class="chip" data-p="all">Select all</button><span class="cs" data-p="cnt" style="color:var(--tx2);font-size:13px"></span></div><div class="pgrid">${Array.from({ length: src.n }, (_, i) => `<div class="pt" data-i="${i}"><canvas data-i="${i}"></canvas><span class="n">${i + 1}</span><span class="ck">${A.ic('check')}</span></div>`).join('')}</div></div>`;
      const io = new IntersectionObserver((es) => es.forEach(async (e) => { if (!e.isIntersecting) return; const cv = e.target; io.unobserve(cv); A.paintThumb(cv, await src.thumb(+cv.dataset.i)); }), { root: $('.sbody', pe), rootMargin: '300px' });
      const upd = () => { $$('.pt', pe).forEach((t) => t.classList.toggle('sel', sel.has(+t.dataset.i))); $('[data-p=cnt]', pe).textContent = `${sel.size} of ${src.n} selected`; $('[data-p=all]', pe).textContent = sel.size === src.n ? 'Deselect all' : 'Select all'; };
      pe.addEventListener('click', (e) => {
        const t = e.target.closest('.pt'); if (t) { const i = +t.dataset.i; sel.has(i) ? sel.delete(i) : sel.add(i); return upd(); }
        const b = e.target.closest('[data-p]'); if (!b) return; const a = b.dataset.p;
        if (a === 'back') A.pop(); else if (a === 'all') { if (sel.size === src.n) sel.clear(); else for (let i = 0; i < src.n; i++) sel.add(i); upd(); }
        else if (a === 'done') { if (!sel.size) return A.toast('Select at least one page'); done = true; resolve(new Set(sel)); A.pop(); }
      });
      A.push(pe, () => { io.disconnect(); if (!done) resolve(null); }); $$('canvas', pe).forEach((c) => io.observe(c)); upd();
    });
    const openSrc = async (f) => { let pdf; try { pdf = await A.loadPdfJs(f.blob); } catch (e) { A.toast(`${f.name}: cannot open (protected?)`); return null; } opened.push(pdf); return { name: f.name, blob: f.blob, pdf, n: pdf.numPages, bytes: new Uint8Array(await f.blob.arrayBuffer()), thumb: A.thumbCache(pdf, 110) }; };
    const addFlow = async (file) => {
      const f = file || (await A.pickPdfs(false, 'Choose a PDF to take pages from'))[0]; if (!f) return false; const src = await openSrc(f); if (!src) return false;
      const sel = await pickPages(src, [], `Select pages — ${f.name}`); if (!sel) return false;
      jobs.push({ id: uid().slice(0, 8), name: pdfName(baseOf(f.name) + '-part' + (jobs.length + 1)), src, sel }); render(); return true;
    };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return; const a = b.dataset.s, card = e.target.closest('.card'), j = card && jobs.find((x) => x.id === card.dataset.j);
      if (a === 'back') A.pop(); else if (a === 'add') await addFlow();
      else if (a === 'rename' && j) { const n = await A.renameDlg(j.name, 'Output file name'); if (n) { j.name = n; render(); } }
      else if (a === 'pick' && j) { const sel = await pickPages(j.src, [...j.sel], `Select pages — ${j.src.name}`); if (sel) { j.sel = sel; render(); } }
      else if (a === 'remove' && j) { jobs.splice(jobs.indexOf(j), 1); render(); }
      else if (a === 'go' && jobs.length) {
        const bz = A.busy('Splitting…');
        try { for (const [k, x] of jobs.entries()) { bz.set(`${x.name} (${k + 1}/${jobs.length})`, k / jobs.length); const items = [...x.sel].sort((p, q) => p - q).map((i) => ({ src: i, rot: 0 })); await A.saveBlob(x.name, new Blob([await A.rebuildPdf(x.src.bytes, items)], { type: 'application/pdf' })); } bz.done(); A.toast(`${jobs.length} file(s) saved to My Files`, 3000); A.pop(); } catch (err) { bz.done(); console.error(err); A.toast('Splitting failed'); }
      }
    });
    A.push(el, () => opened.forEach((p) => p.destroy())); render();
    if (!(await addFlow(pre)) && !jobs.length) A.pop();
  }),
  /* ----- Compress ----- */
  compress: guard(async (pre) => {
    const f = pre || (await A.pickPdfs(false, 'Choose a PDF'))[0]; if (!f) return;
    const r = await A.modal({ title: 'Compress PDF', body: `<div class="seg" id="cl" style="flex-direction:column"><button data-l="0" class="on">Light — keeps text selectable</button><button data-l="1">Medium — good quality images</button><button data-l="2">Strong — smallest size</button></div><div style="font-size:12px;color:var(--tx2);margin-top:12px;line-height:1.7">Medium and Strong turn pages into images, so the text can no longer be selected.</div><label class="lbl">File name</label><input id="cn" value="${esc(baseOf(f.name))}-compressed">`, actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Save', p: 1 }], onOpen: (o) => segSet(o, '#cl'), collect: (o) => ({ l: +$('#cl .on', o).dataset.l, n: $('#cn', o).value }) });
    if (r.k !== 'ok') return; const b = A.busy('Compressing…');
    try {
      let bytes; if (r.v.l === 0) { const d = await PDFLib.PDFDocument.load(await f.blob.arrayBuffer()); bytes = await d.save({ useObjectStreams: true }); } else { const o = await A.openPw(f.blob); if (!o) { b.done(); return; } bytes = await A.rasterize(o.pdf, r.v.l === 1 ? 1.5 : 1.0, r.v.l === 1 ? 0.6 : 0.45, (m, p) => b.set(m, p)); }
      b.done(); const blob = new Blob([bytes], { type: 'application/pdf' }), pct = Math.round((1 - blob.size / f.blob.size) * 100);
      if (blob.size >= f.blob.size && !(await A.confirm(`The size did not shrink (${fmtSize(f.blob.size)} → ${fmtSize(blob.size)}). Save anyway?`, 'Save'))) return;
      const name = pdfName(r.v.n, 'compressed'); await A.saveBlob(name, blob); A.toast(pct > 0 ? `Saved — ${pct}% smaller (${fmtSize(f.blob.size)} → ${fmtSize(blob.size)})` : 'Saved', 3600);
    } finally { b.done(); }
  }),
  /* ----- Remove protection: lists protected files only ----- */
  unlock: guard(async () => {
    const b0 = A.busy('Looking for protected files…'); const list = []; for (const f of A.lib.files.filter((x) => !x.del && x.ext === 'pdf').concat(A.lib.dev.filter((x) => x.ext === 'pdf'))) if (await A.isProtected(f)) list.push(f); b0.done();
    const [f] = await A.pickLib({ multiple: false, title: 'Protected files', exts: ['pdf'], accept: '.pdf,application/pdf', list }); if (!f) return;
    if (f.rec && f.rec.enc) {
      const pw = await A.prompt('Enter the password to remove the lock', '', { type: 'password' }); if (pw == null) return; let blob; try { blob = await A.crypto.dec(f.rec, pw); } catch (e) { return A.toast('Wrong password'); }
      f.rec.blob = blob; delete f.rec.enc; f.rec.size = blob.size; f.rec._n = undefined; await A.lib.save(f.rec); return A.toast('Protection removed'); }
    const o = await A.openPw(f.blob); if (!o) return A.toast('Could not open the file'); if (!o.prot) return A.toast('This file is not password protected');
    const b = A.busy('Removing protection…');
    try { const bytes = await A.rasterize(o.pdf, 2, 0.85, (m, p) => b.set(m, p)); b.done(); await A.saveBlob(baseOf(f.name) + '-unlocked.pdf', new Blob([bytes], { type: 'application/pdf' })); A.toast('Saved unlocked copy (pages are now images)', 3600); } finally { b.done(); }
  }),
  /* ----- Edit PDF (shortcut) ----- */
  editpdf: guard(async () => { const [f] = await A.pickPdfs(false, 'Choose a PDF to edit'); if (!f) return; const rec = f.rec || (await A.saveBlob(f.name, f.blob)); A.openFile(rec.id, { edit: true }); }),
  /* ----- Page numbers ----- */
  numbers: guard(async (pre) => {
    const f = pre || (await A.pickPdfs(false, 'Choose a PDF'))[0]; if (!f) return;
    const r = await A.modal({ title: 'Page numbers', body: `<label class="lbl" style="margin-top:0">Horizontal position</label><div class="seg" id="ph"><button data-v="l">Left</button><button data-v="c" class="on">Center</button><button data-v="r">Right</button></div>
      <label class="lbl">Vertical position</label><div class="seg" id="pv"><button data-v="b" class="on">Bottom</button><button data-v="t">Top</button></div>
      <label class="lbl">Format</label><div class="seg" id="pf"><button data-v="n" class="on">1</button><button data-v="nn">1 / 10</button><button data-v="pn">Page 1</button></div>
      <label class="lbl">Start numbering at</label><input id="ps" type="number" value="1" min="0"><label class="lbl">File name</label><input id="pname" value="${esc(baseOf(f.name))}-numbered">`,
      actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Save', p: 1 }], onOpen: (o) => ['#ph', '#pv', '#pf'].forEach((i) => segSet(o, i)), collect: (o) => ({ h: $('#ph .on', o).dataset.v, v: $('#pv .on', o).dataset.v, f: $('#pf .on', o).dataset.v, s: parseInt($('#ps', o).value) || 1, n: $('#pname', o).value }) });
    if (r.k !== 'ok') return; const b = A.busy('Adding page numbers…');
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib; const doc = await PDFDocument.load(await f.blob.arrayBuffer()), font = await doc.embedFont(StandardFonts.Helvetica), N = doc.getPageCount(), size = 11;
      doc.getPages().forEach((pg, i) => {
        const num = r.v.s + i, label = r.v.f === 'nn' ? `${num} / ${N + r.v.s - 1}` : r.v.f === 'pn' ? `Page ${num}` : String(num), tw = font.widthOfTextAtSize(label, size);
        const R = ((pg.getRotation().angle % 360) + 360) % 360, { width: w, height: h } = pg.getSize(), vw = R === 90 || R === 270 ? h : w, vh = R === 90 || R === 270 ? w : h;
        const vx = r.v.h === 'l' ? 36 : r.v.h === 'r' ? vw - 36 - tw : (vw - tw) / 2, vy = r.v.v === 'b' ? 24 : vh - 24 - size;
        const [x, y] = R === 90 ? [w - vy, vx] : R === 180 ? [w - vx, h - vy] : R === 270 ? [vy, h - vx] : [vx, vy];
        pg.drawText(label, { x, y, size, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(R) });
      });
      const blob = new Blob([await doc.save()], { type: 'application/pdf' }); b.done(); const name = pdfName(r.v.n, 'numbered'); await A.saveBlob(name, blob); A.toast(`Saved “${name}” to My Files`);
    } finally { b.done(); }
  }),
  /* ----- Watermark (text, Arabic supported) ----- */
  watermark: guard(async (pre) => {
    const f = pre || (await A.pickPdfs(false, 'Choose a PDF'))[0]; if (!f) return;
    const r = await A.modal({ title: 'Watermark', body: `<label class="lbl" style="margin-top:0">Text</label><input id="wt" value="CONFIDENTIAL" dir="auto">
      <label class="lbl">Size: <b id="wsv">60</b></label><input type="range" id="ws" min="20" max="140" value="60"><label class="lbl">Opacity: <b id="wov">25</b>%</label><input type="range" id="wo" min="8" max="80" value="25">
      <label class="lbl">Angle</label><div class="seg" id="wa"><button data-v="45" class="on">Diagonal</button><button data-v="0">Horizontal</button></div>
      <label class="lbl">Color</label><div class="seg" id="wc"><button data-v="#6b7280" class="on">Gray</button><button data-v="#e5484d">Red</button><button data-v="#3b7ddd">Blue</button></div><label class="lbl">File name</label><input id="wname" value="${esc(baseOf(f.name))}-watermarked">`,
      actions: [{ k: 'c', label: 'Cancel' }, { k: 'ok', label: 'Save', p: 1 }], onOpen: (o) => { segSet(o, '#wa'); segSet(o, '#wc'); $('#ws', o).oninput = (e) => ($('#wsv', o).textContent = e.target.value); $('#wo', o).oninput = (e) => ($('#wov', o).textContent = e.target.value); },
      collect: (o) => ({ t: $('#wt', o).value.trim(), s: +$('#ws', o).value, o: +$('#wo', o).value / 100, a: +$('#wa .on', o).dataset.v, c: $('#wc .on', o).dataset.v, n: $('#wname', o).value }) });
    if (r.k !== 'ok' || !r.v.t) return; const b = A.busy('Adding watermark…');
    try {
      const { PDFDocument, degrees } = PDFLib; const doc = await PDFDocument.load(await f.blob.arrayBuffer());
      const k = 3, m = document.createElement('canvas').getContext('2d'); m.font = `bold ${r.v.s * k}px Inter,"Segoe UI",Roboto,"Noto Sans Arabic",Arial,sans-serif`; const tw = Math.ceil(m.measureText(r.v.t).width) + 20 * k;
      const c = document.createElement('canvas'); c.width = tw; c.height = Math.ceil(r.v.s * k * 1.5); const x = c.getContext('2d'); x.font = m.font; x.fillStyle = r.v.c; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = isRTL(r.v.t) ? 'rtl' : 'ltr'; x.fillText(r.v.t, c.width / 2, c.height / 2);
      const img = await doc.embedPng(Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]), (ch) => ch.charCodeAt(0))), iw = c.width / k, ih = c.height / k;
      doc.getPages().forEach((pg) => {
        const R = ((pg.getRotation().angle % 360) + 360) % 360, { width: w, height: h } = pg.getSize(), th = ((r.v.a + R) * Math.PI) / 180;
        pg.drawImage(img, { x: w / 2 - ((iw / 2) * Math.cos(th) - (ih / 2) * Math.sin(th)), y: h / 2 - ((iw / 2) * Math.sin(th) + (ih / 2) * Math.cos(th)), width: iw, height: ih, rotate: degrees(r.v.a + R), opacity: r.v.o });
      });
      const blob = new Blob([await doc.save()], { type: 'application/pdf' }); b.done(); const name = pdfName(r.v.n, 'watermarked'); await A.saveBlob(name, blob); A.toast(`Saved “${name}” to My Files`);
    } finally { b.done(); }
  }),
  pages: guard(async () => { const [f] = await A.pickPdfs(false, 'Choose a PDF to organize'); if (!f) return; const rec = f.rec || (await A.saveBlob(f.name, f.blob)); A.pageManager(rec, rec.blob); }),
  sigs: guard(async () => {
    for (;;) {
      const list = await A.sigs.all();
      const r = await A.modal({ title: 'My signatures', body: list.length ? `<div class="sigs">${list.map((s) => `<img src="${s.d}" data-s="${s.id}">`).join('')}</div><div style="font-size:12px;color:var(--tx2)">Tap a signature to delete it</div>` : '<div class="empty" style="padding:24px">No saved signatures</div>', actions: [{ k: 'c', label: 'Close' }, { k: 'new', label: 'New signature', p: 1 }], onOpen: (o, close) => o.addEventListener('click', (e) => { const i = e.target.closest('[data-s]'); if (i) { o.dataset.del = i.dataset.s; close('del'); } }), collect: (o) => o.dataset.del });
      if (r.k === 'new') await A.sigPad(); else if (r.k === 'del') { if (await A.confirm('Delete this signature?', 'Delete', true)) await A.sigs.del(r.v); } else return;
    }
  }),
};
A.runTool = (k) => { const f = A.tools[k]; f ? f() : A.toast('Unknown tool'); };
