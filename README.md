# Rampart Siege — Physics Tower Defense

> Made by Muse Spark 1.3

A 3D physics tower defense built with **three.js** + **Rapier**. Towers don't just
do DPS — they shove, launch and drop enemies. Knock raiders off the bridge into
the canyon for instant kills.

- Fixed winding canyon path with a bridge over a pit (fall = death + bonus)
- 4 towers (Cannon / Gatling / Frost / Mortar) + stone Wall, upgrades to Lv3
- 4 enemies (Grunt / Roller / Brute / Golem boss) as real rigid bodies
- 3-lane campaign, each a different path: **Canyon Pass** (S-curve, 1 bridge),
  **Twin Bridges** (canyon crossed twice — out and back), **The Gorge**
  (long approach, wide crossing). Enemies gain +35% HP per lane.
- Clearing a lane refunds towers at 70% (towers don't transfer between lanes),
  plus a completion bonus, gold top-up and +6 lives
- Fully procedural: meshes, textures (vertex colors), sounds (WebAudio) — zero assets

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
npm run e2e      # headless smoke test (run `npm run preview` first in another shell)
```

## How to play

| Action | Desktop | Touch |
| --- | --- | --- |
| Select tower | Click build bar / 1-5 keys | Tap build bar |
| Place / move ghost | Mouse move + click | Tap map |
| Cancel | Right-click / Esc | Tap selected card again |
| Pan / zoom | WASD or right-drag / wheel | Two-finger drag / pinch* |
| Start wave / speed | Buttons / Space / F | Buttons |

*Pinch zoom is wheel-equivalent where supported; otherwise use buttons.

- Click a placed tower to upgrade (Lv3 max) or sell.
- Cannon & Mortar deal knockback — aim to shove enemies off the bridge.
- Frost slows 30% for 1.6s. Walls go ON the lane (even on bridges) to stall
  the horde — stalled enemies chew through at ~20/s, so cover walls with guns.
  Tower shots fly over walls.
- Leakers cost lives (Grunt 1, Roller 1, Brute 3, Golem 10). Lose at 0 lives.
- Pit falls award +50% bonus gold.

## Tech notes

- `shared`-style single source: `src/map.ts` generates colliders + meshes from one layout.
- Enemies are dynamic Rapier bodies steered toward waypoints each fixed step.
- Projectiles are pooled dynamic balls; damage + impulse on first contact.
- Fixed 60Hz sim accumulator in `main.ts`, render interpolation-free (bodies synced directly).
- `window.__td` exposes `info()`, `startWave()`, `place()` for e2e.
