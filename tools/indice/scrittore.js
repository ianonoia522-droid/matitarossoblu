// Scrittura dei file dell'indice di impronte (Node), formato 2. Usato dal costruttore e dai test.
//   meta.json                descrizione dell'indice
//   fp/XXXX.bin              un file per gruppo (i primi `bits` bit dell'hash): voci ordinate per chiave,
//                            chiave Uint32 LE + documento a 24 bit LE (7 byte); file vuoti compresi
//   documenti/d-S.json       [[url, titolo], ...] per i documenti S*docShard ... S*docShard+docShard-1
// Il browser scarica interi solo i file dei gruppi che gli servono: niente richieste parziali.
'use strict';
const fs = require('fs');
const path = require('path');
const MRIndex = require('../../js/impronte.js');

// raccolta delle impronte in array tipizzati che crescono
class Raccolta {
  constructor(cap) { this.n = 0; this.A = new Uint32Array(cap || 1 << 20); this.B = new Uint32Array(this.A.length); this.D = new Uint32Array(this.A.length); }
  add(a, b, d) {
    if (this.n === this.A.length) {
      const grow = (x) => { const y = new Uint32Array(x.length * 2); y.set(x); return y; };
      this.A = grow(this.A); this.B = grow(this.B); this.D = grow(this.D);
    }
    this.A[this.n] = a; this.B[this.n] = b; this.D[this.n] = d; this.n++;
  }
  // impronte di un documento, senza ripetizioni
  addDoc(fps, d) {
    const seen = new Set();
    for (const f of fps) { const k = f.a + ':' + f.b; if (!seen.has(k)) { seen.add(k); this.add(f.a, f.b, d); } }
    return seen.size;
  }
}

// numero di bit per avere file di circa `target` byte (da 2^2 a 2^16 file)
function scegliBits(n, target) { let b = 2; while (b < 16 && (n * 7) / (1 << b) > (target || 6144)) b++; return b; }

// opts: { k, w, dfMax, docShard, bits, archivio, archivioData, archivioDal, siti, versione }
function scriviIndice(out, documenti, R, opts) {
  opts = opts || {};
  // dfMax: sulle prime 27.000 pagine vere, con 8 si perdevano anche testi ripetuti in poche decine di pagine dello
  // stesso sito (schede e serie di pagine): con 64 l'indice cresce del 2% e si scartano solo le parti fisse dei siti
  const dfMax = opts.dfMax || 64, docShard = opts.docShard || 1000;
  const n = R.n, bits = opts.bits || scegliBits(n), nf = 1 << bits;
  if (documenti.length > 0xffffff) throw new Error('troppi documenti per 24 bit: ' + documenti.length);
  // ordinamento per file (conteggio) e poi per chiave dentro il file
  const file = new Uint32Array(n), key = new Uint32Array(n), cnt = new Uint32Array(nf + 1);
  for (let i = 0; i < n; i++) { const f = MRIndex.bucketOf(R.A[i], R.B[i], bits); file[i] = f; key[i] = MRIndex.keyOf(R.A[i], R.B[i], bits); cnt[f + 1]++; }
  for (let f = 0; f < nf; f++) cnt[f + 1] += cnt[f];
  const order = new Uint32Array(n), fill = cnt.slice(0, nf);
  for (let i = 0; i < n; i++) order[fill[file[i]]++] = i;
  fs.rmSync(path.join(out, 'fp'), { recursive: true, force: true });
  fs.rmSync(path.join(out, 'documenti'), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'fp'), { recursive: true });
  fs.mkdirSync(path.join(out, 'documenti'), { recursive: true });
  let total = 0, dropped = 0, droppedKeys = 0, maxFile = 0;
  for (let f = 0; f < nf; f++) {
    const slice = Array.from(order.subarray(cnt[f], cnt[f + 1])).sort((x, y) => key[x] - key[y] || R.D[x] - R.D[y]);
    const keep = [];
    for (let i = 0; i < slice.length;) {
      let j = i; const kk = key[slice[i]];
      while (j < slice.length && key[slice[j]] === kk) j++;
      const docs = new Set(); for (let t = i; t < j; t++) docs.add(R.D[slice[t]]);
      // impronte presenti in troppe pagine: menu, piè di pagina, testi fissi del sito, formule ricorrenti
      if (docs.size > dfMax) { dropped += j - i; droppedKeys++; }
      else for (const d of Array.from(docs).sort((x, y) => x - y)) keep.push([kk, d]);
      i = j;
    }
    const buf = Buffer.alloc(keep.length * 7);
    keep.forEach(([kk, d], t) => { buf.writeUInt32LE(kk, t * 7); buf[t * 7 + 4] = d & 255; buf[t * 7 + 5] = (d >>> 8) & 255; buf[t * 7 + 6] = (d >>> 16) & 255; });
    fs.writeFileSync(path.join(out, MRIndex.fileName(f, bits)), buf);
    total += keep.length; maxFile = Math.max(maxFile, buf.length);
  }
  for (let s = 0; s * docShard < documenti.length; s++) {
    fs.writeFileSync(path.join(out, 'documenti', 'd-' + s + '.json'), JSON.stringify(documenti.slice(s * docShard, (s + 1) * docShard).map(d => [d.url, d.title])));
  }
  const versione = opts.versione || new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const meta = {
    formato: 2, versione, k: opts.k || MRIndex.K, w: opts.w || MRIndex.W, bits, docShard,
    documenti: documenti.length, voci: total, dfMax, scartate: dropped,
    archivio: opts.archivio || '', archivioData: opts.archivioData || '', archivioDal: opts.archivioDal || '', costruito: new Date().toISOString(),
    siti: opts.siti || [],
  };
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));
  return Object.assign({ maxFile, droppedKeys, files: nf }, meta);
}

module.exports = { Raccolta, scriviIndice, scegliBits };
