// Segnali di scrittura generata di un testo, nella forma usata per la valutazione del rilevatore.
// Si salvano solo questi numeri: il testo non viene conservato.
'use strict';
const MR = require('../../js/engine.js');

const r4 = v => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
function segnali(testo) {
  const r = MR.analyzeAI(testo);
  const sig = {};
  for (const s of r.signals) sig[s.id] = { x: r4(s.x), s: r4(s.score), ok: s.ok };
  return {
    parole: r.words, frasi: r.nProse, lingua: r.lang, indice: r.index, indiceGrezzo: r.indexRaw === null ? null : r4(r.indexRaw), indiceSenzaUmano: r.indexNoHuman,
    base: r.base === null ? null : r4(r.base), h: r4(r.h), hRate: r4(r.hRate), mkPts: r.mkPts, md: r.md, inv: r.inv,
    residui: r.strongRes, fascia: r.band, sig,
  };
}

// come lo incollerebbe uno studente: senza titolo iniziale, titoletti, grassetti e segni degli elenchi
function ripulisci(t) {
  const righe = t.replace(/\r/g, '').split('\n');
  while (righe.length && !righe[0].trim()) righe.shift();
  if (righe.length && righe[0].trim().split(/\s+/).length <= 14 && !/[.!?…:;]$/.test(righe[0].trim())) righe.shift();
  return righe
    .filter(r => !/^\s*#{1,6}\s/.test(r) && !/^\s*\*\*[^*]+\*\*:?\s*$/.test(r))
    .map(r => r.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { segnali, ripulisci };
