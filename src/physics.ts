import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Collision groups: membership << 16 | filter.
 *  Towers shoot OVER walls, so projectiles ignore wall colliders entirely
 *  (no bounce, no premature detonation) while still hitting enemies+ground. */
const GROUND_BITS = (0x0001 << 16) | 0xffff;
export const ENEMY_BITS = (0x0002 << 16) | 0x000f;
/** Enemies stop colliding with EACH OTHER (still vs ground/wall/shots). */
export const ENEMY_GHOST_BITS = (0x0002 << 16) | 0x000d;
const WALL_BITS = (0x0004 << 16) | 0x0003;
const PROJ_BITS = (0x0008 << 16) | 0x0003;

/** Thin wrapper around a Rapier world with fixed ground pieces + spawners. */
export class Physics {
  world: RAPIER.World;
  private events = new RAPIER.EventQueue(true);
  groundHandles = new Set<number>();
  /** Level statics (ground slabs, decks, keep plinth) — cleared per level. */
  private levelBodies: RAPIER.RigidBody[] = [];

  constructor(gravity = -22) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = 1 / 60;
  }

  addStaticBox(hx: number, hy: number, hz: number, x: number, y: number, z: number, friction = 0.9): number {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(0.02)
        .setCollisionGroups(GROUND_BITS).setSolverGroups(GROUND_BITS),
      body,
    );
    this.groundHandles.add(col.handle);
    this.levelBodies.push(body);
    return col.handle;
  }

  /** Remove all level statics (keeps dynamic bodies untouched — call only
   *  after clearing enemies/projectiles/towers). */
  clearStatics(): void {
    for (const body of this.levelBodies) {
      try {
        this.world.removeRigidBody(body);
      } catch {
        /* already gone */
      }
    }
    this.levelBodies = [];
    this.groundHandles.clear();
  }

  spawnEnemyBox(w: number, h: number, d: number, pos: [number, number, number], density: number): { body: RAPIER.RigidBody; collider: number } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos[0], pos[1], pos[2])
        .setLinearDamping(0.6)
        .setAngularDamping(2.5)
        .setCcdEnabled(true)
        .lockRotations(),
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
        .setDensity(density)
        .setFriction(0.7)
        .setRestitution(0.05)
        .setCollisionGroups(ENEMY_BITS).setSolverGroups(ENEMY_BITS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    return { body, collider: col.handle };
  }

  spawnEnemyBall(radius: number, pos: [number, number, number], density: number): { body: RAPIER.RigidBody; collider: number } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos[0], pos[1], pos[2])
        .setLinearDamping(0.25)
        .setAngularDamping(0.6)
        .setCcdEnabled(true),
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setDensity(density)
        .setFriction(0.55)
        .setRestitution(0.35)
        .setCollisionGroups(ENEMY_BITS).setSolverGroups(ENEMY_BITS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    return { body, collider: col.handle };
  }

  spawnProjectile(radius: number, pos: [number, number, number]): { body: RAPIER.RigidBody; collider: number } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos[0], pos[1], pos[2])
        .setLinearDamping(0)
        .setAngularDamping(0.1)
        .setCcdEnabled(true),
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius).setDensity(2.5).setFriction(0.4).setRestitution(0.2)
        .setCollisionGroups(PROJ_BITS).setSolverGroups(PROJ_BITS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    return { body, collider: col.handle };
  }

  spawnStaticBox(w: number, h: number, d: number, pos: [number, number, number]): { body: RAPIER.RigidBody; collider: number } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]),
    );
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.9).setRestitution(0.05)
        .setCollisionGroups(WALL_BITS).setSolverGroups(WALL_BITS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    return { body, collider: col.handle };
  }

  /** Fixed anchor with NO collider — for towers. Projectiles spawn at the
   *  muzzle and can never self-collide with their own tower. Only walls
   *  (which must block enemies) get a real collider. */
  spawnAnchor(pos: [number, number, number]): { body: RAPIER.RigidBody; collider: number } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]),
    );
    return { body, collider: -1 };
  }

  removeCollider(collider: number, body: RAPIER.RigidBody): void {
    if (collider >= 0) {
      try {
        const col = this.world.getCollider(collider);
        this.world.removeCollider(col, false);
      } catch {
        /* already gone */
      }
    }
    try {
      this.world.removeRigidBody(body);
    } catch {
      /* already gone */
    }
  }

  step(): void {
    this.world.step(this.events);
  }

  drainCollisions(cb: (h1: number, h2: number, started: boolean) => void): void {
    this.events.drainCollisionEvents(cb);
  }
}
