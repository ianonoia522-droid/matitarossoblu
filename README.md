# Matita Rossoblù

Antiplagio sulle fonti che fornisci e segnali di scrittura generata da AI. È gratuito e open source, e funziona interamente nel browser: il testo non lascia il computer di chi lo usa.

**Usalo qui:** https://ianonoia522-droid.github.io/matitarossoblu/

Per segnalare un problema o proporre una modifica, apri una issue in questo repository.

## Cosa fa

- **Confronto con le fonti.** Trova copie identiche, copie con poche parole cambiate e frasi che riprendono una fonte con parole in parte diverse. Mostra il testo marcato, l'elenco dei passaggi e il confronto parola per parola.
- **Ricerca web manuale.** Estrae le frasi più caratteristiche del testo e prepara la ricerca esatta, tra virgolette, su Google, Google Scholar e Bing.
- **Segnali AI.** Calcola un indice da 0 a 100 basato su caratteristiche di stile e mostra una mappa frase per frase con i motivi di ogni segnalazione.
- Legge file .docx, .pdf con testo selezionabile, .txt, .md e .html. Esporta un rapporto HTML, da stampare o salvare in PDF, e un riepilogo testuale.

## Cosa non fa

Da leggere prima di usarlo.

- Non cerca su internet e non consulta database come Turnitin o Compilatio: confronta il testo solo con le fonti caricate.
- Non riconosce traduzioni, parafrasi costruite con sinonimi o il plagio di idee.
- **L'indice AI non è una probabilità e non è una prova.** Non è stato calibrato su un corpus: i test inclusi verificano solo che il comportamento non peggiori da una versione all'altra. Un testo umano formale o accademico può ottenere un indice alto. Non va usato per accusare nessuno.
- I PDF scansionati sono immagini e non contengono testo: prima serve un OCR.

## Privacy

- **Nessun server.** L'analisi è JavaScript eseguito nel browser.
- **Nessuna richiesta esterna.** Librerie e font sono ospitati insieme alla pagina, e la Content Security Policy impedisce al browser di contattare altri domini. Si può verificare negli strumenti per sviluppatori, alla scheda Rete.
- **Nessun cookie e nessuna statistica.** Le impostazioni del confronto restano nel `localStorage` del browser.
- **Unica eccezione volontaria:** i pulsanti della ricerca web aprono il motore di ricerca con la frase scelta.

## Usarlo in locale

Scarica la cartella e apri `index.html` con un browser recente: Chrome, Edge, Firefox o Safari. Funziona anche senza connessione.

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
js/app.js            interfaccia
vendor/              mammoth.js 1.6.0 (.docx) e PDF.js 3.11.174 (.pdf), caricati solo quando servono
fonts/               IBM Plex Sans, Serif, Mono e Bodoni Moda (woff2, alfabeto latino)
tests/run.js         test del motore: node tests/run.js
tests/campioni.js    testi campione usati dai test
tests/browser_test.py  test completo in Chrome (facoltativo, richiede Python, Playwright e python-docx)
```

## Come funziona

**Copie.** Il testo viene diviso in parole normalizzate: minuscole e senza accenti. Sequenze di 4 parole che contengono almeno una parola piena fanno da àncora. Da lì la corrispondenza esatta si estende in entrambe le direzioni, e i tratti separati da poche parole cambiate vengono uniti. Un passaggio conta se ha almeno *N* parole uguali alla fonte: è un'impostazione, e il valore predefinito è 6.

**Parafrasi.** Ogni frase viene confrontata con le frasi delle fonti usando le radici delle parole piene. La frase viene segnalata se condivide almeno 4 parole chiave con una frase della fonte e se queste coprono almeno il 60% del suo contenuto.

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

Le fasce sono tre: da 0 a 34 pochi segnali, da 35 a 59 segnali misti, da 60 a 100 molti segnali. Sotto le 150 parole l'indice non viene calcolato.

## Contribuire

La parte più debole è la taratura dell'indice AI, ed è anche il contributo più utile. Servono testi di cui si conosce con certezza l'origine: scritti da persone prima del 2022, oppure generati con un modello noto. Per usarli serve il permesso degli autori. I testi si aggiungono in `tests/campioni.js`, con il valore atteso in `tests/run.js`.

Sono utili anche liste di formule per altre lingue e il supporto a nuovi formati di file.

## Licenza

Il codice è distribuito con licenza MIT: vedi `LICENSE`. Per i componenti di terze parti vedi `THIRD-PARTY-NOTICES.md`.
