export type TowerKind = 'cannon' | 'gatling' | 'frost' | 'mortar' | 'wall';
export type EnemyKind = 'grunt' | 'roller' | 'brute' | 'golem';

export interface TowerDef {
  name: string;
  cost: number;
  range: number;
  cooldown: number;
  damage: number;
  impulse: number;
  projSpeed: number;
  splash: number;
  slowFactor: number;
  slowTime: number;
  color: string;
  desc: string;
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  cannon: {
    name: 'Cannon', cost: 50, range: 9.5, cooldown: 1.6, damage: 14,
    impulse: 26, projSpeed: 22, splash: 0, slowFactor: 0, slowTime: 0,
    color: '#e07b39', desc: 'Heavy ball, big knockback',
  },
  gatling: {
    name: 'Gatling', cost: 40, range: 7.5, cooldown: 0.32, damage: 4,
    impulse: 3.5, projSpeed: 30, splash: 0, slowFactor: 0, slowTime: 0,
    color: '#6fd3ff', desc: 'Rapid fire, low knockback',
  },
  frost: {
    name: 'Frost', cost: 65, range: 6.5, cooldown: 1.7, damage: 2,
    impulse: 1.5, projSpeed: 20, splash: 1.5, slowFactor: 0.3, slowTime: 1.6,
    color: '#9be8ff', desc: 'Slows 30% for 1.6s',
  },
  mortar: {
    name: 'Mortar', cost: 80, range: 12, cooldown: 2.6, damage: 18,
    impulse: 30, projSpeed: 16, splash: 3.6, slowFactor: 0, slowTime: 0,
    color: '#b388ff', desc: 'Lobbed splash + launch',
  },
  wall: {
    name: 'Wall', cost: 20, range: 0, cooldown: 0, damage: 0,
    impulse: 0, projSpeed: 0, splash: 0, slowFactor: 0, slowTime: 0,
    color: '#8b95a5', desc: 'Blocks the lane, 160 HP',
  },
};

export const UPGRADE_COST: Record<TowerKind, [number, number]> = {
  cannon: [40, 70],
  gatling: [35, 60],
  frost: [45, 75],
  mortar: [65, 110],
  wall: [15, 25],
};

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  reward: number;
  lives: number;
  radius: number;
  height: number;
  density: number;
  knockResist: number;
  color: string;
  ball: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: {
    name: 'Raider', hp: 30, speed: 3.1, reward: 8, lives: 1,
    radius: 0.45, height: 1.1, density: 1.6, knockResist: 1, color: '#e5534b', ball: false,
  },
  roller: {
    name: 'Roller', hp: 18, speed: 5.0, reward: 9, lives: 1,
    radius: 0.42, height: 0.84, density: 1.2, knockResist: 0.7, color: '#f0a35e', ball: true,
  },
  brute: {
    name: 'Brute', hp: 130, speed: 2.1, reward: 20, lives: 3,
    radius: 0.62, height: 1.5, density: 3.2, knockResist: 2.6, color: '#9d4edd', ball: false,
  },
  golem: {
    name: 'Golem', hp: 650, speed: 1.6, reward: 150, lives: 10,
    radius: 0.9, height: 2.1, density: 5, knockResist: 5, color: '#3a86ff', ball: false,
  },
};

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  interval: number;
  hpMult: number;
}

export const TOTAL_WAVES = 10;
export const TOTAL_LEVELS = 3;
export const LEVEL_NAMES = ['Canyon Pass', 'Twin Bridges', 'The Gorge'];
/** Enemy HP scales per level so later lanes stay threatening. */
export const LEVEL_HP_BONUS = 0.35;
export const START_GOLD = 170;
export const START_LIVES = 20;
export const EARLY_CALL_BONUS = 25;
export const PIT_BONUS_MULT = 1.5;
export const GOLD_KEY = 'td.best.wave';
export const GRID = 2;

export function waveComp(wave: number, level = 1): SpawnGroup[] {
  const m = (1 + (wave - 1) * 0.22) * (1 + (level - 1) * LEVEL_HP_BONUS);
  switch (wave) {
    case 1: return [{ kind: 'grunt', count: 6, interval: 1.1, hpMult: m }];
    case 2: return [{ kind: 'grunt', count: 9, interval: 0.9, hpMult: m }];
    case 3: return [
      { kind: 'grunt', count: 7, interval: 0.8, hpMult: m },
      { kind: 'roller', count: 4, interval: 0.7, hpMult: m },
    ];
    case 4: return [{ kind: 'roller', count: 10, interval: 0.6, hpMult: m }];
    case 5: return [
      { kind: 'grunt', count: 10, interval: 0.6, hpMult: m },
      { kind: 'brute', count: 2, interval: 2.2, hpMult: m },
    ];
    case 6: return [
      { kind: 'roller', count: 10, interval: 0.5, hpMult: m },
      { kind: 'brute', count: 3, interval: 2.0, hpMult: m },
    ];
    case 7: return [
      { kind: 'grunt', count: 14, interval: 0.45, hpMult: m },
      { kind: 'brute', count: 3, interval: 1.8, hpMult: m },
    ];
    case 8: return [
      { kind: 'roller', count: 14, interval: 0.4, hpMult: m },
      { kind: 'brute', count: 4, interval: 1.6, hpMult: m },
    ];
    case 9: return [
      { kind: 'grunt', count: 12, interval: 0.4, hpMult: m },
      { kind: 'roller', count: 10, interval: 0.4, hpMult: m },
      { kind: 'brute', count: 4, interval: 1.5, hpMult: m },
    ];
    default: return [
      { kind: 'brute', count: 5, interval: 1.4, hpMult: m },
      { kind: 'golem', count: 1, interval: 1.0, hpMult: 1 + (wave - 10) * 0.3 },
      { kind: 'roller', count: 8, interval: 0.5, hpMult: m },
    ];
  }
}

/** Deterministic RNG for decorations / spread. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
