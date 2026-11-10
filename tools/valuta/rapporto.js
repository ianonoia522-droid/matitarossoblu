#!/usr/bin/env node
// Rapporto della valutazione del rilevatore: legge i file .jsonl di umani.js e genera.js (cartella o file)
// e scrive in Markdown falsi positivi, riconoscimenti, separazione (AUC) e peso di ogni segnale.
//   node rapporto.js CARTELLA > valutazione-ai.md
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || '.';
const files = fs.statSync(dir).isDirectory() ? fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => path.join(dir, f)) : [dir];
const righe = [];
for (const f of files) for (const ln of fs.readFileSync(f, 'utf8').split('\n')) { if (!ln) continue; try { righe.push(JSON.parse(ln)); } catch (e) { /* riga troncata */ } }

// un campione per testo: per i testi generati si usa la versione "ripulita" (come la incollerebbe uno studente)
// pagine web: il gruppo si decide dal sito con l'elenco chiuso di umani.js (le prime raccolte usavano un filtro più largo)
const { STUDIO } = require('./umani.js');
const gruppoUmano = r => (r.fonte === 'mc4-studio' || r.fonte === 'mc4-web' ? (STUDIO.test(r.host || '') ? 'mc4-studio' : 'mc4-web') : r.fonte);
const umani = righe.filter(r => r.fonte !== 'ai').map(r => Object.assign({}, r, { gruppo: gruppoUmano(r) }));
const ai = righe.filter(r => r.fonte === 'ai').map(r => Object.assign({ gruppo: r.modello, stile: r.stile }, r.pulito));
const aiGrezzi = righe.filter(r => r.fonte === 'ai').map(r => Object.assign({ gruppo: r.modello, stile: r.stile }, r.grezzo));

const pct = (a, b) => (b ? (100 * a / b).toFixed(1).replace('.', ',') + '%' : '–');
const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '–' : (+v).toFixed(d).replace('.', ','));
// AUC (Mann-Whitney): probabilità che un testo generato abbia un valore più alto di un testo umano
function auc(pos, neg) {
  const all = pos.map(v => [v, 1]).concat(neg.map(v => [v, 0])).sort((a, b) => a[0] - b[0]);
  let r = 0, sumPos = 0;
  while (r < all.length) {
    let s = r; while (s < all.length && all[s][0] === all[r][0]) s++;
    const rank = (r + 1 + s) / 2;
    for (let k = r; k < s; k++) if (all[k][1]) sumPos += rank;
    r = s;
  }
  const P = pos.length, N = neg.length;
  return P && N ? (sumPos - P * (P + 1) / 2) / (P * N) : null;
}
const idx = rows => rows.map(r => r.indice).filter(v => v !== null && v !== undefined);

function tabella(titolo, gruppi) {
  const out = ['| ' + titolo + ' | testi | parole (mediana) | non valutabili | basso (<35) | medio (35-59) | alto (≥60) | indice medio |', '|---|---|---|---|---|---|---|---|'];
  for (const [nome, rows] of gruppi) {
    const v = idx(rows), nv = rows.length - v.length;
    out.push('| ' + nome + ' | ' + rows.length + ' | ' + (med(rows.map(r => r.parole)) || '–') + ' | ' + pct(nv, rows.length) + ' | ' + pct(v.filter(x => x < 35).length, rows.length) + ' | ' +
      pct(v.filter(x => x >= 35 && x < 60).length, rows.length) + ' | ' + pct(v.filter(x => x >= 60).length, rows.length) + ' | ' + num(v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, 0) + ' |');
  }
  return out.join('\n');
}
const per = (rows, k) => { const m = new Map(); for (const r of rows) { const g = r[k]; if (!m.has(g)) m.set(g, []); m.get(g).push(r); } return Array.from(m).sort((a, b) => String(a[0]).localeCompare(String(b[0]))); };

const L = [];
L.push('# Valutazione del rilevatore di testi generati', '');
L.push('Generato il ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC. Testi umani: ' + umani.length + ' (scritti prima di novembre 2022). Testi generati: ' + ai.length + ' (modelli aperti, tre stili di richiesta).', '');
L.push('I testi generati sono valutati come li incollerebbe uno studente: senza titolo, titoletti, grassetti e segni degli elenchi. La tabella in fondo riporta anche la versione grezza.', '');
L.push('## Distribuzione dell\'indice', '');
L.push(tabella('testi umani', per(umani, 'gruppo').concat([['**tutti gli umani**', umani]])), '');
L.push(tabella('testi generati, per modello', per(ai, 'gruppo').concat([['**tutti i generati**', ai]])), '');
L.push(tabella('testi generati, per stile della richiesta', per(ai, 'stile')), '');

L.push('## Separazione (AUC dell\'indice)', '', '0,5 = come tirare a sorte, 1 = separazione perfetta. Calcolata sui testi valutabili (almeno 150 parole).', '');
const hu = idx(umani);
L.push('| confronto | AUC |', '|---|---|');
L.push('| tutti i generati contro tutti gli umani | ' + num(auc(idx(ai), hu)) + ' |');
for (const [g, rows] of per(umani, 'gruppo')) L.push('| tutti i generati contro ' + g + ' | ' + num(auc(idx(ai), idx(rows))) + ' |');
for (const [g, rows] of per(ai, 'gruppo')) L.push('| ' + g + ' contro tutti gli umani | ' + num(auc(idx(rows), hu)) + ' |');
for (const [g, rows] of per(ai, 'stile')) L.push('| stile «' + g + '» contro tutti gli umani | ' + num(auc(idx(rows), hu)) + ' |');
L.push('');

L.push('## Soglie', '');
const hs = hu.slice().sort((a, b) => a - b), as = idx(ai);
L.push('| soglia dell\'indice | umani segnalati (falsi positivi) | generati segnalati |', '|---|---|---|');
for (const t of [35, 60]) L.push('| ' + t + ' (attuale: ' + (t === 35 ? 'medio' : 'alto') + ') | ' + pct(hu.filter(x => x >= t).length, hu.length) + ' | ' + pct(as.filter(x => x >= t).length, as.length) + ' |');
for (const fp of [0.05, 0.01]) {
  const t = hs.length ? hs[Math.min(hs.length - 1, Math.ceil(hs.length * (1 - fp)))] + 1 : null;
  if (t !== null) L.push('| ' + t + ' (al massimo ' + (fp * 100) + '% di falsi positivi) | ' + pct(hu.filter(x => x >= t).length, hu.length) + ' | ' + pct(as.filter(x => x >= t).length, as.length) + ' |');
}
L.push('');

// soglie sull'indice grezzo (prima della taratura delle fasce in engine.js): servono a scegliere T_MID e T_HI
const grz = rows => rows.map(r => r.indiceGrezzo).filter(v => v !== null && v !== undefined);
if (grz(umani).length) {
  const quant = (v, fp) => { const s = v.slice().sort((a, b) => b - a); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * fp))] : null; };
  L.push('## Soglie sull\'indice grezzo', '', 'Valore dell\'indice grezzo superato dal 5% e dall\'1% dei testi di ogni gruppo umano, e quota dei testi generati che lo supera. Servono a tarare le fasce (T_MID e T_HI in engine.js).', '');
  L.push('| gruppo umano | testi | soglia 5% | generati sopra | soglia 1% | generati sopra |', '|---|---|---|---|---|---|');
  const ag = grz(ai);
  for (const [g, rows] of per(umani, 'gruppo').concat([['**tutti gli umani**', umani]])) {
    const v = grz(rows); if (!v.length) continue;
    const t5 = quant(v, 0.05), t1 = quant(v, 0.01);
    L.push('| ' + g + ' | ' + v.length + ' | ' + num(t5, 1) + ' | ' + pct(ag.filter(x => x > t5).length, ag.length) + ' | ' + num(t1, 1) + ' | ' + pct(ag.filter(x => x > t1).length, ag.length) + ' |');
  }
  L.push('');
}

L.push('## Segnali uno per uno', '', 'AUC del valore grezzo di ogni segnale (sopra 0,5: più alto nei testi generati; sotto 0,5: più alto in quelli umani), e mediane. Solo testi in cui il segnale è calcolabile.', '');
L.push('| segnale | AUC | mediana umani | mediana generati | punteggio medio umani | punteggio medio generati |', '|---|---|---|---|---|---|');
const ids = ['burst', 'mk', 'conn', 'para', 'dash', 'contrast', 'trip', 'spec'];
for (const id of ids) {
  const H = umani.filter(r => r.sig && r.sig[id] && r.sig[id].ok), A = ai.filter(r => r.sig && r.sig[id] && r.sig[id].ok);
  const hx = H.map(r => r.sig[id].x), ax = A.map(r => r.sig[id].x);
  const ms = rows => (rows.length ? rows.reduce((a, r) => a + r.sig[id].s, 0) / rows.length : null);
  L.push('| ' + id + ' | ' + num(auc(ax, hx)) + ' | ' + num(med(hx), 3) + ' | ' + num(med(ax), 3) + ' | ' + num(ms(H)) + ' | ' + num(ms(A)) + ' |');
}
for (const [nome, f] of [['imperfezioni umane (hRate)', r => r.hRate], ['tracce di chatbot (residui forti)', r => r.residui], ['Markdown', r => r.md]]) {
  const hx = umani.map(f).filter(v => v !== null && v !== undefined), ax = ai.map(f).filter(v => v !== null && v !== undefined);
  L.push('| ' + nome + ' | ' + num(auc(ax, hx)) + ' | ' + num(med(hx), 3) + ' | ' + num(med(ax), 3) + ' | | |');
}
L.push('');
L.push('## Testi generati non ripuliti', '');
L.push(tabella('testi generati grezzi, per modello', per(aiGrezzi, 'gruppo').concat([['**tutti i generati grezzi**', aiGrezzi]])), '');
L.push('AUC dei generati grezzi contro tutti gli umani: ' + num(auc(idx(aiGrezzi), hu)) + '.', '');
process.stdout.write(L.join('\n') + '\n');
