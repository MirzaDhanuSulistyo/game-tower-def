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
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Phone GPUs fill 2× DPR slowly; 1.8 is indistinguishable in motion.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.8 : 2));
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
  // Portrait screens see a sliver of the map at zoom 1 — open wider.
  if (window.innerWidth < window.innerHeight) game.zoom(1.7);

  el<HTMLDivElement>('hint').textContent = coarse
    ? 'Pick a tower below, then tap or drag on the ground to build. One finger pans the view, pinch to zoom.'
    : 'Pick a tower below, then click the ground to build. Right-drag to pan, wheel to zoom.';

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

  /* ------------------------------------------------------------------
   * Input. Mouse keeps desktop behavior; touch/pen use one unified
   * gesture system:
   *   1 finger + build selected → drag moves the ghost, release places
   *                               (a quick tap places too)
   *   1 finger, no build        → drag pans the camera, tap selects
   *   2 fingers                 → pan (midpoint) + pinch zoom
   * ------------------------------------------------------------------ */
  const TOUCH_TAP_PX = 14;

  interface TouchPtr { x: number; y: number; lx: number; ly: number; downX: number; downY: number }
  const touch = new Map<number, TouchPtr>();
  let twoFinger = false; // a 2-finger gesture happened; suppress the tap on release
  let pinchPrev = 0;
  let panPrevX = 0;
  let panPrevY = 0;

  // Mouse state (hover ghost + LMB place/select + RMB/middle pan).
  let mRMB = false;
  let mMoved = 0;
  let mLastX = 0;
  let mLastY = 0;

  function tapPlaceOrSelect(x: number, y: number): void {
    const hit = pickGround(x, y);
    if (!hit) return;
    if (game.state !== 'playing') return;
    if (game.buildSel) {
      game.moveGhost(hit.x, hit.z);
      if (!game.tryPlace()) {
        // Occupied/invalid spot: treat as a select tap so towers stay
        // inspectable in build mode (touch has no right-click).
        game.clickSelect(hit);
      }
    } else {
      game.clickSelect(hit);
    }
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    sound.ensure();
    canvas.focus();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    if (e.pointerType === 'mouse') {
      mLastX = e.clientX;
      mLastY = e.clientY;
      mMoved = 0;
      if (e.button === 2) mRMB = true;
      return;
    }
    touch.set(e.pointerId, { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, downX: e.clientX, downY: e.clientY });
    if (touch.size === 2) {
      twoFinger = true;
      const [a, b] = [...touch.values()];
      pinchPrev = Math.hypot(a.x - b.x, a.y - b.y);
      panPrevX = (a.x + b.x) / 2;
      panPrevY = (a.y + b.y) / 2;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const dx = e.clientX - mLastX;
      const dy = e.clientY - mLastY;
      mLastX = e.clientX;
      mLastY = e.clientY;
      mMoved += Math.abs(dx) + Math.abs(dy);
      if (mRMB || e.buttons === 2 || e.buttons === 4) {
        const s = game.camZoom * 0.035;
        game.pan(-dx * s, -dy * s);
        return;
      }
      const hit = pickGround(e.clientX, e.clientY);
      if (hit) game.moveGhost(hit.x, hit.z);
      return;
    }
    const p = touch.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.lx;
    const dy = e.clientY - p.ly;
    p.x = e.clientX;
    p.y = e.clientY;
    p.lx = p.x;
    p.ly = p.y;
    if (touch.size >= 2) {
      const [a, b] = [...touch.values()];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchPrev > 0) {
        const s = game.camZoom * 0.045;
        game.pan(-(midX - panPrevX) * s, -(midY - panPrevY) * s);
        game.zoom(Math.min(1.08, Math.max(0.92, pinchPrev / Math.max(20, d))));
      }
      pinchPrev = d;
      panPrevX = midX;
      panPrevY = midY;
    } else if (game.buildSel) {
      const hit = pickGround(p.x, p.y);
      if (hit) game.moveGhost(hit.x, hit.z);
    } else {
      const s = game.camZoom * 0.045;
      game.pan(-dx * s, -dy * s);
    }
  });

  function endTouch(e: PointerEvent, cancelled: boolean): void {
    const p = touch.get(e.pointerId);
    if (!p) return;
    touch.delete(e.pointerId);
    if (touch.size === 1) {
      // One finger remains after a pinch: re-baseline it so the drag
      // doesn't jump and its release never counts as a tap.
      const [rest] = [...touch.values()];
      rest.lx = rest.x;
      rest.ly = rest.y;
      rest.downX = rest.x;
      rest.downY = rest.y;
    } else if (touch.size === 0) {
      const was2 = twoFinger;
      twoFinger = false;
      pinchPrev = 0;
      if (cancelled || was2) return;
      const moved = Math.abs(p.x - p.downX) + Math.abs(p.y - p.downY);
      if (!game.buildSel && moved > TOUCH_TAP_PX) return; // was a pan
      tapPlaceOrSelect(p.x, p.y);
    }
  }

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        mRMB = false;
        if (mMoved < 6) {
          // Right-click cancels build selection.
          game.setBuildSel(null);
          ui.setSelected(null);
        }
        return;
      }
      if (e.button !== 0 || mMoved > 8) return; // was a drag
      tapPlaceOrSelect(e.clientX, e.clientY);
      return;
    }
    endTouch(e, false);
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'mouse') return;
    endTouch(e, true);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    game.zoom(e.deltaY > 0 ? 1.1 : 0.9);
  }, { passive: false });

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
    // World ground point -> screen px (tests / debugging).
    project: (x: number, z: number) => {
      const v = new THREE.Vector3(x, 0, z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    },
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
