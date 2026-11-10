// Scrittura dei file dell'indice di impronte (Node). Usato dal costruttore e dai test.
//   meta.json                descrizione dell'indice
//   dir.bin                  numero di voci per secchio, Uint16 little-endian
//   fp-NN.bin                voci ordinate per secchio e chiave: chiave Uint32 LE + documento a 24 bit LE (7 byte)
//   documenti/d-S.json       [[url, titolo], ...] per i documenti S*docShard ... S*docShard+docShard-1
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

function scegliBits(n) { let b = 8; while (b < 20 && n / (1 << b) > 512) b++; return b; }

// opts: { k, w, dfMax, docShard, maxFileBytes, archivio, siti }
function scriviIndice(out, documenti, R, opts) {
  opts = opts || {};
  const dfMax = opts.dfMax || 8, docShard = opts.docShard || 1000, maxFile = opts.maxFileBytes || 40 * 1024 * 1024;
  const n = R.n, bits = opts.bits || scegliBits(n), nb = 1 << bits;
  // ordinamento per secchio (conteggio) e poi per chiave dentro il secchio
  const bucket = new Uint32Array(n), key = new Uint32Array(n), cnt = new Uint32Array(nb + 1);
  for (let i = 0; i < n; i++) { const b = MRIndex.bucketOf(R.A[i], bits); bucket[i] = b; key[i] = MRIndex.keyOf(R.A[i], R.B[i], bits); cnt[b + 1]++; }
  for (let b = 0; b < nb; b++) cnt[b + 1] += cnt[b];
  const order = new Uint32Array(n), fill = cnt.slice(0, nb);
  for (let i = 0; i < n; i++) order[fill[bucket[i]]++] = i;
  const kept = new Uint32Array(nb);
  let total = 0, dropped = 0, droppedKeys = 0;
  const outIdx = new Uint32Array(n);
  for (let b = 0; b < nb; b++) {
    const s = cnt[b], e = cnt[b + 1];
    if (e === s) continue;
    const slice = Array.from(order.subarray(s, e)).sort((x, y) => key[x] - key[y] || R.D[x] - R.D[y]);
    for (let i = 0; i < slice.length;) {
      let j = i; const kk = key[slice[i]];
      while (j < slice.length && key[slice[j]] === kk) j++;
      const docsN = new Set(slice.slice(i, j).map(x => R.D[x])).size;
      if (docsN > dfMax) { dropped += j - i; droppedKeys++; }
      else { const seen = new Set(); for (let t = i; t < j; t++) { const d = R.D[slice[t]]; if (!seen.has(d)) { seen.add(d); outIdx[total++] = slice[t]; kept[b]++; } } }
      i = j;
    }
  }
  let maxBucket = 0;
  for (let b = 0; b < nb; b++) maxBucket = Math.max(maxBucket, kept[b]);
  if (maxBucket > 65535) throw new Error('secchio troppo pieno: ' + maxBucket);
  fs.mkdirSync(path.join(out, 'documenti'), { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^fp-\d+\.bin$/.test(f)) fs.unlinkSync(path.join(out, f));
  const dir = Buffer.alloc(nb * 2);
  for (let b = 0; b < nb; b++) dir.writeUInt16LE(kept[b], b * 2);
  fs.writeFileSync(path.join(out, 'dir.bin'), dir);
  // file interi per secchio, ciascuno sotto maxFile byte
  const files = [];
  let pos = 0, b = 0;
  while (b < nb) {
    const primo = pos; let voci = 0;
    while (b < nb && (voci === 0 || (voci + kept[b]) * 7 <= maxFile)) { voci += kept[b]; b++; }
    const buf = Buffer.alloc(voci * 7);
    for (let t = 0; t < voci; t++) {
      const i = outIdx[primo + t];
      buf.writeUInt32LE(key[i], t * 7);
      const d = R.D[i]; buf[t * 7 + 4] = d & 255; buf[t * 7 + 5] = (d >>> 8) & 255; buf[t * 7 + 6] = (d >>> 16) & 255;
    }
    const nome = 'fp-' + String(files.length).padStart(2, '0') + '.bin';
    fs.writeFileSync(path.join(out, nome), buf);
    files.push({ nome, primo, voci });
    pos += voci;
  }
  for (let s = 0; s * docShard < documenti.length; s++) {
    fs.writeFileSync(path.join(out, 'documenti', 'd-' + s + '.json'), JSON.stringify(documenti.slice(s * docShard, (s + 1) * docShard).map(d => [d.url, d.title])));
  }
  const versione = opts.versione || new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const meta = {
    formato: 1, versione, k: opts.k || MRIndex.K, w: opts.w || MRIndex.W, bits, dir: 'dir.bin', files, docShard,
    documenti: documenti.length, voci: total, dfMax, scartate: dropped, archivio: opts.archivio || '', archivioData: opts.archivioData || '', archivioDal: opts.archivioDal || '', costruito: new Date().toISOString(),
    siti: opts.siti || [],
  };
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));
  return Object.assign({ maxBucket, droppedKeys }, meta);
}

module.exports = { Raccolta, scriviIndice, scegliBits };
