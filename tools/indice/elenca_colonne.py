"""Elenco delle pagine di un sito dall'indice a colonne di Common Crawl (file Parquet su data.commoncrawl.org).

È il metodo che Common Crawl consiglia per estrarre un dominio intero: DuckDB legge solo i metadati dei file e le
parti ordinate (url_surtkey) che contengono il sito, con richieste parziali. Non usa il server CDX.

  python3 elenca_colonne.py CC-MAIN-2026-43[,CC-MAIN-2025-51,...] skuola.net domain grezzo-skuola.net.jsonl

Con più archivi separati da virgole, le righe di tutti finiscono nello stesso file: costruisci.js tiene per ogni
indirizzo la cattura più recente.

Scrive righe nello stesso formato del server CDX (url, filename, offset, length, status, mime-detected,
languages, timestamp), che costruisci.js filtra (lingua, robots.txt, doppioni).
"""
import gzip, json, os, sys, time, urllib.request

import duckdb

UA = 'MatitaRossoblu-indice/0.1 (+https://github.com/ianonoia522-droid/matitarossoblu)'


def paths(crawl, tries=6, wait=10):
    req = urllib.request.Request('https://data.commoncrawl.org/crawl-data/%s/cc-index-table.paths.gz' % crawl, headers={'User-Agent': UA})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = gzip.decompress(r.read()).decode()
            return ['https://data.commoncrawl.org/' + p for p in data.split() if '/subset=warc/' in p]
        except Exception as e:  # rete, 503 o 403 del firewall di Common Crawl
            print('elenco dei file', crawl, 'tentativo', i + 1, e, file=sys.stderr)
            time.sleep(wait * (i + 1))
    return None


def surt_range(name, mode):
    s = ','.join(reversed(name.lower().split('.')))
    # "net,skuola)" per il dominio, "net,skuola,www)" per i sottodomini: tutto tra "net,skuola)" e "net,skuola-"
    return (s + ')', s + '-') if mode == 'domain' else (s + ')', s + '*')


def connect(remote, threads=4):
    try:
        con = duckdb.connect(config={'custom_user_agent': UA} if remote else {})
    except Exception as e:  # opzione non accettata da questa versione
        print('user agent non impostato:', str(e).splitlines()[0], file=sys.stderr)
        con = duckdb.connect()
    settings = ["SET threads = %d" % threads, "SET parquet_metadata_cache = true"]
    if remote:
        con.execute("INSTALL httpfs; LOAD httpfs;")
        settings += ["SET http_retries = 6", "SET http_retry_wait_ms = 5000", "SET http_retry_backoff = 2",
                     "SET http_timeout = 120000", "SET enable_http_metadata_cache = true"]
    for st in settings:
        try:
            con.execute(st)
        except Exception as e:  # impostazione non presente in questa versione
            print('impostazione ignorata:', st, str(e).splitlines()[0], file=sys.stderr)
    return con


def query(files, name, mode, con=None):
    lo, hi = surt_range(name, mode)
    con = con or connect(any(f.startswith('http') for f in files))
    where_host = "url_host_registered_domain = ?" if mode == 'domain' else "url_host_name = ?"
    lst = '[' + ','.join("'" + f.replace("'", "''") + "'" for f in files) + ']'
    sql = ("SELECT url, warc_filename, warc_record_offset, warc_record_length, fetch_status, content_mime_detected, "
           "content_languages, strftime(fetch_time, '%Y%m%d%H%M%S') "
           "FROM read_parquet(" + lst + ") "
           "WHERE url_surtkey >= ? AND url_surtkey < ? AND " + where_host + " AND fetch_status = 200")
    return con.execute(sql, [lo, hi, name]).fetchall()


def tutti(conf, outdir, solo=None):
    """Un passaggio per archivio per tutti i siti: i metadati dei 300 file Parquet si leggono una volta sola
    (cache di DuckDB), poi per ogni sito solo i blocchi che lo contengono. Un filo solo e pause tra un archivio
    e l'altro, per restare sotto il limite di frequenza del firewall di Common Crawl."""
    c = json.load(open(conf, encoding='utf-8'))
    siti = [(x['dominio'], x['modo']) for x in c['siti'] if not solo or x['dominio'] in solo]
    os.makedirs(outdir, exist_ok=True)
    for crawl in c['archivi']:
        t0 = time.time()
        files = paths(crawl, tries=4, wait=120)
        if not files:
            print(crawl, ': elenco dei file non disponibile, archivio saltato', file=sys.stderr)
            continue
        con = connect(True, threads=1)
        for name, mode in siti:
            rows = None
            for attempt in range(3):
                try:
                    rows = query(files, name, mode, con)
                    break
                except Exception as e:
                    print(crawl, name, 'tentativo', attempt + 1, str(e).splitlines()[0][:160], file=sys.stderr)
                    time.sleep(300 * (attempt + 1))
                    con = connect(True, threads=1)
            if rows is None:
                print(crawl, name, ': saltato', file=sys.stderr)
                continue
            with open(os.path.join(outdir, 'grezzo-%s.jsonl' % name), 'a', encoding='utf-8') as f:
                for url, fn, off, ln, st, mime, langs, ts in rows:
                    f.write(json.dumps({'url': url, 'filename': fn, 'offset': str(off), 'length': str(ln), 'status': str(st),
                                        'mime-detected': mime or '', 'languages': langs or '', 'timestamp': ts or ''}) + '\n')
            print(crawl, name, ':', len(rows), 'righe', file=sys.stderr)
            time.sleep(2)
        print(crawl, ': fatto in', int(time.time() - t0), 's', file=sys.stderr)
        time.sleep(90)


def main():
    if sys.argv[1] == '--tutti':
        return tutti(sys.argv[2], sys.argv[3], set(sys.argv[4].split(',')) if len(sys.argv) > 4 and sys.argv[4] else None)
    crawls, name, mode, out = sys.argv[1].split(','), sys.argv[2], sys.argv[3], sys.argv[4]
    total = 0
    with open(out, 'w', encoding='utf-8') as f:
        for crawl in crawls:
            t0 = time.time()
            files = paths(crawl) if not crawl.startswith('/') else [crawl]   # un percorso locale serve per i test
            if not files:
                print(name, crawl, ': elenco dei file non disponibile, archivio saltato', file=sys.stderr)
                continue
            rows = None
            for attempt in range(4):   # Common Crawl rallenta chi fa troppe richieste: si aspetta e si riprova
                try:
                    rows = query(files, name, mode)
                    break
                except Exception as e:
                    print(name, crawl, 'tentativo', attempt + 1, str(e).splitlines()[0][:160], file=sys.stderr)
                    time.sleep(60 * (attempt + 1))
            if rows is None:
                print(name, crawl, ': archivio saltato', file=sys.stderr)
                continue
            for url, fn, off, ln, st, mime, langs, ts in rows:
                f.write(json.dumps({'url': url, 'filename': fn, 'offset': str(off), 'length': str(ln), 'status': str(st),
                                    'mime-detected': mime or '', 'languages': langs or '', 'timestamp': ts or ''}) + '\n')
            total += len(rows)
            print(name, crawl, ':', len(files), 'file Parquet,', len(rows), 'righe in', int(time.time() - t0), 's', file=sys.stderr)
    print(name, ': in totale', total, 'righe', file=sys.stderr)


if __name__ == '__main__':
    main()
