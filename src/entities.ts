import * as THREE from 'three';
import type { EnemyKind, TowerKind } from './config';
import { ENEMIES, TOWERS } from './config';

/* ------------------------------------------------------------------ */
/* Professional procedural asset set.                                  */
/* Conventions: tower muzzles and enemy faces point toward local +Z.   */
/* Tower aim pivots are Groups named 'head' (game sets rotation.y).    */
/* Frost inner spinner is named 'spin'. Roller wheels named 'wheel'.   */
/* Enemy HP bar sprites are named 'hpbg' / 'hpfg'.                     */
/* ------------------------------------------------------------------ */

interface StdOpts {
  emissive?: string;
  ei?: number;
  rough?: number;
  metal?: number;
  flat?: boolean;
}

function std(color: string, opts: StdOpts = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.72,
    metalness: opts.metal ?? 0.12,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.ei ?? 0,
    flatShading: opts.flat ?? false,
  });
}

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0, y = 0, z = 0,
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/* Palette */
const STONE_DARK = '#39424e';
const STONE_MID = '#5b6675';
const STONE_LIGHT = '#8b95a5';
const GUNMETAL = '#2b323c';
const WOOD = '#6b4a2f';
const WOOD_DARK = '#4a3220';
const GOLD = '#ffd257';
const TRIM_GOLD_DIM = '#8a7226';

function plinth(level: number): THREE.Group {
  const g = new THREE.Group();
  // Stepped stone foundation.
  g.add(mesh(new THREE.CylinderGeometry(1.02, 1.18, 0.22, 12), std(STONE_DARK, { rough: 0.95 }), 0, 0.11, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.55, 12), std(STONE_MID, { rough: 0.9 }), 0, 0.48, 0));
  // Trim ring glows once upgraded.
  const ringMat = level >= 2
    ? std(GOLD, { emissive: GOLD, ei: 0.85, rough: 0.4, metal: 0.6 })
    : std(TRIM_GOLD_DIM, { rough: 0.5, metal: 0.5 });
  const ring = mesh(new THREE.TorusGeometry(0.82, 0.055, 8, 24), ringMat, 0, 0.76, 0, false);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  // Level pips on the drum face (+Z).
  for (let i = 0; i < level; i++) {
    const pip = mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      std(GOLD, { emissive: GOLD, ei: 1 }),
      (i - (level - 1) / 2) * 0.22, 0.52, 0.9, false,
    );
    g.add(pip);
  }
  return g;
}

function cannonHead(defColor: string): THREE.Group {
  const head = new THREE.Group();
  const gun = std(GUNMETAL, { rough: 0.38, metal: 0.85 });
  const accent = std(defColor, { emissive: defColor, ei: 0.35, rough: 0.45, metal: 0.4 });
  // Turntable + cradle cheeks.
  head.add(mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.22, 12), gun, 0, -0.12, 0));
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.BoxGeometry(0.14, 0.46, 0.95), std(WOOD_DARK, { rough: 0.85 }), sx * 0.33, 0.12, 0.1));
    // Wheel.
    const wheel = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 12), std(WOOD, { rough: 0.8 }), sx * 0.46, -0.12, -0.15);
    wheel.rotation.z = Math.PI / 2;
    head.add(wheel);
    head.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8), gun, sx * 0.46, -0.12, -0.15));
  }
  // Barrel along +Z with slight elevation.
  const barrel = mesh(new THREE.CylinderGeometry(0.19, 0.3, 1.9, 14), gun, 0, 0.18, 0.5);
  barrel.rotation.x = Math.PI / 2 - 0.1;
  head.add(barrel);
  // Reinforce bands + muzzle brake.
  for (const z of [0.05, 0.55]) {
    const band = mesh(new THREE.TorusGeometry(0.27, 0.05, 8, 18), accent, 0, 0.18 + (z - 0.5) * 0.1, z, false);
    head.add(band);
  }
  const brake = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 14), accent, 0, 0.28, 1.32);
  brake.rotation.x = Math.PI / 2 - 0.1;
  head.add(brake);
  const mouth = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 12), std('#0c0e12', { rough: 0.9 }), 0, 0.29, 1.33, false);
  mouth.rotation.x = Math.PI / 2 - 0.1;
  head.add(mouth);
  // Breech + sight.
  head.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), gun, 0, 0.1, -0.5));
  head.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), std(defColor, { emissive: defColor, ei: 1 }), 0, 0.42, -0.2, false));
  head.name = 'head';
  head.position.y = 1.28;
  return head;
}

function gatlingHead(defColor: string): THREE.Group {
  const head = new THREE.Group();
  const housing = std(defColor, { rough: 0.4, metal: 0.7, emissive: defColor, ei: 0.2 });
  const dark = std(GUNMETAL, { rough: 0.35, metal: 0.85 });
  head.add(mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.3, 12), dark, 0, -0.15, 0));
  head.add(mesh(new THREE.BoxGeometry(0.6, 0.52, 0.85), housing, 0, 0.22, -0.1));
  // Barrel cluster along +Z.
  const barrels = new THREE.Group();
  const offsets: Array<[number, number]> = [[-0.14, 0.1], [0.14, 0.1], [0, 0.32]];
  for (const [ox, oy] of offsets) {
    const b = mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.5, 8), dark, ox, oy, 0.75);
    b.rotation.x = Math.PI / 2;
    barrels.add(b);
    const tip = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8), std('#aef3ff', { emissive: '#66e0ff', ei: 1.4 }), ox, oy, 1.5, false);
    tip.rotation.x = Math.PI / 2;
    barrels.add(tip);
  }
  const collar = mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.35, 10), dark, 0, 0.17, 0.05);
  collar.rotation.x = Math.PI / 2;
  barrels.add(collar);
  head.add(barrels);
  // Top ammo drum + side crank.
  const drum = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 14), dark, 0, 0.62, -0.25);
  drum.rotation.z = Math.PI / 2;
  head.add(drum);
  head.add(mesh(new THREE.BoxGeometry(0.66, 0.1, 0.5), housing, 0, 0.62, -0.25, false));
  head.add(mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), dark, 0.42, 0.1, -0.3));
  head.name = 'head';
  head.position.y = 1.3;
  return head;
}

function frostHead(): THREE.Group {
  const head = new THREE.Group();
  // Runic obelisk handled in body; head is the floating crystal rig.
  const spin = new THREE.Group();
  spin.name = 'spin';
  const crystal = mesh(new THREE.OctahedronGeometry(0.55, 0), std('#bdf3ff', { emissive: '#54d8ff', ei: 1.1, rough: 0.15, metal: 0.1, flat: true }), 0, 0, 0);
  spin.add(crystal);
  spin.add(mesh(new THREE.OctahedronGeometry(0.26, 0), std('#ffffff', { emissive: '#d8f8ff', ei: 1.6, rough: 0.1, flat: true }), 0, 0, 0, false));
  const halo = mesh(new THREE.TorusGeometry(0.78, 0.045, 8, 28), std('#9be8ff', { emissive: '#54d8ff', ei: 0.9 }), 0, 0, 0, false);
  halo.rotation.x = Math.PI / 2 - 0.35;
  spin.add(halo);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const shard = mesh(new THREE.OctahedronGeometry(0.13, 0), std('#d8f8ff', { emissive: '#54d8ff', ei: 1, flat: true }), Math.cos(a) * 0.85, -0.1, Math.sin(a) * 0.85, false);
    spin.add(shard);
  }
  head.add(spin);
  head.name = 'head';
  head.position.y = 2.0;
  return head;
}

function mortarHead(defColor: string): THREE.Group {
  const head = new THREE.Group();
  const tubeMat = std(defColor, { rough: 0.45, metal: 0.65, emissive: defColor, ei: 0.2 });
  const dark = std(GUNMETAL, { rough: 0.4, metal: 0.8 });
  head.add(mesh(new THREE.BoxGeometry(1.15, 0.28, 1.15), std(STONE_DARK, { rough: 0.9 }), 0, -0.42, 0));
  // Stubby tube pitched up toward +Z.
  const tube = mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.25, 14), tubeMat, 0, 0.28, 0.18);
  tube.rotation.x = 0.5;
  head.add(tube);
  const rim = mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 20), dark, 0, 0.28 + 0.625 * Math.cos(0.5), 0.18 + 0.625 * Math.sin(0.5), false);
  rim.rotation.x = 0.5;
  head.add(rim);
  const mouth = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 14), std('#0c0e12', { rough: 0.9 }), 0, 0.28 + 0.63 * Math.cos(0.5), 0.18 + 0.63 * Math.sin(0.5), false);
  mouth.rotation.x = 0.5;
  head.add(mouth);
  head.add(mesh(new THREE.SphereGeometry(0.34, 12, 10), dark, 0, -0.18, -0.35));
  // Bipod legs.
  for (const sx of [-1, 1]) {
    const leg = mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), dark, sx * 0.55, -0.2, 0.35);
    leg.rotation.z = sx * -0.35;
    head.add(leg);
  }
  // Elevation wheel.
  const wheel = mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), dark, 0.55, 0.0, -0.2, false);
  wheel.rotation.y = Math.PI / 2;
  head.add(wheel);
  head.name = 'head';
  head.position.y = 1.25;
  return head;
}

export function makeTowerMesh(kind: TowerKind, level: number): THREE.Group {
  const def = TOWERS[kind];
  const grp = new THREE.Group();

  if (kind === 'wall') {
    const h = 1.5 + (level - 1) * 0.22;
    grp.add(mesh(new THREE.BoxGeometry(2.0, 0.3, 2.0), std(STONE_DARK, { rough: 0.95 }), 0, 0.15, 0));
    grp.add(mesh(new THREE.BoxGeometry(1.9, h, 1.9), std(def.color, { rough: 0.9 }), 0, 0.3 + h / 2, 0));
    // Metal bands.
    for (const y of [0.3 + h * 0.35, 0.3 + h * 0.75]) {
      grp.add(mesh(new THREE.BoxGeometry(1.96, 0.12, 1.96), std(GUNMETAL, { rough: 0.5, metal: 0.7 }), 0, y, 0, false));
    }
    // Crenellations.
    for (const sx of [-0.68, 0, 0.68]) {
      for (const sz of [-0.68, 0.68]) {
        grp.add(mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), std(STONE_LIGHT, { rough: 0.9 }), sx, 0.3 + h + 0.17, sz));
      }
    }
    // Banner with tower gold.
    grp.add(mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), std('#7a2e2e', { rough: 0.85 }), 0, 0.3 + h * 0.55, 0.96, false));
    grp.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.07), std(GOLD, { emissive: GOLD, ei: 0.5 }), 0, 0.3 + h * 0.55 + 0.28, 0.96, false));
    if (level >= 3) {
      for (const sx of [-0.68, 0.68]) {
        grp.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 6), std(GUNMETAL, { metal: 0.8, rough: 0.35 }), sx, 0.3 + h + 0.55, -0.68));
        grp.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 6), std(GUNMETAL, { metal: 0.8, rough: 0.35 }), sx, 0.3 + h + 0.55, 0.68));
      }
    }
    return grp;
  }

  grp.add(plinth(level));

  if (kind === 'cannon') {
    grp.add(cannonHead(def.color));
    // Cannonball stack beside the plinth.
    const ballMat = std('#171b21', { rough: 0.35, metal: 0.85 });
    grp.add(mesh(new THREE.SphereGeometry(0.19, 12, 10), ballMat, 0.95, 0.19, 0.55));
    grp.add(mesh(new THREE.SphereGeometry(0.19, 12, 10), ballMat, 0.62, 0.19, 0.72));
    grp.add(mesh(new THREE.SphereGeometry(0.19, 12, 10), ballMat, 0.78, 0.5, 0.63));
    grp.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), std(WOOD, { rough: 0.85 }), -0.95, 0.25, 0.5));
  } else if (kind === 'gatling') {
    grp.add(gatlingHead(def.color));
    // Ammo cans.
    grp.add(mesh(new THREE.BoxGeometry(0.42, 0.34, 0.3), std('#3d4a2a', { rough: 0.8 }), -0.9, 0.17, 0.4));
    grp.add(mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), std('#4d5c33', { rough: 0.8 }), -0.88, 0.15, -0.05));
  } else if (kind === 'frost') {
    // Runic obelisk body.
    grp.add(mesh(new THREE.CylinderGeometry(0.34, 0.58, 1.15, 6), std('#7fa8c9', { rough: 0.35, metal: 0.15, flat: true }), 0, 1.3, 0));
    const rune = mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 6), std('#9be8ff', { emissive: '#54d8ff', ei: 1 }), 0, 1.3, 0, false);
    rune.rotation.x = Math.PI / 2;
    grp.add(rune);
    grp.add(frostHead());
    // Ice shards around the base.
    const shardMat = std('#c9f2ff', { emissive: '#54d8ff', ei: 0.7, rough: 0.2, flat: true });
    const shardPos: Array<[number, number, number, number]> = [
      [0.85, 0.25, 0.3, 0.4], [-0.8, 0.2, 0.45, 0.7], [0.2, 0.18, -0.85, 1.1], [-0.35, 0.22, 0.85, 1.9],
    ];
    for (const [x, y, z, ry] of shardPos) {
      const s = mesh(new THREE.OctahedronGeometry(0.2, 0), shardMat, x, y, z, false);
      s.rotation.y = ry;
      s.scale.y = 1.5;
      grp.add(s);
    }
  } else {
    grp.add(mortarHead(def.color));
    // Shell crate + sandbags.
    grp.add(mesh(new THREE.BoxGeometry(0.6, 0.4, 0.45), std(WOOD, { rough: 0.85 }), -1.0, 0.2, 0.35));
    const shellMat = std('#3a3348', { rough: 0.4, metal: 0.7 });
    for (let i = 0; i < 3; i++) {
      grp.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), shellMat, -1.15 + i * 0.16, 0.48, 0.35, false));
    }
    const bagMat = std('#9a8a6a', { rough: 0.95 });
    for (const [x, z] of [[0.75, 0.95], [1.05, 0.8], [0.9, 1.1]] as Array<[number, number]>) {
      const bag = mesh(new THREE.SphereGeometry(0.24, 8, 6), bagMat, x, 0.16, z);
      bag.scale.y = 0.65;
      grp.add(bag);
    }
  }

  if (level >= 3 && kind !== 'frost') {
    const spike = mesh(new THREE.ConeGeometry(0.13, 0.42, 6), std(GOLD, { emissive: GOLD, ei: 0.8, metal: 0.6 }), -0.55, 1.0, -0.55, false);
    grp.add(spike);
  }
  return grp;
}

/* ------------------------------ enemies ------------------------------ */

function hpBar(grp: THREE.Group, y: number, width: number): void {
  grp.userData.hpWidth = width;
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#0d1219', depthTest: false }));
  bg.scale.set(width + 0.08, 0.17, 1);
  bg.position.y = y;
  bg.name = 'hpbg';
  bg.renderOrder = 50;
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#58e06b', depthTest: false }));
  fg.scale.set(width, 0.12, 1);
  fg.position.y = y;
  fg.name = 'hpfg';
  fg.renderOrder = 51;
  grp.add(bg, fg);
}

function gruntMesh(): THREE.Group {
  const def = ENEMIES.grunt;
  const grp = new THREE.Group();
  const cloth = std(def.color, { rough: 0.75 });
  const clothDark = std('#a03a34', { rough: 0.8 });
  const leather = std('#4a3220', { rough: 0.9 });
  const metal = std(GUNMETAL, { rough: 0.4, metal: 0.8 });
  // Legs on hip pivots (legL/legR) so the game can swing them.
  for (const sx of [-1, 1] as const) {
    const isL = sx < 0;
    const leg = new THREE.Group();
    leg.name = isL ? 'legL' : 'legR';
    leg.position.set(sx * 0.18, 0.5, 0);
    const zOff = isL ? 0.08 : -0.08;
    leg.add(mesh(new THREE.BoxGeometry(0.22, 0.5, 0.26), leather, 0, -0.25, zOff));
    leg.add(mesh(new THREE.BoxGeometry(0.24, 0.14, 0.34), metal, 0, -0.43, zOff + 0.04));
    grp.add(leg);
  }
  // Torso + belt + chest plate.
  grp.add(mesh(new THREE.BoxGeometry(0.68, 0.62, 0.5), cloth, 0, 0.81, 0));
  grp.add(mesh(new THREE.BoxGeometry(0.7, 0.13, 0.52), leather, 0, 0.55, 0));
  grp.add(mesh(new THREE.BoxGeometry(0.24, 0.2, 0.06), metal, 0, 0.55, 0.26, false));
  grp.add(mesh(new THREE.BoxGeometry(0.46, 0.4, 0.07), metal, 0, 0.88, 0.25, false));
  // Pauldrons stay static; arms swing on shoulder pivots (armL/armR).
  for (const sx of [-1, 1]) {
    const pad = mesh(new THREE.SphereGeometry(0.19, 10, 8), metal, sx * 0.44, 1.06, 0);
    pad.scale.y = 0.75;
    grp.add(pad);
    const arm = new THREE.Group();
    arm.name = sx < 0 ? 'armL' : 'armR';
    arm.position.set(sx * 0.45, 0.95, 0.02);
    arm.add(mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), clothDark, 0, -0.23, 0));
    arm.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.3), leather, 0, -0.5, 0.06));
    grp.add(arm);
  }
  // Head + helmet + horns, facing +Z.
  grp.add(mesh(new THREE.BoxGeometry(0.4, 0.34, 0.38), std('#c65a52', { rough: 0.7 }), 0, 1.29, 0));
  grp.add(mesh(new THREE.BoxGeometry(0.46, 0.15, 0.44), metal, 0, 1.5, 0));
  grp.add(mesh(new THREE.BoxGeometry(0.1, 0.22, 0.06), metal, 0, 1.32, 0.2, false));
  for (const sx of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.07, 0.26, 6), std('#e8dcc0', { rough: 0.6 }), sx * 0.28, 1.56, 0, false);
    horn.rotation.z = sx * -0.5;
    grp.add(horn);
    grp.add(mesh(new THREE.SphereGeometry(0.07, 8, 8), std('#111111', { emissive: '#ffe45e', ei: 1.2 }), sx * 0.11, 1.3, 0.2, false));
  }
  hpBar(grp, def.height + 0.62, 1.1);
  return grp;
}

function rollerMesh(): THREE.Group {
  const def = ENEMIES.roller;
  const grp = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.name = 'wheel';
  // Pivot AT the axle so rotation.x spins the wheel in place.
  wheel.position.set(0, 0.46, 0);
  const rubber = std('#23262c', { rough: 0.9 });
  const rimMat = std('#f0a35e', { rough: 0.4, metal: 0.6, emissive: '#f0a35e', ei: 0.25 });
  const tire = mesh(new THREE.TorusGeometry(0.3, 0.16, 10, 22), rubber, 0, 0, 0);
  tire.rotation.y = Math.PI / 2; // wheel plane = ZY, axle = X
  wheel.add(tire);
  const hub = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), rimMat, 0, 0, 0, false);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  // Treads around the circumference.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const tread = mesh(new THREE.BoxGeometry(0.5, 0.07, 0.12), rubber, 0, Math.cos(a) * 0.44, Math.sin(a) * 0.44, false);
    tread.rotation.x = -a;
    wheel.add(tread);
  }
  // Spokes.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    const spoke = mesh(new THREE.BoxGeometry(0.1, 0.52, 0.1), rimMat, 0, 0, 0, false);
    spoke.rotation.x = a;
    wheel.add(spoke);
  }
  grp.add(wheel);
  // Chassis + eye stalk (stays upright — NOT part of the wheel).
  grp.add(mesh(new THREE.BoxGeometry(0.4, 0.18, 0.5), std('#3a3f47', { rough: 0.5, metal: 0.6 }), 0, 0.78, -0.05));
  grp.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8), std(GUNMETAL, { metal: 0.7, rough: 0.4 }), 0, 0.95, 0.12, false));
  grp.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), std('#10141a', { emissive: '#ff2d2d', ei: 1.4 }), 0, 1.12, 0.14, false));
  hpBar(grp, def.height + 0.62, 1.0);
  return grp;
}

function bruteMesh(): THREE.Group {
  const def = ENEMIES.brute;
  const grp = new THREE.Group();
  const skin = std(def.color, { rough: 0.65 });
  const skinDark = std('#6d2f9e', { rough: 0.7 });
  const metal = std(GUNMETAL, { rough: 0.4, metal: 0.8 });
  grp.add(mesh(new THREE.BoxGeometry(1.0, 0.8, 0.7), skin, 0, 1.0, 0));
  grp.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.08), metal, 0, 1.0, 0.36, false));
  grp.add(mesh(new THREE.BoxGeometry(1.02, 0.16, 0.72), std('#3a2140', { rough: 0.85 }), 0, 0.66, 0));
  // Legs on hip pivots.
  for (const sx of [-1, 1] as const) {
    const leg = new THREE.Group();
    leg.name = sx < 0 ? 'legL' : 'legR';
    leg.position.set(sx * 0.25, 0.6, 0);
    leg.add(mesh(new THREE.BoxGeometry(0.3, 0.6, 0.34), skinDark, 0, -0.3, sx < 0 ? 0.05 : -0.05));
    grp.add(leg);
  }
  // Glowing war-rune on the chest.
  grp.add(mesh(new THREE.BoxGeometry(0.12, 0.34, 0.05), std('#ff5bd7', { emissive: '#ff5bd7', ei: 1.2 }), 0, 1.05, 0.41, false));
  // Pauldrons with spikes (static); arms swing on shoulder pivots.
  for (const sx of [-1, 1]) {
    const pad = mesh(new THREE.SphereGeometry(0.3, 10, 8), metal, sx * 0.64, 1.36, 0);
    pad.scale.y = 0.8;
    grp.add(pad);
    const spike = mesh(new THREE.ConeGeometry(0.11, 0.34, 6), std('#d8d2c4', { rough: 0.5 }), sx * 0.64, 1.68, 0, false);
    grp.add(spike);
    const arm = new THREE.Group();
    arm.name = sx < 0 ? 'armL' : 'armR';
    arm.position.set(sx * 0.66, 1.2, 0);
    arm.add(mesh(new THREE.BoxGeometry(0.26, 0.7, 0.28), skinDark, 0, -0.38, 0));
    arm.add(mesh(new THREE.SphereGeometry(0.2, 8, 8), skin, 0, -0.78, 0.02));
    grp.add(arm);
  }
  // Head with horned helm, facing +Z.
  grp.add(mesh(new THREE.BoxGeometry(0.44, 0.36, 0.4), skinDark, 0, 1.62, 0));
  grp.add(mesh(new THREE.BoxGeometry(0.5, 0.16, 0.46), metal, 0, 1.84, 0));
  for (const sx of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.09, 0.4, 6), std('#e8dcc0', { rough: 0.55 }), sx * 0.34, 1.92, 0, false);
    horn.rotation.z = sx * -0.6;
    grp.add(horn);
    grp.add(mesh(new THREE.SphereGeometry(0.08, 8, 8), std('#111111', { emissive: '#ff3b3b', ei: 1.4 }), sx * 0.12, 1.62, 0.21, false));
  }
  hpBar(grp, def.height + 0.66, 1.5);
  return grp;
}

function golemMesh(): THREE.Group {
  const def = ENEMIES.golem;
  const grp = new THREE.Group();
  const rock = std('#4a5a75', { rough: 0.9, flat: true });
  const rockDark = std('#2e3a52', { rough: 0.95, flat: true });
  const glow = std('#54d8ff', { emissive: '#3aa8ff', ei: 1.6 });
  grp.add(mesh(new THREE.BoxGeometry(1.1, 0.42, 0.72), rockDark, 0, 0.68, 0));
  // Stumpy legs on hip pivots.
  for (const sx of [-1, 1] as const) {
    const leg = new THREE.Group();
    leg.name = sx < 0 ? 'legL' : 'legR';
    leg.position.set(sx * 0.32, 0.5, 0);
    leg.add(mesh(new THREE.BoxGeometry(0.42, 0.5, 0.46), rockDark, 0, -0.25, sx < 0 ? 0.03 : -0.03));
    grp.add(leg);
  }
  const torso = mesh(new THREE.DodecahedronGeometry(0.88, 0), rock, 0, 1.4, 0);
  torso.scale.set(1.05, 0.95, 0.8);
  grp.add(torso);
  // Glowing core embedded in the chest (+Z).
  grp.add(mesh(new THREE.OctahedronGeometry(0.26, 0), glow, 0, 1.42, 0.62, false));
  grp.add(mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 18), std(GUNMETAL, { metal: 0.8, rough: 0.4 }), 0, 1.42, 0.55, false));
  // Massive arms + fists on shoulder pivots (pads stay static).
  for (const sx of [-1, 1]) {
    const pad = mesh(new THREE.DodecahedronGeometry(0.4, 0), rockDark, sx * 0.9, 1.85, 0);
    grp.add(pad);
    const arm = new THREE.Group();
    arm.name = sx < 0 ? 'armL' : 'armR';
    arm.position.set(sx * 0.98, 1.7, 0);
    arm.add(mesh(new THREE.BoxGeometry(0.36, 0.85, 0.42), rock, 0, -0.42, 0));
    arm.add(mesh(new THREE.DodecahedronGeometry(0.36, 0), rockDark, 0, -1.02, 0.05));
    grp.add(arm);
  }
  // Head with crown, facing +Z.
  grp.add(mesh(new THREE.BoxGeometry(0.52, 0.4, 0.46), rockDark, 0, 2.12, 0));
  grp.add(mesh(new THREE.BoxGeometry(0.56, 0.12, 0.5), std(GUNMETAL, { metal: 0.8, rough: 0.4 }), 0, 2.34, 0));
  for (const sx of [-0.2, 0, 0.2]) {
    grp.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 5), glow, sx, 2.52, 0, false));
  }
  for (const sx of [-1, 1]) {
    grp.add(mesh(new THREE.SphereGeometry(0.09, 8, 8), std('#0a0e14', { emissive: '#54d8ff', ei: 1.8 }), sx * 0.14, 2.12, 0.24, false));
  }
  hpBar(grp, def.height + 0.7, 2.0);
  return grp;
}

export function makeEnemyMesh(kind: EnemyKind): THREE.Group {
  switch (kind) {
    case 'grunt': return gruntMesh();
    case 'roller': return rollerMesh();
    case 'brute': return bruteMesh();
    case 'golem': return golemMesh();
  }
}

export function setHpBar(grp: THREE.Group, frac: number): void {
  const fg = grp.getObjectByName('hpfg') as THREE.Sprite | undefined;
  if (!fg) return;
  const base = (grp.userData.hpWidth as number | undefined) ?? 1.2;
  const f = Math.max(0, Math.min(1, frac));
  fg.scale.x = Math.max(0.001, base * f);
  (fg.material as THREE.SpriteMaterial).color.set(f > 0.5 ? '#58e06b' : f > 0.25 ? '#ffd257' : '#ff5b5b');
}

export function makeProjectileMesh(kind: TowerKind): THREE.Mesh {
  if (kind === 'gatling') {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 8),
      new THREE.MeshStandardMaterial({ color: '#bdf3ff', emissive: '#54d8ff', emissiveIntensity: 2.2, roughness: 0.3 }),
    );
    m.scale.set(0.7, 0.7, 2.6); // tracer streak
    return m;
  }
  if (kind === 'frost') {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      new THREE.MeshStandardMaterial({ color: '#c9f2ff', emissive: '#54d8ff', emissiveIntensity: 1.6, roughness: 0.15, flatShading: true }),
    );
    return m;
  }
  if (kind === 'mortar') {
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.2, 0.3, 4, 10),
      new THREE.MeshStandardMaterial({ color: '#3a3348', emissive: '#b388ff', emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.6 }),
    );
    return m;
  }
  // Cannonball: dark cast iron.
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 14, 12),
    new THREE.MeshStandardMaterial({ color: '#171b21', roughness: 0.32, metalness: 0.88 }),
  );
  return m;
}

export function makeGhostMesh(kind: TowerKind, ok: boolean): THREE.Mesh {
  const geo = kind === 'wall'
    ? new THREE.BoxGeometry(1.9, 1.6, 1.9)
    : new THREE.CylinderGeometry(1, 1, 1.6, 12);
  const meshGhost = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: ok ? '#58e06b' : '#ff5b5b', transparent: true, opacity: 0.45, depthWrite: false }),
  );
  meshGhost.position.y = 0.8;
  return meshGhost;
}

export function makeRangeRing(range: number): THREE.Mesh {
  const meshRing = new THREE.Mesh(
    new THREE.RingGeometry(range - 0.18, range, 56),
    new THREE.MeshBasicMaterial({ color: '#6fd3ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  meshRing.rotation.x = -Math.PI / 2;
  meshRing.position.y = 0.06;
  return meshRing;
}
