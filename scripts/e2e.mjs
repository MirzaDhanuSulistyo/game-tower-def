// Headless smoke test: boots the game, starts, places towers, runs waves.
// Usage: `npm run preview` in one shell, then `npm run e2e` in another.
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

const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(PREVIEW_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__td !== 'undefined', { timeout: 20000 });

  const boot = await page.evaluate(() => window.__td.info());
  console.log('boot:', JSON.stringify(boot));
  if (boot.state !== 'start') throw new Error(`expected start, got ${boot.state}`);

  await page.click('#btn-start');
  await new Promise((r) => setTimeout(r, 800));
  let info = await page.evaluate(() => window.__td.info());
  console.log('started:', JSON.stringify(info));
  if (info.state !== 'playing') throw new Error('did not enter playing state');

  // Place towers on proven off-path, in-range spots (cannon 50 + gatling 40 + mortar 80 = 170).
  const placed = await page.evaluate(() => {
    const td = window.__td;
    return [
      td.place('cannon', -5, 11),
      td.place('gatling', -5, 5),
      td.place('mortar', 8, -6),
    ];
  });
  console.log('placed:', JSON.stringify(placed));
  info = await page.evaluate(() => window.__td.info());
  console.log('after-place:', JSON.stringify(info));
  if (info.towers !== 3) throw new Error(`expected 3 towers, got ${info.towers} (placed=${placed})`);

  // Start wave 1: 6 grunts, towers should get kills (gold increases) and clear the wave.
  await page.evaluate(() => window.__td.startWave());
  await new Promise((r) => setTimeout(r, 8000));
  info = await page.evaluate(() => window.__td.info());
  console.log('wave1+8s:', JSON.stringify(info));
  if (info.wave !== 1) throw new Error(`expected wave 1, got ${info.wave}`);

  await new Promise((r) => setTimeout(r, 25000));
  info = await page.evaluate(() => window.__td.info());
  console.log('wave1+33s:', JSON.stringify(info));
  if (info.lives <= 0) throw new Error('died on wave 1 — towers too weak or path broken');
  if (info.enemies !== 0) throw new Error(`wave 1 not cleared, ${info.enemies} enemies remain: ${JSON.stringify(info.foes)}`);
  if (info.gold <= 0) throw new Error(`no kills recorded (gold=${info.gold})`);

  const fatal = errors.filter((e) => !e.includes('favicon'));
  if (fatal.length > 0) {
    console.error('console errors:', fatal.slice(0, 10));
    throw new Error(`${fatal.length} console errors`);
  }
  console.log('E2E PASS');
} finally {
  await browser.close();
}
