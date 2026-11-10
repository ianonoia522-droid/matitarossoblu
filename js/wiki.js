/* Matita Rossoblù · ricerca su Wikipedia. Parte solo quando chi usa la pagina preme il pulsante.
   Richieste GET semplici all'API di Wikipedia (origin=*, nessuna intestazione aggiunta, quindi nessuna richiesta preliminare CORS),
   una alla volta e al massimo 9 al minuto, perché Wikimedia limita le richieste anonime. Licenza MIT. */
var MRWiki = (function () {
  'use strict';

  const HOSTS = { it: 'it.wikipedia.org', en: 'en.wikipedia.org' };
  const WINDOW = 61000;   // finestra di conteggio, in millisecondi
  const BUDGET = 9;       // richieste ammesse nella finestra
  const GAP = 300;        // pausa minima tra due richieste
  const TIMEOUT = 25000;

  class WikiError extends Error {
    constructor(kind, detail) { super('wikipedia: ' + kind); this.name = 'WikiError'; this.kind = kind; this.detail = detail; }
  }
  function abortError() { const e = new Error('ricerca interrotta'); e.name = 'AbortError'; return e; }
  function realSleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(abortError()); return; }
      const done = () => { if (signal) signal.removeEventListener('abort', stop); resolve(); };
      const t = setTimeout(done, ms);
      function stop() { clearTimeout(t); reject(abortError()); }
      if (signal) signal.addEventListener('abort', stop, { once: true });
    });
  }

  // env: fetch, now, sleep e store ({ get(), set(stringa) }) si possono sostituire nei test
  function createClient(env) {
    env = env || {};
    const doFetch = env.fetch || ((u, o) => fetch(u, o));
    const now = env.now || (() => Date.now());
    const sleep = env.sleep || realSleep;
    const store = env.store || null;
    const cache = new Map();
    let stamps = [], cooldown = 0;

    // il conteggio è condiviso tra le schede aperte e sopravvive al ricaricamento della pagina
    function load() {
      if (!store) return;
      try {
        const o = JSON.parse(store.get() || 'null');
        if (o && Array.isArray(o.t)) stamps = Array.from(new Set(stamps.concat(o.t.filter(x => typeof x === 'number' && isFinite(x))))).sort((a, b) => a - b);
        if (o && typeof o.c === 'number' && isFinite(o.c)) cooldown = Math.max(cooldown, o.c);
      } catch (e) { /* archivio illeggibile: si usa il conteggio in memoria */ }
    }
    function save() { if (store) { try { store.set(JSON.stringify({ t: stamps, c: cooldown })); } catch (e) { /* ignora */ } } }
    function waitMs() {
      load();
      const t = now();
      stamps = stamps.filter(x => x > t - WINDOW && x <= t + 5000);
      let until = cooldown;
      if (stamps.length >= BUDGET) until = Math.max(until, stamps[stamps.length - BUDGET] + WINDOW);
      if (stamps.length) until = Math.max(until, stamps[stamps.length - 1] + GAP);
      return Math.max(0, until - t);
    }
    async function slot(signal, onWait) {
      for (;;) {
        if (signal && signal.aborted) throw abortError();
        const w = waitMs();
        if (w <= 0) { stamps.push(now()); save(); return; }
        if (onWait && w > 1500) onWait(Math.ceil(w / 1000));
        await sleep(Math.min(w, 1000), signal);
      }
    }
    function setCooldown(sec) { cooldown = Math.max(cooldown, now() + sec * 1000); save(); }
    function cooldownLeft() { load(); return Math.max(0, Math.ceil((cooldown - now()) / 1000)); }

    async function get(lang, params, signal, onWait) {
      const host = HOSTS[lang];
      if (!host) throw new WikiError('lang', lang);
      const qs = new URLSearchParams(Object.assign({ action: 'query', format: 'json', formatversion: '2', origin: '*', maxage: '3600', smaxage: '3600' }, params));
      const url = 'https://' + host + '/w/api.php?' + qs.toString();
      if (cache.has(url)) return cache.get(url);
      await slot(signal, onWait);
      const ctl = new AbortController();
      let timedOut = false;
      const onAbort = () => ctl.abort();
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT);
      let data;
      try {
        const res = await doFetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'default', referrerPolicy: 'no-referrer', signal: ctl.signal });
        if (res.status === 429) {
          const ra = parseInt((res.headers && res.headers.get('Retry-After')) || '', 10);
          const sec = ra > 0 && ra <= 3600 ? ra : 60;
          setCooldown(sec);
          throw new WikiError('limit', sec);
        }
        if (!res.ok) throw new WikiError('http', res.status);
        try { data = await res.json(); } catch (e) { if (ctl.signal.aborted) throw e; throw new WikiError('format'); }
      } catch (e) {
        if (e instanceof WikiError) throw e;
        if (signal && signal.aborted) throw abortError();
        if (timedOut) throw new WikiError('timeout');
        // rete assente, estensione che blocca, oppure un limite di Wikimedia senza intestazioni CORS: si aspetta comunque
        setCooldown(20);
        throw new WikiError('network', e && e.message);
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
      if (!data || typeof data !== 'object') throw new WikiError('format');
      if (data.error) {
        const code = String(data.error.code || ''), info = String(data.error.info || code);
        if (/ratelimit|too many requests|\b429\b/i.test(code + ' ' + info)) { setCooldown(60); throw new WikiError('limit', 60); }
        throw new WikiError('api', info.slice(0, 160));
      }
      cache.set(url, data);
      return data;
    }

    async function search(lang, q, limit, signal, onWait) {
      const d = await get(lang, { list: 'search', srsearch: q, srlimit: String(limit), srnamespace: '0', srprop: 'wordcount', srinfo: 'totalhits' }, signal, onWait);
      const rows = (d.query && Array.isArray(d.query.search)) ? d.query.search : [];
      return rows.filter(r => r && r.ns === 0 && r.pageid > 0 && r.title).map(r => ({ pageid: r.pageid, title: String(r.title), words: r.wordcount || 0 }));
    }
    async function page(lang, pageid, signal, onWait) {
      const d = await get(lang, { prop: 'extracts|revisions', explaintext: '1', exsectionformat: 'plain', rvprop: 'ids|timestamp', pageids: String(pageid) }, signal, onWait);
      const p = d.query && Array.isArray(d.query.pages) ? d.query.pages[0] : null;
      if (!p || p.missing || p.invalid || typeof p.extract !== 'string' || !p.extract.trim()) return null;
      const rev = Array.isArray(p.revisions) && p.revisions[0] ? p.revisions[0] : null;
      const host = HOSTS[lang], title = String(p.title);
      return {
        lang, pageid: p.pageid, title, text: p.extract,
        revid: rev ? rev.revid : 0, timestamp: rev ? String(rev.timestamp || '') : '',
        url: 'https://' + host + '/wiki/' + encodeURIComponent(title.replace(/ /g, '_')),
        perma: rev && rev.revid ? 'https://' + host + '/w/index.php?oldid=' + rev.revid : '',
      };
    }
    return { get, search, page, cooldownLeft };
  }

  // Cerca le frasi, ordina le voci trovate e legge le più promettenti; check(voce) dice se coincidono con il testo.
  // Gli errori non vengono rilanciati: il risultato contiene quanto fatto fino a quel punto e l'errore in out.error.
  async function run(client, o) {
    const out = { phrases: 0, searches: 0, read: [], matched: [], skipped: [], error: null };
    const cand = new Map();
    const add = (r, rank, w) => {
      let c = cand.get(r.pageid);
      if (!c) cand.set(r.pageid, c = { pageid: r.pageid, title: r.title, hits: 0, score: 0, order: cand.size });
      if (w >= 1) c.hits++;
      c.score += w / (1 + rank / 2);
    };
    const total = o.groups.length + (o.topic ? 1 : 0);
    const max = o.maxArticles || 4;
    try {
      for (let i = 0; i < o.groups.length; i++) {
        if (o.onProgress) o.onProgress('search', i + 1, total);
        const rows = await client.search(o.lang, o.groups[i], 6, o.signal, o.onWait);
        out.searches++;
        out.phrases += (o.groups[i].match(/"/g) || []).length / 2;
        rows.forEach((r, k) => add(r, k, 1));
      }
      const fromPhrases = Array.from(cand.values()).filter(c => !(o.skip && o.skip.has(c.pageid))).length;
      if (o.topic && fromPhrases < max) {
        if (o.onProgress) o.onProgress('search', total, total);
        const rows = await client.search(o.lang, o.topic, 2, o.signal, o.onWait);
        out.searches++;
        rows.forEach((r, k) => add(r, k, 0.6));
      }
      const list = Array.from(cand.values()).sort((a, b) => b.hits - a.hits || b.score - a.score || a.order - b.order);
      const todo = [];
      for (const c of list) {
        if (o.skip && o.skip.has(c.pageid)) out.skipped.push(c.title);
        else if (todo.length < max) todo.push(c);
      }
      for (let i = 0; i < todo.length; i++) {
        if (o.onProgress) o.onProgress('page', i + 1, todo.length, todo[i].title);
        const p = await client.page(o.lang, todo[i].pageid, o.signal, o.onWait);
        if (!p) continue;
        out.read.push(p.title);
        if (o.check(p)) out.matched.push(p);
      }
    } catch (e) {
      out.error = e;
    }
    return out;
  }

  return { createClient, run, WikiError, HOSTS, BUDGET, WINDOW };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MRWiki;
