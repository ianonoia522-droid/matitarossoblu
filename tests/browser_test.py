# Test completo di Matita Rossoblù in Chrome: sito servito in http e aperto come file://, con la CSP attiva.
# Requisiti: pip install playwright python-docx && playwright install chromium
# Uso: python tests/browser_test.py   (variabile CHROME facoltativa: percorso di un Chrome già installato)
import sys, pathlib, threading, functools, http.server, socketserver, json
import re
from playwright.sync_api import sync_playwright, expect
import docx

import os
SITE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else SITE / 'tests' / 'out'
OUT.mkdir(parents=True, exist_ok=True)

P1 = "La diffusione del caffè in Italia iniziò a Venezia nel Seicento, quando i mercanti della Serenissima lo importavano dai porti del Mediterraneo orientale. Le prime botteghe del caffè aprirono intorno alla metà del Settecento e diventarono presto luoghi di discussione politica e letteraria."
P2 = "Con l'invenzione della macchina a pressione, all'inizio del Novecento, la preparazione cambiò radicalmente: l'acqua calda attraversava il caffè macinato in pochi secondi, producendo una bevanda densa e aromatica che oggi chiamiamo espresso."
P3 = "Nel dopoguerra la moka entrò in quasi tutte le cucine italiane. Il suo successo dipese dal prezzo contenuto, dalla semplicità d'uso e da una campagna pubblicitaria che la trasformò in un simbolo nazionale."

# PDF di due pagine con colonna stretta e sillabazione esplicita (parole spezzate a fine riga)
pdf_html = f"""<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
body{{font:13px Georgia,serif;width:300px;margin:40px}} p{{margin:0 0 18px}} .brk{{page-break-before:always}}
</style></head><body><h1>Storia del caffè</h1><p>{P1}</p>
<p>{P2.replace('preparazione', 'prepara&shy;zione').replace('radicalmente', 'radical&shy;mente').replace('attraversava', 'attraver&shy;sava')}</p>
<p class="brk">{P3}</p></body></html>"""

d = docx.Document()
d.add_heading('Appunti sul caffè', level=1)
d.add_paragraph("Il caffè è arrivato in Italia passando dai porti veneziani, e questo lo sapevo già dalle elementari.")
p = d.add_paragraph("Con l'invenzione della ")
p.add_run("macchina a pressione").bold = True
p.add_run(", all'inizio del Novecento, la preparazione cambiò radicalmente: l'acqua calda attraversava il caffè macinato in pochi secondi, producendo una bevanda densa e aromatica che oggi chiamiamo espresso.")
d.add_paragraph("Mia nonna usava la moka tutte le mattine alle sei, e il rumore del caffè che saliva era la mia sveglia.")
docx_path = OUT / 'appunti.docx'; d.save(docx_path)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(SITE)))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

results = {}
def check(mode, name, ok, detail=''):
    results.setdefault(mode, []).append((name, bool(ok), str(detail)))

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    # crea il PDF di prova con Chrome stesso
    tmp = b.new_page(); tmp.set_content(pdf_html); pdf_path = OUT / 'storia-caffe.pdf'; tmp.pdf(path=str(pdf_path), format='A4'); tmp.close()

    for mode, url in [('http', f'http://127.0.0.1:{port}/index.html'), ('file', (SITE / 'index.html').as_uri())]:
        ctx = b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        if mode == 'http':
            ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=f'http://127.0.0.1:{port}')
        pg = ctx.new_page()
        errors, foreign = [], []
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        def on_req(r):
            u = r.url
            if not (u.startswith(f'http://127.0.0.1:{port}/') or u.startswith('file://') or u.startswith('data:') or u.startswith('blob:')):
                foreign.append(u)
        pg.on('request', on_req)
        pg.goto(url)
        expect(pg.locator('#tabSrcNum')).not_to_have_text('–', timeout=10000)
        check(mode, 'esempio analizzato all\'apertura', pg.inner_text('#tabSrcNum').strip() == '24%' and pg.inner_text('#tabAiNum').strip() == '55', pg.inner_text('#tabSrcNum') + ' / ' + pg.inner_text('#tabAiNum'))
        vis = lambda sel: pg.is_visible(sel)
        check(mode, 'elementi nascosti davvero nascosti all\'apertura', not vis('#pasteBox') and not vis('#copyFb') and not vis('#pane-web') and not vis('#pane-ai') and not vis('#staleBar'), [x for x in ['#pasteBox', '#copyFb', '#pane-web', '#pane-ai', '#staleBar'] if vis(x)])
        check(mode, 'barra esempio e pulsanti visibili', vis('#exampleBar') and vis('#dlBtn') and vis('#pane-src'))
        if mode == 'http':
            pg.screenshot(path=str(OUT / 'desktop-full.png'), full_page=True)
        fonts = pg.evaluate("document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight + ' ' + f.style))")
        check(mode, 'font locali caricati', any('Bodoni' in f for f in fonts) and any('Plex Serif' in f for f in fonts), ', '.join(sorted(set(fonts))))

        # PDF come documento: verifica estrazione, paragrafi e parole spezzate
        pg.set_input_files('#docFile', str(pdf_path))
        expect(pg.locator('#docMsg')).to_have_text(re.compile(r'storia-caffe\.pdf.*(caricato|Non riesco)|Non riesco.*storia-caffe'), timeout=20000)
        msg = pg.inner_text('#docMsg'); txt = pg.input_value('#docText')
        check(mode, 'PDF letto', 'caricato' in msg, msg[:90])
        check(mode, 'PDF: parole spezzate a fine riga ricomposte', 'preparazione' in txt and 'radicalmente' in txt and 'attraversava' in txt and 'prepara-' not in txt, txt[txt.find('Con l'):][:120].replace('\n', ' | '))
        check(mode, 'PDF: paragrafi e pagine separati', txt.count('\n\n') >= 3, txt.count('\n\n'))

        # DOCX come documento
        pg.set_input_files('#docFile', str(docx_path))
        expect(pg.locator('#docMsg')).to_have_text(re.compile(r'appunti\.docx.*(caricato|leggere)|leggere.*appunti'), timeout=20000)
        msg = pg.inner_text('#docMsg'); txt = pg.input_value('#docText')
        check(mode, 'barra esempio sparita dopo il caricamento', not pg.is_visible('#exampleBar'))
        check(mode, 'DOCX letto', 'caricato' in msg and 'macchina a pressione' in txt and 'Mia nonna' in txt, msg[:90])

        # PDF come fonte e analisi
        pg.set_input_files('#srcFile', str(pdf_path))
        expect(pg.locator('#srcMsg')).to_have_text(re.compile(r'aggiunta|Non lette'), timeout=20000)
        check(mode, 'PDF caricato come fonte', pg.locator('#srcList li').count() == 1, pg.inner_text('#srcMsg'))
        pg.click('#runBtn')
        expect(pg.locator('#runStatus')).to_have_text(re.compile(r'completata|Errore'), timeout=15000)
        n_items = pg.locator('#plist .pitem').count()
        check(mode, 'analisi: copia dalla fonte PDF trovata', n_items >= 1 and pg.inner_text('#tabSrcNum').strip() not in ('0%', '–'), pg.inner_text('#tabSrcNum') + ', ' + str(n_items) + ' voci: ' + (pg.inner_text('#plist .pitem .ptype') if n_items else ''))
        pg.click('#plist .pitem .phead')
        check(mode, 'confronto parola per parola si apre', pg.locator('#plist .cmp-t').count() == 2)

        # rapporto scaricabile
        with pg.expect_download(timeout=10000) as dl:
            pg.click('#dlBtn')
        rep = pathlib.Path(dl.value.path()).read_text(encoding='utf-8')
        check(mode, 'rapporto scaricato', 'Rapporto di originalità' in rep and 'macchina a pressione' in rep and dl.value.suggested_filename.startswith('rapporto-originalita-'), dl.value.suggested_filename + ', ' + str(len(rep)) + ' byte')

        # riepilogo negli appunti (solo http: file:// non concede i permessi in automatico)
        pg.click('#copyBtn'); pg.wait_for_timeout(300)
        if mode == 'http':
            clip = pg.evaluate('navigator.clipboard.readText()')
            check(mode, 'riepilogo copiato negli appunti', 'ANTIPLAGIO' in clip and 'copiato' in pg.inner_text('#exportMsg') and not pg.is_visible('#copyFb'), clip.split('\n')[0])
        else:
            check(mode, 'copia riepilogo: appunti o ripiego manuale', 'copiato' in pg.inner_text('#exportMsg') or pg.is_visible('#copyFb'))

        # ricerca web e segnali AI
        pg.click('#tab-web')
        check(mode, 'link di ricerca esatta', pg.locator('.fp a[href^="https://www.google.com/search?q=%22"]').count() >= 1, pg.locator('.fp').count())
        check(mode, 'una sola scheda visibile alla volta', pg.is_visible('#pane-web') and not pg.is_visible('#pane-src') and not pg.is_visible('#pane-ai'))
        pg.click('#tab-ai')
        check(mode, 'scheda segnali AI disegnata', pg.locator('.sig').count() == 8)

        csp = [e for e in errors if 'Content Security Policy' in e or 'Refused' in e]
        check(mode, 'nessuna violazione della CSP', not csp, ' | '.join(csp)[:300])
        check(mode, 'nessun errore di script', not [e for e in errors if e not in csp], ' | '.join(e for e in errors if e not in csp)[:300])
        check(mode, 'nessuna richiesta a server esterni', not foreign, ', '.join(foreign)[:300])
        if mode == 'http':
            pg.click('#tab-src'); pg.wait_for_timeout(100)
            pg.screenshot(path=str(OUT / 'desktop-http.png'), full_page=False)
            pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(200)
            check(mode, 'telefono: nessuno scorrimento orizzontale', pg.evaluate('document.documentElement.scrollWidth') <= 390, pg.evaluate('document.documentElement.scrollWidth'))
        ctx.close()
    b.close()
httpd.shutdown()

bad = 0
for mode, rows in results.items():
    print(f'== {mode}')
    for name, ok, detail in rows:
        bad += not ok
        print(('  ok   ' if ok else '  FAIL ') + name + (f'  ({detail})' if detail else ''))
print('\nTUTTO OK' if not bad else f'\n{bad} controlli falliti')
sys.exit(1 if bad else 0)
