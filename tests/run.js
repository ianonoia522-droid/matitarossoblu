// Test del motore di Matita Rossoblù. Uso: node tests/run.js  (Node 18 o successivo, nessuna dipendenza)
'use strict';
const fs = require('fs');
const path = require('path');
const MR = require('../js/engine.js');
const T = require('./campioni.js');

let failed = 0;
function expect(label, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail !== undefined ? '  (' + detail + ')' : ''));
  if (!ok) failed++;
}

// L'esempio mostrato all'apertura della pagina, letto da app.js
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const grab = (name) => { const i = app.indexOf('const ' + name + ' = `'); const s = app.indexOf('`', i) + 1; return app.slice(s, app.indexOf('`', s)); };
const EX_DOC = grab('EX_DOC');
const block = app.slice(app.indexOf('const EX_SOURCES'), app.indexOf('];', app.indexOf('const EX_SOURCES')) + 2);
const EX_SOURCES = new Function(block.replace('const EX_SOURCES =', 'return ').replace(/];$/, ']'))();
const opts = { k: 6, gap: 3, ignoreQuotes: true, ignoreBiblio: true, paraSens: 'normale' };
const sources = EX_SOURCES.map((s, i) => ({ id: i + 1, name: s.name, text: s.text }));

console.log('Antiplagio');
const res = MR.analyzePlagiarism(EX_DOC, sources, opts);
const lit = res.literal / res.bodyWords;
expect('esempio: quota letterale tra 20% e 28%', lit > 0.20 && lit < 0.28, (lit * 100).toFixed(1) + '%');
expect('esempio: 3 passaggi copiati', res.passages.length === 3, res.passages.length);
expect('esempio: una copia con modifiche riconosciuta come tale', res.passages.some(p => p.ident >= 0.7 && p.ident < 0.97));
expect('esempio: 1 parafrasi, dalla fonte 2', res.para.length === 1 && res.para[0].src === 2, res.para.length);
const q = MR.analyzePlagiarism('Come scrive la dispensa, «il fenomeno dipende soprattutto dai materiali da costruzione: asfalto, cemento e coperture scure assorbono la radiazione solare» e lo confermano le misure.', sources, opts);
expect('citazione tra virgolette esclusa', q.literal === 0 && q.doc.quoteWords > 10, q.literal);
const bib = 'Testo del lavoro con alcune frasi originali scritte da me per questa prova di esclusione.\n'.repeat(4) + '\nBibliografia\n\nIl fenomeno dipende soprattutto dai materiali da costruzione: asfalto, cemento e coperture scure assorbono la radiazione solare durante il giorno.';
const b = MR.analyzePlagiarism(bib, sources, opts);
expect('bibliografia finale esclusa', b.literal === 0 && b.doc.biblioWords > 10, b.literal);
expect('divisione in frasi con abbreviazioni', MR.splitSentences('Il dott. Rossi è arrivato. Ha detto: «Va bene!» Poi è uscito, ecc. Alle 3.5 km... Vedi cfr. Bianchi, p. 12. Fine.').length === 6);
const fp = MR.fingerprints(res.doc, 24);
expect('frasi per la ricerca web estratte', fp.length >= 8, fp.length);
expect('i numeri decimali non vengono spezzati', fp.every(f => !/\d,$/.test(f.phrase)));

console.log('Segnali AI (soglie larghe: servono a evitare regressioni, non dimostrano accuratezza)');
const idx = (t) => MR.analyzeAI(t).index;
const r = {};
for (const k of Object.keys(T)) r[k] = MR.analyzeAI(T[k]);
expect('testo AI italiano sopra 60', r.ai_it.index >= 60, r.ai_it.index);
expect('testo AI inglese sopra 60', r.ai_en.index >= 60, r.ai_en.index);
expect('testo umano informale sotto 20', r.umano_informale.index <= 20, r.umano_informale.index);
expect('testo umano inglese sotto 20', r.umano_en.index <= 20, r.umano_en.index);
expect('testo tecnico umano sotto 35', r.umano_tecnico.index <= 35, r.umano_tecnico.index);
expect('testo accademico umano sotto 45 (caso limite noto)', r.umano_accademico.index <= 45, r.umano_accademico.index);
expect('esempio misto tra 35 e 65', idx(EX_DOC) >= 35 && idx(EX_DOC) <= 65, idx(EX_DOC));
expect('narrativa: trattini di dialogo esclusi', r.narrativa_dialoghi.signals.find(s => s.id === 'dash').score === 0 && r.narrativa_dialoghi.dialogue >= 3);
expect('tracce di chatbot riconosciute', r.chatbot_incollato.residue.filter(x => x.strong).reduce((a, x) => a + x.n, 0) >= 3);
expect('sotto 150 parole nessun indice', MR.analyzeAI('Testo breve di prova con poche parole.').index === null);

console.log('Ricerche per Wikipedia (costruzione delle ricerche)');
const wq = MR.wikiQueries(EX_DOC, opts);
expect('esempio: frasi da cercare', wq.phrases.length >= 8 && wq.phrases.length <= 20, wq.phrases.length);
expect('ogni frase ha 6 parole', wq.phrases.every(p => p.q.split(/[ ']/).length === 6), wq.phrases.map(p => p.q).join(' | ').slice(0, 120));
expect('ricerche entro 280 caratteri e 290 byte', wq.groups.every(g => g.length <= 280 && Buffer.byteLength(g) <= 290), wq.groups.map(g => g.length).join(', '));
expect('ricerche fatte di frasi esatte unite da OR', wq.groups.every(g => /^"[^"]+"(?: OR "[^"]+")*$/.test(g)));
expect('nessun simbolo che la ricerca interpreta', wq.phrases.every(p => !/[*?~\\:()\-"+!.,;«»]/.test(p.q)));
expect('i numeri decimali non vengono spezzati', !wq.phrases.some(p => /\b4 1\b/.test(p.q)));
expect('ricerca per argomento ricavata dal testo', /calore/.test(wq.topic) && wq.topic.split(' ').length === 3, wq.topic);
const wqq = MR.wikiQueries('Come scrive la dispensa, «il fenomeno dipende soprattutto dai materiali da costruzione: asfalto, cemento e coperture scure» e lo confermano le misure fatte in tre quartieri diversi della città.', opts);
expect('le citazioni tra virgolette non vengono cercate', wqq.phrases.length > 0 && wqq.phrases.every(p => !/fenomeno|materiali|asfalto/.test(p.q)), wqq.phrases.map(p => p.q).join(' | '));
const wqb = MR.wikiQueries((EX_DOC + '\n\n' + T.ai_it + '\n\n' + T.umano_accademico + '\n\n').repeat(40), opts);
expect('testo lungo: al massimo 20 frasi senza ripetizioni', wqb.phrases.length <= 20 && new Set(wqb.phrases.map(p => p.q)).size === wqb.phrases.length, wqb.phrases.length + ' frasi, ' + wqb.groups.length + ' ricerche');
expect('lingua riconosciuta', MR.detectLang(T.ai_en) === 'en' && MR.detectLang(T.umano_en) === 'en' && MR.detectLang(T.ai_it) === 'it' && MR.detectLang(EX_DOC) === 'it');

console.log('Prestazioni');
const big = (EX_DOC + '\n\n').repeat(120);
const bigSrc = [{ id: 1, name: 'grande', text: (EX_SOURCES[0].text + '\n\n' + T.ai_it + '\n\n').repeat(150) }];
const t0 = Date.now(); const rb = MR.analyzePlagiarism(big, bigSrc, opts); const t1 = Date.now(); MR.analyzeAI(big); const t2 = Date.now();
expect('40.000 parole contro 70.000 in meno di 3 secondi', t2 - t0 < 3000, (t1 - t0) + ' ms antiplagio, ' + (t2 - t1) + ' ms segnali, ' + rb.bodyWords + ' parole');

console.log('Client per Wikipedia (orologio simulato, nessuna richiesta di rete)');
require('./wiki-test.js')(expect).catch(e => { console.error(e); failed++; }).then(() => {
  console.log(failed ? '\n' + failed + ' test falliti' : '\nTutti i test superati');
  process.exit(failed ? 1 : 0);
});
