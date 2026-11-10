/* Matita Rossoblù · impronte del testo e ricerca nell'indice statico dei siti di studio.
   Le impronte sono hash di sequenze di 5 parole, scelte con il metodo winnowing (Schleimer, Wilkerson, Aiken 2003,
   lo stesso di MOSS): ogni passaggio identico di almeno W + K - 1 parole condivide sicuramente almeno un'impronta.
   Lo stesso codice gira nel browser e nel programma che costruisce l'indice (Node), quindi le due parti non divergono.
   L'indice contiene solo impronte, indirizzi e titoli: nessun testo delle pagine. Licenza MIT. */
var MRIndex = (function () {
  'use strict';
  const E = typeof MR !== 'undefined' ? MR : require('./engine.js');
  const K = 5, W = 24;
  const INF = 4294967296;

  // FNV-1a seguito dal finalizzatore di MurmurHash3: hash a 32 bit ben distribuito
  function fmix(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
  function strHash(s, seed) { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return fmix(h); }

  // hash delle sequenze di k parole su due canali a 32 bit (a, b); le sequenze con meno di 2 parole piene
  // o che toccano parti escluse (citazioni, bibliografia) valgono INF e non vengono mai scelte
  function gramHashes(toks, k, excl, cache) {
    const n = toks.length, g = Math.max(0, n - k + 1);
    const ta = new Uint32Array(n), tb = new Uint32Array(n), full = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
      const w = toks[t].w;
      let c = cache && cache.get(w);
      if (!c) { c = [strHash(w, 0x811c9dc5), strHash(w, 0x2545f491), E.isContent(w) ? 1 : 0]; if (cache) cache.set(w, c); }
      ta[t] = c[0]; tb[t] = c[1]; full[t] = c[2];
    }
    const A = new Float64Array(g), B = new Uint32Array(g);
    for (let i = 0; i < g; i++) {
      let cont = 0, bad = false;
      for (let j = 0; j < k; j++) { cont += full[i + j]; if (excl && excl[i + j]) bad = true; }
      if (bad || cont < 2) { A[i] = INF; continue; }
      let a = 0x9747b28c, b = 0x3c6ef372;
      for (let j = 0; j < k; j++) {
        a = Math.imul(a ^ ta[i + j], 0x01000193); a = (a << 13) | (a >>> 19);
        b = Math.imul(b ^ tb[i + j], 0x5bd1e995); b = (b << 11) | (b >>> 21);
      }
      A[i] = fmix(a ^ k); B[i] = fmix(b ^ (k * 31));
    }
    return { A, B };
  }

  // winnowing: in ogni finestra di w sequenze consecutive si sceglie il minimo (a parità, il più a destra)
  function winnow(A, w) {
    const n = A.length, out = [];
    if (!n) return out;
    if (n <= w) {
      let m = -1;
      for (let i = 0; i < n; i++) if (A[i] < INF && (m < 0 || A[i] <= A[m])) m = i;
      if (m >= 0) out.push(m);
      return out;
    }
    const dq = new Int32Array(n);
    let head = 0, tail = 0, last = -1;
    for (let i = 0; i < n; i++) {
      while (tail > head && A[dq[tail - 1]] >= A[i]) tail--;
      dq[tail++] = i;
      if (dq[head] <= i - w) head++;
      if (i >= w - 1) { const m = dq[head]; if (m !== last && A[m] < INF) { out.push(m); last = m; } }
    }
    return out;
  }

  // impronte di un testo: [{ pos (prima parola della sequenza), a, b }]
  function fingerprints(toks, o) {
    o = o || {};
    const k = o.k || K, w = o.w || W;
    const { A, B } = gramHashes(toks, k, o.excl, o.cache);
    return winnow(A, w).map(i => ({ pos: i, a: A[i], b: B[i] }));
  }

  // posizione nell'indice: i primi `bits` bit scelgono il secchio, i 32 successivi sono la chiave
  function bucketOf(a, bits) { return a >>> (32 - bits); }
  function keyOf(a, b, bits) { return ((a << bits) | (b >>> (32 - bits))) >>> 0; }

  // passaggi ricostruiti: impronte vicine (distanza <= w) fanno parte dello stesso passaggio
  function passages(positions, k, w) {
    const ps = Array.from(new Set(positions)).sort((x, y) => x - y), out = [];
    let cur = null;
    for (const p of ps) {
      if (cur && p - cur.last <= w) { cur.last = p; cur.te = p + k; cur.n++; }
      else { cur = { ti: p, te: p + k, last: p, n: 1 }; out.push(cur); }
    }
    return out.map(c => ({ ti: c.ti, te: c.te, n: c.n }));
  }

  class IndexError extends Error {
    constructor(kind, detail) { super('indice: ' + kind); this.name = 'IndexError'; this.kind = kind; this.detail = detail; }
  }
  function abortError() { const e = new Error('ricerca interrotta'); e.name = 'AbortError'; return e; }

  // Ricerca nell'indice statico: meta.json, conteggi per secchio, voci di 7 byte (chiave 32 bit + documento 24 bit)
  // lette con richieste parziali (HTTP Range), metadati dei documenti in file JSON da `docShard` voci.
  function createIndex(base, env) {
    env = env || {};
    const doFetch = env.fetch || ((u, o) => fetch(u, o));
    let meta = null, prefix = null;
    const docCache = new Map();

    async function get(url, init, signal) {
      let res;
      try { res = await doFetch(url, Object.assign({ signal, credentials: 'same-origin' }, init || {})); }
      catch (e) { if (signal && signal.aborted) throw abortError(); throw new IndexError('network', e && e.message); }
      if (res.status === 404) throw new IndexError('missing', url);
      if (!res.ok) throw new IndexError('http', res.status);
      return res;
    }
    async function load(signal) {
      if (meta) return meta;
      const m = await (await get(base + 'meta.json', { cache: 'no-cache' }, signal)).json();
      if (!m || m.formato !== 1) throw new IndexError('format', 'versione');
      const buf = new Uint8Array(await (await get(base + m.dir + '?v=' + m.versione, null, signal)).arrayBuffer());
      const nb = 1 << m.bits;
      if (buf.length !== nb * 2) throw new IndexError('format', 'dir');
      const p = new Float64Array(nb + 1);
      for (let i = 0; i < nb; i++) p[i + 1] = p[i] + (buf[2 * i] | (buf[2 * i + 1] << 8));
      prefix = p; meta = m;
      return m;
    }
    // byte da leggere per un insieme di secchi, uniti quando sono vicini nello stesso file
    function plan(buckets) {
      const reqs = [];
      for (const b of buckets) {
        const s = prefix[b], e = prefix[b + 1];
        if (e <= s) continue;
        const f = meta.files.find(x => s >= x.primo && s < x.primo + x.voci);
        if (!f) throw new IndexError('format', 'file');
        const from = (s - f.primo) * 7, to = (e - f.primo) * 7;
        const last = reqs[reqs.length - 1];
        if (last && last.f === f && from - last.to <= 4096) { last.to = to; last.buckets.push(b); }
        else reqs.push({ f, from, to, buckets: [b] });
      }
      return reqs;
    }
    async function readRange(r, signal) {
      const res = await get(base + r.f.nome + '?v=' + meta.versione, { headers: { Range: 'bytes=' + r.from + '-' + (r.to - 1) } }, signal);
      if (res.status !== 206) {
        // server senza richieste parziali: si accetta solo un file piccolo
        const len = parseInt(res.headers.get('Content-Length') || '0', 10);
        if (!len || len > 4 * 1024 * 1024) throw new IndexError('range', res.status);
        return new Uint8Array(await res.arrayBuffer()).subarray(r.from, r.to);
      }
      return new Uint8Array(await res.arrayBuffer());
    }
    // impronte -> { idDocumento: [posizioni nel testo] }
    async function lookup(fps, signal, onProgress) {
      await load(signal);
      const bits = meta.bits, want = new Map();
      for (const f of fps) {
        const b = bucketOf(f.a, bits);
        let arr = want.get(b);
        if (!arr) want.set(b, arr = []);
        arr.push({ key: keyOf(f.a, f.b, bits), pos: f.pos });
      }
      const reqs = plan(Array.from(want.keys()).sort((x, y) => x - y));
      const hits = new Map();
      let done = 0;
      const worker = async () => {
        for (;;) {
          const r = reqs.shift();
          if (!r) return;
          const bytes = await readRange(r, signal);
          const base0 = prefix[r.buckets[0]];
          for (const b of r.buckets) {
            const off = (prefix[b] - base0) * 7, cnt = prefix[b + 1] - prefix[b];
            const keyAt = j => (bytes[off + j * 7] | (bytes[off + j * 7 + 1] << 8) | (bytes[off + j * 7 + 2] << 16) | (bytes[off + j * 7 + 3] << 24)) >>> 0;
            for (const q of want.get(b)) {
              let lo = 0, hi = cnt;
              while (lo < hi) { const mid = (lo + hi) >> 1; if (keyAt(mid) < q.key) lo = mid + 1; else hi = mid; }
              for (let j = lo; j < cnt && keyAt(j) === q.key; j++) {
                const o = off + j * 7 + 4, doc = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
                let arr = hits.get(doc);
                if (!arr) hits.set(doc, arr = []);
                arr.push(q.pos);
              }
            }
          }
          done++;
          if (onProgress) onProgress(done, done + reqs.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, reqs.length) }, worker));
      return { hits, requests: done };
    }
    async function docs(ids, signal) {
      await load(signal);
      const out = new Map(), shards = new Map();
      for (const id of ids) { const s = Math.floor(id / meta.docShard); if (!shards.has(s)) shards.set(s, []); shards.get(s).push(id); }
      for (const [s, list] of shards) {
        let arr = docCache.get(s);
        if (!arr) { arr = await (await get(base + 'documenti/d-' + s + '.json?v=' + meta.versione, null, signal)).json(); docCache.set(s, arr); }
        for (const id of list) { const d = arr[id - s * meta.docShard]; if (d) out.set(id, { id, url: d[0], title: d[1] }); }
      }
      return out;
    }
    // ricerca completa: documenti con almeno `minFp` impronte in comune, ordinati per parole coperte
    async function search(toks, excl, o) {
      o = o || {};
      const m = await load(o.signal);
      const fps = fingerprints(toks, { k: m.k, w: m.w, excl });
      if (!fps.length) return { fingerprints: 0, requests: 0, docs: [], meta: m };
      const { hits, requests } = await lookup(fps, o.signal, o.onProgress);
      const found = [];
      for (const [id, pos] of hits) {
        const ps = passages(pos, m.k, m.w).filter(p => p.n >= 2);
        const words = ps.reduce((s, p) => s + p.te - p.ti, 0);
        if (ps.length) found.push({ id, passages: ps, words, fp: new Set(pos).size });
      }
      found.sort((x, y) => y.words - x.words || y.fp - x.fp);
      const top = found.slice(0, o.max || 8);
      const info = await docs(top.map(d => d.id), o.signal);
      for (const d of top) Object.assign(d, info.get(d.id) || { url: '', title: '' });
      return { fingerprints: fps.length, requests, docs: top.filter(d => d.url), candidates: found.length, meta: m };
    }
    return { load, lookup, docs, search, meta: () => meta };
  }

  return { K, W, strHash, fmix, gramHashes, winnow, fingerprints, bucketOf, keyOf, passages, createIndex, IndexError };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MRIndex;
