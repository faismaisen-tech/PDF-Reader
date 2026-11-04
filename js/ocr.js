'use strict';
/* ===== Text recognition: offline OCR (Tesseract) + optional AI OCR (your own API key) =====
   The app never uses the internet unless you choose "AI" as the engine and save an API key. */

const AIDEF = { openai: { name: 'OpenAI (ChatGPT)', model: 'gpt-5.5', host: 'api.openai.com' }, gemini: { name: 'Google Gemini', model: 'gemini-3.5-flash', host: 'generativelanguage.googleapis.com' }, claude: { name: 'Anthropic Claude', model: 'claude-sonnet-5-5', host: 'api.anthropic.com' } };
A.ai = { get: () => Object.assign({ provider: 'openai', key: '', model: '' }, JSON.parse(localStorage.getItem('ai3') || '{}')), set: (v) => localStorage.setItem('ai3', JSON.stringify(v)) };
const AI_PROMPT = 'Transcribe all the text on this page exactly as written, in its original language. Keep paragraph breaks. Use Markdown: "#" for titles/headings, "-" for lists, and Markdown tables where the page has tables. Arabic must stay in its correct logical right-to-left order. Do not translate, summarize or add any commentary. If the page contains no text, return nothing.';

A.aiDlg = async () => {
  let cfg = A.ai.get();
  const r = await A.modal({
    title: 'AI text recognition', mid: true,
    body: `<div style="font-size:13px;color:var(--tx2);line-height:1.7;margin-bottom:6px">Optional. Gives the best result for scanned books and Arabic. When you pick the “AI” engine, the <b>page images are sent to the provider you choose</b> (internet required). Your key is stored only on this device.</div>
    <label class="lbl">Provider</label><div class="seg" id="ap">${Object.entries(AIDEF).map(([k, v]) => `<button data-p="${k}" class="${cfg.provider === k ? 'on' : ''}">${v.name}</button>`).join('')}</div>
    <label class="lbl">API key</label><input id="ak" type="password" value="${esc(cfg.key)}" placeholder="Paste your API key" autocomplete="off">
    <label class="lbl">Model <small>(leave empty for the default)</small></label><input id="am" value="${esc(cfg.model)}" placeholder="${esc(AIDEF[cfg.provider].model)}" dir="ltr">`,
    actions: [{ k: 'c', label: 'Close' }, { k: 'rm', label: 'Remove key', d: 1 }, { k: 'ok', label: 'Save', p: 1 }],
    onOpen: (o) => { $('#ap', o).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; cfg.provider = b.dataset.p; $$('#ap button', o).forEach((x) => x.classList.toggle('on', x === b)); $('#am', o).placeholder = AIDEF[cfg.provider].model; }; },
    collect: (o) => ({ provider: cfg.provider, key: $('#ak', o).value.trim(), model: $('#am', o).value.trim() }),
  });
  if (r.k === 'ok') { A.ai.set(r.v); A.toast(r.v.key ? 'AI settings saved' : 'No key entered'); return !!r.v.key; }
  if (r.k === 'rm') { A.ai.set({ provider: cfg.provider, key: '', model: '' }); A.toast('API key removed'); }
  return false;
};

const toB64 = (canvas, maxSide = 2000, q = 0.88) => {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height)); let c = canvas;
  if (k < 1) { c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); }
  return c.toDataURL('image/jpeg', q).split(',')[1];
};
/* send one page image to the chosen AI provider and get Markdown text back */
A.aiOcr = async (canvas) => {
  const cfg = A.ai.get(); if (!cfg.key) throw new Error('No API key saved'); const model = cfg.model || AIDEF[cfg.provider].model, data = toB64(canvas);
  const call = async () => {
    let res, j;
    if (cfg.provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'text', text: AI_PROMPT }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + data } }] }] }) });
      j = await res.json().catch(() => ({})); if (!res.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Request failed (' + res.status + ')'), { status: res.status });
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    }
    if (cfg.provider === 'claude') {
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }, { type: 'text', text: AI_PROMPT }] }] }) });
      j = await res.json().catch(() => ({})); if (!res.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Request failed (' + res.status + ')'), { status: res.status });
      return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    }
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key }, body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data } }, { text: AI_PROMPT }] }] }) });
    j = await res.json().catch(() => ({})); if (!res.ok) throw Object.assign(new Error((j.error && j.error.message) || 'Request failed (' + res.status + ')'), { status: res.status });
    return ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('');
  };
  try { return await call(); } catch (e) { if (e.status === 429 || e.status === 503) { await sleep(5000); return call(); } throw e; }
};

/* offline OCR worker (Arabic + English models are bundled in the app) */
A.ocrWorker = async (langs) => {
  if (A._ow && A._ow.langs === langs) return A._ow.w; await A.ocrDone();
  const base = new URL('lib/ocr/', location.href).href;
  const w = await Tesseract.createWorker(langs, 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base + 'lang', workerBlobURL: false, gzip: true });
  A._ow = { w, langs }; return w;
};
A.ocrDone = async () => { if (A._ow) { try { await A._ow.w.terminate(); } catch (e) { /* ignore */ } A._ow = null; } };
A.ocrLocal = async (canvas, langs) => { const w = await A.ocrWorker(langs); const r = await w.recognize(canvas); return r.data.text || ''; };

/* does extracted text look like garbage (wrong font mapping, symbols)? */
A.isGarbled = (t) => {
  const s = t.replace(/\s+/g, ''); if (s.length < 12) return false; let bad = 0;
  for (const ch of s) { if (/[\p{L}\p{N}.,;:!?()'"\-–—«»،؛؟%/\\[\]{}*&@#+=<>_|•…]/u.test(ch)) continue; bad++; }
  return bad / s.length > 0.25 || /[\uE000-\uF8FF\uFFFD]/.test(s) && (s.match(/[\uE000-\uF8FF\uFFFD]/g) || []).length / s.length > 0.05;
};
/* render one PDF page to a canvas sized for recognition */
A.pageCanvas = async (pdf, n, targetW = 2000) => {
  const p = await pdf.getPage(n), v1 = p.getViewport({ scale: 1 }), sc = clamp(targetW / v1.width, 1.5, 3.5), v = p.getViewport({ scale: sc }), c = document.createElement('canvas'); c.width = Math.floor(v.width); c.height = Math.floor(v.height);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: x, viewport: v }).promise; return c;
};
/* Markdown (from AI) → plain paragraphs for Word / text */
A.mdToParas = (md) => {
  const out = []; let buf = [];
  const flush = () => { if (buf.length) { out.push({ t: buf.join(' ').trim(), h: 12, head: false }); buf = []; } };
  for (let line of md.replace(/\r/g, '').split('\n')) {
    const l = line.trim(); if (!l) { flush(); continue; }
    const hd = l.match(/^(#{1,6})\s+(.*)$/); if (hd) { flush(); out.push({ t: hd[2].replace(/[*_`]/g, '').trim(), h: 20, head: true }); continue; }
    if (/^\|?[\s:-]+\|[\s|:-]*$/.test(l)) continue;
    if (l.includes('|') && /^\|.*\|$/.test(l)) { flush(); out.push({ t: l.slice(1, -1).split('|').map((c) => c.replace(/[*_`]/g, '').trim()).join('   '), h: 12, head: false }); continue; }
    const li = l.match(/^[-*+]\s+(.*)$/) || l.match(/^\d+[.)]\s+(.*)$/); if (li) { flush(); out.push({ t: '• ' + li[1].replace(/[*_`]/g, ''), h: 12, head: false }); continue; }
    buf.push(l.replace(/\*\*|__|`/g, ''));
  }
  flush(); return out;
};
