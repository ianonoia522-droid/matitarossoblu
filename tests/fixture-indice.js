// Crea un piccolo indice di prova (pagine inventate) per il test nel browser: node tests/fixture-indice.js DIR
// Stampa in JSON il testo da verificare, che contiene un paragrafo copiato da una delle pagine.
'use strict';
const MR = require('../js/engine.js');
const X = require('../js/impronte.js');
const { Raccolta, scriviIndice } = require('../tools/indice/scrittore.js');

const COPIATO = 'La convocazione degli Stati generali nel maggio del 1789 aprì una crisi che il sovrano non riuscì a controllare. ' +
  'I deputati del terzo stato si proclamarono Assemblea nazionale e giurarono, nella sala della pallacorda, di non separarsi prima di aver dato una costituzione alla Francia. ' +
  'Il 14 luglio la folla parigina assaltò la Bastiglia, fortezza e prigione di stato, simbolo del potere assoluto della monarchia.';
const PAGINE = [
  { url: 'https://www.skuola.net/storia/rivoluzione-francese-riassunto.html', title: 'Rivoluzione francese: riassunto', text: 'La Rivoluzione francese fu un periodo di sconvolgimento politico e sociale. ' + COPIATO + ' Negli anni successivi la rivoluzione attraversò fasi sempre più radicali fino al Terrore e alla caduta di Robespierre.' },
  { url: 'https://www.treccani.it/enciclopedia/illuminismo/', title: 'Illuminismo - Enciclopedia', text: 'L\'Illuminismo fu un movimento culturale e filosofico che si sviluppò in Europa nel Settecento, fondato sulla fiducia nella ragione come strumento di conoscenza e di riforma della società, della politica e della religione.' },
];
// molte pagine di riempimento con un piè di pagina comune, che l'indice deve scartare
const PIEDE = 'Tutti i diritti riservati. Iscriviti alla newsletter per ricevere ogni settimana appunti, riassunti e mappe concettuali gratuite per la scuola.';
const VOC = 'acqua terra fuoco aria città fiume monte valle mare lago bosco campo strada ponte torre chiesa castello porto isola regione provincia comune storia guerra pace trattato impero regno repubblica popolo esercito battaglia'.split(' ');
let seed = 7;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
for (let i = 0; i < 40; i++) PAGINE.push({ url: 'https://www.skuola.net/varie/pagina-' + i + '.html', title: 'Pagina ' + i, text: Array.from({ length: 200 }, () => VOC[Math.floor(rnd() * VOC.length)]).join(' ') });

const out = process.argv[2];
const R = new Raccolta(1024), cache = new Map();
PAGINE.forEach((p, d) => R.addDoc(X.fingerprints(MR.tokenize(p.text + '\n' + PIEDE), { cache }), d));
const m = scriviIndice(out, PAGINE, R, { archivio: 'CC-MAIN-2026-43', archivioData: '2026-10', docShard: 10, maxFileBytes: 4000, siti: [{ dominio: 'skuola.net', documenti: 41 }, { dominio: 'treccani.it', documenti: 1 }] });
const testo = 'Per la ricerca di storia ho letto diversi libri e appunti della professoressa, poi ho scritto questa sintesi con parole mie dove possibile.\n\n' +
  COPIATO + '\n\nSecondo me la parte più interessante è il passaggio dalla monarchia assoluta alla monarchia costituzionale, che ho approfondito con un libro trovato in biblioteca.\n\n' + PIEDE;
console.log(JSON.stringify({ testo, files: m.files.length, voci: m.voci, scartate: m.scartate }));
