"""Fetch species data from PokeAPI -> data/pokemon.js and sprites/*.png. Cached in tools/cache."""
import urllib.request as u, json, os, sys
from concurrent.futures import ThreadPoolExecutor
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE=os.path.join(ROOT,'tools','cache'); os.makedirs(CACHE,exist_ok=True)
SPR=os.path.join(ROOT,'sprites')
H={'User-Agent':'Mozilla/5.0'}
def get(url,retries=4):
    for i in range(retries):
        try: return u.urlopen(u.Request(url,headers=H),timeout=30).read()
        except Exception as e:
            if i==retries-1: raise
def getj(kind,key):
    p=os.path.join(CACHE,f'{kind}_{key}.json')
    if os.path.exists(p): return json.load(open(p))
    d=json.loads(get(f'https://pokeapi.co/api/v2/{kind}/{key}'))
    json.dump(d,open(p,'w')); return d
N=json.loads(get('https://pokeapi.co/api/v2/pokemon-species?limit=1')) ['count']
print('species',N)
GEN={'generation-i':1,'generation-ii':2,'generation-iii':3,'generation-iv':4,'generation-v':5,'generation-vi':6,'generation-vii':7,'generation-viii':8,'generation-ix':9}
def one(i):
    try:
        sp=getj('pokemon-species',i)
        dv=[v for v in sp['varieties'] if v['is_default']][0]['pokemon']['name']
        p=getj('pokemon',dv)
        st={s['stat']['name']:s['base_stat'] for s in p['stats']}
        spr=p['sprites']['front_default'] or p['sprites']['other']['official-artwork']['front_default']
        f=os.path.join(SPR,f'{i}.png')
        if spr and not os.path.exists(f): open(f,'wb').write(get(spr))
        return dict(id=i,name=sp['name'],types=[t['type']['name'] for t in sorted(p['types'],key=lambda t:t['slot'])],
          hp=st['hp'],atk=st['attack'],def_=st['defense'],spa=st['special-attack'],spd=st['special-defense'],spe=st['speed'],
          h=p['height'],w=p['weight'],gen=GEN[sp['generation']['name']],shape=(sp['shape'] or {}).get('name','upright'),leg=sp['is_legendary'],myth=sp['is_mythical'],
          from_=(int(sp['evolves_from_species']['url'].rstrip('/').split('/')[-1]) if sp['evolves_from_species'] else 0),
          sprite=bool(spr))
    except Exception as e:
        print('FAIL',i,e); return None
with ThreadPoolExecutor(16) as ex: rows=[r for r in ex.map(one,range(1,N+1)) if r]
pre={r['from_'] for r in rows}
for r in rows: r['full']=r['id'] not in pre
json.dump(rows,open(os.path.join(ROOT,'data','pokemon.json'),'w'))
open(os.path.join(ROOT,'data','pokemon.js'),'w').write('window.POKE_RAW='+json.dumps(rows,separators=(',',':'))+';')
print('ok',len(rows),'nosprite',[r['id'] for r in rows if not r['sprite']])
