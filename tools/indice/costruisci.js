#!/usr/bin/env node
// Costruzione dell'indice di impronte di Matita Rossoblù da Common Crawl (Node 20+).
//
//   node costruisci.js elenca  --archivio CC-MAIN-2026-43 --dominio skuola.net [--modo domain|host] --lavoro DIR
//   node costruisci.js scarica --dominio skuola.net --lavoro DIR [--parte 0/4] [--max 100000] [--concorrenza 8]
//   node costruisci.js unisci  --lavoro DIR --uscita indice/ --archivio CC-MAIN-2026-43
//
// Regole: si usano solo pagine già raccolte da Common Crawl (che rispetta robots.txt), si scartano gli indirizzi
// esclusi dal robots.txt attuale del sito per CCBot, e dell'indice fanno parte solo impronte, indirizzi e titoli.
// Il testo delle pagine resta in memoria il tempo di calcolare le impronte e non viene salvato.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const MR = require('../../js/engine.js');
const X = require('../../js/impronte.js');
const { Raccolta, scriviIndice } = require('./scrittore.js');

const UA = 'MatitaRossoblu-indice/0.1 (+https://github.com/ianonoia522-droid/matitarossoblu)';
const args = (() => { const a = {}, v = process.argv.slice(3); for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) a[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith('--') ? v[++i] : true; return a; })();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...m) => console.error(new Date().toISOString().slice(11, 19), ...m);

async function fetchRetry(url, init, tries) {
  let delay = 2000;
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, Object.assign({ headers: { 'User-Agent': UA } }, init || {}, { headers: Object.assign({ 'User-Agent': UA }, (init && init.headers) || {}) }));
      if ([429, 500, 502, 503, 504].includes(res.status) && i < (tries || 6)) { await res.arrayBuffer().catch(() => {}); await sleep(delay); delay = Math.min(delay * 2, 120000); continue; }
      return res;
    } catch (e) {
      if (i >= (tries || 6)) throw e;
      await sleep(delay); delay = Math.min(delay * 2, 120000);
    }
  }
}

// ---------- elenco delle pagine ----------
// Fonte: un file di righe in formato CDX (--da, prodotto da elenca_colonne.py dall'indice a colonne di Common Crawl)
// oppure, in mancanza, il server CDX index.commoncrawl.org. Si tengono le pagine HTML in italiano con stato 200,
// ammesse dal robots.txt attuale del sito e dal filtro facoltativo; per ogni indirizzo la cattura più recente.
async function elenca() {
  const archivio = args.archivio, dom = args.dominio, modo = args.modo || 'domain', dir = args.lavoro;
  fs.mkdirSync(dir, { recursive: true });
  const filtro = typeof args.filtro === 'string' && args.filtro ? new RegExp(args.filtro) : null;
  const cand = [];
  let lines = 0;
  const consider = (ln) => {
    if (!ln) return;
    lines++;
    let r; try { r = JSON.parse(ln); } catch (e) { return; }
    const mime = r['mime-detected'] || r.mime || '';
    if (String(r.status) !== '200' || !/html/.test(mime) || !/ita/.test(r.languages || '')) return;
    if (filtro && !filtro.test(r.url)) return;
    cand.push(r);
  };
  if (typeof args.da === 'string') {
    for (const ln of fs.readFileSync(args.da, 'utf8').split('\n')) consider(ln);
  } else {
    const base = 'https://index.commoncrawl.org/' + archivio + '-index?url=' + encodeURIComponent(dom) + '&matchType=' + modo;
    const first = await fetchRetry(base + '&showNumPages=true');
    const body = await first.text();
    if (!first.ok) throw new Error('server CDX: stato ' + first.status + ' ' + body.slice(0, 80));
    const pages = +JSON.parse(body.trim().split('\n').pop()).pages || 0;
    log(dom, 'pagine CDX', pages);
    for (let p = 0; p < pages; p++) {
      const res = await fetchRetry(base + '&output=json&page=' + p);
      if (res.status === 404) break;
      if (!res.ok) throw new Error('CDX pagina ' + p + ': ' + res.status);
      for (const ln of (await res.text()).split('\n')) consider(ln);
      if (p % 10 === 9) log(dom, 'pagina', p + 1, 'di', pages, '·', best.size, 'indirizzi');
      await sleep(800);
    }
  }
  // robots.txt attuale, host per host (www.sito.it e sito.it hanno ciascuno il proprio)
  const hosts = new Map();
  for (const r of cand) { const hst = new URL(r.url).host; hosts.set(hst, (hosts.get(hst) || 0) + 1); }
  const robots = new Map();
  for (const [hst] of Array.from(hosts).sort((a, b) => b[1] - a[1]).slice(0, 40)) robots.set(hst, await robotsHost(hst));
  const best = new Map();
  let kept = 0, blocked = 0;
  for (const r of cand) {
    const rb = robots.get(new URL(r.url).host);
    if (rb && rb.isAllowed(r.url, 'CCBot') === false) { blocked++; continue; }
    const key = r.url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    const prev = best.get(key);
    if (!prev || r.timestamp > prev.timestamp) best.set(key, { url: r.url, filename: r.filename, offset: +r.offset, length: +r.length, timestamp: r.timestamp });
    kept++;
  }
  const out = path.join(dir, 'elenco-' + dom + '.jsonl');
  fs.writeFileSync(out, Array.from(best.values()).map(x => JSON.stringify(x)).join('\n') + '\n');
  log(dom, 'righe', lines, '· HTML in italiano', cand.length, '· escluse dal robots.txt attuale', blocked, '· host', hosts.size, '· indirizzi unici', best.size);
}

// robots.txt di un host: null se non si riesce a leggerlo (vale la verifica fatta da Common Crawl al momento della raccolta)
async function robotsHost(host) {
  const robotsParser = require('robots-parser');
  try {
    const res = await fetchRetry('https://' + host + '/robots.txt', null, 2);
    if (res.ok) return robotsParser('https://' + host + '/robots.txt', await res.text());
    if (res.status >= 400 && res.status < 500) return robotsParser('https://' + host + '/robots.txt', '');
  } catch (e) { /* rete */ }
  return null;
}

// ---------- lettura dei record WARC ed estrazione del testo principale ----------
function parseWarc(buf) {
  const raw = zlib.gunzipSync(buf);
  const a = raw.indexOf('\r\n\r\n');
  const b = raw.indexOf('\r\n\r\n', a + 4);
  if (a < 0 || b < 0) return null;
  const http = raw.subarray(a + 4, b).toString('latin1');
  return { http, body: raw.subarray(b + 4) };
}
function decode(body, http) {
  const head = body.subarray(0, 4096).toString('latin1');
  const m = /charset=["']?([\w-]+)/i.exec(http) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  let label = m ? m[1].toLowerCase() : 'utf-8';
  try { return new TextDecoder(label).decode(body); } catch (e) { return new TextDecoder('utf-8').decode(body); }
}
const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,dd,dt,pre,td,th,figcaption';
function blockText(doc) {
  const out = [];
  for (const el of doc.querySelectorAll(BLOCKS)) {
    if (el.querySelector && el.querySelector(BLOCKS)) continue;   // solo i blocchi più interni
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out.join('\n');
}
function extract(html) {
  const { parseHTML } = require('linkedom');
  const { Readability } = require('@mozilla/readability');
  if (html.length > 3e6) html = html.slice(0, 3e6);
  const { document } = parseHTML(html);
  const title = ((document.querySelector('title') || {}).textContent || '').replace(/\s+/g, ' ').trim();
  let text = '';
  try {
    const art = new Readability(document, { charThreshold: 300 }).parse();
    if (art && art.content) text = blockText(parseHTML('<!doctype html><html><body>' + art.content + '</body></html>').document);
  } catch (e) { /* ripiego sotto */ }
  if (MR.countWords(text) < 80) text = blockText(parseHTML(html).document);
  return { title, text: text.normalize('NFC') };
}

async function scarica() {
  const dom = args.dominio, dir = args.lavoro, max = +(args.max || 1e9), conc = +(args.concorrenza || 8);
  const [pi, pn] = (args.parte || '0/1').split('/').map(Number);
  const all = fs.readFileSync(path.join(dir, 'elenco-' + dom + '.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  // campione casuale ma riproducibile: ordine dato dall'hash dell'indirizzo, non alfabetico
  const h = u => parseInt(crypto.createHash('md5').update(u).digest('hex').slice(0, 8), 16);
  const mine = all.map(r => [h(r.url), r]).filter(x => x[0] % pn === pi).sort((a, b) => a[0] - b[0]).slice(0, max).map(x => x[1]);
  log(dom, 'parte', pi + '/' + pn, ':', mine.length, 'pagine di', all.length);
  const tag = dom + '-' + pi;
  const fpOut = fs.openSync(path.join(dir, 'parziale-' + tag + '.bin'), 'w');
  const docOut = fs.openSync(path.join(dir, 'documenti-' + tag + '.jsonl'), 'w');
  const campOut = fs.openSync(path.join(dir, 'campioni-' + tag + '.jsonl'), 'w');
  const cache = new Map(), seenText = new Set();
  let next = 0, done = 0, ok = 0, short = 0, dup = 0, fail = 0, bytes = 0;
  const t0 = Date.now();
  async function one(r) {
    const res = await fetchRetry('https://data.commoncrawl.org/' + r.filename, { headers: { Range: 'bytes=' + r.offset + '-' + (r.offset + r.length - 1) } });
    if (res.status !== 206) { fail++; return; }
    const buf = Buffer.from(await res.arrayBuffer());
    bytes += buf.length;
    const w = parseWarc(buf);
    if (!w) { fail++; return; }
    const { title, text } = extract(decode(w.body, w.http));
    const toks = MR.tokenize(text);
    if (toks.length < 80) { short++; return; }
    const th = crypto.createHash('md5').update(toks.slice(0, 400).map(t => t.w).join(' ')).digest('hex');
    if (seenText.has(th)) { dup++; return; }
    seenText.add(th);
    if (cache.size > 3e6) cache.clear();
    const fps = X.fingerprints(toks, { cache });
    const uniq = new Map();
    for (const f of fps) uniq.set(f.a + ':' + f.b, f);
    const rec = Buffer.alloc(8 + uniq.size * 8);
    rec.writeUInt32LE(ok, 0); rec.writeUInt32LE(uniq.size, 4);
    let o = 8;
    for (const f of uniq.values()) { rec.writeUInt32LE(f.a, o); rec.writeUInt32LE(f.b, o + 4); o += 8; }
    fs.writeSync(fpOut, rec);
    fs.writeSync(docOut, JSON.stringify({ url: r.url, title: title.slice(0, 160), parole: toks.length }) + '\n');
    // verifica: per circa una pagina su 400 si conservano le impronte (non il testo) di estratti di 40 e 80 parole
    if (h(r.url) % 400 === 7 && toks.length >= 140) {
      const start = 10 + (h(r.url + '#') % (toks.length - 100));
      const camp = { url: r.url };
      for (const L of [40, 80]) camp['f' + L] = X.fingerprints(toks.slice(start, start + L), { cache }).map(f => [f.a, f.b, f.pos]);
      fs.writeSync(campOut, JSON.stringify(camp) + '\n');
    }
    ok++;
  }
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= mine.length) return;
      try { await one(mine[i]); } catch (e) { fail++; }
      done++;
      if (done % 1000 === 0) log(dom, done + '/' + mine.length, '· valide', ok, '· brevi', short, '· doppie', dup, '· errori', fail, '·', Math.round(bytes / 1e6) + ' MB', '·', Math.round(done / ((Date.now() - t0) / 1000)) + '/s');
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  fs.closeSync(fpOut); fs.closeSync(docOut); fs.closeSync(campOut);
  log(dom, 'fine: valide', ok, '· brevi', short, '· doppie', dup, '· errori', fail, '·', Math.round(bytes / 1e6) + ' MB in', Math.round((Date.now() - t0) / 1000) + ' s');
}

// ---------- unione delle parti e scrittura dell'indice ----------
async function unisci() {
  const dir = args.lavoro, out = args.uscita;
  const parts = fs.readdirSync(dir).filter(f => /^parziale-.+\.bin$/.test(f)).sort();
  const R = new Raccolta(1 << 22), docs = [], siti = new Map();
  for (const p of parts) {
    const tag = p.slice('parziale-'.length, -4), dom = tag.replace(/-\d+$/, '');
    const meta = fs.readFileSync(path.join(dir, 'documenti-' + tag + '.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const buf = fs.readFileSync(path.join(dir, p));
    let o = 0;
    while (o < buf.length) {
      const local = buf.readUInt32LE(o), n = buf.readUInt32LE(o + 4); o += 8;
      const id = docs.length;
      docs.push({ url: meta[local].url, title: meta[local].title });
      for (let i = 0; i < n; i++, o += 8) R.add(buf.readUInt32LE(o), buf.readUInt32LE(o + 4), id);
    }
    siti.set(dom, (siti.get(dom) || 0) + meta.length);
    log('unite', p, '· documenti', docs.length, '· impronte', R.n);
  }
  const m = scriviIndice(out, docs, R, { archivio: args.archivio || '', archivioData: args.data || '', archivioDal: typeof args.dal === 'string' ? args.dal : '', siti: Array.from(siti, ([dominio, documenti]) => ({ dominio, documenti })) });
  log('indice:', m.documenti, 'documenti,', m.voci, 'voci,', m.scartate, 'scartate,', m.files, 'file di impronte (' + m.bits + ' bit), il più grande di', m.maxFile, 'byte');
  // verifica sull'indice appena scritto, con lo stesso codice di ricerca del browser
  const camp = fs.readdirSync(dir).filter(f => /^campioni-.+\.jsonl$/.test(f)).flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
  const idx = X.createIndex('indice/', { fetch: fileFetch(out) });
  const ver = { campioni: camp.length };
  for (const L of [40, 80]) {
    let found = 0, any = 0;
    for (const c of camp) {
      const fps = c['f' + L].map(([a, b, pos]) => ({ a, b, pos }));
      const { hits } = await idx.lookup(fps);
      let ok = false, some = false;
      for (const [id, pos] of hits) {
        if (docs[id].url !== c.url) continue;
        some = true;
        if (X.passages(pos, m.k, m.w).some(p => p.n >= 2)) ok = true;
      }
      if (ok) found++;
      if (some) any++;
    }
    ver['trovati' + L] = found; ver['impronta' + L] = any;
    log('verifica', L, 'parole:', found + '/' + camp.length, 'trovati (almeno 2 impronte vicine),', any + '/' + camp.length, 'con almeno un\'impronta');
  }
  const metaPath = path.join(out, 'meta.json'), meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.verifica = ver;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
}

// lettura dei file dell'indice da disco, con le richieste parziali, come farebbe il browser
function fileFetch(root) {
  return async (u, init) => {
    const f = path.join(root, u.replace(/^indice\//, '').split('?')[0]);
    if (!fs.existsSync(f)) return { ok: false, status: 404, headers: { get: () => null } };
    const buf = fs.readFileSync(f);
    const rg = init && init.headers && init.headers.Range;
    const part = rg ? (m => buf.subarray(+m[1], +m[2] + 1))(/bytes=(\d+)-(\d+)/.exec(rg)) : buf;
    return { ok: true, status: rg ? 206 : 200, headers: { get: k => (k === 'Content-Length' ? String(part.length) : null) },
      arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.length), json: async () => JSON.parse(part.toString('utf8')) };
  };
}

if (require.main === module) {
  const cmd = process.argv[2], fn = { elenca, scarica, unisci }[cmd];
  if (!fn) { console.error('comando sconosciuto: ' + cmd + ' (elenca, scarica, unisci)'); process.exit(2); }
  Promise.resolve().then(fn).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { parseWarc, decode, extract, blockText, elenca, scarica, unisci, setArgs: a => Object.assign(args, a) };
