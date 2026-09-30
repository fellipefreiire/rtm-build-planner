#!/usr/bin/env python3
"""Writes the "## Skills [emu 2024]" section into each mob page of the knowledge base.

Input: src/data/mob-skills.json (run mob-skills-extract.py first) and src/data/mobs.json.
Usage: python3 scripts/etl/base-mob-skills.py [BASE_MOBS_DIR]   (default ../base/mobs)

Idempotent: the section sits between two HTML comment markers and is replaced on every
run; the rest of the page is left untouched. It goes right before "## Ver também"
(or at the end of the page when that heading is missing).
A page is matched to a mob by its H1 (the name) and, when several mobs share a name,
by the "lv N" in the second line.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.normpath(os.path.join(ROOT, '..', 'base', 'mobs'))

data = json.load(open(os.path.join(ROOT, 'src/data/mob-skills.json')))
mobs = json.load(open(os.path.join(ROOT, 'src/data/mobs.json')))
RATE = data['conf'].get('mob_skill_rate', 100)
DELAY = data['conf'].get('mob_skill_delay', 100)

BEGIN, END = '<!-- skills:emu:begin -->', '<!-- skills:emu:end -->'

STATE = {
    'any': 'qualquer', 'attack': 'atacando', 'idle': 'parado', 'chase': 'perseguindo',
    'walk': 'andando', 'angry': 'irritado', 'dead': 'ao morrer', 'loot': 'pegando item',
    'follow': 'seguindo', 'anytarget': 'qualquer alvo',
}
# emote bubbles: no gameplay effect
COSMETIC = {'NPC_EMOTION', 'NPC_EMOTION_ON'}
TYPE = {'Weapon': 'físico', 'Magic': 'mágico', 'Misc': 'especial'}

def cond_pt(c, v):
    v = v or ''
    return {
        'always': '—',
        'myhpltmaxrate': f'HP < {v}%',
        'myhpinrate': f'HP entre {v}%',
        'friendhpltmaxrate': f'aliado com HP < {v}%',
        'mystatuson': f'com status {v}', 'mystatusoff': f'sem status {v}',
        'friendstatuson': f'aliado com {v}', 'friendstatusoff': f'aliado sem {v}',
        'attackpcgt': f'> {v} jogadores o atacando', 'attackpcge': f'≥ {v} jogadores o atacando',
        'slavelt': f'< {v} escravos', 'slavele': f'≤ {v} escravos',
        'closedattacked': 'atacado de perto', 'longrangeattacked': 'atacado à distância',
        'rudeattacked': 'atacado sem conseguir revidar', 'skillused': f'após sofrer a skill {v}',
        'afterskill': f'após usar {v}', 'casttargeted': 'alvo de um cast',
        'masterhpltmaxrate': f'mestre com HP < {v}%', 'masterattacked': 'mestre atacado',
        'alchemist': 'perto de alquimista', 'spawn': 'ao nascer', 'onspawn': 'ao nascer',
        'groundattacked': 'atacado por skill de chão', 'damagedgt': f'dano recebido > {v}',
    }.get(c, f'{c} {v}'.strip())

def section(mid):
    m = data['mobs'].get(str(mid))
    if not m:
        return '\n'.join([BEGIN, '## Skills `[emu 2024]`', '',
            'Sem dado: o emulador de 2024-06 não tem este mob, ou usa o mesmo id para outro',
            'mob (conteúdo mais novo que o emulador). Skills desconhecidas.', END])
    lines = [BEGIN, '## Skills `[emu 2024]`', '']
    lines.append('> Do emulador rAthena de 2024-06 (`mob_skill_db`), não do RTM: skill, chance e')
    lines.append(f'> cooldown podem ter mudado. Chance e cooldown já com `mob_skill_rate {RATE}%` e')
    lines.append(f'> `mob_skill_delay {DELAY}%` do servidor. Dano por golpe: aba **Incoming** do builder.')
    if m['match'] == 'level':
        lines.append(f'> No emulador este id se chama **{m["emuName"]}** (mesmo nível).')
    lines.append('')
    if not any(r['skill'] not in COSMETIC for r in m['rows']):
        lines += ['Nenhuma skill no emulador: só auto attack.', END]
        return '\n'.join(lines)
    lines += ['| Skill | Lv | Tipo | Elemento | Quando | Chance | Cooldown | Condição |',
              '|---|---|---|---|---|---|---|---|']
    for r in m['rows']:
        if r['skill'] in COSMETIC: continue
        s = data['skills'].get(r['skill'], {'name': r['skill'], 'type': None})
        dmg = s.get('type') in TYPE and 'NoDamage' not in (s.get('flags') or [])
        kind = TYPE[s['type']] if dmg else 'sem dano'
        el = s.get('element', '') if dmg else ''
        if isinstance(el, list): el = el[min(r['lv'], len(el)) - 1]
        chance = r['rate'] * RATE / 100 / 100
        cd = r['delay'] * DELAY / 100 / 1000
        lines.append(f"| {s['name']} | {r['lv']} | {kind} | {el} | {STATE.get(r['state'], r['state'])} "
                     f"| {chance:.1f}% | {cd:g} s | {cond_pt(r['cond'], r['condValue'])} |")
    lines.append(END)
    return '\n'.join(lines)

by_name = {}
for m in mobs: by_name.setdefault(m['name'].lower(), []).append(m)

done = skipped = 0
for fn in sorted(os.listdir(BASE)):
    if not fn.endswith('.md') or fn.startswith('_') or fn == 'INDICE.md': continue
    p = os.path.join(BASE, fn)
    txt = open(p, encoding='utf-8').read()
    h1 = re.match(r'# (.+)\n', txt)
    if not h1: skipped += 1; continue
    cands = by_name.get(h1.group(1).strip().lower(), [])
    lvm = re.search(r'· lv (\d+)', txt[:300])
    if len(cands) > 1 and lvm:
        cands = [c for c in cands if c['lv'] == int(lvm.group(1))] or cands
    if not cands: skipped += 1; continue
    sec = section(cands[0]['id'])
    txt = re.sub(r'\n?' + re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', '\n', txt, flags=re.S)
    if sec:
        if '## Ver também' in txt:
            txt = txt.replace('## Ver também', sec + '\n\n## Ver também', 1)
        else:
            txt = txt.rstrip('\n') + '\n\n' + sec + '\n'
    open(p, 'w', encoding='utf-8').write(txt)
    done += 1 if sec else 0
print(f'{BASE}: section written in {done} pages, {skipped} pages without a matching mob')
