#!/usr/bin/env node
// Costruzione dell'indice di impronte di Matita Rossoblù da Common Crawl (Node 20+).
//
//   node costruisci.js elenca  --da grezzo.jsonl --dominio skuola.net [--filtro REGEXP] --lavoro DATI/elenchi
//   node costruisci.js scarica --dati DATI --tag ID [--ritmo 1.5] [--minuti 300 | --fine EPOCH_MS] [--max N]
//   node costruisci.js unisci  --dati DATI --uscita indice/ --archivio ETICHETTA --data AAAA-MM --dal AAAA-MM
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
// righe JSON di un file, nell'ordine (la posizione conta): null per una riga illeggibile, come l'ultima di una
// corsa interrotta a metà scrittura; il file mancante vale vuoto
function righe(f) {
  if (!fs.existsSync(f)) return [];
  const t = fs.readFileSync(f, 'utf8'), out = [];
  if (!t) return out;
  for (const ln of (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n')) { if (!ln) { out.push(null); continue; } try { out.push(JSON.parse(ln)); } catch (e) { out.push(null); } }
  return out;
}

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

// ---------- lettura delle pagine: lenta, educata e riprendibile ----------
// Legge da DATI/elenchi/elenco-*.jsonl le pagine non ancora fatte (in DATI/parti/<sito>/*.jsonl ci sono quelle lette,
// in *-saltati.txt quelle da non riprovare), alternando i siti, al ritmo di --ritmo richieste al secondo da una sola
// macchina e fino a --fine (millisecondi epoch) o per --minuti minuti. Se Common Crawl risponde 403, 429 o 503
// (limite di frequenza del suo firewall) tutta la lettura si ferma 5 minuti e la pagina torna in coda; dopo 4 pause
// di fila senza progressi la corsa finisce e salva quanto letto. Per ogni pagina si salvano solo impronte, indirizzo,
// titolo, numero di parole e un hash del testo (per riconoscere i doppioni nelle corse successive).
async function scarica() {
  const dati = args.dati, tag = String(args.tag || Date.now()), conc = +(args.concorrenza || 2);
  // ritmo adattivo da una sola macchina: sale di 0,5 ogni 5 minuti senza rifiuti, si dimezza a ogni rifiuto
  let ritmo = +(args.ritmo || 1.5);
  const ritmoMax = +(args['ritmo-max'] || ritmo), ritmoMin = +(args['ritmo-min'] || 0.5);
  let ultimoCambio = Date.now();
  const passoMs = +(args.passo || 5 * 60000);   // intervallo senza rifiuti prima di accelerare (si cambia solo nei test)
  const fine = args.fine ? +args.fine : Date.now() + (+(args.minuti || 300)) * 60000;
  const pausaMs = +(args.pausa || 5 * 60000);   // pausa dopo un rifiuto per frequenza (si cambia solo nei test)
  const elenchi = fs.readdirSync(path.join(dati, 'elenchi')).filter(f => /^elenco-.+\.jsonl$/.test(f));
  const h = u => parseInt(crypto.createHash('md5').update(u).digest('hex').slice(0, 8), 16);
  const seenText = new Set(), code = [];
  let tot = 0;
  for (const f of elenchi) {
    const dom = f.slice('elenco-'.length, -'.jsonl'.length);
    const dir = path.join(dati, 'parti', dom);
    const fatti = new Set();
    if (fs.existsSync(dir)) for (const g of fs.readdirSync(dir)) {
      if (/^[^-]+\.jsonl$/.test(g)) for (const d of righe(path.join(dir, g))) { if (!d) continue; fatti.add(d.url); if (d.h) seenText.add(d.h); }
      if (/-saltati\.txt$/.test(g)) for (const u of fs.readFileSync(path.join(dir, g), 'utf8').split('\n')) if (u) fatti.add(u);
    }
    const max = +(args['max-' + dom] || args.max || 1e9);
    const todo = fs.readFileSync(path.join(dati, 'elenchi', f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      .filter(r => !fatti.has(r.url)).map(r => [h(r.url), r]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const room = Math.max(0, max - fatti.size);
    code.push({ dom, todo: todo.slice(0, room) });
    tot += Math.min(todo.length, room);
    log(dom, ': già fatte', fatti.size, '· da leggere', Math.min(todo.length, room));
  }
  // coda unica che alterna i siti
  const queue = [];
  for (let i = 0; code.some(c => i < c.todo.length); i++) for (const c of code) if (i < c.todo.length) queue.push({ dom: c.dom, r: c.todo[i], tries: 0 });
  log('in coda', queue.length, 'pagine, ritmo', ritmo, 'al secondo, fine', new Date(fine).toISOString().slice(11, 16));
  // file di uscita per sito: sempre nuovi (una corsa ripetuta con lo stesso tag non tocca quelli già salvati)
  // e divisi oltre --max-parte byte, perché GitHub rifiuta i file oltre 100 MB
  const maxParte = +(args['max-parte'] || 40e6);
  const out = new Map();
  const apri = (dom, k) => {
    const dir = path.join(dati, 'parti', dom); fs.mkdirSync(dir, { recursive: true });
    let nome;
    for (;; k++) { nome = tag + (k ? '_' + k : ''); if (!['.bin', '.jsonl', '-saltati.txt'].some(e => fs.existsSync(path.join(dir, nome + e)))) break; }
    return { k, n: 0, bytes: 0, fp: fs.openSync(path.join(dir, nome + '.bin'), 'w'), doc: fs.openSync(path.join(dir, nome + '.jsonl'), 'w'),
      camp: fs.openSync(path.join(dir, nome + '-campioni.jsonl'), 'w'), salt: fs.openSync(path.join(dir, nome + '-saltati.txt'), 'w') };
  };
  const chiudi = o => { for (const k of ['fp', 'doc', 'camp', 'salt']) fs.closeSync(o[k]); };
  const outFor = dom => {
    let o = out.get(dom);
    if (o && o.bytes > maxParte) { chiudi(o); o = null; }
    if (!o) { const prev = out.get(dom); o = apri(dom, prev ? prev.k + 1 : 0); out.set(dom, o); }
    return o;
  };
  const cache = new Map();
  let next = Date.now(), pausaFino = 0, pause = 0, ok = 0, saltate = 0, short = 0, dup = 0, limiti = 0, bytes = 0, stop = false, lastOk = 0;
  const t0 = Date.now();
  async function turno() {
    for (;;) {
      const now = Date.now();
      if (now < pausaFino) { await sleep(Math.min(pausaFino - now, 10000)); continue; }
      if (ritmo < ritmoMax && now - ultimoCambio > passoMs) { ritmo = Math.min(ritmoMax, ritmo + 0.5); ultimoCambio = now; log('nessun rifiuto di recente: ritmo', ritmo, 'al secondo'); }
      const t = Math.max(now, next); next = t + 1000 / ritmo;
      if (t > now) await sleep(t - now);
      return;
    }
  }
  const salta = (dom, url) => { saltate++; fs.writeSync(outFor(dom).salt, url + '\n'); };
  async function one(item) {
    const { dom, r } = item;
    await turno();
    let res;
    try { res = await fetch('https://data.commoncrawl.org/' + r.filename, { headers: { 'User-Agent': UA, Range: 'bytes=' + r.offset + '-' + (r.offset + r.length - 1) } }); }
    catch (e) { if (++item.tries < 3) queue.unshift(item); else salta(dom, r.url); return; }
    if ([403, 429, 503].includes(res.status)) {
      await res.arrayBuffer().catch(() => {});
      limiti++; queue.unshift(item);
      if (Date.now() >= pausaFino) {
        pause = ok > lastOk ? 1 : pause + 1; lastOk = ok;
        if (pause > 4) { stop = true; log('limite di Common Crawl: troppe pause senza progressi, mi fermo'); return; }
        pausaFino = Date.now() + pausaMs * pause;
        ritmo = Math.max(ritmoMin, ritmo / 2); ultimoCambio = Date.now();
        log('limite di Common Crawl (' + res.status + '): pausa di', Math.round(pausaMs * pause / 1000), 'secondi, poi ritmo', ritmo, 'al secondo');
      }
      return;
    }
    if (res.status !== 206) { await res.arrayBuffer().catch(() => {}); salta(dom, r.url); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    bytes += buf.length;
    let w; try { w = parseWarc(buf); } catch (e) { w = null; }
    if (!w) { salta(dom, r.url); return; }
    const { title, text } = extract(decode(w.body, w.http));
    const toks = MR.tokenize(text);
    if (toks.length < 80) { short++; salta(dom, r.url); return; }
    const th = crypto.createHash('md5').update(toks.slice(0, 400).map(t => t.w).join(' ')).digest('hex').slice(0, 16);
    if (seenText.has(th)) { dup++; salta(dom, r.url); return; }
    seenText.add(th);
    if (cache.size > 3e6) cache.clear();
    const uniq = new Map();
    for (const f of X.fingerprints(toks, { cache })) uniq.set(f.a + ':' + f.b, f);
    const o = outFor(dom);
    const rec = Buffer.alloc(8 + uniq.size * 8);
    rec.writeUInt32LE(o.n, 0); rec.writeUInt32LE(uniq.size, 4);
    let off = 8;
    for (const f of uniq.values()) { rec.writeUInt32LE(f.a, off); rec.writeUInt32LE(f.b, off + 4); off += 8; }
    fs.writeSync(o.fp, rec);
    o.bytes += rec.length;
    fs.writeSync(o.doc, JSON.stringify({ url: r.url, title: title.slice(0, 160), parole: toks.length, h: th }) + '\n');
    // verifica: per circa una pagina su 400 le impronte (non il testo) di estratti di 40 e 80 parole
    if (h(r.url) % 400 === 7 && toks.length >= 140) {
      const start = 10 + (h(r.url + '#') % (toks.length - 100)), camp = { url: r.url };
      for (const L of [40, 80]) camp['f' + L] = X.fingerprints(toks.slice(start, start + L), { cache }).map(f => [f.a, f.b, f.pos]);
      fs.writeSync(o.camp, JSON.stringify(camp) + '\n');
    }
    o.n++; ok++;
  }
  let done = 0;
  async function worker() {
    while (!stop && Date.now() < fine) {
      const item = queue.shift();
      if (!item) return;
      try { await one(item); } catch (e) { salta(item.dom, item.r.url); }
      if (++done % 500 === 0) log(done + '/' + tot, '· lette', ok, '· saltate', saltate, '(brevi', short, ', doppie', dup + ')', '· limiti', limiti, '·', Math.round(bytes / 1e6) + ' MB', '·', (ok / ((Date.now() - t0) / 1000)).toFixed(2) + '/s');
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  for (const o of out.values()) chiudi(o);
  log('fine: lette', ok, '· saltate', saltate, '· limiti', limiti, '· restano', queue.length, '·', Math.round(bytes / 1e6) + ' MB in', Math.round((Date.now() - t0) / 60000), 'min');
  fs.writeFileSync(path.join(args.dati, 'ultima-corsa.json'), JSON.stringify({ tag, lette: ok, saltate, limiti, restano: queue.length, ritmo, minuti: Math.round((Date.now() - t0) / 60000) }, null, 1));
}

// ---------- unione delle parti e scrittura dell'indice ----------
async function unisci() {
  const dati = args.dati, out = args.uscita;
  const R = new Raccolta(1 << 22), docs = [], siti = new Map(), camp = [];
  const base = path.join(dati, 'parti');
  for (const dom of (fs.existsSync(base) ? fs.readdirSync(base).sort() : [])) {
    for (const f of fs.readdirSync(path.join(base, dom)).filter(g => /^[^-]+\.bin$/.test(g)).sort()) {
      const tag = f.slice(0, -4);
      const meta = righe(path.join(base, dom, tag + '.jsonl'));
      const buf = fs.readFileSync(path.join(base, dom, f));
      let o = 0;
      while (o + 8 <= buf.length) {
        const local = buf.readUInt32LE(o), n = buf.readUInt32LE(o + 4); o += 8;
        if (!meta[local] || o + n * 8 > buf.length) break;   // corsa interrotta a metà record
        const id = docs.length;
        docs.push({ url: meta[local].url, title: meta[local].title });
        for (let i = 0; i < n; i++, o += 8) R.add(buf.readUInt32LE(o), buf.readUInt32LE(o + 4), id);
        siti.set(dom, (siti.get(dom) || 0) + 1);
      }
      const cf = path.join(base, dom, tag + '-campioni.jsonl');
      if (fs.existsSync(cf)) for (const c of righe(cf)) if (c) camp.push(c);
    }
    log('unito', dom, '· documenti', docs.length, '· impronte', R.n);
  }
  const m = scriviIndice(out, docs, R, { archivio: args.archivio || '', archivioData: args.data || '', archivioDal: typeof args.dal === 'string' ? args.dal : '', siti: Array.from(siti, ([dominio, documenti]) => ({ dominio, documenti })).sort((a, b) => b.documenti - a.documenti) });
  log('indice:', m.documenti, 'documenti,', m.voci, 'voci,', m.scartate, 'scartate,', m.files, 'file di impronte (' + m.bits + ' bit), il più grande di', m.maxFile, 'byte');
  // verifica sull'indice appena scritto, con lo stesso codice di ricerca del browser
  const idx = X.createIndex('indice/', { fetch: fileFetch(out) });
  const ver = { campioni: camp.length };
  for (const L of [40, 80]) {
    let found = 0, any = 0;
    for (const c of camp) {
      const { hits } = await idx.lookup(c['f' + L].map(([a, b, pos]) => ({ a, b, pos })));
      let okc = false, some = false;
      for (const [id, pos] of hits) {
        if (docs[id].url !== c.url) continue;
        some = true;
        if (X.passages(pos, m.k, m.w).some(p => p.n >= 2)) okc = true;
      }
      if (okc) found++;
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
