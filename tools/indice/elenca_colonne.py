"""Elenco delle pagine di un sito dall'indice a colonne di Common Crawl (file Parquet su data.commoncrawl.org).

È il metodo che Common Crawl consiglia per estrarre un dominio intero: DuckDB legge solo i metadati dei file e le
parti ordinate (url_surtkey) che contengono il sito, con richieste parziali. Non usa il server CDX.

  python3 elenca_colonne.py CC-MAIN-2026-43 skuola.net domain grezzo-skuola.net.jsonl

Scrive righe nello stesso formato del server CDX (url, filename, offset, length, status, mime-detected,
languages, timestamp), che costruisci.js filtra (lingua, robots.txt, doppioni).
"""
import gzip, json, sys, time, urllib.request

import duckdb

UA = 'MatitaRossoblu-indice/0.1 (+https://github.com/ianonoia522-droid/matitarossoblu)'


def paths(crawl):
    req = urllib.request.Request('https://data.commoncrawl.org/crawl-data/%s/cc-index-table.paths.gz' % crawl, headers={'User-Agent': UA})
    for i in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = gzip.decompress(r.read()).decode()
            return ['https://data.commoncrawl.org/' + p for p in data.split() if '/subset=warc/' in p]
        except Exception as e:  # rete o 503
            print('elenco dei file, tentativo', i + 1, e, file=sys.stderr)
            time.sleep(10 * (i + 1))
    raise SystemExit('impossibile leggere l\'elenco dei file Parquet')


def surt_range(name, mode):
    s = ','.join(reversed(name.lower().split('.')))
    # "net,skuola)" per il dominio, "net,skuola,www)" per i sottodomini: tutto tra "net,skuola)" e "net,skuola-"
    return (s + ')', s + '-') if mode == 'domain' else (s + ')', s + '*')


def query(files, name, mode):
    lo, hi = surt_range(name, mode)
    con = duckdb.connect()
    settings = ["SET threads = 8"]
    if any(f.startswith('http') for f in files):
        con.execute("INSTALL httpfs; LOAD httpfs;")
        settings += ["SET http_retries = 12", "SET http_retry_wait_ms = 2000", "SET http_retry_backoff = 2",
                     "SET http_timeout = 120000", "SET custom_user_agent = '%s'" % UA]
    for st in settings:
        try:
            con.execute(st)
        except Exception as e:  # impostazione non presente in questa versione
            print('impostazione ignorata:', st, str(e).splitlines()[0], file=sys.stderr)
    where_host = "url_host_registered_domain = ?" if mode == 'domain' else "url_host_name = ?"
    lst = '[' + ','.join("'" + f.replace("'", "''") + "'" for f in files) + ']'
    sql = ("SELECT url, warc_filename, warc_record_offset, warc_record_length, fetch_status, content_mime_detected, "
           "content_languages, strftime(fetch_time, '%Y%m%d%H%M%S') "
           "FROM read_parquet(" + lst + ") "
           "WHERE url_surtkey >= ? AND url_surtkey < ? AND " + where_host + " AND fetch_status = 200")
    return con.execute(sql, [lo, hi, name]).fetchall()


def main():
    crawl, name, mode, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    t0 = time.time()
    files = paths(crawl) if not crawl.startswith('/') else [crawl]   # un percorso locale serve per i test
    print(name, ':', len(files), 'file Parquet', file=sys.stderr)
    rows = query(files, name, mode)
    with open(out, 'w', encoding='utf-8') as f:
        for url, fn, off, ln, st, mime, langs, ts in rows:
            f.write(json.dumps({'url': url, 'filename': fn, 'offset': str(off), 'length': str(ln), 'status': str(st),
                                'mime-detected': mime or '', 'languages': langs or '', 'timestamp': ts or ''}) + '\n')
    print(name, ':', len(rows), 'righe in', int(time.time() - t0), 's', file=sys.stderr)


if __name__ == '__main__':
    main()
