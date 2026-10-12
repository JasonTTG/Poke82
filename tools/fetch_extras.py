"""Adds abilities to every species and the regional forms (Alolan, Galarian, Hisuian, Paldean) as extra entries.
Reads the PokeAPI cache written by fetch_data.py (fetches anything missing). Rewrites data/pokemon.json and data/pokemon.js."""
import urllib.request as u, json, os
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', 'cache')
SPR = os.path.join(ROOT, 'sprites')
H = {'User-Agent': 'Mozilla/5.0'}


def get(url, retries=4):
    for i in range(retries):
        try:
            return u.urlopen(u.Request(url, headers=H), timeout=30).read()
        except Exception:
            if i == retries - 1:
                raise


def getj(kind, key):
    p = os.path.join(CACHE, f'{kind}_{key}.json')
    if os.path.exists(p):
        return json.load(open(p))
    d = json.loads(get(f'https://pokeapi.co/api/v2/{kind}/{key}'))
    json.dump(d, open(p, 'w'))
    return d


rows = json.load(open(os.path.join(ROOT, 'data', 'pokemon.json')))
base = [r for r in rows if r['id'] <= 1025]
byid = {r['id']: r for r in base}
REG = {'alola': 7, 'galar': 8, 'hisui': 8, 'paldea': 9}
GEN_OF_FORM = REG


def abil(p):
    n = [a['ability']['name'] for a in sorted(p['abilities'], key=lambda a: a['slot']) if not a['is_hidden']]
    h = [a['ability']['name'] for a in p['abilities'] if a['is_hidden']]
    return n, (h[0] if h else '')


def one(r):
    sp = getj('pokemon-species', r['id'])
    dv = [v for v in sp['varieties'] if v['is_default']][0]['pokemon']['name']
    p = getj('pokemon', dv)
    r['ab'], r['abh'] = abil(p)
    forms = []
    seen = set()
    for v in sp['varieties']:
        nm = v['pokemon']['name']
        for tok in REG:
            if ('-' + tok) in nm and 'zen' not in nm and 'mega' not in nm and 'gmax' not in nm and '-cap' not in nm and (tok not in seen):
                seen.add(tok)
                fp = getj('pokemon', nm)
                st = {s['stat']['name']: s['base_stat'] for s in fp['stats']}
                spr = fp['sprites']['front_default'] or fp['sprites']['other']['official-artwork']['front_default']
                f = os.path.join(SPR, f"{fp['id']}.png")
                if spr and not os.path.exists(f):
                    open(f, 'wb').write(get(spr))
                ab, abh = abil(fp)
                forms.append(dict(id=fp['id'], name=nm, types=[t['type']['name'] for t in sorted(fp['types'], key=lambda t: t['slot'])],
                                  hp=st['hp'], atk=st['attack'], def_=st['defense'], spa=st['special-attack'], spd=st['special-defense'], spe=st['speed'],
                                  h=fp['height'], w=fp['weight'], gen=GEN_OF_FORM[tok], shape=r['shape'], leg=r['leg'], myth=r['myth'],
                                  base=r['id'], reg=tok, from_=0, sprite=bool(spr), ab=ab, abh=abh))
    return forms


with ThreadPoolExecutor(16) as ex:
    allforms = [f for fs in ex.map(one, base) for f in fs]

# pre-evolution links for forms: the same-region form of the pre-evolution if it exists, else the base pre-evolution
formOf = {(f['base'], f['reg']): f for f in allforms}
for f in allforms:
    sp = getj('pokemon-species', f['base'])
    pre = sp['evolves_from_species']
    if pre:
        pid = int(pre['url'].rstrip('/').split('/')[-1])
        pf = formOf.get((pid, f['reg']))
        f['from_'] = pf['id'] if pf else pid
# species that only evolve from a regional form
OVERRIDE = {863: ('meowth', 'galar'), 862: ('linoone', 'galar'), 865: ('farfetchd', 'galar'), 866: ('mr-mime', 'galar'), 867: ('yamask', 'galar'),
            864: ('corsola', 'galar'), 904: ('qwilfish', 'hisui'), 903: ('sneasel', 'hisui'), 980: ('wooper', 'paldea')}
for sid, (nm, reg) in OVERRIDE.items():
    fm = [f for f in allforms if f['reg'] == reg and f['name'].startswith(nm)]
    if fm:
        byid[sid]['from_'] = fm[0]['id']
out = base + allforms
pre = {r['from_'] for r in out}
for r in out:
    r['full'] = r['id'] not in pre
    r.setdefault('base', 0)
    r.setdefault('reg', '')
    r.setdefault('ab', [])
    r.setdefault('abh', '')
json.dump(out, open(os.path.join(ROOT, 'data', 'pokemon.json'), 'w'))
open(os.path.join(ROOT, 'data', 'pokemon.js'), 'w').write('window.POKE_RAW=' + json.dumps(out, separators=(',', ':')) + ';')
print('ok', len(base), 'species +', len(allforms), 'forms;', 'no abilities:', [r['id'] for r in out if not r['ab']][:10])
print([f['name'] for f in allforms])
