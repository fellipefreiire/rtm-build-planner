#!/usr/bin/env python3
"""Extracts monster skills from an old rAthena emulator (customized for RTM, ~2024-06).

The RTM dump has no monster skills; the emulator's mob_skill_db does.
Usage: python3 scripts/etl/mob-skills-extract.py <EMU_DIR>

Output: src/data/mob-skills.json
  conf     mob_skill_rate / mob_skill_delay from conf/battle/monster.conf (percent)
  skills   skill_db Name -> what the engine needs (type, element, hits, flags, range) for
           every skill a RTM mob casts; non-damaging skills keep only name/type
  mobs     RTM mob id -> emulator data: emuName, match, emuAtk/emuMatk (Attack/Attack2),
           range (AttackRange) and the mob_skill_db rows (empty when it casts nothing)

A mob id is only trusted when the emulator entry has the same name OR the same level as
the RTM one: ids 2673-2684 were reused by RTM for new content (Odin Avatar = emu
"Dumpling Child Ringleader"), and their skill rows belong to the old mob.
"""
import json, os, re, sys
import yaml

EMU = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))

def path(p): return os.path.join(EMU, p)

def load_yaml(p):
    with open(path(p), encoding='utf-8', errors='replace') as f:
        return (yaml.safe_load(f) or {}).get('Body') or []

conf = {}
with open(path('conf/battle/monster.conf'), encoding='utf-8', errors='replace') as f:
    for line in f:
        m = re.match(r'^(mob_skill_rate|mob_skill_delay):\s*(\d+)', line)
        if m: conf[m.group(1)] = int(m.group(2))

emu_mobs = {m['Id']: m for m in load_yaml('db/re/mob_db.yml')}
skill_db = {s['Name']: s for s in load_yaml('db/re/skill_db.yml')}
rtm = json.load(open(os.path.join(ROOT, 'src/data/mobs.json')))

# mob_skill_db.txt columns (rAthena doc/mob_skill_db):
# id,dummy,state,skill_id,lv,rate,casttime,delay,cancelable,target,condition,cond_value,
# val1..val5,emotion,chat
def atoi(v):
    """like C atoi, which is what the emulator uses: '0.200' -> 0 (Rank B Shadow has one such row)"""
    m = re.match(r'\s*-?\d+', v)
    return int(m.group(0)) if m else 0

rows_by_mob = {}
with open(path('db/re/mob_skill_db.txt'), encoding='utf-8', errors='replace') as f:
    for line in f:
        if line.startswith('//') or not line.strip(): continue
        p = [x.strip() for x in line.rstrip('\n').split(',')]
        try: mid = int(p[0])
        except ValueError: continue
        name = p[1].split('@', 1)[1] if '@' in p[1] else p[1]
        rows_by_mob.setdefault(mid, []).append({
            'skill': name,
            'lv': atoi(p[4]),
            'state': p[2],
            'rate': atoi(p[5]),          # out of 10000
            'cast': atoi(p[6]),          # ms
            'delay': atoi(p[7]),         # ms, before mob_skill_delay
            'cancelable': p[8] == 'yes',
            'target': p[9],
            'cond': p[10],
            'condValue': p[11] or None,
            'vals': [v for v in p[12:17] if v],
        })

DAMAGE_TYPES = {'Weapon', 'Magic', 'Misc'}

def per_level(v):
    """skill_db writes per-level values as [{Level, <Key>}]; keep a list indexed by level-1."""
    if isinstance(v, list):
        out = []
        for e in v:
            val = next((x for k, x in e.items() if k != 'Level'), None)
            out.append(val)
        return out
    return v

mobs_out, used = {}, set()
for m in rtm:
    e = emu_mobs.get(m['id'])
    rows = rows_by_mob.get(m['id'], [])
    if not e: continue
    if e['Name'].lower() == m['name'].lower(): match = 'name'
    elif e.get('Level') == m['lv']: match = 'level'
    else: continue
    mobs_out[str(m['id'])] = {
        'emuName': e['Name'], 'match': match,
        'emuAtk': e.get('Attack', 0), 'emuMatk': e.get('Attack2', 0),
        'range': e.get('AttackRange', 1),
        'rows': rows,
    }
    used.update(r['skill'] for r in rows)

skills_out = {}
for n in sorted(used):
    s = skill_db.get(n)
    if not s:
        skills_out[n] = {'name': n, 'type': None}
        continue
    d = {'id': s['Id'], 'name': s.get('Description') or n, 'type': s.get('Type')}
    if d['type'] in DAMAGE_TYPES:
        flags = s.get('DamageFlags') or {}
        d.update({
            'element': per_level(s.get('Element', 'Neutral')),
            'hits': per_level(s.get('HitCount', 1)),
            'range': per_level(s.get('Range', 0)),
            'splash': per_level(s.get('SplashArea', 0)),
            'flags': sorted(k for k, v in flags.items() if v),
        })
    skills_out[n] = d

out = {'source': 'rAthena emulator db/re/mob_skill_db.txt + skill_db.yml (2024-06)', 'conf': conf,
       'skills': skills_out, 'mobs': mobs_out}
dest = os.path.join(ROOT, 'src/data/mob-skills.json')
with open(dest, 'w') as f: json.dump(out, f, separators=(',', ':'))
print(f'{dest}: {len(mobs_out)} mobs, {len(skills_out)} skills, conf {conf}')
