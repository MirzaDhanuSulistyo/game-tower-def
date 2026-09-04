import * as THREE from 'three';
import { GRID, mulberry32 } from './config';

export type Vec3 = [number, number, number];

export interface PitRect { minX: number; maxX: number; minZ: number; maxZ: number; depth: number }
export interface BridgeRect { minX: number; maxX: number; minZ: number; maxZ: number; topY: number }

export interface MapLayout {
  waypoints: Vec3[];
  spawn: Vec3;
  keep: Vec3;
  /** Canyon void (no ground): fall = death. */
  pit: PitRect;
  /** Decks over the pit. Enemies walk along the path across them. */
  bridges: BridgeRect[];
  bounds: number;
}

/**
 * One campaign level = one lane path.
 * 1 Canyon Pass — S-curve, single bridge crossing.
 * 2 Twin Bridges — tall north-south canyon, crossed twice (out and back).
 * 3 The Gorge — long western approach, single wide crossing, late keep.
 */
export function getLayout(level = 1): MapLayout {
  if (level === 2) {
    return {
      waypoints: [
        [-20, 0, 14],
        [12, 0, 14],
        [12, 0, -8],
        [-8, 0, -8],
        [-8, 0, -16],
        [0, 0, -16],
      ],
      spawn: [-20, 1, 14],
      keep: [0, 0, -16],
      pit: { minX: -2, maxX: 4, minZ: -9.5, maxZ: 15.5, depth: -9 },
      bridges: [
        { minX: -3, maxX: 5, minZ: 12.5, maxZ: 16.1, topY: 0.03 },
        { minX: -3, maxX: 5, minZ: -10.1, maxZ: -6.5, topY: 0.03 },
      ],
      bounds: 24,
    };
  }
  if (level === 3) {
    return {
      waypoints: [
        [20, 0, 12],
        [-18, 0, 12],
        [-18, 0, 2],
        [12, 0, 2],
        [12, 0, -10],
        [0, 0, -10],
        [0, 0, -16],
      ],
      spawn: [20, 1, 12],
      keep: [0, 0, -16],
      pit: { minX: -14, maxX: 10, minZ: -0.4, maxZ: 4.4, depth: -9 },
      bridges: [
        { minX: -14.6, maxX: 10.6, minZ: -1.0, maxZ: 5.0, topY: 0.03 },
      ],
      bounds: 24,
    };
  }
  const waypoints: Vec3[] = [
    [-20, 0, 14],
    [-13, 0, 14],
    [-13, 0, 2],
    [13, 0, 2],
    [13, 0, -10],
    [0, 0, -10],
    [0, 0, -17],
  ];
  return {
    waypoints,
    spawn: [-20, 1, 14],
    keep: [0, 0, -17],
    pit: { minX: -11, maxX: 11, minZ: -0.4, maxZ: 4.4, depth: -9 },
    bridges: [
      { minX: -11.6, maxX: 11.6, minZ: -1.0, maxZ: 5.0, topY: 0.03 },
    ],
    bounds: 24,
  };
}

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

export function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.min(1, Math.max(0, t));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function isBuildable(x: number, z: number, layout: MapLayout): { ok: boolean; reason: string } {
  const b = layout.bounds;
  if (Math.abs(x) > b || Math.abs(z) > b + 1) return { ok: false, reason: 'Out of bounds' };
  const { pit } = layout;
  // Strict: nothing builds over the void by default. Walls on bridge decks
  // are exempted in Game.canPlace via isOnBridge().
  if (x > pit.minX - 0.5 && x < pit.maxX + 0.5 && z > pit.minZ - 0.5 && z < pit.maxZ + 0.5) {
    return { ok: false, reason: 'Over the canyon' };
  }
  for (let i = 0; i < layout.waypoints.length - 1; i++) {
    const a = layout.waypoints[i];
    const c = layout.waypoints[i + 1];
    if (distToSeg(x, z, a[0], a[2], c[0], c[2]) < 2.4) return { ok: false, reason: 'On the path' };
  }
  if (Math.hypot(x - layout.keep[0], z - layout.keep[2]) < 3.2) return { ok: false, reason: 'Too close to keep' };
  if (Math.hypot(x - layout.spawn[0], z - layout.spawn[2]) < 3.2) return { ok: false, reason: 'Too close to portal' };
  return { ok: true, reason: '' };
}

/** True when (x,z) sits on a bridge deck with room for a 1.9-wide wall. */
export function isOnBridge(x: number, z: number, layout: MapLayout, margin = 1.0): boolean {
  for (const br of layout.bridges) {
    if (x > br.minX + margin && x < br.maxX - margin && z > br.minZ + margin && z < br.maxZ - margin) return true;
  }
  return false;
}

function lambert(color: string, emissive = '#000000', ei = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, emissive, emissiveIntensity: ei });
}

/** Builds all static visuals. Safe to call per level: replaces the old
 *  'terrain' group and only adds lights once. Returns path ribbon mat. */
export function buildScenery(scene: THREE.Scene, layout: MapLayout, seed = 7): { pathMat: THREE.MeshBasicMaterial } {
  const rng = mulberry32(seed);
  scene.background = new THREE.Color('#101a26');
  scene.fog = new THREE.Fog('#101a26', 55, 130);

  if (!scene.getObjectByName('td-hemi')) {
    const hemi = new THREE.HemisphereLight('#bcd6ff', '#2a2118', 0.75);
    hemi.name = 'td-hemi';
    scene.add(hemi);
  }
  if (!scene.getObjectByName('td-sun')) {
    const sun = new THREE.DirectionalLight('#fff2d8', 1.6);
    sun.name = 'td-sun';
    sun.position.set(-18, 30, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    scene.add(sun);
  }

  const old = scene.getObjectByName('terrain');
  if (old) scene.remove(old);
  const g = new THREE.Group();
  g.name = 'terrain';
  scene.add(g);

  // Ground split into 4 slabs leaving the pit hole.
  const { pit } = layout;
  const groundMat = lambert('#3d5a3a');
  const cliffMat = lambert('#5a4a3f');
  interface Slab { x0: number; x1: number; z0: number; z1: number }
  const B = 26;
  const slabs: Slab[] = [
    { x0: -B, x1: B, z0: pit.maxZ, z1: B },
    { x0: -B, x1: B, z0: -B, z1: pit.minZ },
    { x0: -B, x1: pit.minX, z0: pit.minZ, z1: pit.maxZ },
    { x0: pit.maxX, x1: B, z0: pit.minZ, z1: pit.maxZ },
  ];
  for (const s of slabs) {
    const w = s.x1 - s.x0;
    const d = s.z1 - s.z0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), groundMat);
    m.position.set((s.x0 + s.x1) / 2, -0.5, (s.z0 + s.z1) / 2);
    m.receiveShadow = true;
    g.add(m);
  }
  // Pit inner walls + dark bottom.
  const wallGeoX = new THREE.BoxGeometry(0.6, 9, pit.maxZ - pit.minZ);
  for (const x of [pit.minX, pit.maxX]) {
    const wall = new THREE.Mesh(wallGeoX, cliffMat);
    wall.position.set(x, -4.5, (pit.minZ + pit.maxZ) / 2);
    g.add(wall);
  }
  const wallGeoZ = new THREE.BoxGeometry(pit.maxX - pit.minX, 9, 0.6);
  for (const z of [pit.minZ, pit.maxZ]) {
    const wall = new THREE.Mesh(wallGeoZ, cliffMat);
    wall.position.set((pit.minX + pit.maxX) / 2, -4.5, z);
    g.add(wall);
  }
  const bottom = new THREE.Mesh(
    new THREE.BoxGeometry(pit.maxX - pit.minX, 0.5, pit.maxZ - pit.minZ),
    lambert('#0b0e14'),
  );
  bottom.position.set((pit.minX + pit.maxX) / 2, -9, (pit.minZ + pit.maxZ) / 2);
  g.add(bottom);

  // Bridge decks + rails + plank stripes + lantern posts (one set per crossing).
  const plankMat = lambert('#6a6055');
  const railMat = lambert('#4c4438');
  const postMat = lambert('#3a332a');
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffca7a', emissive: '#ff9d2e', emissiveIntensity: 1.6, roughness: 0.4 });
  for (const br of layout.bridges) {
    const topY = br.topY ?? 0.08;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(br.maxX - br.minX, 0.5, br.maxZ - br.minZ),
      lambert('#7d7466'),
    );
    // Deck top sits at topY (0.03), clearly above ground top (0) so the
    // overlapping lip onto the banks never z-fights the ground.
    deck.position.set((br.minX + br.maxX) / 2, topY - 0.25, (br.minZ + br.maxZ) / 2);
    deck.receiveShadow = true;
    g.add(deck);
    const longX = (br.maxX - br.minX) >= (br.maxZ - br.minZ);
    // Planks sit PROUD of the deck (top ~topY+0.02) so they never z-fight it.
    if (longX) {
      for (let x = br.minX + 1; x < br.maxX - 0.5; x += 1.6) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, br.maxZ - br.minZ - 0.2), plankMat);
        plank.position.set(x, topY - 0.255, (br.minZ + br.maxZ) / 2);
        plank.receiveShadow = true;
        g.add(plank);
      }
    } else {
      for (let z = br.minZ + 1; z < br.maxZ - 0.5; z += 1.6) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(br.maxX - br.minX - 0.2, 0.55, 0.18), plankMat);
        plank.position.set((br.minX + br.maxX) / 2, topY - 0.255, z);
        plank.receiveShadow = true;
        g.add(plank);
      }
    }
    // Rails are segmented so we can leave a gate where the lane crosses.
    // A single continuous rail would visually cut across the path on
    // long-edge entries (this is what blocked level 1).
    const nearLane = (x: number, z: number, thresh = 1.6): boolean => {
      for (let i = 0; i < layout.waypoints.length - 1; i++) {
        const a = layout.waypoints[i];
        const c = layout.waypoints[i + 1];
        if (distToSeg(x, z, a[0], a[2], c[0], c[2]) < thresh) return true;
      }
      return false;
    };
    if (longX) {
      const segLen = 1.0;
      for (const rz of [br.minZ + 0.15, br.maxZ - 0.15]) {
        for (let x = br.minX; x < br.maxX - 0.01; x += segLen) {
          const len = Math.min(segLen, br.maxX - x);
          const cx = x + len / 2;
          if (nearLane(cx, rz)) continue;
          const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, 0.7, 0.3), railMat);
          rail.position.set(cx, topY + 0.36, rz);
          rail.castShadow = true;
          g.add(rail);
        }
      }
    } else {
      const segLen = 1.0;
      for (const rx of [br.minX + 0.15, br.maxX - 0.15]) {
        for (let z = br.minZ; z < br.maxZ - 0.01; z += segLen) {
          const len = Math.min(segLen, br.maxZ - z);
          const cz = z + len / 2;
          if (nearLane(rx, cz)) continue;
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, len + 0.02), railMat);
          rail.position.set(rx, topY + 0.36, cz);
          rail.castShadow = true;
          g.add(rail);
        }
      }
    }
    const spanFrom = longX ? br.minX + 1.5 : br.minZ + 1.5;
    const spanTo = longX ? br.maxX : br.maxZ;
    for (let s = spanFrom; s < spanTo; s += 4.2) {
      const spots: Array<[number, number]> = longX
        ? [[s, br.minZ + 0.15], [s, br.maxZ - 0.15]]
        : [[br.minX + 0.15, s], [br.maxX - 0.15, s]];
      for (const [px, pz] of spots) {
        if (nearLane(px, pz, 1.8)) continue;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.5, 0.32), postMat);
        post.position.set(px, topY + 0.77, pz);
        post.castShadow = true;
        g.add(post);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lanternMat);
        lamp.position.set(px, topY + 1.67, pz);
        g.add(lamp);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 6), postMat);
        cap.position.set(px, topY + 1.9, pz);
        g.add(cap);
      }
    }
  }

  // Lane ribbon — flat segments hugging the walking surface so troops
  // stand ON the road instead of wading in it (the old raised tube buried
  // feet ~0.3 deep on ground legs). Ground legs sit at top 0.035, bridge
  // legs just over the plank tops. Boxes are slightly embedded top-wise
  // (never coplanar), so no z-fighting.
  const pathPts = layout.waypoints;
  const pathMat = new THREE.MeshBasicMaterial({ color: '#c9a86a' });
  const laneW = 1.4;
  const laneH = 0.06;
  const laneTopAt = (x: number, z: number): number => {
    for (const br of layout.bridges) {
      const t = br.topY ?? 0.03;
      if (x > br.minX - 0.6 && x < br.maxX + 0.6 && z > br.minZ - 0.6 && z < br.maxZ + 0.6) return t + 0.04;
    }
    return 0.035;
  };
  for (let i = 0; i < pathPts.length - 1; i++) {
    const a = pathPts[i];
    const c = pathPts[i + 1];
    const dx = c[0] - a[0];
    const dz = c[2] - a[2];
    const len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const top = Math.max(
      laneTopAt(a[0], a[2]),
      laneTopAt(c[0], c[2]),
      laneTopAt((a[0] + c[0]) / 2, (a[2] + c[2]) / 2),
    );
    const seg = new THREE.Mesh(new THREE.BoxGeometry(laneW, laneH, len + laneW * 0.5), pathMat);
    seg.position.set((a[0] + c[0]) / 2, top - laneH / 2, (a[2] + c[2]) / 2);
    seg.rotation.y = Math.atan2(dx, dz);
    seg.receiveShadow = true;
    g.add(seg);
  }
  for (let i = 1; i < pathPts.length - 1; i++) {
    const w = pathPts[i];
    const top = laneTopAt(w[0], w[2]);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(laneW / 2, laneW / 2, laneH, 20), pathMat);
    disc.position.set(w[0], top - laneH / 2, w[2]);
    disc.receiveShadow = true;
    g.add(disc);
  }

  // Spawn portal: stone dais, twin pillars, glowing ring + inner rift.
  const portalBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.3, 18), lambert('#3a4250'));
  portalBase.position.set(layout.spawn[0], 0.15, layout.spawn[2]);
  portalBase.receiveShadow = true;
  g.add(portalBase);
  const portal = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.26, 10, 28),
    new THREE.MeshStandardMaterial({ color: '#e5534b', emissive: '#ff2d2d', emissiveIntensity: 0.9, roughness: 0.4 }),
  );
  portal.position.set(layout.spawn[0], 1.75, layout.spawn[2]);
  g.add(portal);
  const rift = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 28),
    new THREE.MeshBasicMaterial({ color: '#5e0f0f', transparent: true, opacity: 0.9 }),
  );
  rift.position.set(layout.spawn[0], 1.75, layout.spawn[2]);
  g.add(rift);
  for (const sx of [-1.9, 1.9]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), lambert('#4a5462'));
    pillar.position.set(layout.spawn[0] + sx, 1.3, layout.spawn[2]);
    pillar.castShadow = true;
    g.add(pillar);
    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshStandardMaterial({ color: '#ff6b5e', emissive: '#ff2d2d', emissiveIntensity: 1.2, roughness: 0.3, flatShading: true }),
    );
    shard.position.set(layout.spawn[0] + sx, 2.9, layout.spawn[2]);
    g.add(shard);
  }

  // Keep: stone base, turrets, gate, windows, banners, crenellations, crest.
  const keepBase = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), lambert('#8b95a5'));
  keepBase.position.set(layout.keep[0], 1.3, layout.keep[2]);
  keepBase.castShadow = true;
  keepBase.receiveShadow = true;
  g.add(keepBase);
  // Roof slab + crenellations.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.3, 3.7), lambert('#6b7482'));
  roof.position.set(layout.keep[0], 2.72, layout.keep[2]);
  roof.castShadow = true;
  g.add(roof);
  for (let ix = -1; ix <= 1; ix++) {
    for (const sz of [-1.72, 1.72]) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), lambert('#8b95a5'));
      merlon.position.set(layout.keep[0] + ix * 1.15, 3.05, layout.keep[2] + sz);
      g.add(merlon);
    }
    for (const sx of [-1.72, 1.72]) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.5), lambert('#8b95a5'));
      merlon.position.set(layout.keep[0] + sx, 3.05, layout.keep[2] + ix * 1.15);
      g.add(merlon);
    }
  }
  // Gate on the +Z face (path approaches from +Z) + warm windows.
  const gate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.8, 0.2), lambert('#3a2c1e'));
  gate.position.set(layout.keep[0], 0.9, layout.keep[2] + 1.72);
  g.add(gate);
  const winMat = new THREE.MeshStandardMaterial({ color: '#ffca7a', emissive: '#ffb84d', emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.12), winMat);
    win.position.set(layout.keep[0] + sx * 1.0, 1.9, layout.keep[2] + 1.7);
    g.add(win);
  }
  // War banners.
  for (const sx of [-1.35, 1.35]) {
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.08), lambert('#7a2e2e'));
    banner.position.set(layout.keep[0] + sx, 1.7, layout.keep[2] + 1.74);
    g.add(banner);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.09), lambert('#e8b83a'));
    trim.position.set(layout.keep[0] + sx, 2.18, layout.keep[2] + 1.74);
    g.add(trim);
  }
  for (let i = 0; i < 4; i++) {
    const tx = layout.keep[0] + (i % 2 === 0 ? -1.7 : 1.7);
    const tz = layout.keep[2] + (i < 2 ? -1.7 : 1.7);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 2.2, 8), lambert('#6b7482'));
    turret.position.set(tx, 2.2, tz);
    turret.castShadow = true;
    g.add(turret);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.7, 8), lambert('#4a5462'));
    cap.position.set(tx, 3.65, tz);
    cap.castShadow = true;
    g.add(cap);
  }
  const crestPed = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.5, 10), lambert('#6b7482'));
  crestPed.position.set(layout.keep[0], 3.1, layout.keep[2]);
  crestPed.castShadow = true;
  g.add(crestPed);
  const crest = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7),
    new THREE.MeshStandardMaterial({ color: '#e8b83a', emissive: '#ffbe0b', emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.6 }),
  );
  crest.position.set(layout.keep[0], 3.4, layout.keep[2]);
  crest.name = 'keep-crest';
  g.add(crest);

  // Scatter rocks / pines (deterministic, off-path).
  for (let i = 0; i < 46; i++) {
    const x = (rng() - 0.5) * 48;
    const z = (rng() - 0.5) * 48;
    if (Math.abs(x) > 24 || Math.abs(z) > 24) continue;
    if (x > pit.minX - 2 && x < pit.maxX + 2 && z > pit.minZ - 3 && z < pit.maxZ + 3) continue;
    let onPath = false;
    for (let s = 0; s < layout.waypoints.length - 1; s++) {
      const a = layout.waypoints[s];
      const c = layout.waypoints[s + 1];
      if (distToSeg(x, z, a[0], a[2], c[0], c[2]) < 2.6) { onPath = true; break; }
    }
    if (onPath) continue;
    if (rng() < 0.5) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.7), lambert('#6b7482'));
      rock.position.set(x, 0.3, z);
      rock.castShadow = true;
      g.add(rock);
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6), lambert('#5b4232'));
      trunk.position.set(x, 0.45, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.7 + rng() * 0.4, 1.6, 7), lambert('#2f6b3a'));
      top.position.set(x, 1.5, z);
      top.castShadow = true;
      g.add(trunk, top);
    }
  }

  // Grid helper (subtle) — parked at 0.02 with depthWrite off so it
  // never z-fights the ground (0), deck (0), planks (0.05) or path (0.09+).
  const grid = new THREE.GridHelper(52, 26, 0x2a3a4d, 0x22303f);
  grid.position.y = 0.02;
  const gg = grid.material as THREE.Material;
  gg.transparent = true;
  gg.opacity = 0.35;
  gg.depthWrite = false;
  grid.renderOrder = 1;
  g.add(grid);

  return { pathMat };
}
