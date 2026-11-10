"""Copertura dei siti di studio in un archivio di Common Crawl, dall'indice a colonne (DuckDB, richieste parziali).

  python3 copertura_colonne.py CC-MAIN-2026-43 uscita.json [--diagnostica]

Per ogni sito conta le pagine HTML con stato 200, quelle in italiano e gli indirizzi unici in italiano.
Con --diagnostica conta anche le risposte non riuscite (403, 429, 503...) del sottoinsieme crawldiagnostics,
che mostrano se il sito blocca il crawler di Common Crawl.
"""
import json, sys, time

sys.path.insert(0, __file__.rsplit('/', 1)[0] + '/indice')
from elenca_colonne import UA, surt_range  # noqa: E402
import duckdb  # noqa: E402
import gzip, urllib.request  # noqa: E402

SITI = [
    ('skuola.net', 'domain'), ('studenti.it', 'domain'), ('treccani.it', 'domain'), ('sapere.it', 'domain'),
    ('studentville.it', 'domain'), ('homolaicus.com', 'domain'), ('atuttascuola.it', 'domain'), ('scuolissima.com', 'domain'),
    ('biografieonline.it', 'domain'), ('geopop.it', 'domain'), ('focus.it', 'domain'), ('weschool.com', 'domain'),
    ('studiarapido.it', 'domain'), ('storiaxxisecolo.it', 'domain'), ('ilfattostorico.com', 'domain'), ('edscuola.it', 'domain'),
    ('youmath.it', 'domain'), ('chimica-online.it', 'domain'), ('tesionline.it', 'domain'), ('it.docsity.com', 'host'),
    ('www.studocu.com', 'host'), ('raiscuola.rai.it', 'host'), ('appuntimania.com', 'domain'), ('riassuntini.com', 'domain'),
    ('it.wikipedia.org', 'host'),
]


def paths(crawl, subset):
    req = urllib.request.Request('https://data.commoncrawl.org/crawl-data/%s/cc-index-table.paths.gz' % crawl, headers={'User-Agent': UA})
    for i in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = gzip.decompress(r.read()).decode()
            return ['https://data.commoncrawl.org/' + p for p in data.split() if '/subset=%s/' % subset in p]
        except Exception as e:
            print('elenco dei file', crawl, subset, 'tentativo', i + 1, e, file=sys.stderr)
            time.sleep(10 * (i + 1))
    return []


def main():
    crawl, out, diag = sys.argv[1], sys.argv[2], '--diagnostica' in sys.argv
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    for st in ("SET threads = 8", "SET http_retries = 12", "SET http_retry_wait_ms = 2000", "SET http_retry_backoff = 2", "SET http_timeout = 120000"):
        try:
            con.execute(st)
        except Exception as e:
            print('impostazione ignorata:', st, str(e).splitlines()[0], file=sys.stderr)
    lst = lambda fs: '[' + ','.join("'" + f + "'" for f in fs) + ']'  # noqa: E731
    warc = paths(crawl, 'warc')
    dg = paths(crawl, 'crawldiagnostics') if diag else []
    res = {'archivio': crawl, 'file': len(warc), 'siti': {}}
    for name, mode in SITI:
        lo, hi = surt_range(name, mode)
        host = 'url_host_registered_domain' if mode == 'domain' else 'url_host_name'
        t0 = time.time()
        r = {}
        try:
            row = con.execute(
                "SELECT count(*) FILTER (WHERE content_mime_detected = 'text/html'), "
                "count(*) FILTER (WHERE content_mime_detected = 'text/html' AND content_languages LIKE '%ita%'), "
                "count(DISTINCT url) FILTER (WHERE content_mime_detected = 'text/html' AND content_languages LIKE '%ita%') "
                "FROM read_parquet(" + lst(warc) + ") WHERE url_surtkey >= ? AND url_surtkey < ? AND " + host + " = ? AND fetch_status = 200",
                [lo, hi, name]).fetchone()
            r = {'html': row[0], 'ita': row[1], 'unici': row[2]}
            if dg:
                rows = con.execute("SELECT fetch_status, count(*) FROM read_parquet(" + lst(dg) + ") WHERE url_surtkey >= ? AND url_surtkey < ? AND "
                                   + host + " = ? GROUP BY 1 ORDER BY 2 DESC LIMIT 6", [lo, hi, name]).fetchall()
                r['diagnostica'] = {str(s): n for s, n in rows}
        except Exception as e:
            r = {'errore': str(e).splitlines()[0][:160]}
        r['s'] = int(time.time() - t0)
        res['siti'][name] = r
        print(crawl, name, r, file=sys.stderr)
    json.dump(res, open(out, 'w'), indent=1)


if __name__ == '__main__':
    main()
