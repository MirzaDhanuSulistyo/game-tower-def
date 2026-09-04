import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  grav: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
}

/** Pooled particles + rings + shake (no per-frame allocation). */
export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  shakeAmt = 0;
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    const pGeo = new THREE.SphereGeometry(0.14, 6, 5);
    const cGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    for (let i = 0; i < 110; i++) {
      const mesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, grav: 6 });
    }
    for (let i = 0; i < 90; i++) {
      const mesh = new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, grav: 24 });
    }
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0 });
    }
  }

  private spawn(pos: THREE.Vector3, color: string, count: number, speed: number, up: number, life: number, debris: boolean): void {
    const col = new THREE.Color(color);
    let n = 0;
    const start = debris ? 110 : 0;
    const end = debris ? this.particles.length : 110;
    for (let i = start; i < end; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      p.mesh.visible = true;
      (p.mesh.material as THREE.MeshBasicMaterial).color.copy(col);
      p.mesh.position.set(pos.x + (Math.random() - 0.5) * 0.7, pos.y + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.7);
      p.vel.set((Math.random() - 0.5) * speed, up * (0.5 + Math.random()), (Math.random() - 0.5) * speed);
      p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.size = 0.7 + Math.random() * 1.5;
      p.mesh.scale.setScalar(p.size);
      if (++n >= count) break;
    }
  }

  dust(pos: THREE.Vector3, color = '#c9bfa8', count = 8): void {
    this.spawn(pos, color, count, 3.5, 2.5, 0.7, false);
  }

  debris(pos: THREE.Vector3, color: string, count = 10): void {
    this.spawn(pos, color, count, 9, 6, 1.1, true);
  }

  ring(pos: THREE.Vector3, color: string): void {
    for (const r of this.rings) {
      if (r.life > 0) continue;
      r.mesh.visible = true;
      (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
      r.mesh.position.copy(pos);
      r.mesh.position.y += 0.3;
      r.mesh.scale.setScalar(1);
      r.life = 1;
      return;
    }
  }

  muzzle(pos: THREE.Vector3, color: string): void {
    this.spawn(pos, color, 4, 2, 1.5, 0.3, false);
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(0.9, this.shakeAmt + amount);
  }

  shakeOffset(out: THREE.Vector3): void {
    if (this.shakeAmt <= 0.0001) { out.set(0, 0, 0); return; }
    out.set(
      (Math.random() - 0.5) * this.shakeAmt * 1.2,
      (Math.random() - 0.5) * this.shakeAmt * 0.8,
      (Math.random() - 0.5) * this.shakeAmt * 0.6,
    );
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.08 && p.vel.y < 0) {
        p.mesh.position.y = 0.08;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      const f = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.01, p.size * (0.35 + 0.65 * f)));
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt * 1.8;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(1 + (1 - r.life) * 4.2);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.life * 0.65;
      r.mesh.quaternion.copy(this.camera.quaternion);
    }
    if (this.shakeAmt > 0.0001) this.shakeAmt *= Math.max(0, 1 - dt * 5.5);
    else this.shakeAmt = 0;
  }

  get scratch(): THREE.Vector3 {
    return this.tmp;
  }
}
