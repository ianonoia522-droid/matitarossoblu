"""Verifica di fattibilità dell'indice di impronte (gira su GitHub Actions, solo libreria standard).

Per ogni sito candidato:
  - robots.txt: il crawler di Common Crawl (CCBot) è escluso? C'è una riserva TDM (/.well-known/tdmrep.json)?
  - quante pagine HTML con stato 200, e quante in italiano, ci sono nell'ultimo archivio di Common Crawl;
  - lettura di alcuni record WARC con richieste parziali, per misurare dimensioni e testo utile.
Inoltre controlla che GitHub Pages risponda alle richieste parziali (HTTP Range) su un file binario.
Scrive un rapporto Markdown su stdout.
"""
import gzip, io, json, random, re, sys, time, urllib.error, urllib.request, urllib.robotparser

CRAWL = 'CC-MAIN-2026-43'
UA = 'MatitaRossoblu-verifica/0.1 (+https://github.com/ianonoia522-droid/matitarossoblu)'
SITE = 'https://ianonoia522-droid.github.io/matitarossoblu/'
# (dominio, modo): 'domain' include i sottodomini, 'host' solo quell'host
CANDIDATI = [
    ('skuola.net', 'domain'), ('studenti.it', 'domain'), ('treccani.it', 'domain'), ('sapere.it', 'domain'),
    ('studentville.it', 'domain'), ('homolaicus.com', 'domain'), ('atuttascuola.it', 'domain'), ('scuolissima.com', 'domain'),
    ('biografieonline.it', 'domain'), ('geopop.it', 'domain'), ('focus.it', 'domain'), ('weschool.com', 'domain'),
    ('studiarapido.it', 'domain'), ('storiaxxisecolo.it', 'domain'), ('ilfattostorico.com', 'domain'), ('edscuola.it', 'domain'),
    ('youmath.it', 'domain'), ('chimica-online.it', 'domain'), ('tesionline.it', 'domain'), ('it.docsity.com', 'host'),
    ('www.studocu.com', 'host'), ('raiscuola.rai.it', 'host'), ('appuntimania.com', 'domain'), ('riassuntini.com', 'domain'),
]
MAX_PAGES = 12          # pagine di risultati CDX lette per dominio (ognuna circa 15.000 righe), poi si stima
CDX = 'https://index.commoncrawl.org/' + CRAWL + '-index'


def get(url, headers=None, timeout=60, tries=5):
    h = {'User-Agent': UA}
    h.update(headers or {})
    delay = 2
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, 'read') else b''
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(delay); delay = min(delay * 2, 60); continue
            return e.code, dict(e.headers or {}), body
        except Exception as e:  # rete
            if i < tries - 1:
                time.sleep(delay); delay = min(delay * 2, 60); continue
            return 0, {}, str(e).encode()


def robots(domain):
    host = domain if domain.count('.') > 1 or domain.startswith('www.') else 'www.' + domain
    out = {'robots': '?', 'ccbot': '?', 'gptbot': '?', 'tdm': '-'}
    for h in (host, domain):
        st, _, body = get('https://' + h + '/robots.txt', timeout=30, tries=2)
        if st == 200:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(body.decode('utf-8', 'replace').splitlines())
            out['robots'] = h
            out['ccbot'] = 'ammesso' if rp.can_fetch('CCBot', 'https://' + h + '/') else 'ESCLUSO'
            out['gptbot'] = 'ammesso' if rp.can_fetch('GPTBot', 'https://' + h + '/') else 'escluso'
            break
        if st in (401, 403, 404, 410):
            out['robots'] = 'assente (' + str(st) + ')'
            out['ccbot'] = 'ammesso'
    st, _, body = get('https://' + host + '/.well-known/tdmrep.json', timeout=30, tries=2)
    if st == 200 and body.strip().startswith((b'[', b'{')):
        out['tdm'] = 'tdmrep.json: ' + body.decode('utf-8', 'replace')[:120].replace('\n', ' ')
    return out


def cdx_lines(domain, mode):
    q = '?url=' + domain + '&matchType=' + mode
    st, _, body = get(CDX + q + '&showNumPages=true', timeout=120)
    if st != 200:
        return None, 'showNumPages: ' + str(st) + ' ' + body[:120].decode('utf-8', 'replace')
    try:
        info = json.loads(body.decode().strip().splitlines()[-1])
    except Exception:
        return None, 'risposta non leggibile: ' + body[:120].decode('utf-8', 'replace')
    pages = int(info.get('pages', 0))
    lines, read = [], 0
    for p in range(min(pages, MAX_PAGES)):
        st, _, body = get(CDX + q + '&output=json&page=' + str(p), timeout=180)
        if st == 404:
            break
        if st != 200:
            return (lines, pages, read), 'pagina ' + str(p) + ': ' + str(st)
        for ln in body.decode('utf-8', 'replace').splitlines():
            try:
                lines.append(json.loads(ln))
            except Exception:
                pass
        read += 1
        time.sleep(1)
    return (lines, pages, read), ''


def warc_record(rec):
    off, ln = int(rec['offset']), int(rec['length'])
    t0 = time.time()
    st, hd, body = get('https://data.commoncrawl.org/' + rec['filename'], {'Range': 'bytes=%d-%d' % (off, off + ln - 1)}, timeout=60, tries=3)
    ms = int((time.time() - t0) * 1000)
    if st != 206:
        return {'ok': False, 'st': st, 'ms': ms}
    raw = gzip.decompress(body)
    parts = raw.split(b'\r\n\r\n', 2)
    html = parts[2] if len(parts) == 3 else b''
    m = re.search(rb'charset=["\']?([\w-]+)', parts[1] if len(parts) > 1 else b'') or re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', html[:4000], re.I)
    enc = (m.group(1).decode('ascii', 'replace') if m else 'utf-8')
    try:
        text = html.decode(enc, 'replace')
    except LookupError:
        text = html.decode('utf-8', 'replace')
    title = re.search(r'<title[^>]*>(.*?)</title>', text, re.S | re.I)
    body_txt = re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ', text)
    paras = re.findall(r'(?is)<p[^>]*>(.*?)</p>', body_txt)
    ptxt = ' '.join(re.sub(r'<[^>]+>', ' ', x) for x in paras)
    return {'ok': True, 'ms': ms, 'gz': ln, 'html': len(html), 'pwords': len(re.findall(r'\w+', ptxt)),
            'title': re.sub(r'\s+', ' ', title.group(1)).strip()[:80] if title else ''}


def range_test():
    url = SITE + 'tools/range-test.bin'
    local = bytes((i * 7 + 13) % 256 for i in range(65536))
    for _ in range(30):  # la pubblicazione su Pages può arrivare dopo questo job
        st, _, _ = get(url, timeout=30, tries=1)
        if st == 200:
            break
        time.sleep(20)
    res = []
    for enc in ('identity', 'gzip, deflate, br'):
        st, hd, body = get(url, {'Range': 'bytes=1000-1999', 'Accept-Encoding': enc}, timeout=30, tries=2)
        hdl = {k.lower(): v for k, v in hd.items()}
        res.append('- Accept-Encoding `%s`: stato %s, Content-Range `%s`, Content-Encoding `%s`, Content-Type `%s`, ACAO `%s`, byte %d, contenuto %s' % (
            enc, st, hdl.get('content-range', '-'), hdl.get('content-encoding', '-'), hdl.get('content-type', '-'),
            hdl.get('access-control-allow-origin', '-'), len(body), 'identico' if body == local[1000:2000] else 'DIVERSO'))
    st, hd, body = get(url, {'Range': 'bytes=0-9,100-109'}, timeout=30, tries=2)
    res.append('- due intervalli insieme: stato %s, Content-Type `%s`' % (st, {k.lower(): v for k, v in hd.items()}.get('content-type', '-')))
    return res


def main():
    print('# Verifica di fattibilità: indice di impronte da Common Crawl\n')
    print('Archivio: `%s`. Data: %s UTC.\n' % (CRAWL, time.strftime('%Y-%m-%d %H:%M', time.gmtime())))
    print('## GitHub Pages: richieste parziali\n')
    for ln in range_test():
        print(ln)
    print('\n## Siti\n')
    print('| sito | robots.txt | CCBot | GPTBot | riserva TDM | righe CDX lette | pagine CDX (lette/totali) | HTML 200 | in italiano | URL unici ita | stima totale ita |')
    print('|---|---|---|---|---|---|---|---|---|---|---|')
    samples, notes = [], []
    random.seed(7)
    for dom, mode in CANDIDATI:
        t0 = time.time()
        rb = robots(dom)
        res, err = cdx_lines(dom, mode)
        if res is None:
            print('| %s | %s | %s | %s | %s | errore | %s | | | | |' % (dom, rb['robots'], rb['ccbot'], rb['gptbot'], rb['tdm'], err))
            continue
        lines, pages, read = res
        html = [r for r in lines if r.get('status') == '200' and 'html' in (r.get('mime-detected') or r.get('mime') or '')]
        ita = [r for r in html if 'ita' in (r.get('languages') or '')]
        uniq = len({r['url'] for r in ita})
        est = int(uniq * pages / read) if read else 0
        print('| %s | %s | %s | %s | %s | %d | %d/%d | %d | %d | %d | %s |' % (
            dom, rb['robots'], rb['ccbot'], rb['gptbot'], rb['tdm'], len(lines), read, pages, len(html), len(ita), uniq,
            ('~%d' % est) if read < pages else str(uniq)))
        if err:
            notes.append('- %s: %s' % (dom, err))
        for rec in random.sample(ita, min(3, len(ita))):
            r = warc_record(rec)
            r['dom'] = dom; r['url'] = rec['url']
            samples.append(r)
        notes.append('- %s: %d s' % (dom, int(time.time() - t0)))
        sys.stdout.flush()
    print('\n## Record WARC di prova\n')
    print('| sito | esito | ms | byte gzip | byte HTML | parole nei <p> | titolo |')
    print('|---|---|---|---|---|---|---|')
    for s in samples:
        if s['ok']:
            print('| %s | ok | %d | %d | %d | %d | %s |' % (s['dom'], s['ms'], s['gz'], s['html'], s['pwords'], s['title'].replace('|', '/')))
        else:
            print('| %s | stato %s | %d | | | | |' % (s['dom'], s['st'], s['ms']))
    print('\n## Note e tempi\n')
    print('\n'.join(notes))


if __name__ == '__main__':
    main()
