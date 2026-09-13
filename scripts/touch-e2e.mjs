// Touch smoke test: boots the game with phone touch emulation and drives
// every gesture: tap-build, drag-build, one-finger pan, two-finger pinch,
// tap-select. Usage: `npm run preview` in one shell, then
// `node scripts/touch-e2e.mjs` in another.
import { execSync } from 'node:child_process';

const PREVIEW_URL = process.env.PREVIEW_URL ?? 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function findChrome() {
  const candidates = [
    CHROME,
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  for (const c of candidates) {
    try {
      execSync(`test -x "${c}"`);
      return c;
    } catch { /* try next */ }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('No Chrome/Chromium found. Set CHROME_PATH.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const info = (page) => page.evaluate(() => window.__td.info());

const browser = await puppeteer_launch();
async function puppeteer_launch() {
  const { default: puppeteer } = await import('puppeteer-core');
  return puppeteer.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
}

try {
  const page = await browser.newPage();
  // iPhone-ish portrait: touch events, coarse pointer, narrow screen.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(PREVIEW_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__td !== 'undefined', { timeout: 20000 });

  const cdp = await page.createCDPSession();

  async function touchDown(x, y) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
  }
  async function touchMoveTo(x, y) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 0 }] });
    await sleep(25);
  }
  async function touchUp() {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(120);
  }
  async function drag(x1, y1, x2, y2, steps = 6) {
    await touchDown(x1, y1);
    for (let i = 1; i <= steps; i++) {
      await touchMoveTo(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    }
    await touchUp();
  }
  async function pinch(cx, cy, from, to, steps = 8) {
    const pts = (d) => [{ x: cx - d / 2, y: cy, id: 0 }, { x: cx + d / 2, y: cy, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
    for (let i = 1; i <= steps; i++) {
      const d = from + ((to - from) * i) / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
      await sleep(25);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(120);
  }
  const rectOf = (sel) => page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  // First candidate whose screen projection is on the play area (below the
  // top HUD, above the build bar).
  async function onScreenSpot(candidates) {
    return page.evaluate((list) => {
      for (const [wx, wz] of list) {
        const p = window.__td.project(wx, wz);
        if (p.x > 24 && p.x < 366 && p.y > 96 && p.y < 700) return { wx, wz, x: p.x, y: p.y };
      }
      return null;
    }, candidates);
  }

  // ---- boot & start ----
  const hint = await page.$eval('#hint', (el) => el.textContent);
  if (!/pinch/.test(hint ?? '')) throw new Error(`touch hint not applied: "${hint}"`);
  const startBtn = await rectOf('#btn-start');
  await page.tap('#btn-start');
  await sleep(600);
  let inf = await info(page);
  console.log('started:', JSON.stringify(inf));
  if (inf.state !== 'playing') throw new Error(`expected playing, got ${inf.state}`);

  // ---- 1. tap-to-build: card tap, then ground tap ----
  await page.tap('#hud-build .card[data-build="cannon"]');
  await sleep(150);
  const tapSpot = await onScreenSpot([[-6, 6], [-6, 8], [-4, 6], [4, -6], [6, -4], [-16, 8]]);
  if (!tapSpot) throw new Error('no buildable candidate on screen for tap-build');
  console.log('tap-build at screen', Math.round(tapSpot.x), Math.round(tapSpot.y), 'world', `${tapSpot.wx},${tapSpot.wz}`);
  await touchDown(tapSpot.x, tapSpot.y);
  await sleep(60);
  await touchUp();
  await sleep(300);
  inf = await info(page);
  console.log('after tap-build:', JSON.stringify(inf));
  if (inf.towers !== 1) throw new Error(`tap-build failed, towers=${inf.towers}`);

  // ---- 2. drag-to-build: ghost follows finger, release places ----
  // Build selection is still active from step 1 (fast building).
  let pair = null;
  for (const [a, b] of [[[-8, 6], [-10, 6]], [[-8, 8], [-10, 8]], [[8, 6], [8, 8]], [[-4, -6], [-6, -6]], [[6, -6], [6, -8]]]) {
    const pa = await onScreenSpot([a]);
    const pb = await onScreenSpot([b]);
    if (pa && pb) { pair = [pa, pb]; break; }
  }
  if (!pair) throw new Error('no drag-build pair on screen');
  await drag(pair[0].x, pair[0].y, pair[1].x, pair[1].y);
  await sleep(300);
  inf = await info(page);
  console.log('after drag-build:', JSON.stringify(inf));
  if (inf.towers !== 2) throw new Error(`drag-build failed, towers=${inf.towers}`);

  // ---- 3. one-finger drag pans the camera (no build selection: cancel it
  // first by tapping the selected card) ----
  await page.tap('#hud-build .card[data-build="cannon"]');
  await sleep(150);
  const camBefore = (await info(page)).cam;
  await drag(195, 500, 255, 440);
  const camAfter = (await info(page)).cam;
  console.log('pan:', JSON.stringify({ camBefore, camAfter }));
  if (camAfter.x >= camBefore.x - 1 || camAfter.z <= camBefore.z + 1) {
    throw new Error(`pan failed: ${JSON.stringify({ camBefore, camAfter })}`);
  }

  // ---- 4. two-finger pinch zooms ----
  const zoomBefore = (await info(page)).cam.zoom;
  await pinch(195, 450, 80, 240);
  const zoomAfter = (await info(page)).cam.zoom;
  console.log('pinch:', JSON.stringify({ zoomBefore, zoomAfter }));
  if (zoomAfter >= zoomBefore * 0.85) throw new Error(`pinch zoom-in failed: ${zoomBefore} -> ${zoomAfter}`);

  // ---- 5. tap-to-select a tower -> selection panel opens ----
  const placed = await page.evaluate(() => {
    const spots = [[-4, 6], [-2, 6], [4, 6], [-4, 8], [-2, 8], [2, 6]];
    let best = null;
    let bestD = Infinity;
    for (const [wx, wz] of spots) {
      const p = window.__td.project(wx, wz);
      const d = Math.hypot(p.x - 195, p.y - 450);
      if (d < bestD) { bestD = d; best = { wx, wz, x: p.x, y: p.y }; }
    }
    const ok = window.__td.place('gatling', best.wx, best.wz);
    return { ok, ...best };
  });
  if (!placed.ok) throw new Error('gatling place for select-test failed');
  await sleep(150);
  await touchDown(placed.x, placed.y);
  await sleep(60);
  await touchUp();
  await sleep(300);
  const selShown = await page.$eval('#sel-panel', (el) => !el.classList.contains('hidden'));
  const selTitle = await page.$eval('#sel-title', (el) => el.textContent);
  console.log('select:', JSON.stringify({ selShown, selTitle }));
  if (!selShown || !/Gatling/.test(selTitle ?? '')) throw new Error(`tap-select failed: shown=${selShown} title=${selTitle}`);

  const fatal = errors.filter((e) => !e.includes('favicon'));
  if (fatal.length > 0) {
    console.error('console errors:', fatal.slice(0, 10));
    throw new Error(`${fatal.length} console errors`);
  }
  console.log('TOUCH E2E PASS');
} finally {
  await browser.close();
}
