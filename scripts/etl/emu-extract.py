#!/usr/bin/env python3
"""Extracts what the builder needs from an old rAthena emulator (customized for RTM).

Input: path to an extracted rAthena emulator folder (only its db/ directory is read).
Usage: python3 scripts/etl/emu-extract.py <EMU_DIR>

Output: src/data/emu.json
  classJob    RTM class -> internal job (via the skill tree: the dump's `icon` field
              is the internal skill name; the job sharing the most skills wins)
  baseAspd    internal job -> weapon type -> base ASPD penalty (job_stats.yml)
  weaponType  item id -> weapon SubType in the emulator (item_db_equip.yml)
  baseHp/Sp   internal job -> base HP/SP per level, index 0 = level 1
              (db/re/job_basepoints.yml; MaxHP = base x (1 + VIT/100) ...)
  statPoints  base level -> total status points (db/re/statpoint.yml;
              exp.conf has use_statpoint_table: yes)
"""
import json, os, re, sys, collections
import yaml

EMU = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
DUMP = os.path.normpath(os.path.join(ROOT, '..', 'dump'))

def load(p):
    with open(os.path.join(EMU, p), encoding='utf-8', errors='replace') as f:
        return yaml.safe_load(f) or {}

# ---- skill tree -> job
# Regex, not YAML: the Rebellion entry has duplicate `Tree` keys and the YAML parser
# keeps only the last one (Summoner's). Here the union of all of them is used.
tree = {}
with open(os.path.join(EMU, 'db/re/skill_tree.yml'), encoding='utf-8', errors='replace') as f:
    for b in re.split(r'\n  - Job: ', f.read())[1:]:
        job = b.split('\n', 1)[0].strip()
        tree.setdefault(job, set()).update(re.findall(r'- Name: (\w+)', b))

skills = json.load(open(os.path.join(DUMP, 'raw-db-skills.json')))
cols = skills['cols']; K, ICON = cols.index('key'), cols.index('icon')
by_cls = collections.defaultdict(set)
for r in skills['rows']:
    if r[ICON]: by_cls[r[K].split('/')[0]].add(r[ICON])

classes = json.load(open(os.path.join(ROOT, 'src/data/classes.json')))
class_job, weak = {}, {}
for c in classes:
    slug = c['name'].lower().replace(' ', '-').replace("'", '')
    sk = by_cls.get(slug, set())
    if not sk: continue
    ranked = sorted(((len(sk & t), j) for j, t in tree.items()), reverse=True)
    (n1, j1), (n2, _) = ranked[0], ranked[1]
    class_job[c['name']] = j1
    # without a clear margin, the match is doubtful
    if n1 < 0.6 * len(sk) or n1 - n2 < 2: weak[c['name']] = f'{n1}/{len(sk)} skills, runner-up {n2}'

# ---- base ASPD per job (import overrides re)
base_aspd = {}
for p in ('db/re/job_stats.yml', 'db/import/job_stats.yml'):
    if not os.path.exists(os.path.join(EMU, p)): continue
    for e in load(p).get('Body', []) or []:
        if 'BaseASPD' not in e: continue
        for j, on in (e.get('Jobs') or {}).items():
            if on: base_aspd.setdefault(j, {}).update(e['BaseASPD'])

# ---- weapon type per item
items = json.load(open(os.path.join(ROOT, 'src/data/items.json')))
want = {i['id'] for i in items if i['grp'] == 'Weapon'}
wtype = {}
for e in load('db/re/item_db_equip.yml').get('Body', []):
    if e.get('Id') in want and e.get('Type') == 'Weapon':
        wtype[str(e['Id'])] = e.get('SubType', 'Fist')

# RTM category -> most common type, for weapons missing from the emulator
cat_votes = collections.defaultdict(collections.Counter)
for i in items:
    t = wtype.get(str(i['id']))
    if t: cat_votes[i['cat']][t] += 1
cat_type = {c: v.most_common(1)[0][0] for c, v in cat_votes.items()}

# ---- status points per level (cumulative total since level 1)
stat_points = {}
for p in ('db/re/statpoint.yml', 'db/import/statpoint.yml'):
    if not os.path.exists(os.path.join(EMU, p)): continue
    for e in load(p).get('Body', []) or []:
        stat_points[str(e['Level'])] = e['Points']

used_jobs = set(class_job.values())

# ---- base HP/SP per job and level (only jobs used by some class)
base_hp, base_sp = {}, {}
for e in load('db/re/job_basepoints.yml').get('Body', []) or []:
    for key, dst in (('BaseHp', base_hp), ('BaseSp', base_sp)):
        if key not in e: continue
        tab = {x['Level']: x[key[4:]] for x in e[key]}
        lst = [tab.get(l) for l in range(1, max(tab) + 1)]
        for j, on in (e.get('Jobs') or {}).items():
            if on and j in used_jobs: dst[j] = lst
out = {
    '_source': 'old rAthena emulator customized for RTM (~2024). scripts/etl/emu-extract.py',
    'classJob': class_job,
    'classJobUncertain': weak,
    'baseAspd': {j: base_aspd[j] for j in sorted(used_jobs) if j in base_aspd},
    'weaponType': wtype,
    'catType': cat_type,
    'statPoints': stat_points,
    'baseHp': base_hp,
    'baseSp': base_sp,
}
json.dump(out, open(os.path.join(ROOT, 'src/data/emu.json'), 'w'), ensure_ascii=False, indent=1, sort_keys=True)
print(f"HP base: {len(base_hp)} jobs, SP base: {len(base_sp)} jobs; Rebellion 137 = {base_hp.get('Rebellion', [None]*137)[136]} HP / {base_sp.get('Rebellion', [None]*137)[136]} SP")
print(f"status points: {len(stat_points)} levels, 137 = {stat_points.get('137')}, 150 = {stat_points.get('150')}")
print(f"classes {len(class_job)} (doubtful {len(weak)}), jobs with ASPD {len(out['baseAspd'])}, weapons {len(wtype)}/{len(want)}")
for k, v in weak.items(): print('  doubtful:', k, '->', class_job[k], '|', v)
