// Test del client per Wikipedia (js/wiki.js) con un orologio simulato e una Wikipedia finta: nessuna richiesta di rete.
'use strict';
const MR = require('../js/engine.js');
const MRWiki = require('../js/wiki.js');

const WIKI_TEXT = `Storia del caffè

La diffusione del caffè in Italia iniziò a Venezia nel Seicento, quando i mercanti della Serenissima lo importavano dai porti del Mediterraneo orientale. Le prime botteghe del caffè aprirono intorno alla metà del Settecento e diventarono presto luoghi di discussione politica e letteraria.

Con l'invenzione della macchina a pressione, all'inizio del Novecento, la preparazione cambiò radicalmente: l'acqua calda attraversava il caffè macinato in pochi secondi, producendo una bevanda densa e aromatica che oggi chiamiamo espresso.`;
const OTHER_TEXT = `Le bevande calde sono preparate con acqua riscaldata e infusi di foglie, semi o radici. Tra le più diffuse ci sono il tè, la tisana e la cioccolata, servite spesso durante i mesi invernali.`;
const DOC = `Appunti per la ricerca di storia

Ho scelto di parlare del caffè perché a casa mia la moka è accesa dalle sei del mattino. Mia nonna diceva che senza caffè non si comincia nemmeno a parlare.
La diffusione del caffè in Italia iniziò a Venezia nel Seicento, quando i mercanti della Serenissima lo importavano dai porti del Mediterraneo orientale. Le prime botteghe del caffè aprirono intorno alla metà del Settecento e diventarono presto luoghi di discussione politica e letteraria.
Nella seconda parte della ricerca intervisterò il barista sotto casa, che lavora nello stesso locale da trentadue anni e ricorda ancora il prezzo della prima tazzina.`;
const PAGES = { 101: { title: 'Storia del caffè', text: WIKI_TEXT }, 202: { title: 'Bevande calde', text: OTHER_TEXT } };

const norm = s => s.toLowerCase().replace(/[’]/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/\s+/g, ' ').trim();
const json = (data, status, headers) => ({ status: status || 200, ok: !status || (status >= 200 && status < 300), headers: { get: k => (headers || {})[k] || null }, json: async () => data });
// Wikipedia finta: la ricerca tra virgolette trova le voci che contengono la frase esatta, quella libera restituisce «Bevande calde»
function fakeWikipedia(url) {
  const q = new URL(url).searchParams;
  if (q.get('list') === 'search') {
    const s = q.get('srsearch'), phrases = (s.match(/"[^"]+"/g) || []).map(p => norm(p.slice(1, -1)));
    const hits = phrases.length
      ? Object.keys(PAGES).filter(id => phrases.some(p => norm(PAGES[id].text).includes(p)))
      : ['202'];
    return json({ batchcomplete: true, query: { searchinfo: { totalhits: hits.length }, search: hits.map(id => ({ ns: 0, title: PAGES[id].title, pageid: +id, wordcount: 50 })) } });
  }
  if (q.get('prop') === 'extracts|revisions') {
    const id = q.get('pageids'), p = PAGES[id];
    return json({ batchcomplete: true, query: { pages: [{ pageid: +id, ns: 0, title: p.title, extract: p.text, revisions: [{ revid: 5550000 + +id, parentid: 1, timestamp: '2026-10-01T10:00:00Z' }] }] } });
  }
  return json({ error: { code: 'badvalue', info: 'richiesta inattesa' } });
}
// clock condiviso tra più client: simula due schede dello stesso browser
function fakeEnv(handler, store, clock) {
  clock = clock || { t: 1.75e12 };
  const calls = [];
  const env = {
    now: () => clock.t,
    sleep: (ms, signal) => new Promise((resolve, reject) => {
      if (signal && signal.aborted) { const e = new Error('interrotta'); e.name = 'AbortError'; reject(e); return; }
      clock.t += ms; resolve();
    }),
    fetch: async (url, opts) => { calls.push({ url, opts, at: clock.t }); return handler(url, opts); },
    store: store || (() => { let v = null; return { get: () => v, set: x => { v = x; } }; })(),
  };
  return { env, calls, client: MRWiki.createClient(env) };
}
const catchErr = p => p.then(() => null, e => e);

module.exports = async function (expect) {
  const opts = { k: 6, gap: 3, ignoreQuotes: true, ignoreBiblio: true, paraSens: 'normale' };

  // ricerca completa
  {
    const { calls, client } = fakeEnv(fakeWikipedia);
    const wq = MR.wikiQueries(DOC, opts);
    const out = await MRWiki.run(client, {
      lang: 'it', groups: wq.groups, topic: wq.topic, maxArticles: 4,
      check: p => { const x = MR.analyzePlagiarism(DOC, [{ id: 0, name: p.title, text: p.text }], opts).per[0]; return x.passages > 0 || x.paraN > 0; },
    });
    expect('ricerca completa senza errori', !out.error, out.error && out.error.message);
    expect('la voce copiata viene trovata e confermata', out.matched.length === 1 && out.matched[0].title === 'Storia del caffè', out.matched.map(p => p.title).join(', '));
    expect('la voce trovata per argomento senza corrispondenze viene scartata', out.read.includes('Bevande calde') && !out.matched.some(p => p.title === 'Bevande calde'), out.read.join(', '));
    expect('link permanente alla versione letta', out.matched[0] && out.matched[0].perma === 'https://it.wikipedia.org/w/index.php?oldid=5550101' && out.matched[0].url === 'https://it.wikipedia.org/wiki/Storia_del_caff%C3%A8', out.matched[0] && out.matched[0].url);
    const u = new URL(calls[0].url), o = calls[0].opts;
    expect('richieste GET anonime con origin=*', u.origin === 'https://it.wikipedia.org' && u.searchParams.get('origin') === '*' && u.searchParams.get('format') === 'json' && o.method === 'GET' && o.credentials === 'omit');
    expect('nessuna intestazione aggiunta (niente richiesta preliminare CORS)', calls.every(c => !('headers' in c.opts)));
    expect('ricerche entro il limite di CirrusSearch', calls.every(c => (new URL(c.url).searchParams.get('srsearch') || '').length <= 300));
    expect('al massimo 9 richieste per un testo breve', calls.length <= 9, calls.length + ' richieste');
    const again = await MRWiki.run(client, { lang: 'it', groups: wq.groups, topic: wq.topic, maxArticles: 4, check: () => false });
    expect('ripetere la stessa ricerca non rifà le richieste', !again.error && calls.length === out.searches + out.read.length, calls.length);
  }

  // limite di richieste: mai più di 9 in 61 secondi, una alla volta e distanziate
  {
    const store = (() => { let v = null; return { get: () => v, set: x => { v = x; } }; })(), clock = { t: 1.75e12 };
    const { calls, client } = fakeEnv(() => json({ batchcomplete: true, query: { search: [] } }), store, clock);
    let waits = 0;
    for (let i = 0; i < 25; i++) await client.search('it', '"frase numero ' + i + '"', 6, null, () => waits++);
    let worst = 0, minGap = Infinity;
    calls.forEach((c, i) => {
      worst = Math.max(worst, calls.filter(d => d.at > c.at - 61000 && d.at <= c.at).length);
      if (i) minGap = Math.min(minGap, c.at - calls[i - 1].at);
    });
    expect('mai più di 9 richieste in 61 secondi', worst <= 9, 'massimo ' + worst);
    expect('almeno 300 ms tra due richieste', minGap >= 300, minGap + ' ms');
    expect('le attese vengono segnalate', waits > 0, waits + ' avvisi');
    // un'altra scheda (o la pagina ricaricata) legge lo stesso archivio e rispetta lo stesso conteggio
    const other = fakeEnv(() => json({ batchcomplete: true, query: { search: [] } }), store, clock);
    const last = calls[calls.length - 1].at;
    await other.client.search('it', '"altra scheda"', 6, null, null);
    const inWindow = calls.filter(d => d.at > other.calls[0].at - 61000).length;
    expect('il conteggio vale anche per un\'altra scheda o dopo un ricaricamento', inWindow <= 8, inWindow + ' richieste recenti, ' + Math.round((other.calls[0].at - last) / 100) / 10 + ' s dopo l\'ultima');
  }

  // errori
  {
    let mode = '429';
    const handler = () => {
      if (mode === '429') return json({ error: { code: 'http-bad-status', info: '429 Too Many Requests' } }, 429, { 'Retry-After': '30' });
      if (mode === 'network') throw new TypeError('Failed to fetch');
      if (mode === '500') return json({}, 500);
      if (mode === 'api') return json({ error: { code: 'internal_api_error_DBQueryError', info: 'Errore del database' } });
      if (mode === 'ratelimited') return json({ error: { code: 'ratelimited', info: 'You have exceeded your rate limit.' } });
      if (mode === 'badjson') return { status: 200, ok: true, headers: { get: () => null }, json: async () => { throw new SyntaxError('Unexpected token <'); } };
      return json({ batchcomplete: true, query: { search: [] } });
    };
    const { calls, client } = fakeEnv(handler);
    let e = await catchErr(client.search('it', '"uno"', 6));
    expect('429: errore «limit» con il tempo indicato da Wikipedia', e && e.kind === 'limit' && e.detail === 30 && client.cooldownLeft() >= 29, e && e.kind + ' ' + e.detail);
    mode = 'ok';
    const before = calls[calls.length - 1].at;
    await client.search('it', '"due"', 6);
    expect('dopo un 429 la richiesta successiva aspetta', calls[calls.length - 1].at - before >= 30000, Math.round((calls[calls.length - 1].at - before) / 1000) + ' s');
    mode = 'network'; e = await catchErr(client.search('it', '"tre"', 6));
    expect('rete assente o bloccata: errore «network» e pausa di 20 s', e && e.kind === 'network' && client.cooldownLeft() >= 19, e && e.kind);
    mode = '500'; e = await catchErr(client.search('it', '"quattro"', 6));
    expect('errore HTTP riportato con il codice', e && e.kind === 'http' && e.detail === 500, e && e.kind);
    mode = 'api'; e = await catchErr(client.search('it', '"cinque"', 6));
    expect('errore dell\'API riportato con il messaggio', e && e.kind === 'api' && /database/.test(e.detail), e && e.detail);
    mode = 'ratelimited'; e = await catchErr(client.search('it', '"sei"', 6));
    expect('errore «ratelimited» dell\'API trattato come limite', e && e.kind === 'limit', e && e.kind);
    mode = 'badjson'; e = await catchErr(client.search('it', '"sette"', 6));
    expect('risposta non JSON: errore «format»', e && e.kind === 'format', e && e.kind);
    e = await catchErr(client.search('fr', '"otto"', 6));
    expect('lingua non prevista rifiutata', e && e.kind === 'lang', e && e.kind);
  }

  // interruzione durante l'attesa, con i risultati parziali conservati
  {
    const { client } = fakeEnv(fakeWikipedia);
    for (let i = 0; i < 9; i++) await client.search('it', '"riempimento ' + i + '"', 6);
    const ctrl = new AbortController();
    const wq = MR.wikiQueries(DOC, opts);
    const out = await MRWiki.run(client, { lang: 'it', groups: wq.groups, topic: wq.topic, signal: ctrl.signal, onWait: () => ctrl.abort(), check: () => true });
    expect('Interrompi ferma la ricerca durante l\'attesa', out.error && out.error.name === 'AbortError' && out.searches === 0, out.error && out.error.name);
  }
};
