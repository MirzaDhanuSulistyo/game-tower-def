# Submit Rampart Siege to aislopgames.lol

Public GitHub + GitHub Pages. No zip.

`Paste a play URL or upload a static zip` happens if Source is filled and Play URL is empty. The repo URL is not playable — use the Pages URL below.

Paste kit also lives in `/Users/olseraios/Code/aislopgames/submit-kit/CHECKLIST.md` (section 6).

---

## Form (paste)

Log in at https://aislopgames.lol/submit

| Field | Value |
|---|---|
| Title | Rampart Siege |
| Slug | rampart-siege |
| Tagline | Towers that shove. Knock raiders off the bridge. The pit pays extra. |
| Play URL | `https://mirzadhanusulistyo.github.io/game-tower-def/` |
| Zip | **leave empty** (Pages is the play URL) |
| Cover | `cover/cover-landscape.png` |
| Source / GitHub | `https://github.com/MirzaDhanuSulistyo/game-tower-def` |
| Genre | Strategy, Action |
| Engines | Three.js |
| AI tools | **Muse Spark**, Meta AI |
| Slop level | Playable |
| License | Proprietary |
| Embed OK | **on** |
| Wants feedback | **on** |
| NSFW | **off** |

Muse Spark / Meta AI only show on the form after aislopgames is redeployed with those checkboxes. Until then, check **Other** and name them in How it was made.

**Description** (paste):

```
3D physics tower defense. Towers don't just do DPS — they shove, launch, and drop enemies. Knock raiders off the bridge into the canyon for instant kills and +50% bonus gold.

Four towers (Cannon / Gatling / Frost / Mortar) plus a stone Wall, upgrades to Lv3. Four enemies (Raider / Roller / Brute / Golem boss) as real rigid bodies.

Three-lane campaign, each a different path: Canyon Pass (S-curve, 1 bridge), Twin Bridges (canyon crossed twice — out and back), The Gorge (long approach, wide crossing). Enemies gain +35% HP per lane. Clearing a lane refunds towers at 70% (they don't transfer), plus a completion bonus, gold top-up, and +6 lives.

Click a card or press 1–5 to pick a tower, click the ground to place. Click a placed tower to upgrade or sell. Space starts the next wave (early call = +25g). F toggles 2×. WASD or right-drag pans; wheel zooms. Touch works.

Walls go ON the lane (even on bridges) to stall the horde — stalled enemies chew through at ~20/s, so cover walls with guns. Tower shots fly over walls. Leakers cost lives (Raider 1, Roller 1, Brute 3, Golem 10). Lose at 0 lives.

Every mesh, texture, and sound is generated at runtime. Rapier physics. Zero asset downloads.
```

**How it was made:**

```
Wanted tower defense where the cannon actually knocks people into a pit. Muse Spark 1.3 (Meta AI). Rapier enemies, three canyon lanes, zero asset files.
```

---

## Cover

- `cover/cover-landscape.png`

Title is baked in. Cards crop to 16:10 (`object-cover`), so a 16:9 landscape loses a little from the sides.

---

## After you submit

- https://aislopgames.lol/games/rampart-siege

Click **Play**. The start overlay should load *inside* the iframe. Place a Cannon, start a wave.

Updating later: new zip on the listing, or push to Pages if that is the play URL.
