#!/usr/bin/env node
// Temi generati a mano con chatbot (ChatGPT, Gemini...) per la valutazione: legge un file di testo con le risposte,
// ognuna preceduta da una riga "=== N Modello" (N = numero della richiesta in tracce-esterne.json), e salva
// modello, traccia, stile e segnali (testo grezzo e ripulito), senza il testo.
//   node importa.js risposte.txt --out ai-esterni.jsonl
'use strict';
const fs = require('fs');
const { segnali, ripulisci } = require('./segnali.js');
const TRACCE = require('./tracce.json');
const { richieste } = require('./tracce-esterne.json');

const file = process.argv[2], outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : 'ai-esterni.jsonl';
const testo = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
const parti = testo.split(/^[ \t]*={3,}[ \t]*(\d+)[ \t]*[-–:.]?[ \t]*([^\n]*)$/m);
const righe = [];
for (let i = 1; i + 2 < parti.length + 1; i += 3) {
  const n = +parti[i], modello = (parti[i + 1] || '').trim().toLowerCase().replace(/\s+/g, '-') || 'sconosciuto', t = (parti[i + 2] || '').trim();
  if (!t) continue;
  const [ti, stile] = richieste[n - 1] || [null, 'sconosciuto'];
  righe.push({ fonte: 'ai', modello, stile, traccia: ti === null ? '' : TRACCE[ti], richiesta: n, grezzo: segnali(t), pulito: segnali(ripulisci(t)) });
}
fs.writeFileSync(out, righe.map(r => JSON.stringify(r)).join('\n') + '\n');
const per = {}; for (const r of righe) per[r.modello] = (per[r.modello] || 0) + 1;
console.error('importati', righe.length, 'temi:', JSON.stringify(per), '→', out);
for (const r of righe) console.error('  ', r.richiesta, r.modello, r.stile, r.pulito.parole, 'parole · indice', r.pulito.indice, '(grezzo', r.grezzo.indice + ')');
