import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game';
import { Effects } from './effects';
import { SoundKit } from './audio';
import { UI } from './ui';
import type { TowerKind } from './config';

const STEP = 1 / 60;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

async function boot(): Promise<void> {
  await RAPIER.init();

  const canvas = el<HTMLCanvasElement>('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  camera.position.set(0, 25, 24);

  const ui = new UI();
  const sound = new SoundKit();
  const effects = new Effects(scene, camera);
  // Game constructor loads level 1 (lane path + scenery + colliders).
  const game = new Game(scene, effects, sound, ui);

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  ui.onStart = () => { sound.ensure(); sound.click(); game.start(); canvas.focus(); };
  ui.onAgain = () => { sound.ensure(); sound.click(); game.retry(); canvas.focus(); };
  ui.onNext = () => { sound.ensure(); sound.click(); game.nextLevel(); canvas.focus(); };
  ui.onSelectBuild = (kind) => { sound.ensure(); game.setBuildSel(kind); };
  ui.onStartWave = () => { sound.ensure(); game.startWave(); };
  ui.onSpeed = () => {
    game.speedMult = game.speedMult === 1 ? 2 : 1;
    ui.setSpeedLabel(game.speedMult === 1 ? '1×' : '2×');
    sound.click();
  };
  ui.onUpgrade = () => { sound.ensure(); game.upgradeSelected(); };
  ui.onSell = () => { sound.ensure(); game.sellSelected(); };
  ui.onCloseSel = () => game.closeSelection();

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function pickGround(clientX: number, clientY: number): THREE.Vector3 | null {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, out) ? out : null;
  }

  let rmb = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    sound.ensure();
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    lastX = e.clientX;
    lastY = e.clientY;
    moved = 0;
    if (e.button === 2) rmb = true;
  });

  canvas.addEventListener('pointermove', (e) => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (rmb || (e.buttons === 2)) {
      const s = game.camZoom * 0.035;
      game.pan(-dx * s, -dy * s);
      return;
    }
    // Middle-drag or space-drag pans too.
    if (e.buttons === 4) {
      const s = game.camZoom * 0.035;
      game.pan(-dx * s, -dy * s);
      return;
    }
    const hit = pickGround(e.clientX, e.clientY);
    if (hit) game.moveGhost(hit.x, hit.z);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.button === 2) {
      rmb = false;
      if (moved < 6) {
        // Right-click cancels build selection.
        game.setBuildSel(null);
        ui.setSelected(null);
      }
      return;
    }
    if (e.button !== 0) return;
    if (moved > 8) return; // was a drag
    const hit = pickGround(e.clientX, e.clientY);
    if (!hit) return;
    if (game.state !== 'playing') return;
    if (game.buildSel) {
      game.moveGhost(hit.x, hit.z);
      if (game.tryPlace()) {
        // Keep build mode for walls, else keep it too (fast building). Shift not required.
      }
    } else {
      game.clickSelect(hit);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    game.zoom(e.deltaY > 0 ? 1.1 : 0.9);
  }, { passive: false });

  // Touch pinch zoom.
  let pinchD = 0;
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (pinchD > 0) game.zoom(pinchD / Math.max(1, d) > 1 ? 1.04 : 0.96);
      pinchD = d;
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinchD = 0; });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      game.setBuildSel(null);
      ui.setSelected(null);
      game.closeSelection();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (game.state === 'playing') game.startWave();
      else if (game.state === 'start') { sound.ensure(); game.start(); }
      else if (game.state === 'levelclear') { sound.ensure(); game.nextLevel(); }
      e.preventDefault();
    } else if (e.key === 'f' || e.key === 'F') {
      game.speedMult = game.speedMult === 1 ? 2 : 1;
      ui.setSpeedLabel(game.speedMult === 1 ? '1×' : '2×');
    } else if (e.key === '1') uiPick('cannon');
    else if (e.key === '2') uiPick('gatling');
    else if (e.key === '3') uiPick('frost');
    else if (e.key === '4') uiPick('mortar');
    else if (e.key === '5') uiPick('wall');
    else if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') game.pan(0, -1.2);
    else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') game.pan(0, 1.2);
    else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') game.pan(-1.2, 0);
    else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') game.pan(1.2, 0);
  });

  function uiPick(kind: TowerKind): void {
    const next = game.buildSel === kind ? null : kind;
    game.setBuildSel(next);
    ui.setSelected(next);
  }

  // Keep UI cards in sync when game clears selection via right-click.
  const origSetBuild = game.setBuildSel.bind(game);
  game.setBuildSel = (kind) => {
    origSetBuild(kind);
    ui.setSelected(kind);
  };

  (window as unknown as { __td: unknown }).__td = {
    info: () => game.info(),
    start: () => game.start(),
    startWave: () => game.startWave(),
    nextLevel: () => game.nextLevel(),
    loadLevel: (level: number) => game.loadLevel(level, 'keep'),
    place: (kind: TowerKind, x: number, z: number) => {
      game.setBuildSel(kind);
      game.moveGhost(x, z);
      return game.tryPlace();
    },
  };

  const clock = new THREE.Clock();
  let acc = 0;
  function frame(): void {
    requestAnimationFrame(frame);
    const rawDt = Math.min(clock.getDelta(), 0.1);
    const dt = rawDt * game.speedMult;
    acc += dt;
    let steps = 0;
    const maxSteps = game.speedMult > 1 ? 6 : 3;
    while (acc >= STEP && steps < maxSteps) {
      game.tick(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === maxSteps) acc = 0;
    game.present(rawDt, camera);
    renderer.render(scene, camera);
  }
  frame();
}

void boot();
