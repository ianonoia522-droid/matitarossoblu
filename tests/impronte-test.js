// Test delle impronte (js/impronte.js) e dell'indice statico (tools/indice/scrittore.js), senza rete.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const MR = require('../js/engine.js');
const X = require('../js/impronte.js');
const { Raccolta, scriviIndice } = require('../tools/indice/scrittore.js');

// generatore pseudo-casuale riproducibile
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; s = (s ^ (s >>> 12)) >>> 0; return s / 4294967296; }; }
const VOC = ('acqua terra fuoco aria città fiume monte valle mare lago bosco campo strada ponte torre chiesa castello porto isola regione ' +
  'provincia comune storia guerra pace trattato impero regno repubblica popolo esercito battaglia vittoria sconfitta conquista alleanza ' +
  'economia commercio industria agricoltura moneta mercato lavoro operai contadini nobili clero sovrano ministro parlamento legge ' +
  'costituzione diritto libertà cultura arte pittura scultura musica teatro poesia romanzo autore opera secolo periodo epoca anno').split(' ');
const STOPS = 'il la di e che in un una per con del della nel sul non si'.split(' ');
function words(r, n) { const out = []; for (let i = 0; i < n; i++) out.push(r() < 0.3 ? STOPS[Math.floor(r() * STOPS.length)] : VOC[Math.floor(r() * VOC.length)] + (r() < 0.5 ? '' : String.fromCharCode(97 + Math.floor(r() * 26)))); return out; }
const text = arr => arr.join(' ');

// fetch finta che serve i file dell'indice da disco, interi come un server statico
function fakeFetch(dir) {
  const log = [];
  const fn = async (url, init) => {
    const u = new URL(url, 'https://x/');
    const file = path.join(dir, decodeURIComponent(u.pathname.replace(/^\/indice\//, '')));
    log.push({ url, range: init && init.headers && init.headers.Range });
    if (!fs.existsSync(file)) return { ok: false, status: 404, headers: { get: () => null } };
    const buf = fs.readFileSync(file);
    return { ok: true, status: 200, headers: { get: k => (k === 'Content-Length' ? String(buf.length) : null) }, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), json: async () => JSON.parse(buf.toString()) };
  };
  fn.log = log;
  return fn;
}

module.exports = async function (expect) {
  const r = rng(42), cache = new Map();
  const fpOf = s => X.fingerprints(MR.tokenize(s), { cache });

  // garanzia del winnowing: un passaggio identico di W + K - 1 parole condivide almeno un'impronta
  let worst = Infinity, misses = 0;
  for (let t = 0; t < 200; t++) {
    const src = words(r, 400), own1 = words(r, 120), own2 = words(r, 120);
    const at = Math.floor(r() * 300), L = X.W + X.K - 1;
    const stud = own1.concat(src.slice(at, at + L), own2);
    const fs1 = new Set(fpOf(text(src)).map(f => f.a + ':' + f.b));
    const common = fpOf(text(stud)).filter(f => fs1.has(f.a + ':' + f.b)).length;
    worst = Math.min(worst, common);
    if (!common) misses++;
  }
  expect('winnowing: ogni passaggio identico di ' + (X.W + X.K - 1) + ' parole viene trovato', misses === 0, 'minimo ' + worst + ' impronte in comune su 200 prove');
  const dens = fpOf(text(words(r, 5000))).length / 5000;
  expect('densità delle impronte vicina a 2/(W+1)', dens > 0.05 && dens < 0.11, (dens * 100).toFixed(1) + '%');
  const generic = X.fingerprints(MR.tokenize('e il di che la per un in non si e il di che la per un in non si e il di che la'), {});
  expect('le sequenze di sole parole vuote non producono impronte', generic.length === 0);

  // indice completo su disco e ricerca come nel browser
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'indice-'));
  const R = new Raccolta(1024), docs = [];
  const boiler = words(r, 40);   // menu e piè di pagina ripetuti su tutte le pagine
  const SRC = words(r, 600);
  for (let d = 0; d < 300; d++) {
    const body = d === 137 ? SRC : words(r, 300 + Math.floor(r() * 400));
    docs.push({ url: 'https://esempio.it/pagina-' + d, title: 'Pagina ' + d });
    R.addDoc(fpOf(text(boiler.concat(body, boiler))), d);
  }
  const meta = scriviIndice(tmp, docs, R, { archivio: 'CC-PROVA', dfMax: 8, docShard: 100, bits: 8, siti: [{ dominio: 'esempio.it', documenti: 300 }] });
  expect('indice scritto in file piccoli, voci ripetute su molte pagine scartate', meta.files === 256 && fs.readdirSync(path.join(tmp, 'fp')).length === 256 && meta.scartate > 0 && meta.voci > 0, meta.files + ' file, ' + meta.voci + ' voci, ' + meta.scartate + ' scartate, il più grande di ' + meta.maxFile + ' byte');
  const own = words(r, 150), copied = SRC.slice(200, 280), own2 = words(r, 150);
  const studText = text(own.concat(copied, own2, boiler));
  const toks = MR.tokenize(studText);
  const ff = fakeFetch(tmp);
  const idx = X.createIndex('/indice/', { fetch: ff });
  const res = await idx.search(toks, null, {});
  const top = res.docs[0];
  expect('la pagina copiata viene trovata per prima', top && top.url === 'https://esempio.it/pagina-137', top && top.url);
  const p = top && top.passages.find(q => q.te > 150 && q.ti < 230);
  expect('passaggio ricostruito sulla parte copiata', p && top.passages.length === 1 && p.ti >= 150 && p.ti <= 150 + X.W && p.te <= 230 && p.te >= 230 - X.W, top && top.passages.map(q => q.ti + '-' + q.te).join(', ') + ' (copiato: 150-230)');
  expect('il menu ripetuto su tutte le pagine non dà corrispondenze', res.docs.length === 1, res.docs.map(d => d.url).join(', '));
  const read = ff.log.filter(l => /\/fp\//.test(l.url));
  expect('scaricati interi solo i file che servono, senza richieste parziali', read.length >= 1 && read.length <= res.fingerprints && read.length < 64 && !ff.log.some(l => l.range), read.length + ' file su 256 per ' + res.fingerprints + ' impronte');
  const excl = new Uint8Array(toks.length); for (let i = 150; i < 230; i++) excl[i] = 1;
  const resEx = await X.createIndex('/indice/', { fetch: fakeFetch(tmp) }).search(toks, excl, {});
  expect('le parti escluse (citazioni) non vengono cercate', resEx.docs.length === 0, resEx.docs.length);
  const big = scriviIndice(path.join(tmp, 'auto'), docs, R, { archivio: 'CC-PROVA' });
  expect('numero di file scelto in base alla dimensione', big.bits >= 2 && big.maxFile < 30000, big.files + ' file, il più grande di ' + big.maxFile + ' byte');
  let err = null;
  try { await X.createIndex('/manca/', { fetch: fakeFetch(tmp) }).search(toks, null, {}); } catch (e) { err = e; }
  expect('indice assente: errore chiaro', err && err.kind === 'missing', err && err.kind);
  fs.rmSync(tmp, { recursive: true, force: true });
};
