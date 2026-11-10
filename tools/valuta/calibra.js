#!/usr/bin/env node
// Taratura del rilevatore: regressione logistica sui valori grezzi dei segnali (quelli salvati da umani.js,
// genera.js e importa.js), con validazione che tiene fuori un modello generatore alla volta e un quarto dei
// testi umani. Confronta il modello nuovo con l'indice attuale sugli stessi testi tenuti fuori, sceglie le
// soglie (falsi positivi al 5% e all'1% sui testi umani) e scrive i pesi in un file JSON.
//   node calibra.js CARTELLA [--esterni ai-esterni.jsonl] [--lambda 1] [--out modello.json]
'use strict';
const fs = require('fs');
const path = require('path');
const { STUDIO } = require('./umani.js');

const args = (() => { const a = { _: [] }, v = process.argv.slice(2); for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) a[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith('--') ? v[++i] : true; else a._.push(v[i]); return a; })();
const leggi = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const dir = args._[0] || '.';
const files = fs.statSync(dir).isDirectory() ? fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => path.join(dir, f)) : [dir];
const righe = [].concat(...files.map(leggi));
const esterni = args.esterni ? leggi(args.esterni) : [];

const gruppoUmano = r => (r.fonte === 'mc4-studio' || r.fonte === 'mc4-web' ? (STUDIO.test(r.host || '') ? 'mc4-studio' : 'mc4-web') : r.fonte);
const valido = r => r && r.indice !== null && r.indice !== undefined && r.lingua === 'it';
const umani = righe.filter(r => r.fonte !== 'ai').map(r => Object.assign({ y: 0, gruppo: gruppoUmano(r) }, r)).filter(valido);
const ai = righe.filter(r => r.fonte === 'ai' && r.pulito).map(r => Object.assign({ y: 1, gruppo: r.modello, stile: r.stile }, r.pulito)).filter(valido);
const est = esterni.filter(r => r.fonte === 'ai' && r.pulito).map(r => Object.assign({ y: 1, gruppo: r.modello, stile: r.stile }, r.pulito)).filter(valido);

// caratteristiche: valori grezzi dei segnali, con trasformazioni fisse; mancanti = mediana di addestramento
const L1 = v => Math.log1p(Math.max(0, v));
const SIG = (id, f) => r => (r.sig && r.sig[id] && r.sig[id].ok ? f(r.sig[id].x) : null);
const CAR = [
  ['burst', SIG('burst', v => v)],
  ['mk', SIG('mk', v => Math.sqrt(v))],
  ['conn', SIG('conn', v => v)],
  ['para', SIG('para', v => v)],
  ['dash', SIG('dash', L1)],
  ['contrast', SIG('contrast', L1)],
  ['trip', SIG('trip', L1)],
  ['spec', SIG('spec', v => v)],
  ['hRate', r => L1(r.hRate)],
  ['lung', r => (r.frasi ? Math.log(r.parole / r.frasi) : null)],
];
const scelte = args.car ? String(args.car).split(',') : CAR.map(c => c[0]);
const C = CAR.filter(c => scelte.includes(c[0]));
const grezze = r => C.map(c => c[1](r));

const med = a => { const s = a.filter(v => v !== null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function prepara(train) {
  const X = train.map(grezze);
  const m = C.map((_, j) => med(X.map(x => x[j])));
  const fill = x => x.map((v, j) => (v === null || !Number.isFinite(v) ? m[j] : v));
  const F = X.map(fill);
  const mu = C.map((_, j) => F.reduce((a, x) => a + x[j], 0) / F.length);
  const sd = C.map((_, j) => Math.sqrt(F.reduce((a, x) => a + (x[j] - mu[j]) ** 2, 0) / F.length) || 1);
  return { m, mu, sd, z: r => fill(grezze(r)).map((v, j) => (v - mu[j]) / sd[j]) };
}

// pesi: ogni gruppo (fonte umana o modello) pesa uguale dentro la sua classe, le due classi pesano uguale
function pesi(rows) {
  const n = new Map(); for (const r of rows) n.set(r.y + '|' + r.gruppo, (n.get(r.y + '|' + r.gruppo) || 0) + 1);
  const g = [0, 1].map(y => Array.from(n.keys()).filter(k => k.startsWith(y + '|')).length);
  return rows.map(r => rows.length / 2 / g[r.y] / n.get(r.y + '|' + r.gruppo));
}

// regressione logistica con penalità L2 (Newton)
function addestra(rows, lambda) {
  const P = prepara(rows), Z = rows.map(P.z), W = pesi(rows), d = C.length + 1;
  let b = new Array(d).fill(0);
  for (let it = 0; it < 50; it++) {
    const g = new Array(d).fill(0), H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < rows.length; i++) {
      const x = [1].concat(Z[i]), t = x.reduce((a, v, j) => a + v * b[j], 0), p = 1 / (1 + Math.exp(-t));
      for (let j = 0; j < d; j++) { g[j] += W[i] * (p - rows[i].y) * x[j]; for (let k = 0; k < d; k++) H[j][k] += W[i] * p * (1 - p) * x[j] * x[k]; }
    }
    for (let j = 1; j < d; j++) { g[j] += lambda * b[j]; H[j][j] += lambda; }
    const step = risolvi(H, g);
    b = b.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return { P, b, logit: r => [1].concat(P.z(r)).reduce((a, v, j) => a + v * b[j], 0) };
}
function risolvi(A, y) {
  const n = y.length, M = A.map((r, i) => r.concat([y[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

function auc(pos, neg) {
  const all = pos.map(v => [v, 1]).concat(neg.map(v => [v, 0])).sort((a, b) => a[0] - b[0]);
  let r = 0, s = 0;
  while (r < all.length) { let e = r; while (e < all.length && all[e][0] === all[r][0]) e++; for (let k = r; k < e; k++) if (all[k][1]) s += (r + 1 + e) / 2; r = e; }
  return pos.length && neg.length ? (s - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length) : null;
}
// soglia: il valore oltre il quale resta al massimo la quota fp dei testi umani (pesati per gruppo)
function soglia(vals, w, fp) {
  const o = vals.map((v, i) => [v, w[i]]).sort((a, b) => b[0] - a[0]), tot = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < o.length; i++) { acc += o[i][1]; if (acc / tot > fp) return i ? (o[i][0] + o[i - 1][0]) / 2 : o[0][0] + 1e-9; }
  return o[o.length - 1][0];
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(1).replace('.', ',') + '%' : '–');
const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '–' : (+v).toFixed(d).replace('.', ','));

// validazione: per ogni modello generatore, addestramento senza quel modello e senza un quarto degli umani
const lambda = +(args.lambda || 1);
let seed = 42; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const modelli = Array.from(new Set(ai.map(r => r.gruppo))).sort();
const K = modelli.length;
const perGruppo = new Map(); for (const r of umani) { if (!perGruppo.has(r.gruppo)) perGruppo.set(r.gruppo, []); perGruppo.get(r.gruppo).push(r); }
for (const rows of perGruppo.values()) { const ord = rows.map(r => [rnd(), r]).sort((a, b) => a[0] - b[0]); ord.forEach(([, r], i) => { r.fold = i % K; }); }
ai.forEach(r => { r.fold = modelli.indexOf(r.gruppo); });

const fuori = [];   // punteggi sui testi tenuti fuori: { r, z (nuovo), s5, s1 (soglie del giro) }
for (let k = 0; k < K; k++) {
  const train = umani.concat(ai).filter(r => r.fold !== k), test = umani.concat(ai).filter(r => r.fold === k);
  const M = addestra(train, lambda);
  const hu = train.filter(r => r.y === 0), w = pesi(train).filter((_, i) => train[i].y === 0);
  const zh = hu.map(M.logit), s5 = soglia(zh, w, 0.05), s1 = soglia(zh, w, 0.01);
  for (const r of test) fuori.push({ r, z: M.logit(r), s5, s1 });
  for (const r of est) fuori.push({ r, z: M.logit(r), s5, s1, esterno: true, giro: k });
}

const Lr = [];
Lr.push('# Taratura del rilevatore', '');
Lr.push('Testi umani: ' + umani.length + ' (' + Array.from(perGruppo).map(([g, r]) => g + ' ' + r.length).join(', ') + '). Testi generati: ' + ai.length + ' (' + modelli.map(m => m + ' ' + ai.filter(r => r.gruppo === m).length).join(', ') + ')' + (est.length ? '. Esterni (solo prova): ' + est.length : '') + '.', '');
Lr.push('Caratteristiche: ' + C.map(c => c[0]).join(', ') + '. Penalità L2: ' + lambda + '.', '');
Lr.push('## Validazione (ogni modello generatore tenuto fuori a turno, con un quarto dei testi umani)', '');
const interni = fuori.filter(x => !x.esterno);
const zU = interni.filter(x => x.r.y === 0), zA = interni.filter(x => x.r.y === 1);
Lr.push('| | AUC | umani sopra la soglia 5% | generati sopra la soglia 5% | umani sopra la soglia 1% | generati sopra la soglia 1% |', '|---|---|---|---|---|---|');
Lr.push('| modello nuovo | ' + num(auc(zA.map(x => x.z), zU.map(x => x.z))) + ' | ' + pct(zU.filter(x => x.z > x.s5).length, zU.length) + ' | ' + pct(zA.filter(x => x.z > x.s5).length, zA.length) + ' | ' + pct(zU.filter(x => x.z > x.s1).length, zU.length) + ' | ' + pct(zA.filter(x => x.z > x.s1).length, zA.length) + ' |');
// indice attuale, con soglie scelte allo stesso modo sugli umani di addestramento di ogni giro
{
  let u5 = 0, a5 = 0, u1 = 0, a1 = 0;
  for (let k = 0; k < K; k++) {
    const train = umani.filter(r => r.fold !== k), w = pesi(train);
    const t5 = soglia(train.map(r => r.indice), w, 0.05), t1 = soglia(train.map(r => r.indice), w, 0.01);
    for (const x of interni.filter(x => x.r.fold === k)) { const v = x.r.indice; if (x.r.y) { a5 += v > t5; a1 += v > t1; } else { u5 += v > t5; u1 += v > t1; } }
  }
  Lr.push('| indice attuale | ' + num(auc(zA.map(x => x.r.indice), zU.map(x => x.r.indice))) + ' | ' + pct(u5, zU.length) + ' | ' + pct(a5, zA.length) + ' | ' + pct(u1, zU.length) + ' | ' + pct(a1, zA.length) + ' |');
  Lr.push('| indice attuale, soglie di oggi (35 e 60) | | ' + pct(zU.filter(x => x.r.indice >= 35).length, zU.length) + ' | ' + pct(zA.filter(x => x.r.indice >= 35).length, zA.length) + ' | ' + pct(zU.filter(x => x.r.indice >= 60).length, zU.length) + ' | ' + pct(zA.filter(x => x.r.indice >= 60).length, zA.length) + ' |');
}
// AUC giro per giro (modello tenuto fuori contro il quarto di umani tenuto fuori nello stesso giro), poi la media
{
  const nuovo = [], att = [];
  for (let k = 0; k < K; k++) {
    const u = interni.filter(x => x.r.fold === k && x.r.y === 0), a = interni.filter(x => x.r.fold === k && x.r.y === 1);
    nuovo.push(auc(a.map(x => x.z), u.map(x => x.z))); att.push(auc(a.map(x => x.r.indice), u.map(x => x.r.indice)));
  }
  const m = v => v.reduce((x, y) => x + y, 0) / v.length;
  Lr.push('', 'AUC giro per giro (' + modelli.join(', ') + '): modello nuovo ' + nuovo.map(v => num(v)).join(' · ') + ' (media ' + num(m(nuovo)) + '); indice attuale ' + att.map(v => num(v)).join(' · ') + ' (media ' + num(m(att)) + ').');
}
Lr.push('');
Lr.push('| gruppo (tenuto fuori) | testi | AUC contro gli umani tenuti fuori | sopra la soglia 5% | sopra la soglia 1% |', '|---|---|---|---|---|');
const gruppi = Array.from(new Set(interni.map(x => x.r.y + '|' + x.r.gruppo))).sort();
for (const g of gruppi) {
  const xs = interni.filter(x => x.r.y + '|' + x.r.gruppo === g), y = +g[0];
  Lr.push('| ' + (y ? 'generati: ' : 'umani: ') + g.slice(2) + ' | ' + xs.length + ' | ' + (y ? num(auc(xs.map(x => x.z), zU.map(x => x.z))) : '') + ' | ' + pct(xs.filter(x => x.z > x.s5).length, xs.length) + ' | ' + pct(xs.filter(x => x.z > x.s1).length, xs.length) + ' |');
}
for (const s of Array.from(new Set(zA.map(x => x.r.stile))).sort()) {
  const xs = zA.filter(x => x.r.stile === s);
  Lr.push('| generati, stile «' + s + '» | ' + xs.length + ' | ' + num(auc(xs.map(x => x.z), zU.map(x => x.z))) + ' | ' + pct(xs.filter(x => x.z > x.s5).length, xs.length) + ' | ' + pct(xs.filter(x => x.z > x.s1).length, xs.length) + ' |');
}
if (est.length) {
  // i testi esterni non entrano mai nell'addestramento: valgono le soglie medie dei giri
  for (const m of Array.from(new Set(est.map(r => r.gruppo))).sort()) {
    const xs = fuori.filter(x => x.esterno && x.r.gruppo === m && x.giro === 0);
    const tutti = fuori.filter(x => x.esterno && x.r.gruppo === m);
    const sopra = (f) => tutti.filter(f).length / K;
    Lr.push('| esterni: ' + m + ' | ' + xs.length + ' | ' + num(auc(tutti.map(x => x.z), zU.map(x => x.z))) + ' | ' + pct(sopra(x => x.z > x.s5), xs.length) + ' | ' + pct(sopra(x => x.z > x.s1), xs.length) + ' |');
  }
}
Lr.push('');

// modello finale su tutti i dati
const F = addestra(umani.concat(ai), lambda);
const wU = pesi(umani.concat(ai)).filter((_, i) => i < umani.length);
const zh = umani.map(F.logit), s5 = soglia(zh, wU, 0.05), s1 = soglia(zh, wU, 0.01);
Lr.push('## Modello finale (tutti i testi)', '');
Lr.push('| caratteristica | peso (per deviazione standard) | mediana per i mancanti | media | deviazione standard |', '|---|---|---|---|---|');
C.forEach((c, j) => Lr.push('| ' + c[0] + ' | ' + num(F.b[j + 1], 3) + ' | ' + num(F.P.m[j], 3) + ' | ' + num(F.P.mu[j], 3) + ' | ' + num(F.P.sd[j], 3) + ' |'));
Lr.push('', 'Termine noto: ' + num(F.b[0], 3) + '. Soglie sul logit: 5% di falsi positivi ' + num(s5, 3) + ', 1% ' + num(s1, 3) + '.', '');
process.stdout.write(Lr.join('\n') + '\n');
if (args.out) {
  fs.writeFileSync(args.out, JSON.stringify({ caratteristiche: C.map(c => c[0]), b0: F.b[0], w: F.b.slice(1), mediana: F.P.m, media: F.P.mu, ds: F.P.sd, soglia5: s5, soglia1: s1, umani: umani.length, generati: ai.length, lambda }, null, 1) + '\n');
}
