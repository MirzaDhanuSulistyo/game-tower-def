// Combat stall hunter: real defense pounding the bridge, waves 1-3 at 1x.
// Reports any ~14s freeze with coordinates + screenshot.
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
  const rev = await page.evaluate(() => window.__td.info().rev);
  console.log('game rev:', rev);
  await page.click('#btn-start');
  await sleep(400);
  const placed = await page.evaluate(() => {
    const td = window.__td;
    return [td.place('cannon', -5, 11), td.place('gatling', -5, 5), td.place('mortar', 8, -6)];
  });
  console.log('placed:', JSON.stringify(placed));
  let prev = '';
  let same = 0;
  let waveDone = 0;
  const t0 = Date.now();
  await page.evaluate(() => window.__td.startWave());
  while (Date.now() - t0 < 600000) {
    await sleep(2000);
    const s = await page.evaluate(() => {
      const t = window.__td.info();
      return { wave: t.wave, lives: t.lives, state: t.state, enemies: t.enemies, queue: t.queue, foes: t.foes };
    });
    if (s.state === 'lost') { console.log('lost (ok for siege test)'); break; }
    if (s.enemies === 0 && s.queue === 0) {
      waveDone = s.wave;
      console.log(`wave ${s.wave} cleared. lives=${s.lives}`);
      prev = '';
      same = 0;
      if (s.wave >= 3) break;
      await page.evaluate(() => window.__td.startWave());
      continue;
    }
    if (s.enemies === 0) continue;
    const snap = s.foes
      .map((f) => `${f.kind}:${Math.round(f.x * 2) / 2},${Math.round(f.z * 2) / 2},w${f.wp}`)
      .sort().join('|');
    if (snap === prev) same++;
    else { prev = snap; same = 0; }
    if (same >= 7) {
      console.log(`STALL wave=${s.wave} lives=${s.lives}: ${snap}`);
      await page.screenshot({ path: 'cover/debug-siege-stall.png' });
      process.exitCode = 2;
      break;
    }
  }
  console.log('siege probe done, waves cleared:', waveDone);
} finally {
  await browser.close();
}
