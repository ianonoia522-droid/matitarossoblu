/* Matita Rossoblù · interfaccia. Librerie e font sono serviti dal sito stesso; l'unico collegamento esterno è la ricerca
   su Wikipedia (js/wiki.js), che parte solo dal pulsante «Cerca su Wikipedia». Licenza MIT. */
(function () {
  'use strict';
  const OPTS_KEY = 'matita-rossoblu:opts';
  const WIKI_KEY = 'matita-rossoblu:wiki';
  const VENDOR = 'vendor/';
  const E = id => document.getElementById(id);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  const NF0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
  const NF1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtInt = n => NF0.format(n);
  function pct(x) { const v = x * 100; if (!v) return '0%'; if (v < 1) return '<1%'; return (v < 10 ? NF1.format(v) : NF0.format(Math.round(v))) + '%'; }
  function trunc(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  const cc = ord => 'c' + (((ord - 1) % 6) + 1);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const EX_DOC = `Isole di calore: le mie misure in città

Nell'estate del 2023 ho misurato la temperatura in tre punti di Bologna con due sensori da pochi euro e una vecchia stazione meteo: uno in via Indipendenza, uno al parco della Montagnola e il terzo sul balcone di casa, al quarto piano. La sera del 18 luglio, alle 23, tra via Indipendenza e il parco c'erano 4,1 gradi di differenza. Più di quanto mi aspettassi.

Il fenomeno dipende soprattutto dai materiali da costruzione: asfalto, cemento e coperture scure assorbono la radiazione solare durante il giorno e la rilasciano lentamente nelle ore notturne. La scarsità di vegetazione riduce l'evapotraspirazione, che normalmente contribuisce a raffreddare l'ambiente. Gli effetti sulla salute sono importanti: durante le ondate di calore crescono i ricoveri per disidratazione e per malattie cardiovascolari, in particolare tra gli anziani che vivono da soli.

Una delle soluzioni più economiche riguarda i tetti. L'albedo è la grandezza che indica quanta luce viene riflessa da una superficie: il bianco arriva a riflettere l'ottanta per cento della radiazione, una guaina nera resta sotto il dieci. Se applicati su larga scala, i tetti freddi abbassano la temperatura dell'aria di tutto il quartiere.

È importante sottolineare che le isole di calore non rappresentano soltanto un problema ambientale, ma anche una sfida sociale e sanitaria. In un mondo sempre più urbanizzato, la pianificazione del verde svolge un ruolo cruciale nel garantire città più vivibili, resilienti e sostenibili. Inoltre, l'adozione di soluzioni innovative — come i tetti freddi e le pavimentazioni permeabili — consente di affrontare le sfide e le opportunità della transizione climatica. Tuttavia, è fondamentale adottare un approccio olistico che coinvolga cittadini, istituzioni e imprese. In conclusione, investire nella mitigazione delle isole di calore non è solo una scelta tecnica, ma un impegno verso le generazioni future.

Il prossimo passo è ripetere le misure ad agosto, con un sensore in più vicino al Reno, e capire se la differenza notturna regge anche quando c'è vento.`;
  const EX_SOURCES = [
    { name: 'Dispensa di climatologia urbana (esempio)', text: `Le isole di calore urbane sono aree della città in cui la temperatura dell'aria resta sensibilmente più alta rispetto alle campagne circostanti. Il fenomeno dipende soprattutto dai materiali da costruzione: asfalto, cemento e coperture scure assorbono la radiazione solare durante il giorno e la rilasciano lentamente nelle ore notturne. La scarsità di vegetazione riduce l'evapotraspirazione, che normalmente contribuisce a raffreddare l'ambiente. Anche il calore prodotto dal traffico, dagli impianti di climatizzazione e dalle attività industriali si somma all'effetto dei materiali.

Nelle notti estive la differenza di temperatura tra il centro di una grande città e la periferia agricola può superare i cinque gradi. Gli effetti sulla salute sono rilevanti: durante le ondate di calore aumentano i ricoveri per disidratazione e per malattie cardiovascolari, soprattutto tra gli anziani che vivono soli.

Le strategie di mitigazione più studiate comprendono i tetti verdi, le pavimentazioni chiare o permeabili, l'aumento delle alberature stradali e la creazione di corridoi di ventilazione che favoriscano il ricambio d'aria.` },
    { name: 'Articolo divulgativo sui tetti freddi (esempio)', text: `Un tetto freddo è una copertura progettata per riflettere una quota maggiore della radiazione solare rispetto a un tetto tradizionale. La grandezza che misura questa capacità si chiama albedo: una superficie bianca può riflettere fino all'ottanta per cento della luce che riceve, mentre una guaina bituminosa nera ne riflette meno del dieci per cento.

Diversi studi condotti in città mediterranee hanno mostrato che la sostituzione delle coperture scure con materiali riflettenti riduce la temperatura superficiale del tetto di oltre venti gradi nelle giornate estive. Il vantaggio riguarda anche il quartiere: se applicati su larga scala, i tetti freddi abbassano la temperatura dell'aria dell'intero quartiere. Il costo dell'intervento resta contenuto quando la sostituzione coincide con la normale manutenzione della copertura.` },
  ];

  const state = {
    sources: [], nextId: 1, example: false,
    opts: { k: 6, gap: 3, ignoreQuotes: true, ignoreBiblio: true, paraSens: 'normale', wikiLang: 'auto' },
    res: null, ai: null, fp: null, fpShown: 8, snap: null, itemMap: new Map(), openKey: null, aiSel: -1,
  };

  const el = {
    docText: E('docText'), docCount: E('docCount'), docFile: E('docFile'), docMsg: E('docMsg'), docPanel: E('docPanel'),
    exampleBar: E('exampleBar'), clearBtn: E('clearBtn'),
    srcPanel: E('srcPanel'), srcList: E('srcList'), srcEmpty: E('srcEmpty'), srcCount: E('srcCount'), srcFile: E('srcFile'), srcMsg: E('srcMsg'),
    pasteToggle: E('pasteToggle'), pasteBox: E('pasteBox'), pasteName: E('pasteName'), pasteText: E('pasteText'), pasteAdd: E('pasteAdd'), pasteCancel: E('pasteCancel'),
    wikiBtn: E('wikiBtn'), wikiMsg: E('wikiMsg'), idxBtn: E('idxBtn'), idxMsg: E('idxMsg'),
    optK: E('optK'), optGap: E('optGap'), optQuotes: E('optQuotes'), optBiblio: E('optBiblio'), optPara: E('optPara'), optWiki: E('optWiki'),
    runBtn: E('runBtn'), runStatus: E('runStatus'), staleBar: E('staleBar'),
    tabs: [E('tab-src'), E('tab-web'), E('tab-ai')], panes: { src: E('pane-src'), web: E('pane-web'), ai: E('pane-ai') },
    tabSrcNum: E('tabSrcNum'), tabWebNum: E('tabWebNum'), tabAiNum: E('tabAiNum'),
    dlBtn: E('dlBtn'), copyBtn: E('copyBtn'), exportMsg: E('exportMsg'), copyFb: E('copyFb'), copyFbText: E('copyFbText'),
  };
  const TAB_NAMES = ['src', 'web', 'ai'];

  // ---------- impostazioni (salvate solo nel browser di chi usa la pagina) ----------
  function loadOpts() {
    try {
      const o = JSON.parse(localStorage.getItem(OPTS_KEY) || 'null');
      if (!o || typeof o !== 'object') return;
      if ([4, 5, 6, 8, 10, 12].includes(o.k)) state.opts.k = o.k;
      if (Number.isInteger(o.gap) && o.gap >= 0 && o.gap <= 5) state.opts.gap = o.gap;
      if (typeof o.ignoreQuotes === 'boolean') state.opts.ignoreQuotes = o.ignoreQuotes;
      if (typeof o.ignoreBiblio === 'boolean') state.opts.ignoreBiblio = o.ignoreBiblio;
      if (['normale', 'alta', 'off'].includes(o.paraSens)) state.opts.paraSens = o.paraSens;
      if (['auto', 'it', 'en'].includes(o.wikiLang)) state.opts.wikiLang = o.wikiLang;
    } catch (e) { /* archiviazione non disponibile */ }
  }
  function saveOpts() { try { localStorage.setItem(OPTS_KEY, JSON.stringify(state.opts)); } catch (e) { /* ignora */ } }
  function syncOptsUI() {
    el.optK.value = String(state.opts.k); el.optGap.value = String(state.opts.gap);
    el.optQuotes.checked = state.opts.ignoreQuotes; el.optBiblio.checked = state.opts.ignoreBiblio; el.optPara.value = state.opts.paraSens;
    el.optWiki.value = state.opts.wikiLang;
  }
  function readOptsUI() {
    state.opts = { k: parseInt(el.optK.value, 10) || 6, gap: parseInt(el.optGap.value, 10) || 0, ignoreQuotes: el.optQuotes.checked, ignoreBiblio: el.optBiblio.checked, paraSens: el.optPara.value, wikiLang: el.optWiki.value };
    saveOpts(); markStale();
  }

  // ---------- documento e fonti ----------
  function setMsg(node, text, err) { node.textContent = text || ''; node.classList.toggle('err', !!err); }
  function setStatus(t) { el.runStatus.textContent = t || ''; }
  let countTimer = 0;
  function updateDocCount() { clearTimeout(countTimer); countTimer = setTimeout(() => { el.docCount.textContent = fmtInt(MR.countWords(el.docText.value)) + ' parole'; }, 120); }
  function markStale() { if (state.res) el.staleBar.hidden = false; }
  function afterDocChange() { updateDocCount(); markStale(); }

  function loadExample() {
    state.example = true;
    el.docText.value = EX_DOC;
    state.sources = EX_SOURCES.map(s => ({ id: state.nextId++, name: s.name, text: s.text, words: MR.countWords(s.text), example: true }));
    el.exampleBar.hidden = false;
    el.docCount.textContent = fmtInt(MR.countWords(EX_DOC)) + ' parole';
    renderSources();
  }
  function leaveExample(clearDoc) {
    if (!state.example) return;
    if (wiki.running && wiki.ctrl) wiki.ctrl.abort();   // la ricerca riguardava il testo d'esempio
    state.example = false;
    state.sources = state.sources.filter(s => !s.example);
    if (clearDoc) el.docText.value = '';
    el.exampleBar.hidden = true;
    renderSources(); updateDocCount();
  }
  // nome della fonte; le voci di Wikipedia diventano un link alla voce
  function nameHTML(s, cls) {
    if (s && s.wiki) return '<a class="' + cls + '" href="' + esc(s.wiki.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(s.name) + ' · apri la voce">' + esc(s.name) + '</a>';
    if (s && s.idx) return '<a class="' + cls + '" href="' + esc(s.idx.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(s.idx.url) + '">' + esc(s.name) + '</a>';
    return '<span class="' + cls + '" title="' + esc(s.name) + '">' + esc(s.name) + '</span>';
  }
  function renderSources() {
    el.srcList.innerHTML = state.sources.map((s, i) => '<li class="src ' + cc(i + 1) + '"><span class="sn">' + (i + 1) + '</span>' + nameHTML(s, 'nm') + '<span class="wc">' + fmtInt(s.words) + ' parole</span><button type="button" class="x" data-rm="' + s.id + '" aria-label="Rimuovi ' + esc(s.name) + '">×</button></li>').join('');
    el.srcEmpty.hidden = state.sources.length > 0;
    const tot = state.sources.reduce((a, s) => a + s.words, 0);
    el.srcCount.textContent = state.sources.length ? state.sources.length + (state.sources.length === 1 ? ' fonte · ' : ' fonti · ') + fmtInt(tot) + ' parole' : '';
  }
  function addSource(name, text, extra) {
    state.sources.push(Object.assign({ id: state.nextId++, name: name || ('Fonte ' + (state.sources.length + 1)), text, words: MR.countWords(text) }, extra || {}));
    renderSources(); markStale();
  }

  // ---------- librerie caricate solo quando servono ----------
  const loading = {};
  function loadScript(src) {
    if (!loading[src]) {
      loading[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { delete loading[src]; reject(new Error('non riesco a caricare ' + src + '. Controlla che la cartella vendor sia stata pubblicata insieme alla pagina.')); };
        document.head.appendChild(s);
      });
    }
    return loading[src];
  }
  async function getPdfLib() {
    await loadScript(VENDOR + 'pdf.min.js');
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('il lettore PDF non si è avviato.');
    // Aperta come file locale il browser non permette i worker: PDF.js lavora allora nella pagina.
    if (location.protocol === 'file:' && !window.pdfjsWorker) await loadScript(VENDOR + 'pdf.worker.min.js');
    lib.GlobalWorkerOptions.workerSrc = new URL(VENDOR + 'pdf.worker.min.js', document.baseURI).href;
    return lib;
  }
  async function getMammoth() {
    await loadScript(VENDOR + 'mammoth.browser.min.js');
    if (!window.mammoth) throw new Error('il lettore .docx non si è avviato.');
    return window.mammoth;
  }

  // ---------- lettura dei file ----------
  const normalizeText = t => String(t).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  function htmlToText(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,style,noscript,template,svg,nav,footer,iframe').forEach(n => n.remove());
    d.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
    d.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,section,article,pre,dd,dt,figcaption').forEach(n => n.append('\n\n'));
    const root = d.body || d.documentElement;
    return (root.textContent || '').replace(/[ \t ]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function pdfItemsToText(items) {
    const lines = []; let cur = null;
    for (const it of items) {
      if (typeof it.str !== 'string') continue;
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      if (!cur || Math.abs(y - cur.y) > h * 0.6) { cur = { y, text: '', endX: null }; lines.push(cur); }
      if (it.str.length) {
        if (cur.endX !== null && cur.text && !/\s$/.test(cur.text) && !/^\s/.test(it.str) && x - cur.endX > h * 0.18) cur.text += ' ';
        cur.text += it.str; cur.endX = x + (it.width || 0);
      }
      if (it.hasEOL) cur = null;
    }
    const gaps = [];
    for (let i = 1; i < lines.length; i++) { const g = lines[i - 1].y - lines[i].y; if (g > 0) gaps.push(g); }
    gaps.sort((a, b) => a - b);
    const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;
    let out = '', prevY = null;
    for (const ln of lines) {
      const t = ln.text.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (!out) { out = t; prevY = ln.y; continue; }
      const g = prevY - ln.y; prevY = ln.y;
      if (g <= 0 || g > med * 1.6) out += '\n\n' + t;
      else if (/\p{L}[-‐­]$/u.test(out) && /^\p{Ll}/u.test(t)) out = out.slice(0, -1) + t;
      else out += ' ' + t;
    }
    return out;
  }
  async function pdfToText(file, onProgress) {
    const lib = await getPdfLib();
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress && (p === 1 || p % 5 === 0)) onProgress(p, pdf.numPages);
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      pages.push(pdfItemsToText(tc.items));
    }
    pdf.destroy();
    const text = pages.filter(Boolean).join('\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    if (text.replace(/\s/g, '').length < 20) throw new Error('il PDF non contiene testo selezionabile, forse è una scansione. Serve prima un OCR.');
    return text;
  }
  async function readFile(file, onProgress) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['txt', 'md', 'csv', 'text', 'markdown'].includes(ext)) return file.text();
    if (ext === 'html' || ext === 'htm') return htmlToText(await file.text());
    if (ext === 'docx') {
      const mammoth = await getMammoth();
      const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return r.value;
    }
    if (ext === 'pdf') return pdfToText(file, onProgress);
    if (ext === 'doc') throw new Error('il vecchio formato .doc non è supportato: salvalo come .docx o PDF.');
    if (['odt', 'rtf', 'pages'].includes(ext)) throw new Error('il formato .' + ext + ' non è supportato: esportalo in .docx, PDF o .txt.');
    const t = await file.text();
    if (/[\x00-\x08\x0E-\x1F]/.test(t.slice(0, 2000))) throw new Error('formato non riconosciuto.');
    return t;
  }
  async function loadDocFile(file) {
    setMsg(el.docMsg, 'Lettura di «' + file.name + '»…');
    try {
      const text = normalizeText(await readFile(file, (p, n) => setMsg(el.docMsg, 'Lettura di «' + file.name + '»: pagina ' + p + ' di ' + n + '…')));
      if (MR.countWords(text) < 5) throw new Error('il file non contiene testo leggibile.');
      leaveExample(true);
      el.docText.value = text; afterDocChange();
      setMsg(el.docMsg, '«' + file.name + '» caricato: ' + fmtInt(MR.countWords(text)) + ' parole. Controlla che il testo estratto sia completo, poi premi Analizza.');
    } catch (err) { setMsg(el.docMsg, 'Non riesco a leggere «' + file.name + '»: ' + (err && err.message ? err.message : 'errore di lettura.'), true); }
  }
  async function addSourceFiles(files) {
    const list = Array.from(files || []); if (!list.length) return;
    if (state.example) leaveExample(true);
    let ok = 0; const errs = [];
    for (const f of list) {
      setMsg(el.srcMsg, 'Lettura di «' + f.name + '»…');
      try {
        const t = normalizeText(await readFile(f, (p, n) => setMsg(el.srcMsg, 'Lettura di «' + f.name + '»: pagina ' + p + ' di ' + n + '…')));
        if (MR.countWords(t) < 5) throw new Error('testo assente o troppo corto');
        addSource(f.name.replace(/\.[^.]+$/, ''), t); ok++;
      } catch (err) { errs.push('«' + f.name + '», ' + (err && err.message ? err.message.replace(/\.$/, '') : 'errore di lettura')); }
    }
    setMsg(el.srcMsg, (ok ? (ok === 1 ? '1 fonte aggiunta.' : ok + ' fonti aggiunte.') : '') + (errs.length ? ' Non lette: ' + errs.join('; ') + '.' : ''), errs.length > 0 && !ok);
  }
  const hasFiles = e => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
  function setupDrop(panel, onFiles) {
    let depth = 0;
    panel.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; panel.classList.add('drag'); });
    panel.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    panel.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) panel.classList.remove('drag'); });
    panel.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; panel.classList.remove('drag'); onFiles(e.dataTransfer.files); });
  }

  // ---------- analisi ----------
  function compute() {
    const text = el.docText.value;
    const srcs = state.sources.slice();
    const res = MR.analyzePlagiarism(text, srcs, state.opts);
    state.res = res;
    state.ai = MR.analyzeAI(text);
    state.fp = MR.fingerprints(res.doc, 24);
    state.fpShown = 8; state.openKey = null; state.aiSel = -1;
    state.snap = { sources: srcs, ord: new Map(srcs.map((s, i) => [s.id, i + 1])), opts: Object.assign({}, state.opts), at: new Date() };
  }
  async function runAnalysis() {
    if (!el.docText.value.trim()) { state.res = null; renderAll(); el.staleBar.hidden = true; setStatus('Incolla o carica un testo da verificare.'); return; }
    el.runBtn.disabled = true; setStatus('Analisi in corso…');
    await new Promise(r => setTimeout(r, 30));
    const t0 = performance.now();
    try {
      compute(); renderAll(); el.staleBar.hidden = true;
      setStatus('Analisi completata in ' + NF1.format((performance.now() - t0) / 1000) + ' s · ' + fmtInt(state.res.bodyWords) + ' parole');
    } catch (err) { console.error(err); setStatus('Errore durante l\'analisi: ' + (err && err.message ? err.message : err)); }
    finally { el.runBtn.disabled = false; }
  }

  // ---------- ricerca su Wikipedia (solo su richiesta: invia a Wikipedia alcune frasi brevi del testo) ----------
  const wikiClient = window.MRWiki ? MRWiki.createClient({ store: { get: () => localStorage.getItem(WIKI_KEY), set: v => localStorage.setItem(WIKI_KEY, v) } }) : null;
  const wiki = { running: false, ctrl: null };
  const wikiLangOf = text => (state.opts.wikiLang === 'it' || state.opts.wikiLang === 'en' ? state.opts.wikiLang : MR.detectLang(text));
  function titles(list, max) {
    const a = list.slice(0, max).map(t => '«' + t + '»');
    return a.join(', ') + (list.length > max ? ' e ' + (list.length - max) + (list.length - max === 1 ? ' altra' : ' altre') : '');
  }
  function setWikiRunning(on) {
    wiki.running = on;
    el.wikiBtn.textContent = on ? 'Interrompi la ricerca' : 'Cerca su Wikipedia';
    el.wikiBtn.classList.toggle('stop', on);
  }
  function wikiErrText(e) {
    switch (e && e.kind) {
      case 'limit': return 'Wikipedia ha chiesto di rallentare: troppe richieste dal tuo indirizzo in poco tempo. Riprova tra ' + e.detail + ' secondi.';
      case 'timeout': return 'Wikipedia non ha risposto in tempo. Riprova tra poco.';
      case 'http': return 'Wikipedia ha risposto con un errore (codice ' + e.detail + '). Riprova più tardi.';
      case 'format': return 'Wikipedia ha inviato una risposta illeggibile. Riprova più tardi.';
      case 'api': return 'Wikipedia ha rifiutato la richiesta: ' + e.detail + '.';
      case 'network': return navigator.onLine === false ? 'La connessione si è interrotta: la ricerca su Wikipedia ha bisogno di internet.' : 'Wikipedia non risponde. Può dipendere dalla connessione, da un\'estensione del browser che blocca le richieste o dal limite di richieste di Wikipedia: riprova tra un minuto.';
      default: return 'Errore imprevisto durante la ricerca su Wikipedia: ' + (e && e.message ? e.message : e) + '.';
    }
  }
  async function runWiki(ev) {
    // il secondo clic di un doppio clic non interrompe la ricerca appena avviata
    if (wiki.running) { if (wiki.ctrl && !(ev && ev.detail > 1)) wiki.ctrl.abort(); return; }
    if (!wikiClient) { setMsg(el.wikiMsg, 'Il modulo di ricerca su Wikipedia non si è caricato: controlla che il file js/wiki.js sia stato pubblicato.', true); return; }
    const text = el.docText.value;
    if (MR.countWords(text) < 20) { setMsg(el.wikiMsg, 'Incolla o carica prima il testo da verificare: servono almeno 20 parole.', true); return; }
    if (navigator.onLine === false) { setMsg(el.wikiMsg, 'Sei offline: la ricerca su Wikipedia ha bisogno di internet.', true); return; }
    const lang = wikiLangOf(text), opts = Object.assign({}, state.opts);
    const wq = MR.wikiQueries(text, opts);
    if (!wq.groups.length && !wq.topic) { setMsg(el.wikiMsg, 'Nel testo non ci sono frasi da cercare: servono almeno 6 parole di seguito, fuori dalle citazioni.', true); return; }
    const where = 'Wikipedia in ' + (lang === 'en' ? 'inglese' : 'italiano');
    const example = state.example, added = [];
    const have = new Set(state.sources.filter(s => s.wiki && s.wiki.lang === lang).map(s => s.wiki.pageid));
    wiki.ctrl = new AbortController();
    setWikiRunning(true);
    setMsg(el.wikiMsg, where + ': avvio della ricerca…');
    const out = await MRWiki.run(wikiClient, {
      lang, groups: wq.groups, topic: wq.topic, skip: have, signal: wiki.ctrl.signal,
      maxArticles: MR.countWords(text) > 2000 ? 5 : 4,
      onWait: s => setMsg(el.wikiMsg, where + ': Wikipedia limita le richieste anonime, attendo ' + s + ' s prima della prossima…'),
      onProgress: (kind, i, n, title) => setMsg(el.wikiMsg, kind === 'search' ? where + ': ricerca ' + i + ' di ' + n + '…' : where + ': lettura della voce «' + title + '», ' + i + ' di ' + n + '…'),
      check: p => {
        const body = normalizeText(p.text);
        const x = MR.analyzePlagiarism(text, [{ id: 0, name: p.title, text: body }], opts).per[0];
        if (!x.passages && !x.paraN) return false;
        const name = (lang === 'en' ? 'Wikipedia (inglese) · ' : 'Wikipedia · ') + p.title;
        addSource(name, body, { example, wiki: { lang, pageid: p.pageid, title: p.title, url: p.url, perma: p.perma, revid: p.revid, ts: p.timestamp } });
        added.push(p.title);
        return true;
      },
    });
    setWikiRunning(false);
    wiki.ctrl = null;
    const e = out.error, aborted = e && e.name === 'AbortError';
    if (e && !aborted && !e.kind) console.error(e);
    const parts = [];
    if (aborted) parts.push('Ricerca su Wikipedia interrotta.');
    else if (e) parts.push(wikiErrText(e));
    if (added.length) parts.push((added.length === 1 ? 'Corrispondenze in 1 voce, aggiunta alle fonti: ' : 'Corrispondenze in ' + added.length + ' voci, aggiunte alle fonti: ') + titles(added, 4) + '.');
    else if (!e) parts.push('Nessuna corrispondenza su ' + where + '.');
    if (out.searches) parts.push('Frasi cercate: ' + out.phrases + (out.read.length ? '; voci lette: ' + out.read.length : '') + '.');
    const none = out.read.filter(t => added.indexOf(t) < 0);
    if (none.length) parts.push('Senza corrispondenze: ' + titles(none, 3) + '.');
    if (out.skipped.length) parts.push('Già tra le fonti: ' + titles(out.skipped, 3) + '.');
    if (!added.length && !e) parts.push('Un risultato vuoto non dimostra che il testo sia originale: la ricerca prova un campione di frasi e trova le copie in cui almeno una di quelle frasi è rimasta identica.');
    setMsg(el.wikiMsg, parts.join(' '), !!e && !aborted);
    if (added.length) { selectTab('src'); await runAnalysis(); }
  }

  // ---------- ricerca nell'indice dei siti di studio (impronte; il testo non esce dal computer) ----------
  const idxClient = window.MRIndex ? MRIndex.createIndex('indice/') : null;
  const idx = { running: false, ctrl: null };
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function archivioLabel(m) {
    const mese = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? MESI[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : ''; };
    const a = mese(m && m.archivioData), da = mese(m && m.archivioDal);
    if (a && da && da !== a) return 'archivio Common Crawl, raccolte da ' + da + ' a ' + a;
    return a ? 'archivio Common Crawl di ' + a : 'archivio Common Crawl' + (m && m.archivio ? ' ' + m.archivio : '');
  }
  function idxErrText(e) {
    switch (e && e.kind) {
      case 'missing': return 'L\'indice dei siti di studio non è disponibile su questo sito.';
      case 'network': return 'Non riesco a leggere l\'indice: controlla la connessione e riprova.';
      case 'format': return 'L\'indice ha un formato che questa versione della pagina non riconosce: ricarica la pagina.';
      case 'http': return 'Il server ha risposto con un errore (codice ' + e.detail + ') mentre leggevo l\'indice.';
      default: return 'Errore imprevisto durante la ricerca nell\'indice: ' + (e && e.message ? e.message : e) + '.';
    }
  }
  function setIdxRunning(on) {
    idx.running = on;
    el.idxBtn.textContent = on ? 'Interrompi la ricerca' : 'Cerca nei siti di studio';
    el.idxBtn.classList.toggle('stop', on);
  }
  async function runIdx(ev) {
    if (idx.running) { if (idx.ctrl && !(ev && ev.detail > 1)) idx.ctrl.abort(); return; }
    if (!idxClient) { setMsg(el.idxMsg, 'Il modulo di ricerca nell\'indice non si è caricato: controlla che il file js/impronte.js sia stato pubblicato.', true); return; }
    if (location.protocol === 'file:') { setMsg(el.idxMsg, 'La ricerca nei siti di studio funziona dal sito pubblicato, non dalla pagina aperta come file locale.', true); return; }
    const text = el.docText.value;
    if (MR.countWords(text) < 20) { setMsg(el.idxMsg, 'Incolla o carica prima il testo da verificare: servono almeno 20 parole.', true); return; }
    const opts = Object.assign({}, state.opts), doc = MR.analyzePlagiarism(text, [], opts).doc;
    idx.ctrl = new AbortController();
    setIdxRunning(true);
    setMsg(el.idxMsg, 'Lettura dell\'indice…');
    const added = [];
    let res = null, err = null;
    try {
      res = await idxClient.search(doc.toks, doc.excl, {
        signal: idx.ctrl.signal, max: 6,
        onProgress: (i, n) => setMsg(el.idxMsg, 'Confronto delle impronte: ' + i + ' di ' + n + ' blocchi dell\'indice…'),
      });
      const have = new Set(state.sources.filter(s => s.idx).map(s => s.idx.url));
      for (const d of res.docs) {
        if (have.has(d.url)) continue;
        const dominio = d.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        // il testo della fonte è fatto dei passaggi del testo verificato che coincidono con la pagina
        const body = d.passages.map(p => doc.text.slice(doc.toks[p.ti].s, doc.toks[p.te - 1].e)).join('\n\n');
        addSource(dominio + ' · ' + (d.title || d.url), body, { example: state.example, idx: { url: d.url, title: d.title, dominio, archivio: res.meta.archivio, archivioData: res.meta.archivioData } });
        added.push(dominio + ' · ' + (d.title || d.url));
      }
    } catch (e) { err = e; }
    setIdxRunning(false);
    idx.ctrl = null;
    const aborted = err && err.name === 'AbortError';
    if (err && !aborted && !err.kind) console.error(err);
    const m = res ? res.meta : idxClient.meta(), parts = [];
    if (aborted) parts.push('Ricerca nell\'indice interrotta.');
    else if (err) parts.push(idxErrText(err));
    else if (added.length) parts.push((added.length === 1 ? 'Corrispondenze in 1 pagina, aggiunta alle fonti: ' : 'Corrispondenze in ' + added.length + ' pagine, aggiunte alle fonti: ') + titles(added, 3) + '.');
    else if (res && res.docs.length) parts.push('Le pagine trovate sono già tra le fonti.');
    else parts.push('Nessuna corrispondenza nell\'indice.');
    if (m && !err) {
      const siti = (m.siti || []).map(s => s.dominio);
      parts.push('Indice: ' + fmtInt(m.documenti) + ' pagine di ' + siti.slice(0, 4).join(', ') + (siti.length > 4 ? ' e altri ' + (siti.length - 4) + ' siti' : '') + ', dall\'' + archivioLabel(m) + '.');
      // quanto ritrova davvero: la verifica fatta a ogni costruzione dell'indice su brani presi a caso dalle sue pagine
      const v = m.verifica, pc = (a, b) => { const n = Math.round(100 * a / b); return (n === 1 || n === 11 || /^8/.test(String(n)) ? 'l\'' : n === 0 ? 'lo ' : 'il ') + n + '%'; };
      if (!added.length) parts.push((v && v.campioni ? 'Nella verifica dell\'indice ritrova ' + pc(v.trovati80, v.campioni) + ' dei brani di 80 parole copiati dalle sue pagine e ' + pc(v.trovati40, v.campioni) + ' di quelli di 40. ' : '') + 'L\'indice contiene solo una parte di quei siti: un esito vuoto non dimostra che il testo sia originale.');
    }
    setMsg(el.idxMsg, parts.join(' '), !!err && !aborted);
    if (added.length) { selectTab('src'); await runAnalysis(); }
  }

  // ---------- disegno dei risultati ----------
  function selectTab(name) {
    TAB_NAMES.forEach((n, i) => { const on = n === name; el.tabs[i].setAttribute('aria-selected', String(on)); el.tabs[i].tabIndex = on ? 0 : -1; el.panes[n].hidden = !on; });
  }
  function applyWidths(root) {
    $$('[data-w]', root).forEach(n => { n.style.width = Math.max(0, Math.min(100, parseFloat(n.getAttribute('data-w')) || 0)) + '%'; });
    $$('[data-left]', root).forEach(n => { n.style.left = Math.max(0, Math.min(100, parseFloat(n.getAttribute('data-left')) || 0)) + '%'; });
  }
  function renderAll() {
    el.copyFb.hidden = true; el.exportMsg.textContent = '';
    if (!state.res) {
      const emp = '<p class="empty">Incolla o carica un testo e premi <b>Analizza</b>.</p>';
      el.panes.src.innerHTML = emp; el.panes.web.innerHTML = emp; el.panes.ai.innerHTML = emp;
      el.tabSrcNum.textContent = '–'; el.tabWebNum.textContent = '–'; el.tabAiNum.textContent = '–';
      updateExportUI(); return;
    }
    renderSrcPane(); renderWebPane(); renderAiPane(); updateTabNums(); updateExportUI();
  }
  function updateTabNums() {
    const r = state.res;
    el.tabSrcNum.textContent = state.snap.sources.length ? pct(r.literal / Math.max(1, r.bodyWords)) : '–';
    el.tabWebNum.textContent = String(Math.min(state.fp.length, state.fpShown));
    el.tabAiNum.textContent = state.ai.index === null ? '–' : String(state.ai.index);
  }
  const srcObj = id => state.snap.sources.find(s => s.id === id);
  const ordOf = id => state.snap.ord.get(id) || 0;
  function litType(p) { return p.ident >= 0.97 ? 'Copia identica' : p.ident >= 0.7 ? 'Copia con modifiche' : 'Copia rimaneggiata'; }

  function passageItems() {
    const r = state.res, doc = r.doc, items = [];
    r.passages.forEach((p, i) => items.push({ key: 'L' + i, kind: 'lit', pos: doc.toks[p.iS].s, src: p.src, p }));
    r.para.forEach((h, i) => items.push({ key: 'P' + i, kind: 'para', pos: doc.sents[h.d].s, src: h.src, h }));
    items.sort((a, b) => a.pos - b.pos);
    return items;
  }
  const typeLabel = it => (it.kind === 'lit' ? litType(it.p) : 'Possibile parafrasi');
  const metaLabel = it => (it.kind === 'lit' ? (it.p.iE - it.p.iS) + ' parole · ' + Math.round(it.p.ident * 100) + '% uguale' : it.h.shared + ' parole chiave in comune');
  function docExcerpt(it) {
    const doc = state.res.doc;
    if (it.kind === 'lit') return doc.text.slice(doc.toks[it.p.iS].s, doc.toks[it.p.iE - 1].e);
    const s = doc.sents[it.h.d]; return doc.text.slice(s.s, s.e);
  }
  function srcExcerpt(it) {
    const src = srcObj(it.src); if (!src) return '';
    if (it.kind === 'lit') return src.text.slice(src.toks[it.p.jS].s, src.toks[it.p.jE - 1].e);
    const s = src.sents[it.h.sj]; return src.text.slice(s.s, s.e);
  }

  function renderRanges(text, ranges) {
    ranges = ranges.filter(r => r.e > r.s);
    if (!ranges.length) return esc(text);
    const pts = [0, text.length];
    for (const r of ranges) pts.push(r.s, r.e);
    pts.sort((a, b) => a - b);
    const xs = []; for (const p of pts) if (!xs.length || xs[xs.length - 1] !== p) xs.push(p);
    ranges.sort((a, b) => a.s - b.s);
    let ri = 0, active = [], out = '', cur = null, buf = '';
    const badges = new Set();
    const flush = () => {
      if (!buf) return;
      if (!cur) out += buf;
      else {
        let pre = '';
        if (cur.badge && !badges.has(cur.key)) { badges.add(cur.key); pre = '<sup class="fn ' + cur.cc + '">' + cur.badge + '</sup>'; }
        out += pre + '<span class="' + cur.cls + '"' + (cur.key ? ' data-key="' + cur.key + '"' : '') + (cur.title ? ' title="' + esc(cur.title) + '"' : '') + '>' + buf + '</span>';
      }
      buf = '';
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      while (ri < ranges.length && ranges[ri].s <= a) active.push(ranges[ri++]);
      if (active.length) active = active.filter(r => r.e > a);
      let top = null; for (const r of active) if (!top || r.pr > top.pr) top = r;
      if (top !== cur) { flush(); cur = top; }
      buf += esc(text.slice(a, b));
    }
    flush();
    return out;
  }
  function markedDocHTML() {
    const r = state.res, doc = r.doc, toks = doc.toks, owner = r.owner, ranges = [];
    let t = 0;
    while (t < toks.length) {
      const o = owner[t]; if (o < 0) { t++; continue; }
      let u = t; while (u + 1 < toks.length && owner[u + 1] === o) u++;
      const p = r.passages[o], ord = ordOf(p.src);
      ranges.push({ s: toks[t].s, e: toks[u].e, pr: 3, cls: 'm ' + cc(ord), cc: cc(ord), key: 'L' + o, badge: String(ord), title: 'Fonte ' + ord + ' · ' + litType(p) });
      t = u + 1;
    }
    r.para.forEach((h, i) => { const s = doc.sents[h.d], ord = ordOf(h.src); ranges.push({ s: s.s, e: s.e, pr: 1, cls: 'pp ' + cc(ord), key: 'P' + i, title: 'Fonte ' + ord + ' · possibile parafrasi' }); });
    doc.quotes.forEach(q => ranges.push({ s: q.s, e: q.e, pr: 0, cls: 'q', title: 'Citazione tra virgolette, esclusa dal confronto' }));
    if (doc.biblioStart >= 0) ranges.push({ s: doc.biblioStart, e: doc.text.length, pr: 0, cls: 'q', title: 'Bibliografia, esclusa dal confronto' });
    return renderRanges(doc.text, ranges);
  }
  function tokHTML(text, toks, ti, te, clsFn) {
    if (te <= ti) return '';
    let html = '', pos = toks[ti].s;
    for (let t = ti; t < te; t++) {
      const tk = toks[t];
      html += esc(text.slice(pos, tk.s));
      const c = clsFn(t), w = esc(text.slice(tk.s, tk.e));
      html += c ? '<span class="' + c + '">' + w + '</span>' : w;
      pos = tk.e;
    }
    const tail = /^[^\s\p{L}\p{N}]{0,3}/u.exec(text.slice(pos, pos + 3));
    return html + esc(tail ? tail[0] : '');
  }
  function stemSet(toks, a, b) { const s = new Set(); for (let t = a; t < b; t++) { const w = toks[t].w; if (MR.isContent(w)) s.add(MR.stem(w)); } return s; }
  function compareHTML(it) {
    const doc = state.res.doc, src = srcObj(it.src), ord = ordOf(it.src);
    if (!src) return '<p class="cmp-note">La fonte non è più disponibile.</p>';
    if (src.idx && it.kind === 'lit') {
      // l'indice conserva solo impronte: il testo della pagina non c'è, si mostra il passaggio e il link
      const p = it.p, dE = Math.min(p.iE, p.iS + 500);
      return '<div class="cmp-grid one"><div><h4>Nel testo</h4><p class="cmp-t">' + tokHTML(doc.text, doc.toks, p.iS, dE, () => '') + '</p></div></div><p class="cmp-note">Secondo le impronte dell\'indice, questo passaggio compare nella pagina <a href="' + esc(src.idx.url) + '" target="_blank" rel="noopener noreferrer">' + esc(trunc(src.idx.title || src.idx.url, 80)) + '</a> (' + esc(src.idx.dominio) + '). L\'indice non conserva il testo delle pagine: aprila per verificare. I bordi del passaggio possono differire di qualche parola.</p>';
    }
    let dh, sh, note;
    if (it.kind === 'lit') {
      const p = it.p, cap = 500, dE = Math.min(p.iE, p.iS + cap), sE = Math.min(p.jE, p.jS + cap);
      const a = [], b = [];
      for (let t = p.iS; t < dE; t++) a.push(doc.toks[t].w);
      for (let t = p.jS; t < sE; t++) b.push(src.toks[t].w);
      const { ma, mb } = MR.lcsMask(a, b);
      dh = tokHTML(doc.text, doc.toks, p.iS, dE, t => (ma[t - p.iS] ? '' : 'chg'));
      sh = tokHTML(src.text, src.toks, p.jS, sE, t => (mb[t - p.jS] ? '' : 'chg'));
      note = 'Evidenziate le parole che cambiano tra testo e fonte.' + (p.iE > dE || p.jE > sE ? ' Il passaggio è lungo: qui ne vedi le prime 500 parole.' : '');
    } else {
      const ds = doc.sents[it.h.d], ss = src.sents[it.h.sj];
      const dSet = stemSet(doc.toks, ds.ti, ds.te), sSet = stemSet(src.toks, ss.ti, ss.te);
      const shared = (toks, set) => t => { const w = toks[t].w; return MR.isContent(w) && set.has(MR.stem(w)) ? 'sh' : ''; };
      dh = tokHTML(doc.text, doc.toks, ds.ti, ds.te, shared(doc.toks, sSet));
      sh = tokHTML(src.text, src.toks, ss.ti, ss.te, shared(src.toks, dSet));
      note = 'Evidenziate le parole chiave in comune.';
    }
    return '<div class="cmp-grid"><div><h4>Nel testo</h4><p class="cmp-t">' + dh + '</p></div><div><h4>Nella fonte ' + ord + ' · ' + esc(trunc(src.name, 60)) + '</h4><p class="cmp-t">' + sh + '</p></div></div><p class="cmp-note">' + note + '</p>';
  }
  function itemHTML(it) {
    const ord = ordOf(it.src), open = state.openKey === it.key;
    return '<li class="pitem ' + cc(ord) + (open ? ' on' : '') + '" data-key="' + it.key + '"><button type="button" class="phead" aria-expanded="' + open + '"><span class="sn">' + ord + '</span><span class="ptype">' + esc(typeLabel(it)) + '</span><span class="pmeta">' + esc(metaLabel(it)) + '</span></button><p class="pex">' + esc(trunc(docExcerpt(it), 170)) + '</p><div class="cmp"' + (open ? '' : ' hidden') + '>' + (open ? compareHTML(it) : '') + '</div></li>';
  }
  function renderSrcPane() {
    const r = state.res, snap = state.snap, pane = el.panes.src, body = Math.max(1, r.bodyWords);
    if (!snap.sources.length) {
      pane.innerHTML = '<div class="pane-note"><p><b>Nessuna fonte caricata.</b> L\'antiplagio confronta il testo con le fonti che aggiungi al punto 2: file tuoi, testi incollati o le voci trovate dal pulsante <button type="button" class="link" data-wiki>Cerca su Wikipedia</button>. Senza fonti restano la <button type="button" class="link" data-goto="web">ricerca web manuale</button> e i <button type="button" class="link" data-goto="ai">segnali AI</button>.</p></div>';
      $$('[data-goto]', pane).forEach(b => b.addEventListener('click', () => { const n = b.getAttribute('data-goto'); selectTab(n); el.tabs[TAB_NAMES.indexOf(n)].focus(); }));
      $$('[data-wiki]', pane).forEach(b => b.addEventListener('click', () => { el.wikiBtn.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }); el.wikiBtn.focus({ preventScroll: true }); }));
      return;
    }
    const items = passageItems();
    state.itemMap = new Map(items.map(i => [i.key, i]));
    const doc = r.doc, o = snap.opts;
    let note = 'Su ' + fmtInt(r.bodyWords) + ' parole · corrispondenza minima ' + o.k + ' parole, fino a ' + o.gap + ' parole cambiate';
    if (o.ignoreQuotes && doc.quoteWords) note += ' · citazioni tra virgolette escluse (' + fmtInt(doc.quoteWords) + ' parole)';
    if (o.ignoreBiblio && doc.biblioStart >= 0) note += ' · bibliografia esclusa (' + fmtInt(doc.biblioWords) + ' parole)';
    const per = r.per.map(p => {
      const ord = ordOf(p.id);
      let det = p.passages === 1 ? '1 passaggio' : p.passages + ' passaggi';
      if (p.passages) det += ', il più lungo di ' + p.longest + ' parole';
      if (p.paraN) det += ' · ' + p.paraN + (p.paraN === 1 ? ' possibile parafrasi' : ' possibili parafrasi');
      return '<li class="' + cc(ord) + '"><span class="sn">' + ord + '</span>' + nameHTML(srcObj(p.id) || p, 'nm') + '<span class="pc">' + pct(p.covered / body) + '</span><span class="bar"><i data-w="' + (p.covered / body * 100).toFixed(2) + '"></i></span><span class="det">' + det + '</span></li>';
    }).join('');
    let html = '<div class="sum"><div><div class="figs"><div class="fig-b"><span class="fig blu">' + pct(r.literal / body) + '</span><span class="fig-lbl">del testo coincide con le fonti, parola per parola o con poche modifiche</span></div><div class="fig-b"><span class="fig fig-2">' + pct(r.paraWords / body) + '</span><span class="fig-lbl">in frasi che riprendono una fonte con parole in parte diverse</span></div></div><p class="sum-note">' + esc(note) + '</p></div><div><h3 class="sec-h per-h">Per fonte</h3><ol class="per-src">' + per + '</ol></div></div>';
    const legend = '<span class="legend"><span class="lg m-lg">copia</span><span class="lg pp-lg">possibile parafrasi</span>' + (doc.quotes.length || doc.biblioStart >= 0 ? '<span class="lg q-lg">escluso</span>' : '') + '</span>';
    html += '<div class="split"><div class="view-col"><div class="view-h"><h3>Testo marcato</h3>' + legend + '</div><div class="docview" id="docView" tabindex="0" aria-label="Testo con le corrispondenze evidenziate"><div class="inner">' + markedDocHTML() + '</div></div></div>';
    html += '<aside class="appar" aria-label="Elenco delle corrispondenze"><div class="view-h"><h3>Apparato</h3><span class="meta">' + items.length + (items.length === 1 ? ' voce' : ' voci') + '</span></div>' + (items.length ? '<ol class="plist" id="plist">' + items.map(itemHTML).join('') + '</ol>' : '<p class="empty small">Nessuna corrispondenza con le fonti, con le impostazioni attuali.</p>') + '</aside></div>';
    pane.innerHTML = html;
    applyWidths(pane);
    const view = E('docView'), plist = E('plist');
    if (view) view.addEventListener('click', e => { const t = e.target.closest('[data-key]'); if (t) openItem(t.getAttribute('data-key'), true); });
    if (plist) plist.addEventListener('click', e => { const h = e.target.closest('.phead'); if (h) toggleItem(h.closest('.pitem').getAttribute('data-key')); });
    if (state.openKey) highlightMarks(state.openKey);
  }
  function openItem(key, fromText) {
    const plist = E('plist'); if (!plist) return;
    const li = plist.querySelector('.pitem[data-key="' + key + '"]'); if (!li) return;
    if (state.openKey !== key) toggleItem(key); else highlightMarks(key);
    if (fromText) {
      const top = li.offsetTop - plist.offsetTop;
      if (plist.scrollHeight > plist.clientHeight + 4) plist.scrollTo({ top: Math.max(0, top - 8), behavior: reduceMotion ? 'auto' : 'smooth' });
      else li.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
  function toggleItem(key) {
    const plist = E('plist'); if (!plist) return;
    state.openKey = state.openKey === key ? null : key;
    $$('.pitem', plist).forEach(li => {
      const k = li.getAttribute('data-key'), on = k === state.openKey, c = li.querySelector('.cmp');
      li.classList.toggle('on', on);
      li.querySelector('.phead').setAttribute('aria-expanded', String(on));
      if (on) { c.innerHTML = compareHTML(state.itemMap.get(k)); c.hidden = false; } else if (!c.hidden) { c.hidden = true; c.innerHTML = ''; }
    });
    highlightMarks(state.openKey);
  }
  function highlightMarks(key) {
    const view = E('docView'); if (!view) return;
    $$('.on', view).forEach(n => n.classList.remove('on'));
    if (!key) return;
    const marks = $$('[data-key="' + key + '"]', view);
    marks.forEach(n => n.classList.add('on'));
    if (marks[0]) {
      const top = marks[0].offsetTop;
      if (top < view.scrollTop + 16 || top > view.scrollTop + view.clientHeight - 40) view.scrollTo({ top: Math.max(0, top - view.clientHeight / 3), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  // Ricerca web
  function fpHTML(f, i) {
    const q = encodeURIComponent('"' + f.phrase + '"');
    const where = Math.round(f.ti / Math.max(1, state.res.doc.toks.length) * 100);
    return '<li class="fp"><div class="fp-txt"><q id="fpq' + i + '">' + esc(f.phrase) + '</q><span class="fp-pos">al ' + where + '% del testo</span></div><div class="fp-actions"><a href="https://www.google.com/search?q=' + q + '" target="_blank" rel="noopener noreferrer">Google</a><a href="https://scholar.google.com/scholar?q=' + q + '" target="_blank" rel="noopener noreferrer">Scholar</a><a href="https://www.bing.com/search?q=' + q + '" target="_blank" rel="noopener noreferrer">Bing</a><button type="button" data-copy="' + i + '">Copia</button></div></li>';
  }
  function renderWebPane() {
    const fp = state.fp, pane = el.panes.web;
    if (!fp.length) { pane.innerHTML = '<p class="empty">Il testo è troppo breve per estrarre frasi da cercare: servono frasi di almeno 9 parole.</p>'; return; }
    const shown = fp.slice(0, state.fpShown), rest = fp.length - shown.length;
    pane.innerHTML = '<div class="pane-intro"><p>Le frasi più caratteristiche del testo, distribuite dall\'inizio alla fine. Ogni pulsante apre il motore di ricerca con la frase tra virgolette, cioè cercata esattamente: è il controllo manuale che fanno anche i docenti, e trova le copie da pagine web indicizzate. Per Wikipedia c\'è anche la ricerca automatica, con il pulsante «Cerca su Wikipedia» al punto 2.</p><p class="small">Cliccando, la frase viene inviata al motore di ricerca scelto. Il testo esce dal tuo computer solo così o con la ricerca su Wikipedia, e solo se lo decidi tu. Se la ricerca non trova nulla, il testo potrebbe comunque provenire da libri, tesi o archivi non indicizzati.</p></div><ol class="fplist">' + shown.map(fpHTML).join('') + '</ol>' + (rest > 0 ? '<div><button type="button" class="btn" id="fpMore">Mostra altre ' + Math.min(8, rest) + ' frasi</button></div>' : '');
    const more = E('fpMore');
    if (more) more.addEventListener('click', () => { state.fpShown += 8; renderWebPane(); updateTabNums(); });
    $$('[data-copy]', pane).forEach(b => b.addEventListener('click', () => {
      const i = parseInt(b.getAttribute('data-copy'), 10), txt = state.fp[i].phrase;
      const done = () => { b.textContent = 'Copiata'; setTimeout(() => { b.textContent = 'Copia'; }, 1600); };
      const fallback = () => { const q = E('fpq' + i); if (!q) return; const rg = document.createRange(); rg.selectNodeContents(q); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg); b.textContent = 'Selezionata'; };
      try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
    }));
  }

  // Segnali AI
  const BAND_TXT = { lo: 'Pochi segnali tipici dei testi generati', mid: 'Segnali misti', hi: 'Molti segnali tipici dei testi generati', na: 'Testo troppo breve per un indice' };
  // Misure della valutazione del rilevatore (tools/valuta; rapporto completo nel ramo rapporti-ai), da aggiornare
  // insieme a T_MID e T_HI in engine.js.
  const PROVA_TXT = 'Nelle prove, su 1.800 testi scritti da persone prima del 2022 e 165 temi generati da quattro modelli aperti, arriva a «segnali misti» o oltre il 2,6% dei testi umani (il 4,8% delle pagine di appunti e riassunti) e il 69% dei temi generati; a «molti segnali» lo 0,3% dei testi umani e il 36% dei temi generati.';
  const PROVA_URL = 'https://github.com/ianonoia522-droid/matitarossoblu/blob/rapporti-ai/valutazione-ai.md';
  const QTY_TXT = { insufficiente: 'insufficiente', scarsa: 'scarsa, indice instabile', sufficiente: 'sufficiente', buona: 'buona' };
  function humanLine(ai) {
    const H = ai.human, parts = [];
    const add = (n, one, many) => { if (n) parts.push(n + ' ' + (n === 1 ? one : many)); };
    add(H.dbl, 'spazio doppio', 'spazi doppi');
    add(H.nospace, 'spazio mancante dopo la punteggiatura', 'spazi mancanti dopo la punteggiatura');
    add(H.spBefore, 'spazio prima della punteggiatura', 'spazi prima della punteggiatura');
    add(H.lowerAfter, 'minuscola dopo il punto', 'minuscole dopo il punto');
    add(H.rep, 'punteggiatura ripetuta', 'punteggiature ripetute');
    add(H.emo, 'emoticon o risata', 'emoticon o risate');
    add(H.coll, 'parola colloquiale', 'parole colloquiali');
    return parts;
  }
  function sigHTML(s) {
    const ex = s.examples && s.examples.length ? '<span class="ex">Trovate: ' + s.examples.map(x => '«' + esc(trunc(x, 60)) + '»').join(', ') + '</span>' : '';
    const val = s.ok ? '<span class="v">' + esc(s.value) + '</span><span class="u">' + esc(s.unit) + '</span>' : '<span class="u">Non valutato: ' + esc(s.need) + '</span>';
    const bar = s.ok ? '<span class="track"><i data-w="' + Math.round(s.score * 100) + '"></i></span><span class="cap">contributo ' + Math.round(s.score * 100) + '% · peso ' + NF1.format(s.w) + ' · ' + esc(s.scale) + '</span>' : '';
    return '<li class="sig' + (s.ok ? '' : ' na') + '"><div class="sig-txt"><b>' + esc(s.name) + '</b><span class="d">' + esc(s.desc) + '</span>' + ex + '</div><div class="sig-val">' + val + '</div><div class="sig-bar">' + bar + '</div></li>';
  }
  function aiMapHTML() {
    const ai = state.ai, text = state.res.doc.text;
    let html = '', pos = 0;
    ai.sentences.forEach((s, i) => {
      html += esc(text.slice(pos, s.s));
      let inner = '', p = s.s;
      for (const mk of s.marks.slice().sort((a, b) => a.s - b.s)) {
        if (mk.s < p) continue;
        const e = Math.min(mk.e, s.e);
        inner += esc(text.slice(p, mk.s)) + '<b class="mk" title="' + esc(mk.label) + '">' + esc(text.slice(mk.s, e)) + '</b>';
        p = e;
      }
      inner += esc(text.slice(p, s.e));
      html += '<span class="sx' + (s.lvl ? ' sx' + s.lvl : '') + (state.aiSel === i ? ' on' : '') + '" data-si="' + i + '">' + inner + '</span>';
      pos = s.e;
    });
    return html + esc(text.slice(pos));
  }
  function inspHTML(i) {
    const s = i >= 0 ? state.ai.sentences[i] : null;
    if (!s) return '<p>Tocca una frase della mappa per vedere quali segnali contiene.</p>';
    const t = state.res.doc.text.slice(s.s, s.e);
    return '<p class="it">' + esc(trunc(t, 220)) + '</p>' + (s.why.length ? '<div class="chips">' + s.why.map(w => '<span class="chip">' + esc(w) + '</span>').join('') + '</div>' : '<div class="chips"><span class="chip neutral">nessun segnale in questa frase</span></div>');
  }
  function renderAiPane() {
    const ai = state.ai, pane = el.panes.ai;
    const hl = humanLine(ai);
    const drop = ai.index !== null && ai.indexNoHuman !== null ? ai.indexNoHuman - ai.index : 0;
    let html = '<div class="ai-sum"><div class="gauge"><div class="g-num"><span class="fig rosso">' + (ai.index === null ? '–' : ai.index) + '</span><span class="of">/100</span></div><span class="band ' + ai.band + '">' + BAND_TXT[ai.band] + '</span><p class="g-lbl">Indice di somiglianza con lo stile dei testi generati. <b>Non è una probabilità e da solo non prova nulla.</b></p>' + '<p class="g-prova">' + esc(PROVA_TXT) + ' <a href="' + PROVA_URL + '" target="_blank" rel="noopener noreferrer">Come è stato misurato</a></p>' + '</div>';
    html += '<div class="g-side"><div class="scale-wrap" aria-hidden="true"><div class="scale"><i class="z1"></i><i class="z2"></i><i class="z3"></i></div>' + (ai.index !== null ? '<span class="marker" data-left="' + ai.index + '"></span>' : '') + '<div class="scale-lbl"><span class="z1">pochi segnali</span><span class="z2">misti</span><span class="z3">molti</span></div></div>';
    html += '<dl class="facts"><div><dt>Quantità di testo</dt><dd>' + QTY_TXT[ai.qty] + ' · ' + fmtInt(ai.words) + ' parole, ' + ai.nProse + ' frasi</dd></div><div><dt>Lingua rilevata</dt><dd>' + (ai.lang === 'en' ? 'inglese, formule inglesi' : 'italiano, formule italiane') + '</dd></div>' + (ai.dialogue >= 3 ? '<div><dt>Dialoghi</dt><dd>' + ai.dialogue + ' battute: i trattini a inizio battuta non contano</dd></div>' : '') + '</dl></div></div>';
    if (ai.residue.length) {
      html += '<div class="residue"><h3>Tracce di copia-incolla</h3><ul>' + ai.residue.map(r => '<li>' + esc(r.label) + ': ' + r.n + (r.ex.length ? ' (' + r.ex.map(x => '«' + esc(trunc(x, 50)) + '»').join(', ') + ')' : '') + '</li>').join('') + '</ul><p>Frasi rivolte al lettore come in una chat, segnaposto e caratteri invisibili compaiono quando si incolla una risposta di un assistente o una pagina web. La formattazione Markdown è normale se il testo nasce in Markdown.</p></div>';
    }
    html += '<div class="sig-wrap"><h3 class="sec-h">Da cosa dipende l\'indice</h3><ol class="sig-list">' + ai.signals.map(sigHTML).join('') + '</ol>';
    if (hl.length) html += '<p class="human">Imperfezioni tipiche della scrittura a mano: ' + esc(hl.join(', ')) + '. ' + (drop > 0 ? 'Abbassano l\'indice di ' + drop + (drop === 1 ? ' punto.' : ' punti.') : 'Sono troppo poche per spostare l\'indice.') + '</p>';
    else html += '<p class="human">Nessuna imperfezione tipica della scrittura a mano (spazi doppi, minuscole dopo il punto, punteggiatura ripetuta). Un testo revisionato con cura ne ha poche anche se è scritto a mano.</p>';
    html += '</div>';
    const tops = ai.sentences.map((s, i) => ({ s, i })).filter(x => x.s.pts >= 2).sort((a, b) => b.s.pts - a.s.pts).slice(0, 6);
    const text = state.res.doc.text;
    html += '<div class="split"><div class="view-col"><div class="view-h"><h3>Mappa delle frasi</h3><span class="legend"><span class="lg sx1">un segnale</span><span class="lg sx2">alcuni</span><span class="lg sx3">molti</span><span class="lg"><b class="mk">in grassetto</b> le formule</span></span></div><div class="docview" id="aiView" tabindex="0" aria-label="Testo con le frasi colorate per numero di segnali"><div class="inner">' + aiMapHTML() + '</div></div></div>';
    html += '<aside class="appar"><div class="view-h"><h3>Frase selezionata</h3></div><div class="insp" id="aiInsp">' + inspHTML(state.aiSel) + '</div><div class="view-h"><h3>Frasi con più segnali</h3></div>' + (tops.length ? '<ol class="tops">' + tops.map(x => '<li><button type="button" class="top" data-si="' + x.i + '"><span class="top-t">' + esc(trunc(text.slice(x.s.s, x.s.e), 150)) + '</span><span class="chips">' + x.s.why.slice(0, 4).map(w => '<span class="chip">' + esc(w) + '</span>').join('') + '</span></button></li>').join('') + '</ol>' : '<p class="empty small">Nessuna frase con più di un segnale.</p>') + '</aside></div>';
    pane.innerHTML = html;
    applyWidths(pane);
    E('aiView').addEventListener('click', e => { const t = e.target.closest('[data-si]'); if (t) selectSentence(parseInt(t.getAttribute('data-si'), 10), false); });
    $$('.top', pane).forEach(b => b.addEventListener('click', () => selectSentence(parseInt(b.getAttribute('data-si'), 10), true)));
  }
  function selectSentence(i, scroll) {
    state.aiSel = i;
    const view = E('aiView'); if (!view) return;
    $$('.sx.on', view).forEach(n => n.classList.remove('on'));
    const node = view.querySelector('[data-si="' + i + '"]');
    if (node) {
      node.classList.add('on');
      if (scroll) view.scrollTo({ top: Math.max(0, node.offsetTop - view.clientHeight / 3), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    E('aiInsp').innerHTML = inspHTML(i);
  }

  // ---------- rapporto e riepilogo ----------
  const REPORT_CSS = 'body{margin:0;background:#F4F5F8;color:#151B2B;font:15px/1.55 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:900px;margin:0 auto;padding:32px 20px 64px}h1{font:700 32px/1.1 "Bodoni Moda",Didot,Georgia,serif;margin:0 0 6px}h2{font:600 13px/1.3 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.07em;margin:36px 0 12px;padding-bottom:6px;border-bottom:1px solid #D5DBE5}h3{font-size:15px;margin:22px 0 8px}.meta{color:#5B6579;font-size:13px}.note{background:#FFF6E3;border:1px solid #EBD6A8;padding:10px 12px;font-size:13.5px;border-radius:4px}.figs{display:flex;flex-wrap:wrap;gap:12px 36px}.big{font:500 44px/1 "Bodoni Moda",Didot,Georgia,serif}table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid #E3E7EE}th{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:#5B6579}.ex{font-family:Georgia,serif;font-style:italic;color:#38425A}.doc{white-space:pre-wrap;font:15px/1.8 Georgia,serif;background:#FFF;border:1px solid #D5DBE5;padding:18px 20px;border-radius:4px}.m{background:var(--sbg);box-shadow:inset 0 -2px 0 var(--sc)}.pp{text-decoration:underline dotted var(--sc) 2px;text-underline-offset:3px}.q{color:#7A8398}sup.fn{font:600 10px monospace;color:var(--sc)}.sn{display:inline-block;min-width:18px;padding:1px 4px;border-radius:3px;background:var(--sc);color:#FFF;font:600 11px monospace;text-align:center}.c1{--sc:#1F4FCC;--sbg:#DCE5FA}.c2{--sc:#8F5C0E;--sbg:#F4E3C1}.c3{--sc:#0B7A6E;--sbg:#CBEAE4}.c4{--sc:#A12F79;--sbg:#F2D7E9}.c5{--sc:#4C6B10;--sbg:#DFEBC5}.c6{--sc:#5848C6;--sbg:#E1DCF8}ul{padding-left:18px}li{margin:4px 0}a{color:#1F4FCC}@media print{body{background:#FFF}main{padding:0}.doc{border:0;padding:0}}';
  const REPORT_LIMITS = [
    'Il confronto è limitato alle fonti fornite e alle eventuali voci di Wikipedia aggiunte: non include il resto di internet, Turnitin, Compilatio o archivi di tesi.',
    'La ricerca su Wikipedia prova un campione di frasi del testo: un esito vuoto non dimostra che il testo sia originale.',
    'Una corrispondenza può essere legittima (citazione corretta, definizione normativa, terminologia tecnica): ogni passaggio va letto.',
    'Traduzioni, parafrasi con sinonimi e plagio di idee sfuggono al confronto lessicale.',
    "L'indice dei segnali AI misura caratteristiche di stile. Non è una probabilità e non prova l'uso di intelligenza artificiale.",
    'Le fasce dei segnali AI sono tarate su testi scritti da persone prima del 2022 e su temi generati da modelli aperti; un testo generato e poi rielaborato sfugge più facilmente.',
  ];
  function settingsLine() {
    const o = state.snap.opts, doc = state.res.doc;
    let t = 'Corrispondenza minima ' + o.k + ' parole, fino a ' + o.gap + ' parole cambiate; parafrasi: ' + (o.paraSens === 'off' ? 'disattivata' : o.paraSens === 'alta' ? 'più sensibile' : 'normale');
    if (o.ignoreQuotes && doc.quoteWords) t += '; citazioni escluse (' + doc.quoteWords + ' parole)';
    if (o.ignoreBiblio && doc.biblioStart >= 0) t += '; bibliografia esclusa (' + doc.biblioWords + ' parole)';
    return t + '.';
  }
  function wikiVersion(w) {
    const d = w.ts ? new Date(w.ts) : null;
    return d && !isNaN(d) ? 'versione del ' + d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'versione consultata';
  }
  function reportName(s) {
    if (s.idx) return '<a href="' + esc(s.idx.url) + '">' + esc(s.name) + '</a><br><span class="meta">dall\'indice delle impronte, ' + esc(archivioLabel(s.idx)) + ': il testo della pagina non è conservato, i passaggi sono quelli del testo verificato</span>';
    if (!s.wiki) return esc(s.name);
    return '<a href="' + esc(s.wiki.url) + '">' + esc(s.name) + '</a><br><span class="meta">' + (s.wiki.perma ? '<a href="' + esc(s.wiki.perma) + '">' + esc(wikiVersion(s.wiki)) + '</a>' : esc(wikiVersion(s.wiki))) + ' · testo CC BY-SA</span>';
  }
  function buildReport() {
    const r = state.res, ai = state.ai, snap = state.snap, body = Math.max(1, r.bodyWords), items = passageItems();
    const date = snap.at.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });
    let h = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapporto di originalità</title><style>' + REPORT_CSS + '</style></head><body><main>';
    h += '<h1>Rapporto di originalità</h1><p class="meta">Matita Rossoblù · ' + esc(date) + ' · ' + fmtInt(r.bodyWords) + ' parole analizzate</p>';
    h += '<p class="note">Questo rapporto descrive somiglianze lessicali e caratteristiche di stile. Da solo non stabilisce se c\'è stato plagio o uso di intelligenza artificiale: i passaggi vanno letti e valutati da una persona.</p>';
    h += '<h2>Antiplagio · confronto con le fonti fornite</h2>';
    if (!snap.sources.length) h += '<p>Nessuna fonte fornita: confronto non eseguito.</p>';
    else {
      h += '<div class="figs"><div><span class="big">' + pct(r.literal / body) + '</span><br>coincide con le fonti</div><div><span class="big">' + pct(r.paraWords / body) + '</span><br>possibili parafrasi</div></div>';
      h += '<p class="meta">' + esc(settingsLine()) + '</p>';
      h += '<table><thead><tr><th>Fonte</th><th>Nome</th><th>Copertura</th><th>Passaggi</th><th>Il più lungo</th><th>Parafrasi</th></tr></thead><tbody>' + r.per.map(p => { const ord = ordOf(p.id); return '<tr class="' + cc(ord) + '"><td><span class="sn">' + ord + '</span></td><td>' + reportName(srcObj(p.id) || p) + '</td><td>' + pct(p.covered / body) + '</td><td>' + p.passages + '</td><td>' + (p.passages ? p.longest + ' parole' : '–') + '</td><td>' + p.paraN + '</td></tr>'; }).join('') + '</tbody></table>';
      if (items.length) {
        h += '<h3>Passaggi</h3><table><thead><tr><th>Fonte</th><th>Tipo</th><th>Nel testo</th><th>Nella fonte</th></tr></thead><tbody>' + items.map(it => { const ord = ordOf(it.src); return '<tr class="' + cc(ord) + '"><td><span class="sn">' + ord + '</span></td><td>' + esc(typeLabel(it)) + '<br><span class="meta">' + esc(metaLabel(it)) + '</span></td><td class="ex">' + esc(trunc(docExcerpt(it), 400)) + '</td><td class="ex">' + esc(trunc(srcExcerpt(it), 400)) + '</td></tr>'; }).join('') + '</tbody></table>';
      }
      h += '<h3>Testo marcato</h3><div class="doc">' + markedDocHTML().replace(/ data-key="[^"]*"/g, '') + '</div>';
    }
    h += '<h2>Segnali di scrittura generata</h2>';
    h += ai.index === null ? '<p>Testo troppo breve per calcolare l\'indice: servono almeno 150 parole.</p>' : '<p><span class="big">' + ai.index + '</span> /100 · ' + esc(BAND_TXT[ai.band]) + ' · quantità di testo ' + esc(QTY_TXT[ai.qty]) + '</p>' + '<p class="meta">' + esc(PROVA_TXT) + '</p>';
    h += '<table><thead><tr><th>Segnale</th><th>Valore</th><th>Contributo</th><th>Peso</th></tr></thead><tbody>' + ai.signals.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + (s.ok ? esc(s.value + ' · ' + s.unit) : 'non valutato: ' + esc(s.need)) + '</td><td>' + (s.ok ? Math.round(s.score * 100) + '%' : '–') + '</td><td>' + NF1.format(s.w) + '</td></tr>').join('') + '</tbody></table>';
    if (ai.residue.length) h += '<h3>Tracce di copia-incolla</h3><ul>' + ai.residue.map(x => '<li>' + esc(x.label) + ': ' + x.n + '</li>').join('') + '</ul>';
    const hl = humanLine(ai);
    if (hl.length) h += '<p class="meta">Imperfezioni tipiche della scrittura a mano: ' + esc(hl.join(', ')) + '.</p>';
    h += '<h2>Limiti</h2><ul>' + REPORT_LIMITS.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul></main></body></html>';
    return h;
  }
  function buildSummary() {
    const r = state.res, ai = state.ai, snap = state.snap, body = Math.max(1, r.bodyWords);
    const L = [];
    L.push('Matita Rossoblù · ' + snap.at.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' }));
    L.push('Testo: ' + fmtInt(r.bodyWords) + ' parole analizzate', '');
    L.push('ANTIPLAGIO (confronto con ' + snap.sources.length + (snap.sources.length === 1 ? ' fonte fornita)' : ' fonti fornite)'));
    if (!snap.sources.length) L.push('- nessuna fonte: confronto non eseguito');
    else {
      L.push('- coincide con le fonti: ' + pct(r.literal / body));
      L.push('- possibili parafrasi: ' + pct(r.paraWords / body));
      r.per.forEach(p => { const s = srcObj(p.id), w = s && s.wiki, x = s && s.idx; L.push('- fonte ' + ordOf(p.id) + ' «' + p.name + '»' + (w ? ' (' + (w.perma || w.url) + ', ' + wikiVersion(w) + ')' : '') + (x ? ' (' + x.url + ', indice delle impronte)' : '') + ': ' + pct(p.covered / body) + ', ' + p.passages + ' passaggi' + (p.passages ? ', il più lungo di ' + p.longest + ' parole' : '')); });
      L.push('- ' + settingsLine());
    }
    L.push('', 'SEGNALI AI');
    L.push(ai.index === null ? '- indice non calcolato: servono almeno 150 parole' : '- indice ' + ai.index + '/100: ' + BAND_TXT[ai.band].toLowerCase() + ' (quantità di testo ' + QTY_TXT[ai.qty] + ')');
    if (ai.index !== null) L.push('- ' + PROVA_TXT);
    ai.signals.filter(s => s.ok).forEach(s => L.push('- ' + s.name + ': ' + s.value + ' ' + s.unit + ' (contributo ' + Math.round(s.score * 100) + '%)'));
    if (ai.residue.length) L.push('- tracce di copia-incolla: ' + ai.residue.map(x => x.label + ' ' + x.n).join('; '));
    L.push('', "Nota: l'indice non è una probabilità e non prova l'uso di AI; le corrispondenze vanno lette una per una.");
    return L.join('\n');
  }
  function setExportMsg(t) { el.exportMsg.textContent = t; }
  function saveFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function downloadReport() {
    if (!state.res) return;
    const d = state.snap.at, stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    try { saveFile('rapporto-originalita-' + stamp + '.html', buildReport(), 'text/html;charset=utf-8'); setExportMsg('Rapporto scaricato: aprilo nel browser, da lì puoi stamparlo o salvarlo in PDF.'); }
    catch (e) { console.error(e); setExportMsg('Non riesco a creare il file del rapporto in questo browser: usa «Copia riepilogo».'); }
  }
  function copySummary() {
    if (!state.res) return;
    const txt = buildSummary();
    const fallback = () => { el.copyFbText.value = txt; el.copyFb.hidden = false; el.copyFbText.focus(); el.copyFbText.select(); setExportMsg(''); };
    try { navigator.clipboard.writeText(txt).then(() => { el.copyFb.hidden = true; setExportMsg('Riepilogo copiato negli appunti.'); }, fallback); } catch (e) { fallback(); }
  }
  function updateExportUI() { el.dlBtn.hidden = !state.res; el.copyBtn.disabled = !state.res; }

  // ---------- eventi ----------
  el.docText.addEventListener('paste', e => {
    if (!state.example) return;
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!t) return;
    e.preventDefault();
    leaveExample(true);
    el.docText.value = normalizeText(t);
    afterDocChange();
  });
  el.docText.addEventListener('input', afterDocChange);
  el.docText.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runAnalysis(); } });
  el.docFile.addEventListener('change', () => { const f = el.docFile.files && el.docFile.files[0]; if (f) loadDocFile(f); el.docFile.value = ''; });
  el.srcFile.addEventListener('change', () => { const fs = Array.from(el.srcFile.files || []); el.srcFile.value = ''; addSourceFiles(fs); });
  el.clearBtn.addEventListener('click', () => {
    if (wiki.running && wiki.ctrl) wiki.ctrl.abort();
    leaveExample(true); state.res = null; renderAll(); el.staleBar.hidden = true;
    setStatus(''); setMsg(el.docMsg, ''); setMsg(el.srcMsg, ''); setMsg(el.wikiMsg, ''); el.docText.focus();
  });
  el.srcList.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const id = parseInt(b.getAttribute('data-rm'), 10);
    state.sources = state.sources.filter(s => s.id !== id);
    renderSources(); markStale();
  });
  el.pasteToggle.addEventListener('click', () => {
    const open = el.pasteBox.hidden; el.pasteBox.hidden = !open; el.pasteToggle.setAttribute('aria-expanded', String(open));
    if (open) el.pasteName.focus();
  });
  el.pasteCancel.addEventListener('click', () => { el.pasteBox.hidden = true; el.pasteToggle.setAttribute('aria-expanded', 'false'); });
  el.pasteAdd.addEventListener('click', () => {
    const t = normalizeText(el.pasteText.value);
    if (MR.countWords(t) < 5) { setMsg(el.srcMsg, 'Incolla il testo della fonte: ne servono almeno 5 parole.', true); return; }
    if (state.example) leaveExample(true);
    addSource(el.pasteName.value.trim() || ('Fonte ' + (state.sources.length + 1)), t);
    el.pasteName.value = ''; el.pasteText.value = ''; el.pasteBox.hidden = true; el.pasteToggle.setAttribute('aria-expanded', 'false');
    setMsg(el.srcMsg, 'Fonte aggiunta.');
  });
  [el.optK, el.optGap, el.optQuotes, el.optBiblio, el.optPara].forEach(n => n.addEventListener('change', readOptsUI));
  el.optWiki.addEventListener('change', () => { state.opts.wikiLang = el.optWiki.value; saveOpts(); });
  el.wikiBtn.addEventListener('click', runWiki);
  el.idxBtn.addEventListener('click', runIdx);
  el.runBtn.addEventListener('click', runAnalysis);
  el.tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(TAB_NAMES[i]));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const n = (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
      selectTab(TAB_NAMES[n]); el.tabs[n].focus();
    });
  });
  el.dlBtn.addEventListener('click', downloadReport);
  el.copyBtn.addEventListener('click', copySummary);
  setupDrop(el.docPanel, fs => { if (fs && fs[0]) loadDocFile(fs[0]); });
  setupDrop(el.srcPanel, addSourceFiles);
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => { if (hasFiles(e)) e.preventDefault(); });

  // ---------- avvio ----------
  loadOpts(); syncOptsUI(); loadExample();
  try { compute(); renderAll(); setStatus('Esempio analizzato. Sostituisci testo e fonti con i tuoi, poi premi Analizza.'); }
  catch (err) { console.error(err); state.res = null; renderAll(); }
  selectTab('src');
})();
