"""Investigation-only Unicode casefold/NFC census over the complete C dictionary."""
import hashlib, json, pathlib, sqlite3, sys, time, unicodedata

root = pathlib.Path(__file__).resolve().parent / 'artifacts' / 'search'
db = sqlite3.connect(f'file:{(root / "C.db").as_posix()}?mode=ro', uri=True)
out = sqlite3.connect(root / 'normalization.db')
out.execute('CREATE TABLE norm(kind TEXT,id INTEGER,a BLOB,u BLOB,n BLOB)')
digest = lambda s: hashlib.sha256(s.encode('utf-16le', 'surrogatepass')).digest()
started = time.perf_counter()
rows = 0
non_nfc = {'field': 0, 'string': 0}
for kind, ident, key in db.execute("SELECT kind,id,exact_key FROM dictionary WHERE kind IN ('field','string')"):
    text = json.loads(key)
    ascii_fold = text.translate(str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'))
    nfc = unicodedata.normalize('NFC', text)
    non_nfc[kind] += nfc != text
    out.execute('INSERT INTO norm VALUES(?,?,?,?,?)', (kind, ident, digest(ascii_fold), digest(text.casefold()), digest(nfc)))
    rows += 1
    if rows % 100000 == 0:
        out.commit()
        print(json.dumps({'stage': 'normalization', 'rows': rows, 'seconds': time.perf_counter()-started}), flush=True)
out.commit()
results = []
for col in ['a','u','n']:
    out.execute(f'CREATE INDEX norm_{col} ON norm(kind,{col},id)')
for kind in ['field', 'string']:
    for label, col in [('ASCII case-insensitive', 'a'), ('Unicode full casefold', 'u'), ('NFC', 'n')]:
        groups = out.execute(f'SELECT count(*),coalesce(sum(c),0) FROM (SELECT count(*) c FROM norm WHERE kind=? GROUP BY {col} HAVING count(*)>1)', (kind,)).fetchone()
        examples = []
        for folded, count in out.execute(f'SELECT {col},count(*) c FROM norm WHERE kind=? GROUP BY {col} HAVING count(*)>1 ORDER BY c DESC LIMIT 5', (kind,)):
            ids = [x[0] for x in out.execute(f'SELECT id FROM norm WHERE kind=? AND {col}=? LIMIT 4', (kind, folded))]
            originals = [json.loads(db.execute('SELECT exact_key FROM dictionary WHERE id=?', (i,)).fetchone()[0]) for i in ids]
            examples.append({'variantCount': count, 'originals': [s[:160] for s in originals]})
        results.append({'kind': kind, 'policy': label, 'variantGroups': groups[0], 'distinctValuesInGroups': groups[1], 'examples': examples})
    # Indexes are analysis artifacts, not the candidate index schema.
result = {'python':sys.version,'sqlite':sqlite3.sqlite_version,'unicodeVersion':unicodedata.unidata_version,'rows':rows,'nonNfcDistinct':non_nfc,'wallMs':(time.perf_counter()-started)*1000,'results':results,'groupKey':'SHA-256 of normalized UTF-16LE with surrogatepass; statistical census, not query truth proof'}
(root / 'normalization.json').write_text(json.dumps(result, ensure_ascii=True, indent=2)+'\n', encoding='utf-8')
out.close()
db.close()
print(json.dumps({'complete':True,'rows':rows}), flush=True)
