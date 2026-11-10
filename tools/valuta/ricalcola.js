#!/usr/bin/env node
// Ricalcola i segnali dei temi generati con la versione attuale del rilevatore, dal testo salvato da genera.js.
// I testi umani non sono salvati (solo i loro segnali): per loro serve rifare il campione (valuta-ai.yml, parte umani).
//   node ricalcola.js CARTELLA_DATI CARTELLA_USCITA
'use strict';
const fs = require('fs');
const path = require('path');
const { segnali, ripulisci } = require('./segnali.js');

const [da, a] = process.argv.slice(2);
if (!da || !a) { console.error('uso: node ricalcola.js CARTELLA_DATI CARTELLA_USCITA'); process.exit(2); }
fs.mkdirSync(a, { recursive: true });
let rifatti = 0, invariati = 0;
for (const f of fs.readdirSync(da).filter(f => f.endsWith('.jsonl'))) {
  const out = [];
  for (const ln of fs.readFileSync(path.join(da, f), 'utf8').split('\n')) {
    if (!ln) continue;
    let r; try { r = JSON.parse(ln); } catch (e) { continue; }
    if (r.fonte === 'ai' && typeof r.testo === 'string') { r.grezzo = segnali(r.testo); r.pulito = segnali(ripulisci(r.testo)); rifatti++; } else invariati++;
    out.push(JSON.stringify(r));
  }
  fs.writeFileSync(path.join(a, f), out.join('\n') + '\n');
}
console.error('ricalcolati', rifatti, 'temi generati; lasciate come erano', invariati, 'righe senza testo');
