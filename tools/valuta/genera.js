#!/usr/bin/env node
// Temi generati per valutare il rilevatore: li chiede a un server compatibile con le API di OpenAI
// (llama-server di llama.cpp con un modello aperto) a partire dalle tracce di tracce.json, in tre stili:
// richiesta semplice, "scrivi come uno studente", "non deve sembrare scritto da un'AI".
//
//   node genera.js --server http://127.0.0.1:8080 --modello NOME --n 45 --out ai-NOME.jsonl [--fine EPOCH_S]
'use strict';
const fs = require('fs');
const path = require('path');
const { segnali, ripulisci } = require('./segnali.js');
const TRACCE = require('./tracce.json');

const STILI = {
  normale: t => 'Scrivi un tema di circa 500 parole sulla seguente traccia.\n\nTraccia: ' + t,
  studente: t => 'Sei uno studente di 16 anni di un liceo italiano. Scrivi questo tema come lo scriveresti tu per la verifica in classe: circa 500 parole, senza titoli e senza elenchi puntati.\n\nTraccia: ' + t,
  umanizzato: t => 'Scrivi un tema di circa 500 parole sulla traccia seguente. Deve sembrare scritto da uno studente vero e non da un\'intelligenza artificiale: evita le formule tipiche dei chatbot, varia la lunghezza delle frasi, non usare elenchi, titoli o trattini lunghi.\n\nTraccia: ' + t,
};
const NOMI = Object.keys(STILI);

const args = (() => { const a = {}, v = process.argv.slice(2); for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) a[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith('--') ? v[++i] : true; return a; })();
const log = (...m) => console.error(new Date().toISOString().slice(11, 19), ...m);

async function main() {
  const n = +(args.n || 45), fine = args.fine ? +args.fine * 1000 : Infinity, out = [];
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  for (let i = 0; i < n && Date.now() < fine; i++) {
    const traccia = TRACCE[i % TRACCE.length], stile = NOMI[(i + Math.floor(i / TRACCE.length)) % NOMI.length];
    const t0 = Date.now();
    const res = await fetch(args.server + '/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: STILI[stile](traccia) }], temperature: 0.8, top_p: 0.95, max_tokens: 1200 }),
    });
    if (!res.ok) { log('errore', res.status, (await res.text()).slice(0, 200)); continue; }
    const j = await res.json();
    const testo = String(j.choices[0].message.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const pulito = ripulisci(testo);
    const r = { fonte: 'ai', modello: args.modello, stile, traccia, testo, grezzo: segnali(testo), pulito: segnali(pulito) };
    out.push(r);
    fs.appendFileSync(args.out, JSON.stringify(r) + '\n');
    log((i + 1) + '/' + n, stile, '·', r.pulito.parole, 'parole ·', Math.round((Date.now() - t0) / 1000), 's · indice', r.pulito.indice);
  }
  log('fatto:', out.length, 'temi');
}

main().catch(e => { console.error(e); process.exit(1); });
