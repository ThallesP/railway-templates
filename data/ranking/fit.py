import json, glob, itertools, re, os
from math import log
def toks(s): return re.findall(r'[a-z0-9]+', (s or '').lower())
res = {}
for f in sorted(glob.glob('query-*.json')):
    q = f[len('query-'):-5].replace('_',' ')
    rows = json.load(open(f))
    qt = toks(q)
    feats = []
    for r in rows:
        name, desc, code = r['name'], r.get('description') or '', r['code']
        nt, dt, ct = toks(name), toks(desc), toks(code)
        has = lambda ts: all(any(t.startswith(x) for t in ts) for x in qt)
        exact = toks(name) == qt
        starts = nt[:len(qt)] == qt
        h = r['live']['health']
        tier = 3 if h == 100 else (2 if (h is not None and h >= 70) else (1 if h is None else 0))
        feats.append(dict(pos=r['pos'], code=code, name=name, exact=int(exact), starts=int(starts), nameHas=int(has(nt)), descHas=int(has(dt)), codeHas=int(has(ct)),
            occ=sum(1 for x in qt for t in nt+dt+ct if t.startswith(x)), nlen=len(nt), tier=tier, health=(h if h is not None else -1), active=r['live']['activeProjects'], recent=r['live']['recentProjects'], ver=int(r['isVerified']), created=r['live']['createdAt']))
    res[q] = feats
def kendall(order, rows):
    s = sorted(rows, key=order)
    rank = {r['code']: i for i, r in enumerate(s)}
    c = d = 0
    for a, b in itertools.combinations(rows, 2):
        x = (a['pos'] - b['pos']) * (rank[a['code']] - rank[b['code']])
        c += x > 0; d += x < 0
    return (c - d) / max(1, c + d)
models = {
 'active desc': lambda r: (-r['active'],),
 'tier, active': lambda r: (-r['tier'], -r['active']),
 'nameHas, tier, active': lambda r: (-r['nameHas'], -r['tier'], -r['active']),
 'exact, nameHas, tier, active': lambda r: (-r['exact'], -r['nameHas'], -r['tier'], -r['active']),
 'exact, nameHas, descHas, tier, active': lambda r: (-r['exact'], -r['nameHas'], -r['descHas'], -r['tier'], -r['active']),
 'exact, nameHas, tier, health, active': lambda r: (-r['exact'], -r['nameHas'], -r['tier'], -r['health'], -r['active']),
 'occ, tier, active': lambda r: (-r['occ'], -r['tier'], -r['active']),
 'exact, occ, tier, active': lambda r: (-r['exact'], -r['occ'], -r['tier'], -r['active']),
 'exact, starts, nameHas, tier, active': lambda r: (-r['exact'], -r['starts'], -r['nameHas'], -r['tier'], -r['active']),
 'nameHas, exact, tier, active': lambda r: (-r['nameHas'], -r['exact'], -r['tier'], -r['active']),
 'exact, nameHas, health, active': lambda r: (-r['exact'], -r['nameHas'], -r['health'], -r['active']),
 'exact, nameHas, active': lambda r: (-r['exact'], -r['nameHas'], -r['active']),
 'exact, nameHas, tier, recent': lambda r: (-r['exact'], -r['nameHas'], -r['tier'], -r['recent']),
 'exact, nameHas, tier, created desc': lambda r: (-r['exact'], -r['nameHas'], -r['tier'], r['created']),
}
print(f"{'model':42s} " + ' '.join(f'{q[:9]:>9s}' for q in res) + '   mean')
for m, fn in models.items():
    taus = [kendall(fn, rows) for rows in res.values()]
    print(f"{m:42s} " + ' '.join(f'{t:9.2f}' for t in taus) + f'  {sum(taus)/len(taus):6.2f}')
json.dump(res, open('features.json','w'))
# Run from this directory: python3 fit.py
