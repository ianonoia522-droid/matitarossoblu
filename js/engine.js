/* Matita Rossoblù · motore di analisi (antiplagio lessicale e segnali di stile).
   Puro JavaScript, nessuna dipendenza e nessuna richiesta di rete. Licenza MIT. */
var MR = (function () {
  'use strict';

  const MARK_RE = /\p{M}+/gu;
  const ASCII_RE = /^[\x00-\x7F]*$/;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const NF1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const NF2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const P0 = (x) => Math.round(x * 100) + '%';

  function foldWord(w) {
    return ASCII_RE.test(w) ? w.toLowerCase() : w.normalize('NFD').replace(MARK_RE, '').toLowerCase();
  }

  // Testo in minuscolo, senza accenti, con apostrofi e virgolette uniformati; map[i] = posizione nell'originale
  function foldWithMap(text) {
    const parts = [], map = [];
    const n = text.length;
    for (let i = 0; i < n; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) { parts.push(c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : text[i]); map.push(i); continue; }
      const pair = c >= 0xD800 && c <= 0xDBFF && i + 1 < n;
      const ch = pair ? text.slice(i, i + 2) : text[i];
      let f;
      if (ch === '’' || ch === '‘' || ch === 'ʼ' || ch === '´') f = "'";
      else if (ch === '“' || ch === '”' || ch === '„') f = '"';
      else if (ch === ' ' || ch === ' ' || ch === ' ' || ch === ' ') f = ' ';
      else f = ch.normalize('NFD').replace(MARK_RE, '').toLowerCase();
      for (let k = 0; k < f.length; k++) { parts.push(f[k]); map.push(i); }
      if (pair) i++;
    }
    map.push(n);
    return { s: parts.join(''), map };
  }
  function foldIdx(F, orig) {
    let lo = 0, hi = F.map.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (F.map[mid] < orig) lo = mid + 1; else hi = mid; }
    return lo;
  }

  const WORD_RE = /[\p{L}\p{N}]+/gu;
  function tokenize(text) {
    const toks = []; let m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text)) !== null) toks.push({ w: foldWord(m[0]), s: m.index, e: m.index + m[0].length });
    return toks;
  }
  function countWords(text) { let n = 0; WORD_RE.lastIndex = 0; while (WORD_RE.exec(text) !== null) n++; return n; }
  function tokAt(toks, off) {
    let lo = 0, hi = toks.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (toks[mid].s < off) lo = mid + 1; else hi = mid; }
    return lo;
  }

  const STOP = new Set(('a ad al allo ai agli all alla alle anche ancora avere aveva avevano abbia abbiamo abbiano ben che chi ci cio cioe come con contro cosi cui da dal dallo dai dagli dall dalla dalle del dello dei degli dell della delle dentro di dove dopo dunque e ed era erano essa esse essi esso essere essendo fa fanno fare fatto fra gia gli ha hai hanno ho i il in inoltre infatti invece io la le lei li lo loro lui ma mai me meno mentre mi mia mie miei mio molto molta molti molte ne nei negli nel nello nell nella nelle no noi non nonche nostra nostre nostri nostro o ogni oppure ora ossia ovvero per perche pero piu poco poi possono potrebbe prima pure puo qual quale quali qualche quando quanto quanta quanti quante quella quelle quelli quello questa queste questi questo qui quindi sara saranno se sei sempre senza si sia siamo siano siete solo sono sopra sotto sta stata state stati stato stesso stessa stessi stesse su sua sue sui sul sullo sull sulla sulle suo suoi tale tali tanto tanta tanti tante te ti tra tu tua tue tuo tuoi tutti tutto tutta tutte tuttavia un una uno va vi viene vengono voi vostro vostra altro altra altri altre ecc es cosa ' +
    'the an and or but if of to in on at by for with from as is are was were be been being it its this that these those there their they them he she his her we our you your me my not no so than then too very can could should would will may might must do does did have has had which who whom what when where why how all any each more most other some such only own same also into about over under between through during before after above below up down out off again further once here both few nor just because while until against among upon within without one ones s t').split(' '));
  const IT_FN = new Set('il lo la gli le di che per non una del della delle dei degli sono con nel nella alla anche come piu questo questa sul sulla essere stato hanno'.split(' '));
  const EN_FN = new Set('the and of to is that it for with as are this be was on by not from have has which were'.split(' '));

  function stem(w) {
    if (w.length >= 6 && w.endsWith('es')) w = w.slice(0, -2);
    else if (w.length >= 5 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w.length >= 5 && /[aeiou]$/.test(w)) w = w.slice(0, -1);
    return w.length > 6 ? w.slice(0, 6) : w;
  }
  function isContent(w) { return (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) || /^\d{2,}$/.test(w); }

  // ---------- frasi e paragrafi ----------
  const STRONG_ABBR = new Set('dott dr prof sig sigg ing avv arch geom rag mr mrs ms fig figg tab tabb cap capp vol voll art artt pag pagg cfr es eg ie vs ca rif par sez lett co'.split(' '));
  const ABBR = new Set('ecc etc n nn nr num no p pp v vd s ss sgg ed eds op cit ibid id tel gen feb mar apr mag giu lug ago set sett ott nov dic jan jun jul aug sep oct dec inc ltd corp spa srl sas snc approx min max st'.split(' '));
  const SENT_RE = /([.!?…]+)(["'»”’)\]]*)(?:[ \t  ]+|(?=\n)|$)|\n/g;
  function splitSentences(text) {
    const out = []; let start = 0, m;
    const push = (a, b) => {
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      if (b > a) out.push({ s: a, e: b });
    };
    SENT_RE.lastIndex = 0;
    while ((m = SENT_RE.exec(text)) !== null) {
      if (m[0] === '\n') { push(start, m.index); start = m.index + 1; continue; }
      if (!m[0].length) { SENT_RE.lastIndex++; continue; }
      const endIdx = m.index + m[1].length + m[2].length;
      const next = text.charAt(m.index + m[0].length);
      if (m[1] === '.') {
        const wm = /(\p{L}+)$/u.exec(text.slice(Math.max(start, m.index - 16), m.index));
        if (wm) {
          const raw = wm[1], w = foldWord(raw);
          if (raw.length === 1 && /\p{Lu}/u.test(raw) && /\p{Lu}/u.test(next)) continue;
          if (STRONG_ABBR.has(w)) continue;
          if (ABBR.has(w) && /[\p{Ll}\d]/u.test(next)) continue;
        }
      }
      if (/\p{Ll}/u.test(next)) continue;
      push(start, endIdx); start = endIdx;
    }
    push(start, text.length);
    return out;
  }
  function attachTokens(sents, toks) {
    let t = 0;
    for (const s of sents) {
      while (t < toks.length && toks[t].s < s.s) t++;
      s.ti = t;
      while (t < toks.length && toks[t].s < s.e) t++;
      s.te = t;
    }
    return sents;
  }
  // Testo a capo fisso (email, .txt a 80 colonne): gli a capo singoli diventano spazi, stessa lunghezza
  function unwrapIfHardWrapped(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length);
    if (lines.length < 6) return text;
    let wrapped = 0;
    for (const l of lines) if (l.length >= 45 && l.length <= 110 && !/[.!?:;»"”)]$/.test(l)) wrapped++;
    if (wrapped / lines.length < 0.5) return text;
    return text.replace(/([^\n])\n(?!\n)/g, '$1 ');
  }
  function splitParagraphs(text) {
    const out = []; const blank = /\n[ \t]*\n/.test(text);
    const re = blank ? /\n[ \t]*\n\s*/g : /\n+/g;
    let start = 0, m;
    while ((m = re.exec(text)) !== null) { if (m.index > start) out.push({ s: start, e: m.index }); start = m.index + m[0].length; }
    if (start < text.length) out.push({ s: start, e: text.length });
    return out;
  }
  function sentStems(toks, sents, excl) {
    for (const s of sents) {
      const set = new Set();
      for (let t = s.ti; t < s.te; t++) { if (excl && excl[t]) continue; const w = toks[t].w; if (isContent(w)) set.add(stem(w)); }
      s.stems = set;
    }
  }
  function prepText(obj) {
    if (obj._src === obj.text && obj.toks) return obj;
    obj.toks = tokenize(obj.text);
    obj.sents = attachTokens(splitSentences(unwrapIfHardWrapped(obj.text)), obj.toks);
    sentStems(obj.toks, obj.sents, null);
    obj._src = obj.text; obj._idx = null; obj._idxK = 0;
    return obj;
  }
  function findQuotes(text) {
    const out = []; const re = /«[^«»\n]{1,800}»|“[^“”\n]{1,800}”|"[^"\n]{1,800}"/g; let m;
    while ((m = re.exec(text)) !== null) out.push({ s: m.index, e: m.index + m[0].length });
    return out;
  }
  function lastBiblioHeading(text) {
    const re = /^[ \t]*(?:\d+(?:\.\d+)*[.)]?[ \t]+)?(?:bibliografia(?: e sitografia)?|riferimenti bibliografici|riferimenti|sitografia|fonti bibliografiche|references|bibliography|works cited|literature cited)[ \t]*:?[ \t]*$/gim;
    let m, last = -1;
    while ((m = re.exec(text)) !== null) last = m.index;
    return last;
  }
  function prepDoc(text, opts) {
    const toks = tokenize(text), n = toks.length, excl = new Uint8Array(n);
    let biblioStart = -1;
    if (opts.ignoreBiblio) { const h = lastBiblioHeading(text); if (h >= 0 && h >= text.length * 0.4) biblioStart = h; }
    const quotes = opts.ignoreQuotes ? findQuotes(text) : [];
    let qi = 0, quoteWords = 0, biblioWords = 0;
    for (let i = 0; i < n; i++) {
      const t = toks[i];
      if (biblioStart >= 0 && t.s >= biblioStart) { excl[i] = 2; biblioWords++; continue; }
      while (qi < quotes.length && quotes[qi].e <= t.s) qi++;
      if (qi < quotes.length && t.s >= quotes[qi].s && t.e <= quotes[qi].e) { excl[i] = 1; quoteWords++; }
    }
    const sents = attachTokens(splitSentences(unwrapIfHardWrapped(text)), toks);
    sentStems(toks, sents, excl);
    return { text, toks, excl, sents, quotes: biblioStart >= 0 ? quotes.filter(q => q.s < biblioStart) : quotes, biblioStart, quoteWords, biblioWords, bodyWords: n - biblioWords };
  }

  // ---------- corrispondenze letterali ----------
  function seedKeys(toks, k, excl) {
    const n = toks.length, keys = new Array(Math.max(0, n - k + 1));
    for (let i = 0; i + k <= n; i++) {
      let ok = true, content = false, key = '';
      for (let t = i; t < i + k; t++) {
        if (excl && excl[t]) { ok = false; break; }
        const w = toks[t].w;
        if (!content && isContent(w)) content = true;
        key += (t > i ? ' ' : '') + w;
      }
      keys[i] = ok && content ? key : null;
    }
    return keys;
  }
  function buildIndex(keys) {
    const idx = new Map();
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j]; if (key === null) continue;
      const arr = idx.get(key);
      if (!arr) idx.set(key, [j]); else if (arr.length < 40) arr.push(j);
    }
    return idx;
  }
  function findRuns(D, ex, docKeys, S, idx) {
    const runs = [], diagEnd = new Map();
    for (let i = 0; i < docKeys.length; i++) {
      const key = docKeys[i]; if (key === null) continue;
      const hits = idx.get(key); if (!hits) continue;
      for (let h = 0; h < hits.length; h++) {
        const j = hits[h], d = j - i, end = diagEnd.get(d);
        if (end !== undefined && end > i) continue;
        let a = i, b = j;
        const floor = end === undefined ? 0 : end;
        while (a - 1 >= floor && b - 1 >= 0 && !ex[a - 1] && D[a - 1].w === S[b - 1].w) { a--; b--; }
        let x = i, y = j;
        while (x < D.length && y < S.length && !ex[x] && D[x].w === S[y].w) { x++; y++; }
        runs.push({ i: a, j: b, len: x - a });
        diagEnd.set(d, x);
      }
    }
    return runs;
  }
  function selectRuns(runs, n, minLen) {
    runs.sort((p, q) => q.len - p.len || p.i - q.i);
    const taken = new Uint8Array(n), sel = [];
    for (const r of runs) {
      const end = r.i + r.len; let a = r.i;
      while (a < end) {
        while (a < end && taken[a]) a++;
        let b = a; while (b < end && !taken[b]) b++;
        if (b - a >= minLen) { sel.push({ i: a, j: r.j + (a - r.i), len: b - a }); taken.fill(1, a, b); }
        a = b;
      }
    }
    return sel.sort((p, q) => p.i - q.i);
  }
  function mergeRuns(sel, gap) {
    const out = [];
    for (const r of sel) {
      const last = out[out.length - 1];
      if (last) {
        const dGap = r.i - last.iE, sGap = r.j - last.jE;
        if (dGap >= 0 && dGap <= gap && sGap >= -1 && sGap <= gap && Math.abs(dGap - sGap) <= gap) {
          last.iE = r.i + r.len; last.jE = Math.max(last.jE, r.j + r.len); last.matched += r.len; last.longest = Math.max(last.longest, r.len);
          continue;
        }
      }
      out.push({ iS: r.i, iE: r.i + r.len, jS: r.j, jE: r.j + r.len, matched: r.len, longest: r.len });
    }
    return out;
  }
  const seedSize = (k) => (k <= 5 ? Math.max(3, k - 1) : (k <= 8 ? 4 : 5));

  function analyzePlagiarism(docText, sources, opts) {
    const doc = prepDoc(docText, opts);
    const n = doc.toks.length, k = opts.k, sk = seedSize(k);
    const docKeys = seedKeys(doc.toks, sk, doc.excl);
    const passages = [];
    for (const src of sources) {
      prepText(src);
      if (!src._idx || src._idxK !== sk) { src._idx = buildIndex(seedKeys(src.toks, sk, null)); src._idxK = sk; }
      const runs = findRuns(doc.toks, doc.excl, docKeys, src.toks, src._idx);
      const sel = selectRuns(runs, n, sk);
      for (const p of mergeRuns(sel, opts.gap)) {
        const span = p.iE - p.iS;
        if (p.matched < k || p.matched / span < 0.5) continue;
        p.src = src.id; p.kind = 'lit';
        p.ident = p.matched / Math.max(span, p.jE - p.jS);
        passages.push(p);
      }
    }
    passages.sort((a, b) => a.iS - b.iS || (b.iE - b.iS) - (a.iE - a.iS));
    const owner = new Int32Array(n).fill(-1);
    const byLen = passages.map((p, i) => i).sort((a, b) => (passages[b].iE - passages[b].iS) - (passages[a].iE - passages[a].iS));
    for (const pi of byLen) { const p = passages[pi]; for (let t = p.iS; t < p.iE; t++) if (owner[t] < 0) owner[t] = pi; }
    let literal = 0; for (let t = 0; t < n; t++) if (owner[t] >= 0) literal++;
    const para = opts.paraSens === 'off' || !sources.length ? [] : findParaphrases(doc, sources, owner, opts);
    let paraWords = 0; const paraTok = new Uint8Array(n);
    for (const h of para) {
      const s = doc.sents[h.d]; let w = 0;
      for (let t = s.ti; t < s.te; t++) if (owner[t] < 0 && !doc.excl[t] && !paraTok[t]) { paraTok[t] = 1; w++; }
      h.words = w; paraWords += w;
    }
    const per = sources.map(src => ({ id: src.id, name: src.name, covered: 0, passages: 0, longest: 0, para: 0, paraN: 0 }));
    const pid = new Map(per.map(x => [x.id, x]));
    for (const p of passages) { const x = pid.get(p.src); x.passages++; x.covered += p.iE - p.iS; x.longest = Math.max(x.longest, p.iE - p.iS); }
    for (const h of para) { const x = pid.get(h.src); x.para += h.words; x.paraN++; }
    return { doc, passages, owner, para, paraTok, per, literal, paraWords, bodyWords: doc.bodyWords, k, gap: opts.gap };
  }

  // ---------- parafrasi a livello di frase ----------
  function findParaphrases(doc, sources, owner, opts) {
    const hi = opts.paraSens === 'alta';
    const minShared = hi ? 3 : 4, minCont = hi ? 0.5 : 0.6, minDice = hi ? 0.35 : 0.42;
    const inv = new Map(); let total = 0;
    sources.forEach((src, si) => {
      src.sents.forEach((ss, sj) => {
        total++;
        for (const st of ss.stems) { let a = inv.get(st); if (!a) inv.set(st, a = []); a.push(si * 1e6 + sj); }
      });
    });
    const maxDf = Math.max(25, Math.floor(total * 0.06));
    const hits = [];
    for (let d = 0; d < doc.sents.length; d++) {
      const ds = doc.sents[d];
      if (ds.stems.size < minShared + 1) continue;
      const nt = ds.te - ds.ti; if (!nt) continue;
      let cov = 0, exc = 0;
      for (let t = ds.ti; t < ds.te; t++) { if (owner[t] >= 0) cov++; if (doc.excl[t]) exc++; }
      if (cov / nt > 0.5 || exc / nt > 0.5) continue;
      const counts = new Map();
      for (const st of ds.stems) { const a = inv.get(st); if (!a || a.length > maxDf) continue; for (const key of a) counts.set(key, (counts.get(key) || 0) + 1); }
      let best = null;
      for (const [key, c] of counts) {
        if (c < 2) continue;
        const si = Math.floor(key / 1e6), sj = key % 1e6, ss = sources[si].sents[sj];
        let shared = 0; for (const st of ds.stems) if (ss.stems.has(st)) shared++;
        if (shared < minShared) continue;
        const cont = shared / ds.stems.size, dice = 2 * shared / (ds.stems.size + ss.stems.size);
        if (cont < minCont || dice < minDice) continue;
        const score = 0.6 * cont + 0.4 * dice;
        if (!best || score > best.score) best = { d, si, sj, src: sources[si].id, shared, cont, dice, score };
      }
      if (best) hits.push(best);
    }
    return hits;
  }

  // ---------- frasi da cercare sul web ----------
  function fingerprints(doc, max) {
    const { toks, text, excl } = doc, cands = [];
    for (let si = 0; si < doc.sents.length; si++) {
      const s = doc.sents[si], len = s.te - s.ti;
      if (len < 9) continue;
      let bad = false; for (let t = s.ti; t < s.te; t++) if (excl[t]) { bad = true; break; }
      if (bad) continue;
      const w = new Array(len);
      for (let x = 0; x < len; x++) {
        const tk = toks[s.ti + x], raw = text.slice(tk.s, tk.e);
        let v = STOP.has(tk.w) ? 0.15 : (/\d/.test(raw) ? 1.4 : raw.length >= 9 ? 1.3 : raw.length >= 6 ? 1 : 0.6);
        if (x > 0 && /^\p{Lu}/u.test(raw)) v += 0.4;
        w[x] = v;
      }
      const W = Math.min(13, len); let sum = 0, best = -1, bestA = 0;
      for (let x = 0; x < len; x++) { sum += w[x]; if (x >= W) sum -= w[x - W]; if (x >= W - 1 && sum > best) { best = sum; bestA = x - W + 1; } }
      let ti = s.ti + bestA, te = ti + W;
      // non spezzare numeri come 4,1 o 12.5 ai bordi della finestra
      const numJoin = (a, b) => /^\d+$/.test(toks[a].w) && /^\d+$/.test(toks[b].w) && /^[.,:\/]$/.test(text.slice(toks[a].e, toks[b].s));
      while (te < s.te && numJoin(te - 1, te)) te++;
      while (ti > s.ti && numJoin(ti - 1, ti)) ti--;
      const phrase = text.slice(toks[ti].s, toks[te - 1].e).replace(/["“”«»]/g, ' ').replace(/\s+/g, ' ').trim();
      cands.push({ ti, te, score: best / W, phrase });
    }
    const N = toks.length || 1, used = new Set(), first = [];
    const segs = Math.min(8, cands.length);
    for (let g = 0; g < segs; g++) {
      const lo = g * N / segs, hi = (g + 1) * N / segs; let b = null;
      for (const c of cands) if (!used.has(c) && c.ti >= lo && c.ti < hi && (!b || c.score > b.score)) b = c;
      if (b) { used.add(b); first.push(b); }
    }
    first.sort((a, b) => a.ti - b.ti);
    const more = cands.filter(c => !used.has(c)).sort((a, b) => b.score - a.score).slice(0, Math.max(0, max - first.length)).sort((a, b) => a.ti - b.ti);
    return first.concat(more);
  }

  // ---------- ricerche per Wikipedia ----------
  // Sequenze di parole consecutive, dentro una frase e fuori dalle parti escluse, da cercare come frase esatta.
  // Più frasi vanno in una stessa ricerca, unite da OR, entro il limite di CirrusSearch (300 caratteri).
  function detectLang(input) {
    const toks = typeof input === 'string' ? tokenize(input) : input;
    let itc = 0, enc = 0;
    for (const t of toks) { if (IT_FN.has(t.w)) itc++; else if (EN_FN.has(t.w)) enc++; }
    return enc > itc * 1.2 ? 'en' : 'it';
  }
  function utf8len(s) { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; }
  const GAP_PLAIN = /^[\s,;:()\[\]«»"“”„–—]+$/;   // separatori che la ricerca ignora
  const GAP_APOS = /^['’ʼ]$/;
  function wikiQueries(input, opts) {
    opts = opts || {};
    const doc = typeof input === 'string' ? prepDoc(input, opts) : input;
    const { toks, text, excl } = doc, n = toks.length;
    const W = opts.words || 6, maxLen = opts.maxLen || 280, maxBytes = opts.maxBytes || 290;
    const maxPhrases = opts.maxPhrases || Math.max(8, Math.min(20, Math.round(doc.bodyWords / 60)));
    // giunzione con la parola precedente: 1 spazio, 2 apostrofo, 0 non cercabile (trattini, punti, numeri come 4,1)
    const join = new Uint8Array(n);
    for (let t = 1; t < n; t++) {
      const g = text.slice(toks[t - 1].e, toks[t].s);
      if (GAP_APOS.test(g)) join[t] = 2;
      else if (GAP_PLAIN.test(g) && (/\s/.test(g) || !(/^\d+$/.test(toks[t - 1].w) && /^\d+$/.test(toks[t].w)))) join[t] = 1;
    }
    const weight = (t, first) => {
      const tk = toks[t], raw = text.slice(tk.s, tk.e);
      if (STOP.has(tk.w)) return 0.15;
      let v = /\d/.test(raw) ? 1.1 : raw.length >= 9 ? 1.3 : raw.length >= 6 ? 1 : 0.6;
      if (t > first && /^\p{Lu}/u.test(raw)) v += 0.3;
      return v;
    };
    const cands = [];
    for (const s of doc.sents) {
      if (s.te - s.ti < W) continue;
      let best = null;
      for (let a = s.ti; a + W <= s.te; a++) {
        let ok = true, sc = 0, content = 0;
        for (let t = a; t < a + W; t++) {
          if (excl[t] || (t > a && !join[t])) { ok = false; break; }
          sc += weight(t, s.ti);
          if (isContent(toks[t].w)) content++;
        }
        if (ok && content >= 3 && (!best || sc > best.sc)) best = { ti: a, te: a + W, sc };
      }
      if (best) cands.push(best);
    }
    const phraseOf = (c) => {
      let q = '';
      for (let t = c.ti; t < c.te; t++) { if (t > c.ti) q += join[t] === 2 ? "'" : ' '; q += text.slice(toks[t].s, toks[t].e); }
      return q.normalize('NFC');
    };
    // prima la frase migliore di ogni tratto del testo, poi le migliori rimaste
    const used = new Set(), seen = new Set(), pick = [];
    const take = (c) => { used.add(c); c.q = phraseOf(c); const key = c.q.toLowerCase(); if (seen.has(key) || c.q.length + 2 > maxLen) return; seen.add(key); pick.push(c); };
    const segs = Math.min(maxPhrases, cands.length);
    for (let g = 0; g < segs; g++) {
      const lo = g * n / segs, hi = (g + 1) * n / segs; let b = null;
      for (const c of cands) if (!used.has(c) && c.ti >= lo && c.ti < hi && (!b || c.sc > b.sc)) b = c;
      if (b) take(b);
    }
    for (const c of cands.filter(x => !used.has(x)).sort((a, b) => b.sc - a.sc)) { if (pick.length >= maxPhrases) break; take(c); }
    pick.sort((a, b) => a.ti - b.ti);
    const phrases = pick.slice(0, maxPhrases).map(c => ({ ti: c.ti, te: c.te, q: c.q }));
    const groups = [];
    let cur = [];
    const build = (arr) => arr.map(p => '"' + p.q + '"').join(' OR ');
    for (const p of phrases) {
      const q = build(cur.concat(p));
      if (cur.length && (q.length > maxLen || utf8len(q) > maxBytes)) { groups.push(build(cur)); cur = [p]; } else cur.push(p);
    }
    if (cur.length) groups.push(build(cur));
    // ricerca per argomento: le parole piene più frequenti (quelle di un titolo iniziale contano di più)
    const freq = new Map(), first = doc.sents[0], titled = first && first.te - first.ti <= 12;
    for (let t = 0; t < n; t++) {
      if (excl[t]) continue;
      const w = toks[t].w;
      if (w.length < 4 || !isContent(w) || /\d/.test(w)) continue;
      const st = stem(w);
      let r = freq.get(st);
      if (!r) freq.set(st, r = { n: 0, forms: new Map(), at: t });
      r.n += titled && t >= first.ti && t < first.te ? 3 : 1;
      const f = text.slice(toks[t].s, toks[t].e).toLowerCase().normalize('NFC');
      r.forms.set(f, (r.forms.get(f) || 0) + 1);
    }
    const top = Array.from(freq.values()).filter(r => r.n >= 2).sort((a, b) => b.n - a.n || a.at - b.at).slice(0, 3)
      .map(r => Array.from(r.forms.entries()).sort((a, b) => b[1] - a[1])[0][0]);
    return { phrases, groups, topic: top.length >= 2 ? top.join(' ') : '', lang: detectLang(toks) };
  }

  // ---------- confronto parola per parola ----------
  function lcsMask(a, b) {
    const n = a.length, m = b.length, W = m + 1, dp = new Uint16Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    const ma = new Uint8Array(n), mb = new Uint8Array(m); let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ma[i] = 1; mb[j] = 1; i++; j++; }
      else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++; else j++;
    }
    return { ma, mb };
  }

  // ---------- segnali di scrittura generata ----------
  const MARKERS = [
    ['it', 3, 'è importante sottolineare', "\\b(?:e|risulta|appare|diventa) (?:importante|fondamentale|essenziale|cruciale|utile) (?:sottolineare|notare|evidenziare|ricordare|considerare|osservare|precisare|tenere (?:presente|a mente))\\b"],
    ['it', 3, 'vale la pena notare', "\\bvale la pena (?:di )?(?:notare|sottolineare|ricordare|menzionare|evidenziare|osservare)\\b"],
    ['it', 3, 'svolge un ruolo cruciale', "\\b(?:svolg|gioc|rivest|ricopr|assum)\\w* (?:un |il )?ruolo (?:cruciale|fondamentale|chiave|centrale|essenziale|determinante|significativo|vitale|di primo piano|strategico)\\b"],
    ['it', 3, 'in un mondo sempre più…', "\\bin un (?:mondo|panorama|contesto|mercato) (?:sempre piu|in continua|in costante|in rapida|globalizzat|interconness)"],
    ['it', 3, 'immergiamoci / esploriamo insieme', "\\b(?:immergiamoci|addentriamoci|tuffiamoci|esploriamo insieme|scopriamo insieme|approfondiamo insieme)\\b"],
    ['it', 3, 'arazzo / ricco mosaico', "\\b(?:arazz[oi]|ricco mosaico|vasto mosaico)\\b"],
    ['it', 3, 'sfruttare appieno il potenziale', "\\b(?:sfruttar|liberar|sbloccar|esprimer|massimizzar)\\w* (?:appieno |pienamente |al meglio )?(?:il |l'intero |tutto il )?(?:pieno |suo |loro |vero |proprio )?potenziale\\b"],
    ['it', 3, 'navigare le sfide', "\\bnavigare (?:le|nelle|tra le|attraverso le|in|nel) (?:sfide|complessita|acque|incertezze|mare|panorama)\\b"],
    ['it', 3, 'ecco alcuni… (elenco da chatbot)', "\\becco (?:alcuni|alcune|un elenco|una lista|i principali|le principali|una panoramica|cinque|tre|quattro|dieci|sette)\\b"],
    ['it', 3, 'una miriade di', "\\b(?:una|un'?) ?(?:miriade|pletora) di\\b"],
    ['it', 2, 'in continua evoluzione', "\\bin (?:continua|costante|rapida|perenne) (?:evoluzione|trasformazione|crescita)\\b"],
    ['it', 2, 'testimonianza di', "\\b(?:e|rappresenta|costituisce|resta|rimane|sono) (?:una |la )?(?:chiara |vera |viva |concreta |tangibile )?testimonianza\\b|\\ba testimonianza (?:di|del|della|dell|dei|delle)\\b"],
    ['it', 2, 'sfide e opportunità', "\\b(?:sfide e (?:le )?opportunita|opportunita e (?:le )?sfide)\\b"],
    ['it', 2, 'approccio olistico / a 360 gradi', "\\b(?:a 360 gradi|olistic[oaie]|approccio integrato e)\\b"],
    ['it', 2, "nell'era digitale", "\\bnell'era (?:digitale|moderna|attuale|odierna|della|dell|dei|delle)\\b|\\bin un'epoca in cui\\b"],
    ['it', 2, 'elemento chiave / tassello fondamentale', "\\b(?:un|il|uno|una|la) (?:elemento|aspetto|fattore|tassello|pilastro|strumento|leva|componente) (?:chiave|cruciale|fondamentale|essenziale|imprescindibile|indispensabile|strategic[oa])\\b"],
    ['it', 2, 'pietra miliare / catalizzatore', "\\b(?:pietra miliare|pietre miliari|catalizzator[ei]|punto di svolta)\\b"],
    ['it', 2, 'sfaccettato / intricato', "\\b(?:sfaccettat[oaie]|intricat[oaie]|poliedric[oaie]|multidimensional[ei]|multisfaccettat[oaie])\\b"],
    ['it', 2, 'una panoramica completa', "\\b(?:di seguito|qui di seguito|ecco) (?:una panoramica|un riepilogo|un elenco|una sintesi|i punti chiave|alcuni consigli|alcuni suggerimenti|alcuni esempi)\\b|\\bpanoramica (?:completa|dettagliata|esaustiva|approfondita|chiara)\\b"],
    ['it', 2, 'promuovere una cultura', "\\b(?:promuover|favorir|incentivar|coltivar)\\w* (?:una |la )?(?:cultura|consapevolezza|sinergia|crescita sostenibile|innovazione)\\b"],
    ['it', 2, 'una vasta gamma di', "\\b(?:un'?|una) ?(?:ampia|vasta|ricca) (?:gamma|varieta|serie) di\\b"],
    ['it', 2, 'ricorda che / tieni presente', "\\b(?:ricorda|ricordate|ricordiamo|tieni presente|tenete presente|tieni a mente|tenete a mente) che\\b"],
    ['it', 2, 'è fondamentale che / per', "\\be (?:fondamentale|essenziale|cruciale|importante|indispensabile) (?:che|per|comprendere|capire|considerare|adottare|garantire|investire)\\b"],
    ['it', 2, 'un viaggio alla scoperta', "\\b(?:un|il|questo) viaggio (?:affascinante|alla scoperta|attraverso|nel mondo)\\b"],
    ['it', 1, 'cruciale', "\\bcrucial[ei]\\b"],
    ['it', 1, 'fondamentale / essenziale', "\\b(?:fondamental[ei]|essenzial[ei])\\b"],
    ['it', 1, 'in modo significativo / efficace', "\\b(?:in modo (?:significativo|efficace|ottimale|sostenibile|proattivo)|significativamente)\\b"],
    ['it', 1, 'sinergia', "\\bsinergi[ae]\\b"],
    ['it', 1, "innovativo / all'avanguardia", "\\b(?:all'avanguardia|innovativ[oaie]|trasformativ[oaie]|rivoluzionari[oaie])\\b"],
    ['it', 1, 'resiliente', "\\b(?:resilient[ei]|resilienza)\\b"],
    ['it', 1, 'senza dubbio', "\\bsenza (?:ombra di )?dubbio\\b"],
    ['it', 1, 'garantire', "\\bgarantir(?:e|ne|lo|la)\\b"],
    ['it', 1, 'affascinante', "\\baffascinant[ei]\\b"],
    ['en', 3, 'delve', "\\bdelv(?:e|es|ed|ing)\\b"],
    ['en', 3, 'tapestry', "\\btapestr(?:y|ies)\\b"],
    ['en', 3, 'testament to', "\\btestament to\\b"],
    ['en', 3, "it's important to note", "\\bit(?:'s| is) (?:important|worth|crucial|essential|vital|key) (?:to )?(?:note|noting|remember|consider|highlight|mention|recognize|understand|emphasize)\\b"],
    ['en', 3, "in today's fast-paced world", "\\bin today'?s (?:fast-paced|digital|ever-changing|rapidly (?:evolving|changing)|modern|interconnected|competitive) (?:world|age|landscape|era|society|environment)\\b"],
    ['en', 3, 'navigate the complexities', "\\bnavigat(?:e|es|ing) (?:the )?(?:complexities|challenges|intricacies|landscape|nuances)\\b"],
    ['en', 3, 'in the realm of', "\\bin the (?:realm|landscape) of\\b"],
    ['en', 3, 'a myriad of', "\\ba (?:myriad|plethora) of\\b"],
    ['en', 3, 'unlock the potential', "\\b(?:unlock|unleash|harness)(?:es|ed|ing|s)? (?:the |its |their |your )?(?:full )?(?:potential|power)\\b"],
    ['en', 3, 'plays a crucial role', "\\bplay(?:s|ed|ing)? (?:a|an) (?:crucial|key|vital|pivotal|significant|essential|critical|central) role\\b"],
    ['en', 3, "let's dive in", "\\blet(?:'s| us) (?:dive|delve|explore|take a (?:closer )?look|unpack|break (?:it|this) down)\\b"],
    ['en', 2, 'ever-evolving', "\\bever-(?:evolving|changing|growing|shifting|expanding)\\b"],
    ['en', 2, 'underscore', "\\bunderscor(?:e|es|ed|ing)\\b"],
    ['en', 2, 'pivotal', "\\bpivotal\\b"],
    ['en', 2, 'intricate', "\\bintricat(?:e|ely|acies)\\b"],
    ['en', 2, 'multifaceted', "\\bmulti-?faceted\\b"],
    ['en', 2, 'seamless', "\\bseamless(?:ly)?\\b"],
    ['en', 2, 'showcase', "\\bshowcas(?:e|es|ed|ing)\\b"],
    ['en', 2, 'meticulous', "\\bmeticulous(?:ly)?\\b"],
    ['en', 2, 'commendable', "\\bcommendabl[ey]\\b"],
    ['en', 2, 'embark on', "\\bembark(?:s|ed|ing)? (?:on|upon)\\b"],
    ['en', 2, 'game-changer', "\\bgame[- ]chang(?:er|ers|ing)\\b"],
    ['en', 2, 'paving the way', "\\bpav(?:e|es|ed|ing) the way\\b"],
    ['en', 2, 'comprehensive overview', "\\bcomprehensive (?:overview|guide|understanding|approach|look)\\b"],
    ['en', 2, 'here are some…', "\\b(?:here are|below are) (?:some|a few|several|the (?:key|main|top))\\b"],
    ['en', 2, "whether you're", "\\bwhether you'?re\\b"],
    ['en', 2, 'serves as a testament', "\\b(?:stands|serves) as (?:a|an) (?:testament|reminder|cornerstone|beacon|example)\\b"],
    ['en', 2, 'cornerstone / beacon', "\\b(?:cornerstone|beacon|linchpin)s?\\b"],
    ['en', 1, 'crucial / vital', "\\b(?:crucial|vital)\\b"],
    ['en', 1, 'foster', "\\bfoster(?:s|ed|ing)?\\b"],
    ['en', 1, 'leverage', "\\bleverag(?:e|es|ed|ing)\\b"],
    ['en', 1, 'robust / holistic', "\\b(?:robust|holistic)\\b"],
    ['en', 1, 'landscape / realm', "\\b(?:landscape|realm)s?\\b"],
    ['en', 1, 'notably', "\\bnotably\\b"],
    ['en', 1, 'vibrant / bustling', "\\b(?:vibrant|bustling|nestled|boasts?)\\b"],
  ];
  const MARKERS_C = MARKERS.map(([lang, tier, label, src]) => ({ lang, tier, label, re: new RegExp(src, 'g') })).sort((a, b) => b.tier - a.tier);
  const CONNECTOR_RE = new RegExp('^(?:' + ['inoltre', 'tuttavia', 'pertanto', 'infine', 'innanzitutto', 'in primo luogo', 'in secondo luogo', 'in terzo luogo', 'in ultimo luogo', 'in conclusione', 'in sintesi', 'in definitiva', 'di conseguenza', 'allo stesso modo', "d'altra parte", "d'altro canto", 'al contrario', 'analogamente', 'parallelamente', 'nel complesso', 'per questo motivo', 'in particolare', 'oltre a cio', 'in aggiunta', 'ciononostante', 'nonostante cio', 'a tal fine', 'in questo contesto', 'in tale contesto', 'alla luce di', 'per concludere', 'riassumendo', 'in breve', 'moreover', 'furthermore', 'additionally', 'however', 'therefore', 'thus', 'consequently', 'in addition', 'overall', 'ultimately', 'in conclusion', 'in summary', 'to summarize', 'to sum up', 'firstly', 'secondly', 'thirdly', 'finally', 'notably', 'importantly', 'similarly', 'conversely', 'as a result', 'on the other hand', 'in contrast', 'nevertheless', 'hence', 'specifically', 'in essence', 'lastly', 'first and foremost'].join('|') + ')\\b');
  const CONTRAST_RE = new RegExp([
    "\\bnon (?:[a-z']+ ){0,2}(?:solo|soltanto|semplicemente|solamente|tanto|un semplice|una semplice|un mero|una mera)\\b[^.!?\\n]{0,120}?\\b(?:ma|bensi)\\b",
    "\\bnon (?:e|si tratta di) [^.!?\\n,;]{1,50}[,;] (?:e|si tratta di)\\b",
    "\\bnot (?:just|only|merely|simply)\\b[^.!?\\n]{0,120}?\\b(?:but|it'?s|it is|they'?re)\\b",
    "\\b(?:it|this|that)(?:'s| is| was) not (?:about |just |only )?[^.!?\\n]{1,60}?[,;\\u2014-] ?(?:it|this|that)(?:'s| is| was)\\b",
    "\\bisn'?t (?:just|only|merely|simply|about)\\b[^.!?\\n]{0,80}?\\b(?:it'?s|but)\\b",
  ].join('|'), 'g');
  const T_ITEM = "(?:(?:il|lo|la|i|gli|le|un|una|uno|the|a|an|di|del|dello|della|dei|degli|delle)\\s+|l['’]|un['’]|dell['’])?\\p{L}{3,}";
  const TRIPLET_RE = new RegExp("(^|[^\\p{L}\\p{N}'’])(" + T_ITEM + ")\\s*,\\s*(" + T_ITEM + ")\\s*,?\\s+(?:e|ed|and|o|or)\\s+(" + T_ITEM + ")(?![\\p{L}\\p{N}])", 'gu');
  const RESIDUE = [
    ['Apertura da chatbot («Certo!», «Ottima domanda»)', "(?:^|\\n)[ \\t]*(?:certo|certamente|assolutamente|ottima domanda|sure|certainly|absolutely|great question|of course)[ \\t]*[!,.:]", true],
    ['Chiusura da chatbot («Spero sia utile», «Fammi sapere»)', "\\b(?:spero (?:che )?(?:questo|queste|questa|quest'|ti sia|vi sia|possa|ti possa|le informazioni)|fammi sapere|fatemi sapere|non esitare a (?:chiedere|contattarmi|farmi)|se hai (?:bisogno|altre domande|domande)|posso aiutarti|vuoi che (?:approfondisca|scriva|aggiunga|riformuli)|i hope this helps|let me know if|feel free to (?:ask|reach)|hope this helps|happy to help)\\b", true],
    ["Riferimenti a sé come AI", "\\b(?:come (?:modello|assistente|intelligenza artificiale|ia)(?: di linguaggio| virtuale)?|as an ai(?: language model)?|as a language model|non ho accesso a (?:internet|informazioni in tempo reale)|i don'?t have (?:access to )?(?:real-time|personal))\\b", true],
    ['Segnaposto da compilare ([Inserisci nome])', "\\[(?:inserisci|inserire|nome|cognome|data|azienda|indirizzo|citta|your name|insert|name|date|company)[^\\]\\n]{0,40}\\]", true],
    ['Presentazione della risposta («Ecco una versione…»)', "\\b(?:ecco (?:a te |qui )?(?:una versione|il testo|la versione|una bozza|un esempio di|una proposta)|here(?:'s| is) (?:a|an|the) (?:revised|rewritten|improved|polished|updated|draft))\\b", true],
  ].map(([label, src, strong]) => ({ label, strong, re: new RegExp(src, 'g') }));
  const MD_RE = /^#{1,6}\s+\S|\*\*[^*\n]{2,80}\*\*|^\s*(?:[-*•]|\d+\.)\s+\*\*/gm;
  const INVIS_RE = /[​‌‍⁠﻿ ]/g;
  const CAP_WORD_RE = /\p{L}[\p{L}'’]*/gu;
  function isSpecific(t) {
    if (/\d/.test(t)) return true;
    if (/[«“"][^»”"\n]{2,}[»”"]/.test(t)) return true;
    CAP_WORD_RE.lastIndex = 0; let m, i = 0;
    while ((m = CAP_WORD_RE.exec(t)) !== null) {
      if (i > 0 && /^\p{Lu}/u.test(m[0]) && m[0] !== 'I' && !/:\s*$/.test(t.slice(Math.max(0, m.index - 3), m.index))) return true;
      i++;
    }
    return false;
  }
  function count(re, s) { re.lastIndex = 0; let n = 0, m; while ((m = re.exec(s)) !== null) { if (!m[0].length) re.lastIndex++; n++; } return n; }
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const sdev = (a, m) => (a.length ? Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length) : 0);

  // Taratura delle fasce: l'indice grezzo viene riscalato (in modo crescente, quindi l'ordine dei testi non cambia)
  // perché il confine di «segnali misti» (35) e quello di «molti segnali» (60) cadano dove li supera solo una piccola
  // quota dei temi scritti da persone nei campioni di prova (tools/valuta). Con T_MID = 35 e T_HI = 60 non cambia nulla.
  const T_MID = 35, T_HI = 60;
  function taratura(v) {
    return v <= T_MID ? v * 35 / T_MID : v <= T_HI ? 35 + (v - T_MID) * 25 / (T_HI - T_MID) : 60 + (v - T_HI) * 40 / (100 - T_HI);
  }

  function analyzeAI(raw) {
    const text = unwrapIfHardWrapped(raw);
    const toks = tokenize(text), words = toks.length;
    const sents = attachTokens(splitSentences(text), toks);
    const F = foldWithMap(text);
    const lang = detectLang(toks);
    const SX = sents.map(s => ({ s: s.s, e: s.e, n: s.te - s.ti, marks: [], mkPts: 0, conn: false, dash: 0, contrast: false, trip: 0, residue: false, spec: false, prose: false }));
    const starts = SX.map(s => s.s);
    const sentAt = (off) => { let lo = 0, hi = starts.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= off) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r >= 0 && off < SX[r].e ? r : -1; };
    const prose = [];
    for (const s of SX) if (s.n >= 3 && (s.n >= 12 || /[.!?…:;»"”)]/.test(text.charAt(s.e - 1)))) { s.prose = true; prose.push(s); }
    let m;

    // formule ricorrenti
    const mkSum = new Map(); let mkPts = 0;
    for (const M of MARKERS_C) {
      if (M.lang !== lang) continue;
      M.re.lastIndex = 0;
      while ((m = M.re.exec(F.s)) !== null) {
        if (!m[0].length) { M.re.lastIndex++; continue; }
        const s = F.map[m.index], e = F.map[m.index + m[0].length - 1] + 1, si = sentAt(s);
        if (si >= 0) {
          const S = SX[si];
          if (S.marks.some(x => x.s < e && s < x.e)) continue;
          const add = Math.min(M.tier, Math.max(0, 6 - S.mkPts));
          S.mkPts += add; mkPts += add;
          S.marks.push({ s, e: Math.min(e, S.e), label: M.label, tier: M.tier });
        } else mkPts += M.tier;
        let r = mkSum.get(M.label);
        if (!r) { r = { label: M.label, tier: M.tier, n: 0, ex: [] }; mkSum.set(M.label, r); }
        r.n++; const ex = text.slice(s, e).replace(/\s+/g, ' ');
        if (r.ex.length < 2 && r.ex.indexOf(ex) < 0) r.ex.push(ex);
      }
    }
    const mkSent = prose.filter(s => s.mkPts >= 2).length;
    const mkCov = prose.length ? mkSent / prose.length : 0;

    // connettivi a inizio frase
    let conn = 0;
    for (const s of prose) {
      const fi = foldIdx(F, s.s);
      const head = F.s.slice(fi, fi + 48).replace(/^[^a-z]+/, '');
      if (CONNECTOR_RE.test(head)) { s.conn = true; conn++; }
    }
    const connRatio = prose.length ? conn / prose.length : 0;

    // trattino lungo (escluse le battute di dialogo)
    let dash = 0, dialogue = 0, off = 0;
    for (const line of text.split('\n')) {
      const dia = /^\s*(?:[—–]|«\s*[—–]|"\s*[—–])/.test(line);
      if (dia) dialogue++;
      if (!dia && !/^\s*-\s/.test(line)) {
        let i = line.indexOf('—');
        while (i >= 0) { dash++; const si = sentAt(off + i); if (si >= 0) SX[si].dash++; i = line.indexOf('—', i + 1); }
      }
      off += line.length + 1;
    }
    const dashRate = words ? dash / words * 1000 : 0;

    // contrapposizioni
    let contrast = 0; CONTRAST_RE.lastIndex = 0;
    while ((m = CONTRAST_RE.exec(F.s)) !== null) {
      if (!m[0].length) { CONTRAST_RE.lastIndex++; continue; }
      contrast++; const si = sentAt(F.map[m.index]); if (si >= 0) SX[si].contrast = true;
    }
    const contrastRate = words ? contrast / words * 1000 : 0;

    // elenchi di tre
    let trip = 0; TRIPLET_RE.lastIndex = 0;
    while ((m = TRIPLET_RE.exec(text)) !== null) {
      const at = m.index + m[1].length;
      if (/,\s*$/.test(text.slice(Math.max(0, at - 3), at))) continue;
      trip++; const si = sentAt(at); if (si >= 0) SX[si].trip++;
    }
    const tripRate = words ? trip / words * 1000 : 0;

    // dettagli concreti
    let spec = 0;
    for (const s of prose) if (isSpecific(text.slice(s.s, s.e))) { s.spec = true; spec++; }
    const specRatio = prose.length ? spec / prose.length : 0;

    // ritmo delle frasi e dei paragrafi
    const lens = prose.map(s => s.n), mean = avg(lens), cv = mean ? sdev(lens, mean) / mean : 0;
    const paraLens = splitParagraphs(text).map(p => tokAt(toks, p.e) - tokAt(toks, p.s)).filter(x => x >= 25);
    const pm = avg(paraLens), cvp = pm ? sdev(paraLens, pm) / pm : 0;

    // tracce di copia-incolla
    const residue = [];
    for (const R of RESIDUE) {
      R.re.lastIndex = 0; let n = 0; const ex = [];
      while ((m = R.re.exec(F.s)) !== null) {
        if (!m[0].length) { R.re.lastIndex++; continue; }
        n++; const s0 = F.map[m.index];
        if (ex.length < 2) ex.push(text.slice(s0, F.map[m.index + m[0].length - 1] + 1).trim());
        const si = sentAt(s0); if (si >= 0) SX[si].residue = true;
      }
      if (n) residue.push({ label: R.label, n, ex, strong: R.strong });
    }
    const md = count(MD_RE, text);
    if (md) residue.push({ label: 'Formattazione Markdown (**grassetto**, # titoli, elenchi)', n: md, ex: [], strong: false });
    const inv = count(INVIS_RE, raw);
    if (inv) residue.push({ label: 'Caratteri invisibili (spazi a larghezza zero o spazi stretti)', n: inv, ex: [], strong: false });

    // imperfezioni tipiche della scrittura a mano
    const human = {
      // due spazi dopo il punto sono un'abitudine (anche di alcuni modelli), non una svista: contano solo in mezzo alla frase
      dbl: count(/[^\s.!?:;…] {2,}(?=[^\s])/g, text),
      nospace: count(/[,;](?=\p{L})|[.!?](?=\p{Lu}\p{Ll})/gu, text),
      spBefore: count(/[\p{L}\p{N}] +[,.;:!?](?=\s|$)/gu, text),
      lowerAfter: 0,
      rep: count(/[!?]{2,}|\.{4,}/g, text),
      emo: count(/(?:^|\s)(?:[:;=]-?[)(DPp]|<3|xD+)(?=\s|$|[.,!?])/gm, text) + count(/\b(?:a?h(?:ah)+|lol|lmao)\b/g, F.s),
      coll: count(/\b(?:boh|mah|beh|vabbe|vabbeh|figurati|yeah|nope|gonna|wanna|kinda|tbh)\b/g, F.s) + count(/\b(?:ok|okay)\b/g, text),
    };
    { const re = /(\p{L}+)[.!?]\s+\p{Ll}/gu; let mm; while ((mm = re.exec(text)) !== null) { const w = foldWord(mm[1]); if (!ABBR.has(w) && !STRONG_ABBR.has(w)) human.lowerAfter++; } }
    const hRate = words ? (2 * (human.nospace + human.spBefore + human.lowerAfter) + human.dbl + human.rep + human.emo + 0.8 * human.coll) / words * 1000 : 0;
    const h = clamp(hRate / 6);

    const ok150 = words >= 150;
    const mkEx = Array.from(mkSum.values()).sort((a, b) => b.tier - a.tier || b.n - a.n).flatMap(r => r.ex.slice(0, 1)).slice(0, 5);
    const S = [
      { id: 'burst', x: cv, name: 'Variazione nella lunghezza delle frasi', desc: 'I modelli tendono a scrivere frasi di lunghezza simile. Chi scrive a mano alterna più spesso frasi brevi e lunghe.', ok: prose.length >= 8, need: 'servono almeno 8 frasi', value: NF2.format(cv), unit: 'coefficiente di variazione, in media ' + NF1.format(mean) + ' parole per frase', score: clamp((0.62 - cv) / 0.30), w: 1, scale: 'nullo sopra 0,62, pieno sotto 0,32' },
      { id: 'mk', x: mkCov, name: 'Formule ricorrenti dei modelli', desc: lang === 'en' ? 'Espressioni che i modelli usano molto più delle persone, come «delve», «it\'s important to note», «plays a crucial role». Conta la quota di frasi che ne contiene.' : 'Espressioni che i modelli usano molto più delle persone, come «è importante sottolineare» o «svolge un ruolo cruciale». Conta la quota di frasi che ne contiene.', ok: ok150 && prose.length >= 5, need: 'servono almeno 150 parole', value: P0(mkCov), unit: 'delle frasi, ' + mkPts + ' punti in totale', score: clamp((mkCov - 0.08) / 0.45), w: 2, scale: 'nullo sotto 8%, pieno sopra 53%', examples: mkEx },
      { id: 'conn', x: connRatio, name: 'Connettivi a inizio frase', desc: lang === 'en' ? 'Moreover, However, Additionally, In conclusion all\'inizio di molte frasi: struttura da tema scolastico, comune nei modelli e anche nella scrittura accademica.' : 'Inoltre, Tuttavia, Pertanto, In conclusione all\'inizio di molte frasi: struttura da tema scolastico, comune nei modelli e anche nella scrittura accademica.', ok: prose.length >= 8, need: 'servono almeno 8 frasi', value: P0(connRatio), unit: 'delle frasi', score: clamp((connRatio - 0.10) / 0.25), w: 0.8, scale: 'nullo sotto 10%, pieno sopra 35%' },
      { id: 'para', x: cvp, name: 'Paragrafi di lunghezza uniforme', desc: 'Paragrafi quasi tutti della stessa lunghezza, spesso aperti da un\'introduzione e chiusi da una conclusione.', ok: paraLens.length >= 4, need: 'servono almeno 4 paragrafi di 25 parole', value: NF2.format(cvp), unit: 'coefficiente di variazione su ' + paraLens.length + ' paragrafi', score: clamp((0.55 - cvp) / 0.35), w: 0.7, scale: 'nullo sopra 0,55, pieno sotto 0,20' },
      { id: 'dash', x: dashRate, name: 'Trattino lungo (—)', desc: lang === 'en' ? 'Frequente nei testi generati, ma usato anche da molti autori in inglese.' : 'Molto frequente nei testi generati. In italiano chi scrive a mano usa di solito virgole, parentesi o il trattino corto. Le battute di dialogo sono escluse.', ok: ok150, need: 'servono almeno 150 parole', value: NF1.format(dashRate), unit: 'ogni 1000 parole, ' + dash + ' in totale', score: clamp(dashRate / 10), w: lang === 'en' ? 0.6 : 1, scale: 'nullo a 0, pieno da 10 ogni 1000 parole' },
      { id: 'contrast', x: contrastRate, name: 'Contrapposizioni «non solo… ma»', desc: 'Costruzioni come «non è solo X, è Y» o «non solo… ma anche», che i modelli usano spesso per dare enfasi.', ok: ok150, need: 'servono almeno 150 parole', value: NF1.format(contrastRate), unit: 'ogni 1000 parole, ' + contrast + ' in totale', score: clamp(contrastRate / 8), w: 0.8, scale: 'nullo a 0, pieno da 8 ogni 1000 parole' },
      { id: 'trip', x: tripRate, name: 'Elenchi di tre termini', desc: 'Serie di tre parole («rapido, efficace e sicuro»). I modelli le usano molto; sono comuni anche nella scrittura curata.', ok: ok150, need: 'servono almeno 150 parole', value: NF1.format(tripRate), unit: 'ogni 1000 parole, ' + trip + ' in totale', score: clamp((tripRate - 3) / 12), w: 0.4, scale: 'nullo sotto 3, pieno da 15 ogni 1000 parole' },
      { id: 'spec', x: specRatio, name: 'Dettagli concreti', desc: 'Quota di frasi con numeri, nomi propri, date o citazioni. Un testo generato senza materiale di partenza tende a restare generico.', ok: prose.length >= 6, need: 'servono almeno 6 frasi', value: P0(specRatio), unit: 'delle frasi', score: clamp((0.45 - specRatio) / 0.35), w: 0.8, scale: 'nullo sopra 45%, pieno sotto 10%' },
    ];
    const usable = S.filter(x => x.ok);
    let base = null;
    if (ok150 && usable.length >= 3) { let sw = 0, ss = 0; for (const x of usable) { sw += x.w; ss += x.w * x.score; } base = ss / sw; }
    const strongRes = residue.filter(r => r.strong).reduce((a, r) => a + r.n, 0);
    const rr = Math.min(1, 0.5 * strongRes + (inv > 0 ? 0.25 : 0) + (md >= 3 ? 0.15 : 0));
    const grezzo = v => clamp(v + (1 - v) * 0.6 * rr) * 100;
    const indexRaw = base === null ? null : grezzo(base * (1 - 0.5 * h));
    const index = base === null ? null : Math.round(taratura(indexRaw));
    const indexNoHuman = base === null ? null : Math.round(taratura(grezzo(base)));
    const band = index === null ? 'na' : index < 35 ? 'lo' : index < 60 ? 'mid' : 'hi';
    const qty = words < 150 ? 'insufficiente' : words < 400 ? 'scarsa' : words < 1000 ? 'sufficiente' : 'buona';

    for (const s of SX) {
      const p = s.mkPts + (s.conn ? 1 : 0) + Math.min(2, s.dash) + (s.contrast ? 2 : 0) + (s.trip ? 0.5 : 0) + (s.residue ? 3 : 0);
      s.pts = p; s.lvl = p <= 0 ? 0 : p <= 1.5 ? 1 : p <= 3.5 ? 2 : 3;
      const why = [], seen = new Set();
      for (const mk of s.marks) if (!seen.has(mk.label)) { seen.add(mk.label); why.push(mk.label); }
      if (s.conn) why.push('connettivo a inizio frase');
      if (s.dash) why.push('trattino lungo');
      if (s.contrast) why.push('contrapposizione «non solo… ma»');
      if (s.trip) why.push('elenco di tre termini');
      if (s.residue) why.push('traccia di chatbot');
      s.why = why;
    }
    // x: valore grezzo di ogni segnale (per la taratura su testi di prova), score: contributo tra 0 e 1
    return { lang, words, nSent: SX.length, nProse: prose.length, mean, base, h, hRate, human, index, indexRaw, indexNoHuman, band, qty, signals: S, residue, dialogue, sentences: SX, mkPts, md, inv, strongRes };
  }

  return { foldWord, tokenize, countWords, tokAt, stem, isContent, splitSentences, prepText, analyzePlagiarism, fingerprints, wikiQueries, detectLang, lcsMask, analyzeAI };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MR;
