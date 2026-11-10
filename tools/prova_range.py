"""Richieste parziali sul sito pubblicato, da browser veri (Chromium, Firefox, WebKit) con Playwright.

Verifica che fetch() con l'intestazione Range riceva 206 e i byte giusti anche se GitHub Pages comprime i file,
come prevede lo standard Fetch (Accept-Encoding: identity quando c'è Range). Scrive un riepilogo in Markdown.
"""
import json, sys
from playwright.sync_api import sync_playwright

SITE = 'https://ianonoia522-droid.github.io/matitarossoblu/'
JS = """async (u) => {
  const out = {};
  try {
    const r = await fetch(u, { headers: { Range: 'bytes=1000-1999' }, cache: 'no-store' });
    const b = new Uint8Array(await r.arrayBuffer());
    let ok = b.length === 1000;
    for (let i = 0; ok && i < 1000; i++) if (b[i] !== ((1000 + i) * 7 + 13) % 256) ok = false;
    out.stato = r.status; out.byte = b.length; out.giusti = ok; out.range = r.headers.get('Content-Range');
  } catch (e) { out.errore = String(e); }
  return out;
}"""


def main():
    rows = []
    with sync_playwright() as p:
        for name in ('chromium', 'firefox', 'webkit'):
            try:
                b = getattr(p, name).launch()
                pg = b.new_page()
                sent = []
                pg.on('request', lambda r: sent.append(r.headers.get('accept-encoding')) if 'range-test' in r.url else None)
                pg.goto(SITE, wait_until='domcontentloaded')
                res = pg.evaluate(JS, SITE + 'tools/range-test.bin')
                res['accept-encoding'] = sent[-1] if sent else None
                rows.append((name, res))
                b.close()
            except Exception as e:
                rows.append((name, {'errore': str(e)[:200]}))
    print('## Richieste parziali dai browser (sito pubblicato)\n')
    for name, r in rows:
        print('- %s: %s' % (name, json.dumps(r, ensure_ascii=False)))


if __name__ == '__main__':
    main()
