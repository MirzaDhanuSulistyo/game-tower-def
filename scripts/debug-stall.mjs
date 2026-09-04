// Stall hunter: play waves 1-2 at 2x with no towers, report any ~12s freeze.
const URL = process.env.DEBUG_URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { default: puppeteer } = await import('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__td !== 'undefined', { timeout: 20000 });
  await page.click('#btn-start');
  await sleep(400);
  await page.click('#btn-speed'); // 2x
  await page.evaluate(() => window.__td.startWave());
  let prev = '';
  let same = 0;
  let startedWave2 = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 420000) {
    await sleep(2000);
    const s = await page.evaluate(() => {
      const t = window.__td.info();
      return { wave: t.wave, lives: t.lives, enemies: t.enemies, queue: t.queue, foes: t.foes };
    });
    if (s.wave === 1 && s.enemies === 0 && s.queue === 0 && !startedWave2) {
      startedWave2 = true;
      await page.evaluate(() => window.__td.startWave());
      console.log('wave 1 cleared, starting wave 2. lives=', s.lives);
      prev = '';
      same = 0;
      continue;
    }
    if (s.wave === 2 && s.enemies === 0 && s.queue === 0 && startedWave2) {
      console.log('wave 2 cleared, NO STALLS. lives=', s.lives);
      break;
    }
    if (s.lives <= 0) { console.log('died (pathing ok, no towers)'); break; }
    if (s.enemies === 0) continue;
    // coarse snapshot: 0.5 grid kills jitter, hops don't affect x/z much
    const snap = s.foes
      .map((f) => `${f.kind}:${Math.round(f.x * 2) / 2},${Math.round(f.z * 2) / 2},w${f.wp}`)
      .sort().join('|');
    if (snap === prev) same++;
    else { prev = snap; same = 0; }
    if (same >= 6) {
      console.log(`STALL wave=${s.wave} lives=${s.lives}: ${snap}`);
      await page.screenshot({ path: 'cover/debug-stall.png' });
      process.exitCode = 2;
      break;
    }
  }
  console.log('probe done');
} finally {
  await browser.close();
}
