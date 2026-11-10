# Matita Rossoblù

Antiplagio sulle tue fonti, su Wikipedia e sui siti di studio, segnali di scrittura generata da AI. È gratuito e open source, e l'analisi avviene nel browser: il testo lascia il computer solo per le ricerche che chi lo usa avvia, cioè alcune frasi inviate a Wikipedia o a un motore di ricerca.

**Usalo qui:** https://ianonoia522-droid.github.io/matitarossoblu/

Per segnalare un problema o proporre una modifica, apri una issue in questo repository.

## Cosa fa

- **Confronto con le fonti.** Trova copie identiche, copie con poche parole cambiate e frasi che riprendono una fonte con parole in parte diverse. Mostra il testo marcato, l'elenco dei passaggi e il confronto parola per parola.
- **Ricerca su Wikipedia.** Con un pulsante cerca su Wikipedia, in italiano o in inglese, un campione di frasi del testo, legge le voci che le contengono e aggiunge come fonti quelle che coincidono davvero, con il link alla versione letta.
- **Ricerca nei siti di studio.** Confronta le impronte del testo con un indice di pagine di siti di appunti e riassunti in italiano, costruito dall'archivio pubblico Common Crawl e pubblicato insieme alla pagina. Il testo non esce dal computer.
- **Ricerca web manuale.** Estrae le frasi più caratteristiche del testo e prepara la ricerca esatta, tra virgolette, su Google, Google Scholar e Bing.
- **Segnali AI.** Calcola un indice da 0 a 100 basato su caratteristiche di stile e mostra una mappa frase per frase con i motivi di ogni segnalazione.
- Legge file .docx, .pdf con testo selezionabile, .txt, .md e .html. Esporta un rapporto HTML, da stampare o salvare in PDF, e un riepilogo testuale.

## Cosa non fa

Da leggere prima di usarlo.

- Non cerca nel resto di internet e non consulta database come Turnitin o Compilatio: confronta il testo con le fonti caricate e, se lo chiedi, con Wikipedia.
- La ricerca su Wikipedia è un campione: fino a 20 frasi e 5 voci per volta. Trova una copia se almeno una delle frasi cercate è rimasta identica nella versione attuale della voce; non vede le versioni precedenti né i siti che copiano Wikipedia. Un esito vuoto non dimostra che il testo sia originale.
- L'indice dei siti di studio contiene solo una parte delle pagine di pochi siti, nella versione raccolta da Common Crawl alla data indicata. Trova con certezza i passaggi identici di almeno 28 parole, quelli più brevi solo a volte, e l'estensione della parte copiata è stimata per difetto.
- Non riconosce traduzioni, parafrasi costruite con sinonimi o il plagio di idee.
- **L'indice AI non è una probabilità e non è una prova.** Non è stato calibrato su un corpus: i test inclusi verificano solo che il comportamento non peggiori da una versione all'altra. Un testo umano formale o accademico può ottenere un indice alto. Non va usato per accusare nessuno.
- I PDF scansionati sono immagini e non contengono testo: prima serve un OCR.

## Privacy

- **Nessun server.** L'analisi è JavaScript eseguito nel browser.
- **Richieste esterne solo su richiesta.** Librerie e font sono ospitati insieme alla pagina. La Content Security Policy permette al browser di contattare soltanto `it.wikipedia.org` ed `en.wikipedia.org`, usati dalla ricerca su Wikipedia. Si può verificare negli strumenti per sviluppatori, alla scheda Rete.
- **Cosa riceve Wikipedia.** Solo dopo il clic su «Cerca su Wikipedia»: fino a 20 frasi di 6 parole e 3 parole chiave, più le richieste per leggere le voci trovate. Il testo intero non viene inviato. Le richieste sono anonime, senza cookie né intestazioni aggiunte; Wikimedia vede comunque l'indirizzo IP, come per qualsiasi visita a Wikipedia.
- **Ricerca nei siti di studio.** Il browser scarica dal sito stesso solo i file dell'indice che gli servono, scelti in base alle impronte; il testo non viene inviato.
- **Nessun cookie e nessuna statistica.** Le impostazioni e il conteggio delle richieste a Wikipedia restano nel `localStorage` del browser.
- **Ricerca web manuale.** I pulsanti aprono il motore di ricerca scelto con la frase indicata.

## Usarlo in locale

Scarica la cartella e apri `index.html` con un browser recente: Chrome, Edge, Firefox o Safari. Funziona anche senza connessione, tranne la ricerca su Wikipedia. La ricerca nei siti di studio ha bisogno di un server, anche locale: per esempio `python3 -m http.server` nella cartella, poi `http://localhost:8000`.

Aperto da file locale, PDF.js lavora senza worker, quindi i PDF molto lunghi richiedono qualche secondo in più.

## Pubblicarlo con GitHub Pages

1. Crea un repository pubblico su GitHub. Con un account gratuito, Pages funziona sui repository pubblici.
2. Carica il contenuto di questa cartella nella radice del repository, con *Add file → Upload files* oppure con `git push`. Il file `index.html` deve stare nella radice.
3. Apri *Settings → Pages → Build and deployment*. In *Source* scegli **Deploy from a branch**, poi il branch `main` e la cartella `/ (root)`, e premi *Save*.
4. Dopo qualche minuto il sito è raggiungibile su `https://<utente>.github.io/<repository>/`.

Va bene qualsiasi hosting statico, come Netlify, Cloudflare Pages o un server Apache o Nginx: basta caricare i file così come sono, senza fasi di build. Il file `.nojekyll` evita l'elaborazione Jekyll su GitHub Pages.

## Struttura

```
index.html           pagina
css/style.css        stili
js/engine.js         motore di analisi: JavaScript puro, senza dipendenze, usabile anche in Node
js/impronte.js       impronte del testo e ricerca nell'indice; lo stesso codice serve a costruire l'indice
js/wiki.js           ricerca su Wikipedia: richieste, limite di frequenza, scelta delle voci
js/app.js            interfaccia
indice/              indice delle impronte dei siti di studio (file statici, generati)
tools/indice/        costruzione dell'indice da Common Crawl (Node), con l'elenco dei siti in siti.json
vendor/              mammoth.js 1.6.0 (.docx) e PDF.js 3.11.174 (.pdf), caricati solo quando servono
fonts/               IBM Plex Sans, Serif, Mono e Bodoni Moda (woff2, alfabeto latino)
tests/run.js         test del motore e della ricerca su Wikipedia: node tests/run.js
tests/wiki-test.js   test di js/wiki.js con un orologio simulato e una Wikipedia finta
tests/impronte-test.js  test delle impronte e dell'indice, senza rete
tests/campioni.js    testi campione usati dai test
tests/browser_test.py  test completo in Chrome (facoltativo, richiede Python, Playwright e python-docx)
```

## Come funziona

**Copie.** Il testo viene diviso in parole normalizzate: minuscole e senza accenti. Sequenze di 4 parole che contengono almeno una parola piena fanno da àncora. Da lì la corrispondenza esatta si estende in entrambe le direzioni, e i tratti separati da poche parole cambiate vengono uniti. Un passaggio conta se ha almeno *N* parole uguali alla fonte: è un'impostazione, e il valore predefinito è 6.

**Parafrasi.** Ogni frase viene confrontata con le frasi delle fonti usando le radici delle parole piene. La frase viene segnalata se condivide almeno 4 parole chiave con una frase della fonte e se queste coprono almeno il 60% del suo contenuto.

**Wikipedia.** Dal testo vengono scelte fino a 20 sequenze di 6 parole consecutive, al massimo una per frase, distribuite dall'inizio alla fine e preferendo le parole meno comuni; citazioni e bibliografia restano escluse. Le sequenze vengono cercate come frasi esatte con il motore di ricerca di Wikipedia (CirrusSearch), unite con OR in ricerche di al massimo 280 caratteri. Una ricerca in più usa le 3 parole chiave più frequenti, per trovare la voce sull'argomento anche quando il testo è riformulato. Le voci trovate vengono ordinate per numero di ricerche in cui compaiono; le prime 4, o 5 per i testi oltre le 2000 parole, vengono scaricate in testo semplice (estensione TextExtracts) e confrontate con lo stesso motore usato per le altre fonti. Diventano fonti solo le voci con almeno un passaggio copiato o una possibile parafrasi.

Le richieste partono una alla volta, a distanza di almeno 300 ms e al massimo 9 ogni 61 secondi, perché Wikimedia limita le richieste anonime: le [regole in vigore dal 2026](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) indicano circa 10 al minuto per indirizzo IP. Il conteggio è condiviso tra le schede aperte. Se Wikipedia risponde con il codice 429, la ricerca si ferma, tiene quanto già trovato e rispetta la pausa indicata.

**Siti di studio.** Le pagine vengono lette dall'archivio pubblico [Common Crawl](https://commoncrawl.org/), che le ha raccolte rispettando i robots.txt; vengono scartati anche gli indirizzi che il robots.txt attuale del sito esclude per il suo crawler (CCBot), e i siti che lo escludono del tutto non vengono indicizzati. Da ogni pagina si estrae il testo principale, senza menu e piè di pagina. Il testo viene diviso in sequenze di 5 parole; tra queste si scelgono le impronte con il metodo *winnowing* (Schleimer, Wilkerson e Aiken, 2003, lo stesso del sistema antiplagio MOSS): in ogni finestra di 24 sequenze consecutive si tiene quella con l'hash minore. Così ogni passaggio identico di almeno 28 parole condivide sicuramente almeno un'impronta, e l'indice resta piccolo: circa 8 impronte ogni 100 parole. Le sequenze con meno di due parole piene non diventano impronte, e quelle presenti in più di 8 pagine vengono scartate perché sono menu, formule ricorrenti o testi ripetuti.

L'indice conserva solo impronte numeriche, indirizzi e titoli: nessun testo delle pagine. È fatto di file statici: un file di pochi KB per ogni gruppo di impronte (`fp/`), con voci di 7 byte ordinate, e i titoli delle pagine (`documenti/`). Il browser calcola le impronte del testo con lo stesso codice usato per costruire l'indice (`js/impronte.js`) e scarica interi solo i file dei gruppi che gli servono. Non usa richieste parziali (HTTP Range): con la compressione che GitHub Pages applica ai file, Firefox le riceve sbagliate. Una pagina viene proposta come fonte se condivide almeno due impronte vicine con il testo; i passaggi segnati vanno dalla prima all'ultima impronta in comune, quindi la parte copiata può essere un po' più ampia.

L'indice si costruisce poco alla volta con il workflow *Costruzione dell'indice di impronte*, che legge l'elenco dei siti e degli archivi da `tools/indice/siti.json`. Common Crawl protegge i suoi server con un limite di frequenza: il workflow legge al massimo 1,5 pagine al secondo da una sola macchina, si ferma qualche minuto quando riceve un rifiuto e riprende nella corsa successiva, ogni notte, finché restano pagine da leggere. Le impronte delle pagine già lette stanno nel ramo `indice-dati`, l'indice completo nel ramo `indice-build`.

Oggi l'indice comprende siti come biografieonline.it, sapere.it, studentville.it, atuttascuola.it e treccani.it (senza vocabolario e sinonimi). Restano fuori skuola.net, quasi assente negli archivi di Common Crawl, e studenti.it, focus.it e youmath.it, che nel robots.txt escludono il crawler di Common Crawl. Chi gestisce un sito presente nell'indice e vuole esserne escluso può aprire una issue: il sito viene tolto alla ricostruzione successiva.

**Segnali AI.** L'indice è la media pesata di otto misure, ridotta se compaiono imperfezioni tipiche della scrittura a mano. Pesi e soglie sono in `analyzeAI`, nel file `js/engine.js`.

| Segnale | Peso | Contributo nullo | Contributo pieno |
|---|---|---|---|
| Formule ricorrenti dei modelli (quota di frasi) | 2 | sotto 8% | sopra 53% |
| Variazione nella lunghezza delle frasi | 1 | sopra 0,62 | sotto 0,32 |
| Trattino lungo, ogni 1000 parole (italiano) | 1 | 0 | da 10 |
| Connettivi a inizio frase | 0,8 | sotto 10% | sopra 35% |
| Contrapposizioni «non solo… ma», ogni 1000 parole | 0,8 | 0 | da 8 |
| Dettagli concreti (quota di frasi) | 0,8 | sopra 45% | sotto 10% |
| Paragrafi di lunghezza uniforme | 0,7 | sopra 0,55 | sotto 0,20 |
| Elenchi di tre termini, ogni 1000 parole | 0,4 | sotto 3 | da 15 |

Le fasce sono tre: da 0 a 34 pochi segnali, da 35 a 59 segnali misti, da 60 a 100 molti segnali. La media pesata viene riscalata con una funzione crescente, che non cambia l'ordine dei testi, perché i confini delle fasce cadano dove nelle prove li supera al massimo il 5% (segnali misti) e l'1% (molti segnali) dei testi scritti da persone di ciascun gruppo (`T_MID` e `T_HI` in `js/engine.js`). Sotto le 150 parole l'indice non viene calcolato.

**Valutazione.** Il workflow *Valutazione del rilevatore di testi generati* misura l'indice su testi scritti da persone prima di ChatGPT e su temi generati, e pubblica il rapporto nel ramo [`rapporti-ai`](https://github.com/ianonoia522-droid/matitarossoblu/blob/rapporti-ai/valutazione-ai.md). I testi umani sono temi e componimenti, pagine di siti di studio e un campione di pagine web italiane raccolte nel 2019-2020 (dal corpus mC4), e voci di Wikipedia nella versione di fine ottobre 2022: di questi si salvano solo i segnali e l'indirizzo, non il testo. I temi generati rispondono a 30 tracce scolastiche, chiesti in tre modi (richiesta semplice, «scrivi come uno studente», «non deve sembrare scritto da un'AI») a quattro modelli aperti (Qwen 2.5 da 3 e 7 miliardi di parametri, Llama 3.2 3B, Gemma 3 4B); sono valutati come li incollerebbe uno studente, senza titoli e grassetti. Gli strumenti sono in `tools/valuta`.

Misura di novembre 2026, con le fasce tarate:

| Testi | Quanti | «Segnali misti» o oltre | «Molti segnali» |
|---|---|---|---|
| Temi e componimenti scritti da persone (pagine web del 2019-2020) | 750 | 1,1% | 0% |
| Appunti e riassunti dei siti di studio | 600 | 4,8% | 0,5% |
| Altre pagine web italiane | 300 | 2,0% | 0,3% |
| Voci di Wikipedia (ottobre 2022) | 150 | 2,0% | 0,7% |
| **Tutti i testi umani** | 1.800 | 2,6% | 0,3% |
| Temi generati da modelli aperti | 165 | 69% | 36% |

L'ordine dei testi è buono (AUC 0,96: presi a caso un tema generato e un testo umano, nel 96% dei casi il generato ha l'indice più alto), ma quasi un tema generato su tre resta nella fascia più bassa. Chiedere al modello di scrivere «come uno studente» o di non sembrare un'AI non ha abbassato l'indice. Prima della taratura le fasce erano molto più prudenti: «segnali misti» o oltre per lo 0,5% dei testi umani e il 39% dei temi generati, «molti segnali» per lo 0,1% e il 6%. Le quote dei testi umani sono misurate sugli stessi testi usati per scegliere i confini delle fasce.

Limiti della valutazione: i modelli aperti piccoli non sono quelli che usano di solito gli studenti; i temi umani vengono dal web e non da compiti in classe; non ci sono temi generati e poi rielaborati a mano, che sfuggono più facilmente. Una regressione logistica addestrata sugli stessi dati (`tools/valuta/calibra.js`) separa in modo simile ai pesi attuali i temi di un modello escluso dall'addestramento (AUC media 0,97 contro 0,96), ma impara anche abitudini dei soli modelli piccoli: per esempio considera umano il trattino lungo, che questi modelli non usano e ChatGPT usa spesso. Per questo i pesi restano quelli ragionati e la taratura riguarda solo le fasce.

## Contribuire

La parte più debole resta la taratura dell'indice AI, ed è anche il contributo più utile. Mancano soprattutto compiti veri, scritti in classe o a casa prima del 2022, e temi generati con i servizi più usati (ChatGPT, Gemini, Copilot), anche rielaborati a mano. Per usarli serve il permesso degli autori; nel repository pubblico finiscono solo i segnali calcolati, non i testi (vedi `tools/valuta/importa.js`).

Sono utili anche liste di formule per altre lingue, il supporto a nuovi formati di file, ad altre edizioni linguistiche di Wikipedia e segnalazioni di siti di studio da aggiungere all'indice.

## Licenza

Il codice è distribuito con licenza MIT: vedi `LICENSE`. Per i componenti di terze parti vedi `THIRD-PARTY-NOTICES.md`.

I testi delle voci di Wikipedia scaricati durante la ricerca sono distribuiti con licenza CC BY-SA 4.0. Restano nel browser di chi usa lo strumento; il rapporto indica la voce e il link alla versione confrontata.
