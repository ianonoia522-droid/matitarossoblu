# Valutazione del rilevatore di testi generati

Generato il 2026-11-10 20:58 UTC. Testi umani: 1800 (scritti prima di novembre 2022). Testi generati: 165 (modelli aperti, tre stili di richiesta).

I testi generati sono valutati come li incollerebbe uno studente: senza titolo, titoletti, grassetti e segni degli elenchi. La tabella in fondo riporta anche la versione grezza.

## Distribuzione dell'indice

| testi umani | testi | parole (mediana) | non valutabili | basso (<35) | medio (35-59) | alto (≥60) | indice medio |
|---|---|---|---|---|---|---|---|
| mc4-studio | 600 | 399 | 0,2% | 95,0% | 4,3% | 0,5% | 12 |
| mc4-temi | 750 | 439 | 0,0% | 98,9% | 1,1% | 0,0% | 10 |
| mc4-web | 300 | 406 | 0,0% | 98,0% | 1,7% | 0,3% | 11 |
| wikipedia | 150 | 437 | 0,0% | 98,0% | 1,3% | 0,7% | 15 |
| **tutti gli umani** | 1800 | 420 | 0,1% | 97,4% | 2,3% | 0,3% | 11 |

| testi generati, per modello | testi | parole (mediana) | non valutabili | basso (<35) | medio (35-59) | alto (≥60) | indice medio |
|---|---|---|---|---|---|---|---|
| gemma3-4b | 45 | 559 | 0,0% | 31,1% | 24,4% | 44,4% | 51 |
| llama3.2-3b | 45 | 458 | 0,0% | 40,0% | 31,1% | 28,9% | 45 |
| qwen2.5-3b | 45 | 437 | 0,0% | 28,9% | 40,0% | 31,1% | 45 |
| qwen2.5-7b | 30 | 569 | 0,0% | 20,0% | 40,0% | 40,0% | 49 |
| **tutti i generati** | 165 | 513 | 0,0% | 30,9% | 33,3% | 35,8% | 47 |

| testi generati, per stile della richiesta | testi | parole (mediana) | non valutabili | basso (<35) | medio (35-59) | alto (≥60) | indice medio |
|---|---|---|---|---|---|---|---|
| normale | 55 | 538 | 0,0% | 34,5% | 40,0% | 25,5% | 44 |
| studente | 55 | 534 | 0,0% | 25,5% | 29,1% | 45,5% | 50 |
| umanizzato | 55 | 491 | 0,0% | 32,7% | 30,9% | 36,4% | 47 |

## Separazione (AUC dell'indice)

0,5 = come tirare a sorte, 1 = separazione perfetta. Calcolata sui testi valutabili (almeno 150 parole).

| confronto | AUC |
|---|---|
| tutti i generati contro tutti gli umani | 0,96 |
| tutti i generati contro mc4-studio | 0,95 |
| tutti i generati contro mc4-temi | 0,97 |
| tutti i generati contro mc4-web | 0,96 |
| tutti i generati contro wikipedia | 0,96 |
| gemma3-4b contro tutti gli umani | 0,96 |
| llama3.2-3b contro tutti gli umani | 0,96 |
| qwen2.5-3b contro tutti gli umani | 0,95 |
| qwen2.5-7b contro tutti gli umani | 0,99 |
| stile «normale» contro tutti gli umani | 0,96 |
| stile «studente» contro tutti gli umani | 0,97 |
| stile «umanizzato» contro tutti gli umani | 0,96 |

## Soglie

| soglia dell'indice | umani segnalati (falsi positivi) | generati segnalati |
|---|---|---|
| 35 (attuale: medio) | 2,6% | 69,1% |
| 60 (attuale: alto) | 0,3% | 35,8% |
| 30 (al massimo 5% di falsi positivi) | 4,5% | 83,6% |
| 49 (al massimo 1% di falsi positivi) | 0,8% | 46,7% |

## Soglie sull'indice grezzo

Valore dell'indice grezzo superato dal 5% e dall'1% dei testi di ogni gruppo umano, e quota dei testi generati che lo supera. Servono a tarare le fasce (T_MID e T_HI in engine.js).

| gruppo umano | testi | soglia 5% | generati sopra | soglia 1% | generati sopra |
|---|---|---|---|---|---|
| mc4-studio | 599 | 25,8 | 70,9% | 33,3 | 40,6% |
| mc4-temi | 750 | 20,2 | 89,7% | 26,4 | 67,9% |
| mc4-web | 300 | 20,2 | 89,7% | 31,5 | 46,7% |
| wikipedia | 150 | 21,4 | 87,9% | 35,6 | 36,4% |
| **tutti gli umani** | 1799 | 21,7 | 86,7% | 31,5 | 46,7% |

## Segnali uno per uno

AUC del valore grezzo di ogni segnale (sopra 0,5: più alto nei testi generati; sotto 0,5: più alto in quelli umani), e mediane. Solo testi in cui il segnale è calcolabile.

| segnale | AUC | mediana umani | mediana generati | punteggio medio umani | punteggio medio generati |
|---|---|---|---|---|---|
| burst | 0,14 | 0,541 | 0,356 | 0,33 | 0,81 |
| mk | 0,70 | 0,000 | 0,000 | 0,00 | 0,03 |
| conn | 0,81 | 0,000 | 0,087 | 0,01 | 0,18 |
| para | 0,22 | 0,376 | 0,225 | 0,50 | 0,84 |
| dash | 0,48 | 0,000 | 0,000 | 0,02 | 0,00 |
| contrast | 0,66 | 0,000 | 0,000 | 0,03 | 0,15 |
| trip | 0,62 | 0,000 | 2,062 | 0,05 | 0,11 |
| spec | 0,19 | 0,714 | 0,250 | 0,10 | 0,52 |
| imperfezioni umane (hRate) | 0,29 | 0,000 | 0,000 | | |
| tracce di chatbot (residui forti) | 0,58 | 0,000 | 0,000 | | |
| Markdown | 0,50 | 0,000 | 0,000 | | |

## Testi generati non ripuliti

| testi generati grezzi, per modello | testi | parole (mediana) | non valutabili | basso (<35) | medio (35-59) | alto (≥60) | indice medio |
|---|---|---|---|---|---|---|---|
| gemma3-4b | 45 | 567 | 0,0% | 28,9% | 26,7% | 44,4% | 51 |
| llama3.2-3b | 45 | 465 | 0,0% | 44,4% | 24,4% | 31,1% | 44 |
| qwen2.5-3b | 45 | 449 | 0,0% | 24,4% | 42,2% | 33,3% | 47 |
| qwen2.5-7b | 30 | 572 | 0,0% | 20,0% | 40,0% | 40,0% | 49 |
| **tutti i generati grezzi** | 165 | 521 | 0,0% | 30,3% | 32,7% | 37,0% | 48 |

AUC dei generati grezzi contro tutti gli umani: 0,97.

