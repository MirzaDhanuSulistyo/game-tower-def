import * as THREE from 'three';
import {
  EARLY_CALL_BONUS,
  ENEMIES,
  GRID,
  LEVEL_NAMES,
  PIT_BONUS_MULT,
  START_GOLD,
  START_LIVES,
  TOTAL_LEVELS,
  TOTAL_WAVES,
  TOWERS,
  UPGRADE_COST,
  waveComp,
  type EnemyKind,
  type TowerKind,
} from './config';
import { ENEMY_BITS, ENEMY_GHOST_BITS, Physics } from './physics';
import { buildScenery, distToSeg, getLayout, isBuildable, isOnBridge, snap, type MapLayout } from './map';
import { makeEnemyMesh, makeProjectileMesh, makeRangeRing, makeTowerMesh, setHpBar } from './entities';
import type { Effects } from './effects';
import type { SoundKit } from './audio';
import type { UI } from './ui';
import type RAPIER from '@dimforge/rapier3d-compat';

export type GameState = 'start' | 'playing' | 'won' | 'lost' | 'levelclear';

interface TowerRec {
  id: number;
  kind: TowerKind;
  level: number;
  pos: THREE.Vector3;
  group: THREE.Group;
  cooldown: number;
  hp: number;
  maxHp: number;
  collider: number;
  body: RAPIER.RigidBody;
  rangeRing: THREE.Mesh | null;
}

interface EnemyRec {
  id: number;
  kind: EnemyKind;
  body: RAPIER.RigidBody;
  collider: number;
  group: THREE.Group;
  hp: number;
  maxHp: number;
  speed: number;
  reward: number;
  lives: number;
  wp: number;
  slowT: number;
  slowF: number;
  alive: boolean;
  anim: number;
  stuckT: number;
  winX: number;
  winZ: number;
  winT: number;
  laneOff: number;
  ghostT: number;
}

interface ProjRec {
  id: number;
  kind: TowerKind;
  body: RAPIER.RigidBody;
  collider: number;
  mesh: THREE.Mesh;
  damage: number;
  impulse: number;
  splash: number;
  slowF: number;
  slowT: number;
  life: number;
  alive: boolean;
}

interface SpawnItem {
  kind: EnemyKind;
  hpMult: number;
  delay: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

let nextId = 1;

export class Game {
  state: GameState = 'start';
  gold = START_GOLD;
  lives = START_LIVES;
  wave = 0;
  level = 1;
  speedMult = 1;

  layout: MapLayout = getLayout(1);
  physics = new Physics();
  private towers = new Map<number, TowerRec>();
  private enemies = new Map<number, EnemyRec>();
  private projs = new Map<number, ProjRec>();
  private byCollider = new Map<number, { tag: 'enemy' | 'proj' | 'tower'; id: number }>();

  private spawnQueue: SpawnItem[] = [];
  private spawnT = 0;
  spawning = false;

  buildSel: TowerKind | null = null;
  selTower: number | null = null;
  ghost: THREE.Mesh | null = null;
  ghostRing: THREE.Mesh | null = null;
  ghostPos = V();
  ghostOk = false;

  // camera rig
  camTarget = V(0, 0, -1);
  camZoom = 1;

  private time = 0;
  private tmpA = V();
  private tmpB = V();
  private crest: THREE.Object3D | null = null;
  /** Economy snapshot at level start — retry restores it. */
  private levelSnap = { gold: START_GOLD, lives: START_LIVES };

  constructor(
    private scene: THREE.Scene,
    private effects: Effects,
    private sound: SoundKit,
    private ui: UI,
  ) {
    this.loadLevel(1, 'fresh');
    this.state = 'start';
    this.refreshUI();
  }

  /* ---------------------------- setup ---------------------------- */

  /**
   * Load a campaign level (new lane path): clears entities, swaps physics
   * statics + scenery, then applies the economy mode:
   * fresh = new campaign · carry = next level (tower refund + top-ups) ·
   * keep = retry (economy already restored from snapshot).
   */
  loadLevel(level: number, mode: 'fresh' | 'carry' | 'keep'): void {
    if (mode === 'carry') {
      // Towers don't transfer between lanes — refund at sell rate.
      for (const t of this.towers.values()) {
        const spent = TOWERS[t.kind].cost
          + (t.level > 1 ? UPGRADE_COST[t.kind][0] : 0)
          + (t.level > 2 ? UPGRADE_COST[t.kind][1] : 0);
        this.gold += Math.floor(spent * 0.7);
      }
    }
    for (const e of this.enemies.values()) this.removeEnemy(e, false);
    for (const p of this.projs.values()) this.removeProj(p);
    for (const t of this.towers.values()) this.removeTower(t);
    this.enemies.clear();
    this.projs.clear();
    this.towers.clear();
    this.byCollider.clear();

    this.level = level;
    this.layout = getLayout(level);
    this.physics.clearStatics();
    this.buildStaticColliders();
    buildScenery(this.scene, this.layout, level * 101 + 7);
    this.crest = this.scene.getObjectByName('keep-crest') ?? null;

    if (mode === 'fresh') {
      this.gold = START_GOLD;
      this.lives = START_LIVES;
    } else if (mode === 'carry') {
      // Completion bonus + top-ups so a new lane is always starts-able.
      this.gold += 50 + 25 * (level - 1);
      if (this.gold < START_GOLD) this.gold = START_GOLD;
      this.lives = Math.min(START_LIVES, this.lives + 6);
      // Fresh defense needs a fresh build ghost/selection.
      this.setBuildSel(null);
    }
    this.wave = 0;
    this.spawnQueue = [];
    this.spawning = false;
    this.waveCleared = true;
    this.selTower = null;
    this.ui.hideSelection();
    this.levelSnap = { gold: Math.floor(this.gold), lives: Math.ceil(this.lives) };
    this.refreshUI();
  }

  private buildStaticColliders(): void {
    const { pit } = this.layout;
    const B = 26;
    // Physics tiles overlap generously: abutting static boxes leave a
    // hairline crack that grabs sliding bodies, so every slab is grown
    // 0.15 into its neighbors (visuals stay abutting — no z-fighting).
    const G = 0.15;
    interface Slab { x0: number; x1: number; z0: number; z1: number }
    const slabs: Slab[] = [
      { x0: -B - G, x1: B + G, z0: pit.maxZ - G, z1: B + G },
      { x0: -B - G, x1: B + G, z0: -B - G, z1: pit.minZ + G },
      { x0: -B - G, x1: pit.minX + G, z0: pit.minZ - G, z1: pit.maxZ + G },
      { x0: pit.maxX - G, x1: B + G, z0: pit.minZ - G, z1: pit.maxZ + G },
    ];
    for (const s of slabs) {
      const w = s.x1 - s.x0;
      const d = s.z1 - s.z0;
      this.physics.addStaticBox(w / 2, 0.5, d / 2, (s.x0 + s.x1) / 2, -0.5, (s.z0 + s.z1) / 2);
    }
    // Deck physics tops are flush with the banks (top 0): no lip to jam
    // the lane. Visual decks sit slightly proud (topY) to avoid z-fighting;
    // the 3cm visual step is stepped over without noticing.
    for (const br of this.layout.bridges) {
      this.physics.addStaticBox(
        (br.maxX - br.minX) / 2, 0.25, (br.maxZ - br.minZ) / 2,
        (br.minX + br.maxX) / 2, -0.25, (br.minZ + br.maxZ) / 2, 0.95,
      );
    }
    // Keep plinth so stray shots collide.
    this.physics.addStaticBox(1.7, 1.3, 1.7, this.layout.keep[0], 1.3, this.layout.keep[2]);
  }

  start(): void {
    this.loadLevel(1, 'fresh');
    this.state = 'playing';
    this.ui.showPlaying();
    this.ui.toast(`Level 1: ${LEVEL_NAMES[0]} — build, then press Start wave`);
    this.sound.horn();
  }

  reset(): void {
    this.loadLevel(1, 'fresh');
    this.refreshUI();
  }

  retry(): void {
    // Restore the level-start economy, then reload the same lane.
    this.gold = this.levelSnap.gold;
    this.lives = this.levelSnap.lives;
    this.loadLevel(this.level, 'keep');
    this.state = 'playing';
    this.ui.showPlaying();
  }

  /** Advance to the next lane after a level clear. */
  nextLevel(): void {
    if (this.state !== 'levelclear' || this.level >= TOTAL_LEVELS) return;
    this.loadLevel(this.level + 1, 'carry');
    this.state = 'playing';
    this.ui.showPlaying();
    this.ui.toast(`Level ${this.level}: ${LEVEL_NAMES[this.level - 1]} — new lane, same war`);
    this.sound.horn();
  }

  /* ---------------------------- building ---------------------------- */

  setBuildSel(kind: TowerKind | null): void {
    this.buildSel = kind;
    this.selTower = null;
    this.ui.hideSelection();
    this.clearGhost();
    if (kind) this.makeGhost(kind);
  }

  private makeGhost(kind: TowerKind): void {
    const def = TOWERS[kind];
    const ok = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.4, 16),
      new THREE.MeshBasicMaterial({ color: '#58e06b', transparent: true, opacity: 0.4, depthWrite: false }),
    );
    ok.position.y = 0.2;
    this.scene.add(ok);
    this.ghost = ok;
    if (def.range > 0) {
      const ring = makeRangeRing(def.range);
      this.scene.add(ring);
      this.ghostRing = ring;
    }
  }

  private clearGhost(): void {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (this.ghostRing) { this.scene.remove(this.ghostRing); this.ghostRing = null; }
  }

  moveGhost(x: number, z: number): void {
    if (!this.ghost || !this.buildSel) return;
    const gx = snap(x);
    const gz = snap(z);
    this.ghostPos.set(gx, 0, gz);
    this.ghost.position.set(gx, 0.2, gz);
    if (this.ghostRing) this.ghostRing.position.set(gx, 0.06, gz);
    this.ghostOk = this.canPlace(this.buildSel, gx, gz).ok;
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(this.ghostOk ? '#58e06b' : '#ff5b5b');
  }

  hideGhost(): void {
    if (this.ghost) this.ghost.visible = false;
    if (this.ghostRing) this.ghostRing.visible = false;
  }

  showGhost(): void {
    if (this.ghost) this.ghost.visible = true;
    if (this.ghostRing) this.ghostRing.visible = true;
  }

  canPlace(kind: TowerKind, gx: number, gz: number): { ok: boolean; reason: string } {
    const base = isBuildable(gx, gz, this.layout);
    if (!base.ok) {
      // Walls are the blockers: they may sit ON the lane, including on bridge
      // decks over the void (the choke point). Guns must stay off-path and
      // off-bridge. Walls still can't crowd the spawn/keep.
      if (kind === 'wall' && (base.reason === 'On the path' || base.reason === 'Over the canyon')) {
        if (base.reason === 'Over the canyon' && !isOnBridge(gx, gz, this.layout)) {
          return base;
        }
        if (Math.hypot(gx - this.layout.keep[0], gz - this.layout.keep[2]) < 3.2) {
          return { ok: false, reason: 'Too close to keep' };
        }
        if (Math.hypot(gx - this.layout.spawn[0], gz - this.layout.spawn[2]) < 3.2) {
          return { ok: false, reason: 'Too close to portal' };
        }
        // fall through to occupancy/gold checks below
      } else {
        return base;
      }
    }
    for (const t of this.towers.values()) {
      if (Math.hypot(t.pos.x - gx, t.pos.z - gz) < GRID * 0.9) return { ok: false, reason: 'Occupied' };
    }
    if (TOWERS[kind].cost > this.gold) return { ok: false, reason: 'Not enough gold' };
    return { ok: true, reason: '' };
  }

  tryPlace(): boolean {
    if (!this.buildSel || this.state !== 'playing') return false;
    const kind = this.buildSel;
    const gx = this.ghostPos.x;
    const gz = this.ghostPos.z;
    const chk = this.canPlace(kind, gx, gz);
    if (!chk.ok) {
      this.ui.toast(chk.reason);
      return false;
    }
    this.gold -= TOWERS[kind].cost;
    const id = nextId++;
    const group = makeTowerMesh(kind, 1);
    group.position.set(gx, 0, gz);
    this.scene.add(group);
    const hp = kind === 'wall' ? 160 : 80;
    // Walls block enemies physically; gun towers are off-path anchors with no
    // collider so freshly spawned shells can never clip their own tower.
    const spawned = kind === 'wall'
      ? this.physics.spawnStaticBox(1.9, 1.8, 1.9, [gx, 0.9, gz])
      : this.physics.spawnAnchor([gx, 0, gz]);
    const rec: TowerRec = {
      id, kind, level: 1, pos: V(gx, 0, gz), group,
      cooldown: 0, hp, maxHp: hp,
      collider: spawned.collider, body: spawned.body, rangeRing: null,
    };
    this.towers.set(id, rec);
    if (spawned.collider >= 0) this.byCollider.set(spawned.collider, { tag: 'tower', id });
    this.effects.dust(V(gx, 1, gz), '#c9bfa8', 8);
    this.sound.build();
    this.refreshUI();
    return true;
  }

  clickSelect(world: THREE.Vector3): boolean {
    // Returns true if a tower was selected.
    let best: TowerRec | null = null;
    let bestD = 2.2;
    for (const t of this.towers.values()) {
      const d = Math.hypot(t.pos.x - world.x, t.pos.z - world.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) {
      this.selTower = best.id;
      this.showTowerPanel(best);
      this.sound.click();
      return true;
    }
    this.selTower = null;
    this.ui.hideSelection();
    return false;
  }

  private showTowerPanel(t: TowerRec): void {
    const def = TOWERS[t.kind];
    const dmg = this.towerDamage(t).toFixed(t.kind === 'gatling' ? 1 : 0);
    const title = `${def.name} Lv${t.level}${t.kind === 'wall' ? ` · ${Math.ceil(t.hp)}/${t.maxHp} HP` : ''}`;
    const desc = t.kind === 'wall'
      ? def.desc
      : `DMG ${dmg} · RNG ${this.towerRange(t).toFixed(1)} · ${def.desc}`;
    if (t.level >= 3) {
      this.ui.showSelection(title, desc, 'Max level', false);
      return;
    }
    const cost = UPGRADE_COST[t.kind][t.level - 1];
    this.ui.showSelection(title, desc, `Upgrade (${cost}g)`, this.gold >= cost);
  }

  upgradeSelected(): void {
    const t = this.selTower !== null ? this.towers.get(this.selTower) ?? null : null;
    if (!t || t.level >= 3) return;
    const cost = UPGRADE_COST[t.kind][t.level - 1];
    if (this.gold < cost) {
      this.ui.toast('Not enough gold');
      return;
    }
    this.gold -= cost;
    t.level++;
    // Rebuild mesh to show pips.
    this.scene.remove(t.group);
    t.group = makeTowerMesh(t.kind, t.level);
    t.group.position.copy(t.pos);
    this.scene.add(t.group);
    if (t.kind === 'wall') {
      t.maxHp = 160 * (1 + 0.6 * (t.level - 1));
      t.hp = t.maxHp;
    }
    this.effects.ring(V(t.pos.x, 1, t.pos.z), '#ffd257');
    this.sound.upgrade();
    this.showTowerPanel(t);
    this.refreshUI();
  }

  sellSelected(): void {
    const t = this.selTower !== null ? this.towers.get(this.selTower) ?? null : null;
    if (!t) return;
    const spent = TOWERS[t.kind].cost + (t.level > 1 ? UPGRADE_COST[t.kind][0] : 0) + (t.level > 2 ? UPGRADE_COST[t.kind][1] : 0);
    this.gold += Math.floor(spent * 0.7);
    this.effects.dust(V(t.pos.x, 1, t.pos.z), '#8b95a5', 10);
    this.removeTower(t);
    this.towers.delete(t.id);
    this.byCollider.delete(t.collider);
    this.selTower = null;
    this.ui.hideSelection();
    this.sound.click();
    this.refreshUI();
  }

  closeSelection(): void {
    this.selTower = null;
    this.ui.hideSelection();
  }

  private removeTower(t: TowerRec): void {
    this.scene.remove(t.group);
    this.physics.removeCollider(t.collider, t.body);
    if (t.rangeRing) this.scene.remove(t.rangeRing);
  }

  towerRange(t: TowerRec): number {
    return TOWERS[t.kind].range * (1 + 0.12 * (t.level - 1));
  }

  towerDamage(t: TowerRec): number {
    return TOWERS[t.kind].damage * (1 + 0.55 * (t.level - 1));
  }

  towerCooldown(t: TowerRec): number {
    return TOWERS[t.kind].cooldown * (t.level > 1 ? 0.9 : 1) * (t.level > 2 ? 0.88 : 1);
  }

  /* ---------------------------- waves ---------------------------- */

  startWave(): void {
    if (this.state !== 'playing' || this.spawning || this.wave >= TOTAL_WAVES) return;
    if (this.enemies.size > 0) {
      this.gold += EARLY_CALL_BONUS;
      this.ui.toast(`Early call +${EARLY_CALL_BONUS}g!`);
    }
    this.wave++;
    const comp = waveComp(this.wave, this.level);
    const queue: SpawnItem[] = [];
    // Interleave groups.
    const maxLen = Math.max(...comp.map((g) => g.count));
    for (let i = 0; i < maxLen; i++) {
      for (const g of comp) {
        if (i < g.count) queue.push({ kind: g.kind, hpMult: g.hpMult, delay: g.interval });
      }
    }
    this.spawnQueue = queue;
    this.spawnT = 0.5;
    this.spawning = true;
    this.sound.horn();
    this.refreshUI();
  }

  private spawnEnemy(kind: EnemyKind, hpMult: number): void {
    const def = ENEMIES[kind];
    const s = this.layout.spawn;
    const jx = (Math.random() - 0.5) * 1.2;
    const jz = (Math.random() - 0.5) * 1.2;
    const pos: [number, number, number] = [s[0] + jx, 1.2, s[2] + jz];
    const spawned = def.ball
      ? this.physics.spawnEnemyBall(def.radius, pos, def.density)
      : this.physics.spawnEnemyBox(def.radius * 1.5, def.height, def.radius * 1.5, pos, def.density);
    const group = makeEnemyMesh(kind);
    group.position.set(pos[0], 0, pos[2]);
    this.scene.add(group);
    const id = nextId++;
    const hp = Math.round(def.hp * hpMult);
    const rec: EnemyRec = {
      id, kind, body: spawned.body, collider: spawned.collider, group,
      hp, maxHp: hp, speed: def.speed * (0.92 + Math.random() * 0.16),
      reward: def.reward, lives: def.lives, wp: 1,
      slowT: 0, slowF: 0, alive: true, anim: Math.random() * Math.PI * 2, stuckT: 0,
      winX: pos[0], winZ: pos[2], winT: 0,
      laneOff: [-0.35, 0, 0.35][id % 3], ghostT: 0,
    };
    this.enemies.set(id, rec);
    this.byCollider.set(spawned.collider, { tag: 'enemy', id });
    this.effects.dust(V(pos[0], 1, pos[2]), def.color, 4);
  }

  private removeEnemy(e: EnemyRec, effect = true): void {
    if (!e.alive) return;
    e.alive = false;
    if (effect) this.scene.remove(e.group);
    else this.scene.remove(e.group);
    this.physics.removeCollider(e.collider, e.body);
    this.byCollider.delete(e.collider);
    this.enemies.delete(e.id);
  }

  /* ---------------------------- combat ---------------------------- */

  private fireTower(t: TowerRec, target: EnemyRec): void {
    const def = TOWERS[t.kind];
    const tp = target.body.translation();
    const tlv = target.body.linvel();
    const dx0 = tp.x - t.pos.x;
    const dz0 = tp.z - t.pos.z;
    const dist = Math.hypot(dx0, dz0);
    if (dist < 0.001) return;
    // Lead the target: predict half the time-of-flight.
    const tof = dist / Math.max(1, def.projSpeed);
    const px = tp.x + tlv.x * tof * 0.6;
    const pz = tp.z + tlv.z * tof * 0.6;
    const py = tp.y + 0.25;
    // Muzzle: offset forward from the tower hub so the shell spawns in open
    // air ahead of the barrel, never inside tower geometry.
    const yaw = Math.atan2(px - t.pos.x, pz - t.pos.z);
    const hx = Math.sin(yaw);
    const hz = Math.cos(yaw);
    const muzzleY = t.kind === 'mortar' ? 1.9 : 1.6;
    const muzzle = this.tmpA.set(t.pos.x + hx * 1.25, muzzleY, t.pos.z + hz * 1.25);
    const dir = V(px - muzzle.x, py - muzzle.y, pz - muzzle.z).normalize();
    const spawned = this.physics.spawnProjectile(t.kind === 'gatling' ? 0.16 : 0.28, [muzzle.x, muzzle.y, muzzle.z]);
    const vel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
    if (t.kind === 'mortar') {
      const hdir = V(px - muzzle.x, 0, pz - muzzle.z).normalize();
      const up = 7.5 + dist * 0.5;
      vel.x = hdir.x * def.projSpeed * 0.8;
      vel.z = hdir.z * def.projSpeed * 0.8;
      vel.y = up;
    } else {
      vel.x = dir.x * def.projSpeed;
      vel.y = dir.y * def.projSpeed;
      vel.z = dir.z * def.projSpeed;
    }
    spawned.body.setLinvel(vel, true);
    const mesh = makeProjectileMesh(t.kind);
    mesh.position.copy(muzzle);
    this.scene.add(mesh);
    const id = nextId++;
    const rec: ProjRec = {
      id, kind: t.kind, body: spawned.body, collider: spawned.collider, mesh,
      damage: this.towerDamage(t), impulse: def.impulse * (1 + 0.3 * (t.level - 1)),
      splash: def.splash * (1 + 0.15 * (t.level - 1)),
      slowF: def.slowFactor, slowT: def.slowTime,
      life: 3.2, alive: true,
    };
    this.projs.set(id, rec);
    this.byCollider.set(spawned.collider, { tag: 'proj', id });
    // Aim the head with explicit yaw (+Z toward target). Never use
    // Object3D.lookAt on a child — with a translated parent and a stale
    // matrixWorld it yields a 180°-flipped barrel ("shooting backward").
    const head = t.group.getObjectByName('head');
    if (head) head.rotation.y = yaw;
    this.effects.muzzle(muzzle, def.color);
    this.sound.shoot(t.kind);
  }

  private damageEnemy(e: EnemyRec, dmg: number, from?: THREE.Vector3, impulse = 0, slowF = 0, slowT = 0): void {
    if (!e.alive) return;
    e.hp -= dmg;
    if (slowT > 0) {
      e.slowT = Math.max(e.slowT, slowT);
      e.slowF = Math.max(e.slowF, slowF);
    }
    if (from && impulse > 0) {
      const def = ENEMIES[e.kind];
      const p = e.body.translation();
      this.tmpA.set(p.x - from.x, 0.6, p.z - from.z);
      if (this.tmpA.lengthSq() < 0.01) this.tmpA.set(0, 1, 0);
      this.tmpA.normalize().multiplyScalar(impulse / def.knockResist);
      try {
        e.body.applyImpulse({ x: this.tmpA.x, y: this.tmpA.y, z: this.tmpA.z }, true);
      } catch { /* noop */ }
    }
    const pos = e.group.position.clone();
    pos.y += 0.8;
    if (e.hp <= 0) {
      this.gold += e.reward;
      this.sound.pop();
      this.effects.debris(pos, ENEMIES[e.kind].color, e.kind === 'golem' ? 18 : 8);
      this.effects.dust(pos, '#ffffff', 4);
      if (e.kind === 'brute' || e.kind === 'golem') this.effects.shake(0.25);
      this.removeEnemy(e);
      this.refreshUI();
    } else {
      setHpBar(e.group, e.hp / e.maxHp);
      this.effects.dust(pos, '#ffffff', 2);
    }
  }

  private explodeAt(pos: THREE.Vector3, damage: number, impulse: number, radius: number, slowF: number, slowT: number): void {
    this.effects.ring(pos, '#ffb04a');
    this.effects.dust(pos, '#4a4038', 10);
    this.sound.boom();
    this.effects.shake(0.3);
    for (const e of Array.from(this.enemies.values())) {
      const p = e.body.translation();
      const d = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
      if (d > radius + 0.6) continue;
      const fall = 1 - (d / (radius + 0.6)) * 0.6;
      this.damageEnemy(e, damage * fall, pos, impulse * fall, slowF, slowT);
    }
  }

  private removeProj(p: ProjRec): void {
    if (!p.alive) return;
    p.alive = false;
    this.scene.remove(p.mesh);
    this.physics.removeCollider(p.collider, p.body);
    this.byCollider.delete(p.collider);
    this.projs.delete(p.id);
  }

  /* ---------------------------- fixed step ---------------------------- */

  tick(dt: number): void {
    this.time += dt;
    if (this.crest) this.crest.rotation.y += dt * 1.2;

    if (this.state !== 'playing') {
      this.physics.step();
      return;
    }

    // Spawning.
    if (this.spawning) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.spawnQueue.length > 0) {
        const item = this.spawnQueue.shift();
        if (item) {
          this.spawnEnemy(item.kind, item.hpMult);
          this.spawnT = item.delay * (this.speedMult > 1 ? 0.8 : 1);
        }
      }
      if (this.spawnQueue.length === 0) this.spawning = false;
    }

    // Steering. Positions cached once so neighbor separation is O(n^2)
    // without repeated wasm crossings.
    const spots: Array<{ id: number; x: number; z: number }> = [];
    for (const e of this.enemies.values()) {
      if (!e.alive) continue;
      const tp = e.body.translation();
      spots.push({ id: e.id, x: tp.x, z: tp.z });
    }
    for (const e of this.enemies.values()) {
      if (!e.alive) continue;
      if (e.slowT > 0) e.slowT -= dt;
      // Restore solidity after a pass-through window ends.
      if (e.ghostT > 0) {
        e.ghostT -= dt;
        if (e.ghostT <= 0) {
          try {
            this.physics.world.getCollider(e.collider).setSolverGroups(ENEMY_BITS);
          } catch { /* noop */ }
        }
      }
      const effSpeed = e.speed * (e.slowT > 0 ? 1 - e.slowF : 1);
      const p = e.body.translation();
      // Pit fall.
      if (p.y < -4) {
        const bonus = Math.round(e.reward * PIT_BONUS_MULT);
        this.gold += bonus;
        this.ui.toast(`Pit kill +${bonus}g!`);
        this.sound.coin();
        this.effects.ring(V(p.x, -2, p.z), '#6fd3ff');
        this.removeEnemy(e);
        continue;
      }
      // Over-void safety: anything inside the pit rect but below deck-walking
      // height has slipped off (e.g. hanging on the far slab face) — count it
      // as a pit kill so waves can never stalemate on geometry.
      const pit = this.layout.pit;
      if (
        p.y < 0.35 &&
        p.x > pit.minX && p.x < pit.maxX &&
        p.z > pit.minZ && p.z < pit.maxZ
      ) {
        const bonus = Math.round(e.reward * PIT_BONUS_MULT);
        this.gold += bonus;
        this.sound.coin();
        this.effects.ring(V(p.x, -2, p.z), '#6fd3ff');
        this.removeEnemy(e);
        continue;
      }
      const wps = this.layout.waypoints;
      if (e.wp >= wps.length) {
        this.leak(e);
        continue;
      }
      const wp = wps[e.wp];
      // Per-enemy lateral offset: the column spreads across the lane so
      // followers overtake a stuck leader instead of piling into its back.
      const wdx = wp[0] - p.x;
      const wdz = wp[2] - p.z;
      const wdist = Math.hypot(wdx, wdz);
      let dx = wdx;
      let dz = wdz;
      let dist = wdist;
      if (wdist > 0.01 && e.laneOff !== 0) {
        dx = wdx + (-wdz / wdist) * e.laneOff;
        dz = wdz + (wdx / wdist) * e.laneOff;
        dist = Math.hypot(dx, dz);
      }
      if (wdist < 1.6) {
        e.wp++;
        continue;
      }
      // Anti-stall: cracks, deck toes and pack arches can freeze slow bodies
      // (west lip, slab seam, mid-deck packs) with the queue deadlocked
      // behind. A body that wants to move but can't for >0.6s gets small
      // hops until it breaks free. Lane-only, ~0.11m hops (walls still
      // block), skipped while chewing a wall. Falling bodies are excluded
      // three ways — they move fast, drop below the feet window in <0.1s
      // (resetting the timer), and plummet (vy gate) — so canyon kills
      // still work.
      const halfH = ENEMIES[e.kind].ball ? ENEMIES[e.kind].radius : ENEMIES[e.kind].height / 2;
      const feetY = p.y - halfH;
      const lv0 = e.body.linvel();
      const hSpeed0 = Math.hypot(lv0.x, lv0.z);
      if (dist > 1.7 && hSpeed0 < effSpeed * 0.35 && feetY > -0.08) e.stuckT += dt;
      else e.stuckT = 0;
      // Displacement window catches vibrators: knockback-wedged bodies can
      // jitter at high speed without traveling, which resets the timer
      // above forever. Real travel in 0.4s is ~1m+, so <0.3 means pinned.
      e.winT += dt;
      if (e.winT >= 0.4) {
        e.winT = 0;
        const moved = Math.hypot(p.x - e.winX, p.z - e.winZ);
        e.winX = p.x;
        e.winZ = p.z;
        if (dist > 1.7 && moved < 0.3 && feetY > -0.08) e.stuckT = Math.max(e.stuckT, 1);
      }
      if (e.stuckT > 0.6 && feetY < 0.05 && feetY > -0.08 && dist > 1.7 && lv0.y > -1) {
        let nearLane = false;
          for (let i = 0; i < wps.length - 1 && !nearLane; i++) {
            const a = wps[i];
            const c = wps[i + 1];
            // Wide radius: knockback parks bodies off-lane (this stall was
            // 2m south of the centerline) where toes still grab them.
            if (distToSeg(p.x, p.z, a[0], a[2], c[0], c[2]) < 2.5) nearLane = true;
          }
        let onWall = false;
        if (nearLane) {
          for (const t of this.towers.values()) {
            if (t.kind === 'wall' && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 1.9) { onWall = true; break; }
          }
        }
        if (nearLane && !onWall) {
          try {
            // Escalate if wedged deep: 0.11m hops first, 0.46m after 3s.
            // Still far below wall height (1.8m).
            e.body.setLinvel({ x: lv0.x, y: Math.max(lv0.y, e.stuckT > 3 ? 4.5 : 2.2), z: lv0.z }, true);
          } catch { /* noop */ }
        }
      }
      // Last resort: wedged 4s+ despite hops → the pack walks THROUGH for
      // 1.2s instead of piling up behind. Still collides ground/walls/shots.
      if (e.stuckT > 4 && e.ghostT <= 0) {
        e.ghostT = 1.2;
        try {
          this.physics.world.getCollider(e.collider).setSolverGroups(ENEMY_GHOST_BITS);
        } catch { /* noop */ }
      }
      const nx = dx / Math.max(0.001, dist);
      const nz = dz / Math.max(0.001, dist);
      const lv = e.body.linvel();
      const k = ENEMIES[e.kind].ball ? 4.5 : 8;
      let mass = 1;
      try { mass = (e.body as unknown as { mass(): number }).mass() || 1; } catch { mass = 1; }
      const ix = (nx * effSpeed - lv.x) * mass * k * dt;
      const iz = (nz * effSpeed - lv.z) * mass * k * dt;
      // Separation: push apart packed neighbors so 90° corners and bridge
      // entries can't deadlock into a queue. Short-range only.
      let sepx = 0;
      let seppz = 0;
      for (const s of spots) {
        if (s.id === e.id) continue;
        const ddx = p.x - s.x;
        const ddz = p.z - s.z;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 > 0.0001 && d2 < 1.44) {
          const d = Math.sqrt(d2);
          const f = (1.2 - d) / 1.2;
          sepx += (ddx / d) * f;
          seppz += (ddz / d) * f;
        }
      }
      try {
        e.body.applyImpulse({ x: ix + sepx * mass * 26 * dt, y: 0, z: iz + seppz * mass * 26 * dt }, true);
        // Rollers need a push uphill onto bridge; boxes need anti-tip.
        if (!ENEMIES[e.kind].ball && Math.abs(lv.y) > 0.01) {
          e.body.applyImpulse({ x: 0, y: -mass * 2 * dt, z: 0 }, true);
        }
      } catch { /* noop */ }
      // Keep reached? Radius 3.0: the keep's collider face stops bodies
      // ~2+ out, so 1.6 could never trigger and arrivals piled up forever.
      if (e.wp >= wps.length - 1 && dist < 3.0) {
        this.leak(e);
      }
    }

    // Towers.
    for (const t of this.towers.values()) {
      if (t.kind === 'wall') continue;
      // Idle animation: frost crystal + halo slowly spin.
      if (t.kind === 'frost') {
        const spin = t.group.getObjectByName('spin');
        if (spin) spin.rotation.y += dt * 1.6;
      }
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const range = this.towerRange(t);
      let best: EnemyRec | null = null;
      let bestD = range;
      let bestProgress = -1;
      for (const e of this.enemies.values()) {
        const p = e.body.translation();
        const d = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
        if (d > range) continue;
        // Prefer furthest along path (highest wp, then closest to next wp).
        const score = e.wp * 100 - Math.hypot(p.x - this.layout.waypoints[Math.min(e.wp, this.layout.waypoints.length - 1)][0], p.z - this.layout.waypoints[Math.min(e.wp, this.layout.waypoints.length - 1)][2]);
        if (score > bestProgress || (score === bestProgress && d < bestD)) {
          bestProgress = score;
          best = e;
          bestD = d;
        }
      }
      if (best) {
        this.fireTower(t, best);
        t.cooldown = Math.max(0.12, this.towerCooldown(t));
      }
    }

    this.physics.step();
    this.handleCollisions();

    // Projectiles aging + mesh sync.
    for (const p of Array.from(this.projs.values())) {
      p.life -= dt;
      const t = p.body.translation();
      if (p.life <= 0 || t.y < -8) {
        this.removeProj(p);
        continue;
      }
      p.mesh.position.set(t.x, t.y, t.z);
    }
    for (const e of this.enemies.values()) {
      const t = e.body.translation();
      // Sanity clamp: knockback scales with 1/mass, so light balls can take
      // ~100 m/s hits and leave orbit (observed y=58). Cap keeps launches
      // spectacular but on the map; pit knock-ins only need a few m/s.
      const lvC = e.body.linvel();
      const hsC = Math.hypot(lvC.x, lvC.z);
      if (hsC > 14 || lvC.y > 16 || lvC.y < -20) {
        const f = hsC > 14 ? 14 / hsC : 1;
        try {
          e.body.setLinvel(
            { x: lvC.x * f, y: Math.min(16, Math.max(-20, lvC.y)), z: lvC.z * f },
            true,
          );
        } catch { /* noop */ }
      }
      // Rollers ride 0.04 higher: their tire bottom would otherwise sit
      // below the lane surface and read as "sunk". Boxes keep the old base.
      const baseY = ENEMIES[e.kind].ball ? Math.max(0.04, t.y - 0.5) : Math.max(0, t.y - 0.5);
      e.group.position.set(t.x, baseY, t.z);
      const lv = e.body.linvel();
      const sp = Math.hypot(lv.x, lv.z);
      if (ENEMIES[e.kind].ball) {
        // Rollers: yaw the chassis toward travel and spin the wheel child.
        // Speed-scaled spin = rolling; plus a small chassis bob at speed.
        if (sp > 0.4) {
          const yaw = Math.atan2(lv.x, lv.z);
          let d = yaw - e.group.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          e.group.rotation.y += d * Math.min(1, dt * 8);
        }
        const wheel = e.group.getObjectByName('wheel');
        if (wheel) wheel.rotation.x += (sp / Math.max(0.2, ENEMIES[e.kind].radius)) * dt;
        e.anim += dt * (4 + sp * 1.5);
        e.group.position.y += Math.sin(e.anim) * 0.02 * Math.min(1, sp / 3);
      } else {
        // Face travel direction smoothly (model forward is +Z).
        if (sp > 0.4) {
          const yaw = Math.atan2(lv.x, lv.z);
          let d = yaw - e.group.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          e.group.rotation.y += d * Math.min(1, dt * 8);
        }
        // Walk cycle: phase advances with actual speed so frost/slows and
        // stalls visibly slow the stride; amplitude fades to idle at rest.
        e.anim += dt * (3 + sp * 2.4);
        const amp = Math.min(1, sp / 1.5);
        const stride = e.kind === 'golem' ? 0.38 : e.kind === 'brute' ? 0.55 : 0.65;
        const armSwing = e.kind === 'golem' ? 0.3 : 0.55;
        const s1 = Math.sin(e.anim) * stride * amp;
        const s2 = Math.sin(e.anim + Math.PI) * stride * amp;
        const legL = e.group.getObjectByName('legL');
        const legR = e.group.getObjectByName('legR');
        const armL = e.group.getObjectByName('armL');
        const armR = e.group.getObjectByName('armR');
        if (legL) legL.rotation.x = s1;
        if (legR) legR.rotation.x = s2;
        if (armL) armL.rotation.x = s2 * (armSwing / Math.max(0.01, stride));
        if (armR) armR.rotation.x = s1 * (armSwing / Math.max(0.01, stride));
        // Bob + heavy-unit sway.
        e.group.position.y += Math.abs(Math.cos(e.anim)) * 0.06 * amp;
        e.group.rotation.z = e.kind === 'golem'
          ? Math.sin(e.anim) * 0.035 * amp
          : e.kind === 'brute'
            ? Math.sin(e.anim) * 0.02 * amp
            : 0;
      }
      if (e.slowT > 0) {
        // Frost tint pulse.
        e.group.position.y += Math.sin(this.time * 12) * 0.008;
      }
    }

    // Walls under attack: capped DPS so a full pack doesn't insta-melt a
    // wall, but a stalled horde still chews through. Stalled = blocked head-on.
    for (const t of Array.from(this.towers.values())) {
      if (t.kind !== 'wall') continue;
      let stalledN = 0;
      let grindN = 0;
      let bruteMult = 0;
      for (const e of this.enemies.values()) {
        const p = e.body.translation();
        if (Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < 1.7) {
          const lv = e.body.linvel();
          const stalled = Math.hypot(lv.x, lv.z) < e.speed * 0.35;
          if (stalled) stalledN++;
          else grindN++;
          bruteMult = Math.max(bruteMult, e.kind === 'brute' ? 2.5 : e.kind === 'golem' ? 5 : 1);
        }
      }
      const attackers = stalledN + grindN;
      if (attackers > 0) {
        // 20/s stalled + 6/s grind, +25% per extra attacker, brutes hit harder.
        const dps = (stalledN > 0 ? 20 : 0) + (grindN > 0 ? 6 : 0);
        const scaled = dps * (1 + 0.25 * (attackers - 1)) * (1 + (bruteMult - 1) * 0.5);
        t.hp -= scaled * dt;
        if (t.hp <= 0) {
          this.effects.debris(V(t.pos.x, 1, t.pos.z), '#8b95a5', 12);
          this.sound.pop();
          this.ui.toast('Wall destroyed!');
          this.removeTower(t);
          this.towers.delete(t.id);
          this.byCollider.delete(t.collider);
          if (this.selTower === t.id) {
            this.selTower = null;
            this.ui.hideSelection();
          }
          continue;
        }
        // Hit feedback on a timer (reuses the unused gun cooldown field).
        t.cooldown -= dt;
        if (t.cooldown <= 0) {
          t.cooldown = 0.45;
          this.tmpA.set(t.pos.x + (Math.random() - 0.5), 1.4, t.pos.z + (Math.random() - 0.5));
          this.effects.dust(this.tmpA, '#9aa3b2', 3);
          if (this.selTower === t.id) this.showTowerPanel(t);
        }
      }
    }

    // Wave cleared?
    if (!this.spawning && this.spawnQueue.length === 0 && this.enemies.size === 0 && this.wave > 0 && this.state === 'playing') {
      // Only trigger once per wave: wave stays until next startWave.
      if (!this.waveCleared) {
        this.waveCleared = true;
        const bonus = 20 + this.wave * 5;
        this.gold += bonus;
        this.ui.toast(`Wave ${this.wave} cleared +${bonus}g`);
        this.sound.coin();
        if (this.wave >= TOTAL_WAVES) {
          this.levelClear();
        }
        this.refreshUI();
      }
    } else if (this.spawning || this.enemies.size > 0) {
      this.waveCleared = false;
    }

    this.refreshDynamicUI();
  }

  private waveCleared = true;

  private leak(e: EnemyRec): void {
    this.lives -= e.lives;
    this.sound.leak();
    this.effects.shake(0.35);
    this.effects.dust(V(this.layout.keep[0], 2, this.layout.keep[2]), '#ff5b5b', 10);
    this.removeEnemy(e);
    if (this.lives <= 0) {
      this.lives = 0;
      this.lose();
    }
    this.refreshUI();
    if (this.lives <= 5 && this.lives > 0) this.ui.toast(`Only ${Math.ceil(this.lives)} lives left!`);
  }

  private handleCollisions(): void {
    const hits: Array<[number, number]> = [];
    this.physics.drainCollisions((h1, h2, started) => {
      if (started) hits.push([h1, h2]);
    });
    for (const [h1, h2] of hits) {
      const a = this.byCollider.get(h1);
      const b = this.byCollider.get(h2);
      if (!a || !b) continue;
      // Projectile vs enemy.
      let projEntry: { tag: 'enemy' | 'proj' | 'tower'; id: number } | undefined;
      let otherEntry: { tag: 'enemy' | 'proj' | 'tower'; id: number } | undefined;
      if (a.tag === 'proj' && b.tag === 'enemy') { projEntry = a; otherEntry = b; }
      else if (b.tag === 'proj' && a.tag === 'enemy') { projEntry = b; otherEntry = a; }
      if (projEntry && otherEntry) {
        const p = this.projs.get(projEntry.id);
        const e = this.enemies.get(otherEntry.id);
        if (!p || !e || !p.alive || !e.alive) continue;
        const impact = p.mesh.position.clone();
        if (p.splash > 0) {
          this.explodeAt(impact, p.damage, p.impulse, p.splash, p.slowF, p.slowT);
        } else {
          if (p.slowT > 0) this.effects.dust(impact, '#bdf3ff', 6);
          this.damageEnemy(e, p.damage, impact, p.impulse, p.slowF, p.slowT);
          if (p.kind === 'cannon') {
            this.effects.shake(0.12);
            this.sound.splash();
          }
        }
        this.removeProj(p);
        continue;
      }
      // Projectile vs anything else (ground/tower/keep) -> impact.
      const soloProj = a.tag === 'proj' ? this.projs.get(a.id) : b.tag === 'proj' ? this.projs.get(b.id) : undefined;
      if (soloProj && soloProj.alive) {
        const impact = soloProj.mesh.position.clone();
        // Only explode on real impact after some flight time.
        if (soloProj.life < 3.0) {
          if (soloProj.splash > 0) {
            this.explodeAt(impact, soloProj.damage, soloProj.impulse, soloProj.splash, soloProj.slowF, soloProj.slowT);
          } else {
            this.effects.dust(impact, '#c9bfa8', 4);
          }
          this.removeProj(soloProj);
        }
      }
    }
  }

  private refreshUI(): void {
    this.ui.setGold(this.gold);
    this.ui.setLives(this.lives);
    this.ui.setWave(this.wave);
    this.ui.setLevel(this.level);
    const costs: Record<string, number> = {
      cannon: TOWERS.cannon.cost,
      gatling: TOWERS.gatling.cost,
      frost: TOWERS.frost.cost,
      mortar: TOWERS.mortar.cost,
      wall: TOWERS.wall.cost,
    };
    this.ui.refreshAfford(this.gold, costs);
    this.refreshDynamicUI();
  }

  private refreshDynamicUI(): void {
    const left = this.enemies.size + this.spawnQueue.length;
    if (this.wave === 0 && !this.spawning) {
      this.ui.setWaveButton('Start wave', false);
      this.ui.setLeft(null, false);
    } else if (this.spawning) {
      this.ui.setWaveButton(`Wave ${this.wave}… (${left} left)`, true);
      this.ui.setLeft(left, true);
    } else if (left > 0) {
      this.ui.setWaveButton(`Call wave ${this.wave + 1} (+${EARLY_CALL_BONUS}g)`, this.wave >= TOTAL_WAVES);
      this.ui.setLeft(left, false);
    } else if (this.wave < TOTAL_WAVES) {
      this.ui.setWaveButton(`Start wave ${this.wave + 1}`, false);
      this.ui.setLeft(0, false);
    } else {
      this.ui.setWaveButton('Done', true);
      this.ui.setLeft(0, false);
    }
    this.ui.setWave(this.wave);
    this.ui.setGold(this.gold);
    this.ui.setLives(this.lives);
  }

  /** All waves of the lane cleared: campaign victory or next lane. */
  private levelClear(): void {
    if (this.state !== 'playing') return;
    if (this.level >= TOTAL_LEVELS) {
      this.win();
      return;
    }
    this.state = 'levelclear';
    this.sound.victory();
    this.ui.showEnd(
      true,
      `Level ${this.level}/${TOTAL_LEVELS}`,
      this.gold,
      `${LEVEL_NAMES[this.level - 1]} holds! Towers refund 70% on the next lane.`,
      true,
    );
  }

  private win(): void {
    if (this.state !== 'playing') return;
    this.state = 'won';
    this.sound.victory();
    try {
      const best = Number(localStorage.getItem('td.best.level') ?? '0') || 0;
      if (this.level > best) localStorage.setItem('td.best.level', String(this.level));
    } catch { /* private mode */ }
    this.ui.showEnd(true, `Level ${this.level}/${TOTAL_LEVELS}`, this.gold, `All ${TOTAL_LEVELS} lanes hold. The realm is safe!`, false);
  }

  private lose(): void {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    this.sound.defeat();
    this.ui.showEnd(false, `Lv${this.level} · Wave ${this.wave}/${TOTAL_WAVES}`, this.gold, `${LEVEL_NAMES[this.level - 1]} overrun on wave ${this.wave}. Retry the lane.`, false);
  }

  /* ---------------------------- camera ---------------------------- */

  pan(dx: number, dz: number): void {
    this.camTarget.x = clamp(this.camTarget.x + dx, -22, 22);
    this.camTarget.z = clamp(this.camTarget.z + dz, -22, 18);
  }

  zoom(f: number): void {
    this.camZoom = clamp(this.camZoom * f, 0.55, 1.9);
  }

  present(_dt: number, camera: THREE.PerspectiveCamera): void {
    this.effects.update(_dt);
    const z = this.camZoom;
    this.tmpA.set(this.camTarget.x, 25 * z, this.camTarget.z + 23 * z);
    this.effects.shakeOffset(this.tmpB);
    this.tmpA.add(this.tmpB);
    const k = 1 - Math.exp(-_dt * 6);
    camera.position.lerp(this.tmpA, k);
    this.tmpB.set(this.camTarget.x, 0, this.camTarget.z - 2);
    camera.lookAt(this.tmpB);
  }

  info(): { state: GameState; rev: number; gold: number; lives: number; wave: number; level: number; enemies: number; towers: number; spawning: boolean; queue: number; projs: number; foes: Array<{ kind: string; x: number; y: number; z: number; hp: number; wp: number }> } {
    const foes = Array.from(this.enemies.values()).slice(0, 8).map((e) => {
      const p = e.body.translation();
      return {
        kind: e.kind,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        z: Math.round(p.z * 10) / 10,
        hp: Math.round(e.hp),
        wp: e.wp,
      };
    });
    return {
      state: this.state,
      rev: 10,
      gold: Math.floor(this.gold),
      lives: Math.ceil(this.lives),
      wave: this.wave,
      level: this.level,
      enemies: this.enemies.size,
      towers: this.towers.size,
      spawning: this.spawning,
      queue: this.spawnQueue.length,
      projs: this.projs.size,
      foes,
    };
  }
}
