# RTM Build Planner

A build planner and damage simulator for **Return to Morroc: Refuge** (RTM), a Ragnarok Online private server.

- **Build Planner** — equip items, cards, refines, random options, Dream Enchants, class gems and the Valhalla / Amatsu seals, allocate the skill tree and read a status window that matches the in-game one.
- **Incoming** — pick a monster and see what its normal attack and each of its skills does to the active build, per hit: after DEF/MDEF, armor element and resistances, as % of your HP and hits to die. Monster skills come from the rAthena emulator (the RTM database has none).
- **Simulator** — build a skill rotation on a timeline and see Combo Ready, Finisher Ready and Overslash stacks over time, the damage of every cast, a per-skill breakdown and the rotation total / DPS against any monster.

It is a static site (no server, no account): builds are saved in your browser and can be exported/imported as JSON.

> Unofficial, non-commercial fan project. Not affiliated with the RTM: Refuge staff or with Gravity. Game names, data and sprites belong to their respective owners.

## How accurate is it?

The engine is checked against a character rebuilt identically in-game (`tests/calibration.test.ts`): every value in the status window (stats, ATK, MATK, HIT, CRIT, DEF, MDEF, FLEE, ASPD, SP) and the relevant `@battlestats` lines (skill boosts, crit %, crit damage, ATK %, penetration, leech, regen, delays) match. A 6-hit Roaring Overslash on the training dummy is within ~1.5% of the in-game number.

Only the **Revenant** class is calibrated. Other classes use the same formulas but have not been checked against the game, and the UI marks their numbers as uncalibrated.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev      # http://localhost:7000
npm test         # unit, golden and calibration tests
npm run build    # static export to out/
```

### Deploying to Vercel

Import the repository in Vercel and keep the defaults (framework: Next.js). `next.config.mjs` uses `output: 'export'`, so the site is served as static files; no environment variables are needed.

## Data

`src/data/*.json` is **generated and committed**. It is built from the JSON files published by the community database at <https://rtm-database.pages.dev> (`assets/data/db-items.json`, `db-mobs.json`, `db-skills.json`, …) plus a few tables extracted from the rAthena emulator.

```bash
npm run data         # regenerate src/data/*.json from a raw dump in ../dump (not included)
npm run icons        # download item icons into public/icons/ (idempotent)
npm run skill-icons  # download skill icons into public/skills/
```

The raw dump is not part of this repository. To regenerate the data, download those JSON files into a `dump/` folder next to the project (`raw-db-items.json`, `raw-db-mobs.json`, `raw-db-skills.json`, …) and run `npm run data`.

Everything the game data does not state (formulas, server config, patch changes) lives in `src/lib/rules/` and `scripts/etl/overrides.mjs`, each value with a comment saying where it came from.

## Project layout

```
scripts/etl/          build-time: raw dump -> typed JSON
  dump.mjs            reads and denormalises the columnar dump
  effects.mjs         item description text -> Modifier[] | UnparsedEffect[]
  skills.mjs          "Damage is 150+15% per level +2% per LUK" -> coefficients
  overrides.mjs       corrections to the dump, each with a reason
  emu-extract.py      rAthena emulator -> src/data/emu.json (jobs, base ASPD, weapon types)
  mob-skills-extract.py  rAthena emulator -> src/data/mob-skills.json (monster skills, MATK)
  base-mob-skills.py  mob-skills.json -> "Skills" section of the knowledge base mob pages
src/data/*.json       ETL output — do not edit by hand
src/lib/rules/        what no text states: server constants, class rules, random options,
                      Dream Enchants, seals
src/lib/engine/       pure, no React, no I/O
  sheet.ts            Build -> StatSheet (the status window)
  simulate.ts         StatSheet + Mob -> damage per hit, by layer
  rotation.ts         a skill sequence over time (cooldowns, delays, SP, combo states)
src/components/       UI
tests/                unit, golden and in-game calibration tests
```

## Principles

1. **No effect line disappears.** Every line of an item description becomes a modifier or an "unparsed" entry with a reason, and whatever the engine does not apply is shown in the UI.
2. **Every number says where it came from.** Values carry a provenance (`db`, `emu`, `derived`, `measured`, `reported`, `uncalibrated`).
3. **Game formulas come from the emulator source** (rAthena `battle.cpp`, `status.cpp`, `skill.cpp`, `db/re/*.yml`, `conf/battle/*.conf`) and are corrected only by in-game measurements.

## Contributing

Issues and pull requests are welcome — especially in-game measurements (status window, `@battlestats`, dummy damage) for classes other than Revenant, which are what the calibration tests are built from.

## Credits

- Game data: [RTM: Refuge Database](https://rtm-database.pages.dev) and the [RTM: Refuge](https://rtmrefuge.pages.dev) site.
- Formulas and server tables: [rAthena](https://github.com/rathena/rathena).
- Item and skill icons: downloaded from the RTM: Refuge Database; they are Ragnarok Online assets owned by Gravity.

## License

Code: [MIT](LICENSE). Game data and assets are not covered by the license and belong to their respective owners.
