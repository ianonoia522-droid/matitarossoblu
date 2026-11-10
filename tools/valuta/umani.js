#!/usr/bin/env node
// Testi scritti da persone per valutare il rilevatore di testi generati. Di ogni testo si salvano solo i segnali
// (numeri), il titolo o il sito di provenienza: il testo resta in memoria il tempo del calcolo.
//
//   node umani.js wikipedia --n 150 --out umani-wikipedia.jsonl
//       voci casuali di Wikipedia in italiano, nella versione precedente a novembre 2022 (prima di ChatGPT)
//   node umani.js mc4 --file a.json.gz,b.json.gz --n-studio 300 --n-web 300 --out umani-mc4.jsonl
//   node umani.js mc4 --parti 10-34 --n-temi 150 --n-studio 75 --n-web 0 --out umani-mc4-1.jsonl
//       pagine web italiane raccolte nel 2019-2020 (mC4): temi e componimenti (dall'indirizzo), siti di studio
//       e un campione del resto del web
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { segnali } = require('./segnali.js');

const UA = 'MatitaRossoblu-valutazione/0.1 (+https://github.com/ianonoia522-droid/matitarossoblu)';
const args = (() => { const a = {}, v = process.argv.slice(3); for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) a[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith('--') ? v[++i] : true; return a; })();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...m) => console.error(new Date().toISOString().slice(11, 19), ...m);
let seed = 20221130;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const conta = s => s.split(/\s+/).filter(Boolean).length;

// lunghezza da tema: paragrafi interi fino a circa `target` parole
function taglia(paragrafi, target) {
  const out = []; let n = 0;
  for (const p of paragrafi) {
    const w = conta(p);
    if (n && n + w > target * 1.2) break;
    out.push(p); n += w;
    if (n >= target) break;
  }
  return { testo: out.join('\n\n'), parole: n };
}

async function api(params) {
  const u = 'https://it.wikipedia.org/w/api.php?' + new URLSearchParams(Object.assign({ format: 'json', formatversion: '2' }, params));
  for (let i = 0, d = 5000; ; i++) {
    let res;
    try { res = await fetch(u, { headers: { 'User-Agent': UA } }); } catch (e) { res = { ok: false, status: 0 }; }
    if (res.ok) return res.json();
    if (i < 6 && (res.status === 0 || res.status === 429 || res.status >= 500)) { log('Wikipedia', res.status, ': attendo', d / 1000, 's'); await sleep(d); d *= 2; continue; }
    throw new Error('Wikipedia: stato ' + res.status);
  }
}

async function wikipedia() {
  const { parseHTML } = require(path.join(__dirname, '..', 'indice', 'node_modules', 'linkedom'));
  const n = +(args.n || 150), out = [], visti = new Set();
  let provate = 0;
  while (out.length < n) {
    const r = await api({ action: 'query', list: 'random', rnnamespace: 0, rnlimit: 100 }); await sleep(500);
    const titoli = r.query.random.map(x => x.title).filter(t => !visti.has(t));
    titoli.forEach(t => visti.add(t));
    for (let i = 0; i < titoli.length && out.length < n; i += 50) {
      const info = await api({ action: 'query', prop: 'info', titles: titoli.slice(i, i + 50).join('|') }); await sleep(500);
      for (const pg of info.query.pages) {
        if (out.length >= n || !pg.length || pg.length < 6000) continue;
        provate++;
        try {
          const rv = await api({ action: 'query', prop: 'revisions', titles: pg.title, rvlimit: 1, rvstart: '2022-10-31T00:00:00Z', rvdir: 'older', rvprop: 'ids|timestamp' }); await sleep(500);
          const rev = rv.query && rv.query.pages[0] && rv.query.pages[0].revisions && rv.query.pages[0].revisions[0];
          if (!rev) continue;   // voce creata dopo
          const p = await api({ action: 'parse', oldid: rev.revid, prop: 'text', disablelimitreport: 1, disableeditsection: 1 }); await sleep(500);
          if (!p.parse || typeof p.parse.text !== 'string') continue;   // versione nascosta o cancellata
          const { document } = parseHTML('<!doctype html><html><body>' + p.parse.text + '</body></html>');
          const par = Array.from(document.querySelectorAll('.mw-parser-output > p'))
            .map(e => e.textContent.replace(/\[(?:\d+|[a-z]|N \d+|nota \d+|senza fonte|citazione necessaria|chiarimenti necessari)\]/gi, '').replace(/\s+/g, ' ').trim())
            .filter(t => conta(t) >= 15);
          const t = taglia(par, 250 + Math.floor(rnd() * 650));
          if (t.parole < 200) continue;
          out.push(Object.assign({ fonte: 'wikipedia', titolo: pg.title, revid: rev.revid, data: rev.timestamp.slice(0, 10) }, segnali(t.testo)));
        } catch (e) { log('salto', pg.title, ':', e.message); continue; }
        if (out.length % 10 === 0) log('Wikipedia:', out.length, 'testi su', provate, 'voci lunghe provate');
      }
    }
  }
  return out;
}

// siti di studio e di appunti (elenco chiuso: con parole come "studio" o "temi" nel nome entravano anche studi
// legali e aziende di sistemi). Il resto è "web".
const STUDIO = /(?:^|\.)(?:studenti\.it|skuola\.net|studentville\.it|atuttascuola\.it|homolaicus\.com|studiarapido\.it|scuolissima\.com|tesionline\.it|docsity\.com|oilproject\.org|weschool\.com|sapere\.it|appuntimania\.it|riassuntiok\.com|nienteansia\.it|maestrasabry\.it|ilsapere\.org|parafrasando\.it)$/;
// pagine che dall'indirizzo sembrano temi o componimenti, su qualunque sito (scuole, blog, siti di studio):
// sono il confronto più vicino ai compiti veri. "tema" da solo non basta (pagine di categoria, temi grafici).
const TEMA = /(?:^|[\/\-_.])(?:tem[ai][-_](?:svolt|sull?|sulla|sui|sugli|sulle|su[-_]|di[-_]|argomentativ|descrittiv|espositiv|narrativ|riflessiv|per[-_]|scolastic|d[-_]italiano|italiano)|temisvolti|temi[-_]saggi|saggi?o?[-_]brev|componiment[oi][-_]|testo[-_]argomentativo|testi[-_]argomentativi)/i;

// righe di un file .json.gz, locale o scaricato al momento (senza salvarlo su disco)
async function* righeGz(sorgente) {
  let input;
  if (/^https?:/.test(sorgente)) {
    const res = await fetch(sorgente, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error('stato ' + res.status);
    input = require('stream').Readable.fromWeb(res.body);
  } else input = fs.createReadStream(sorgente);
  const gz = input.pipe(zlib.createGunzip());
  try {
    for await (const ln of readline.createInterface({ input: gz, crlfDelay: Infinity })) yield ln;
  } finally { input.destroy(); gz.destroy(); }
}

async function mc4() {
  // --file a.json.gz,b.json.gz oppure --parti 10-34 (scaricate da --base, una alla volta)
  let fonti = String(args.file || '').split(',').filter(Boolean);
  if (args.parti) {
    const [a, b] = String(args.parti).split('-').map(Number);
    const base = args.base || 'https://huggingface.co/datasets/allenai/c4/resolve/main/multilingual';
    for (let i = a; i <= (b || a); i++) fonti.push(base + '/c4-it.tfrecord-' + String(i).padStart(5, '0') + '-of-01024.json.gz');
  }
  const max = { temi: +(args['n-temi'] || 0), studio: +(args['n-studio'] || 300), web: +(args['n-web'] || 300) };
  const out = { temi: [], studio: [], web: [] };
  const pieno = () => Object.keys(max).every(k => out[k].length >= max[k]);
  let righe = 0;
  for (const f of fonti) {
    if (pieno()) break;
    try {
      for await (const ln of righeGz(f)) {
        righe++;
        if (pieno()) break;
        let d; try { d = JSON.parse(ln); } catch (e) { continue; }
        let u; try { u = new URL(d.url); } catch (e) { continue; }
        const host = u.host.replace(/^www\./, '');
        const tipo = TEMA.test(u.pathname) ? 'temi' : STUDIO.test(host) ? 'studio' : 'web';
        if (out[tipo].length >= max[tipo]) continue;
        if (tipo === 'web' && rnd() > 0.02) continue;
        const par = String(d.text || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (conta(par.join(' ')) < 250) continue;
        const t = taglia(par, 250 + Math.floor(rnd() * 650));
        if (t.parole < 200) continue;
        const s = segnali(t.testo);
        if (s.lingua !== 'it') continue;
        out[tipo].push(Object.assign({ fonte: 'mc4-' + tipo, host, url: d.url, data: String(d.timestamp || '').slice(0, 10) }, s));
      }
    } catch (e) { log('salto', path.basename(f), ':', e.message); }
    log(path.basename(f), ': righe lette', righe, '· temi', out.temi.length, '· studio', out.studio.length, '· web', out.web.length);
  }
  return out.temi.concat(out.studio, out.web);
}

if (require.main === module) {
  const cmd = process.argv[2], fn = { wikipedia, mc4 }[cmd];
  if (!fn) { console.error('uso: node umani.js wikipedia|mc4 ...'); process.exit(2); }
  fn().then(rows => {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    log('scritti', rows.length, 'testi in', args.out);
  }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { taglia, STUDIO, TEMA };
