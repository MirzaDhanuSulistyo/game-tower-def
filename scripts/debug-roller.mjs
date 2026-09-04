// Roller visual probe: rush to wave 3 at 2x speed, screenshot rollers on lane.
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
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__td !== 'undefined', { timeout: 20000 });
  await page.click('#btn-start');
  await sleep(500);
  await page.evaluate(() => {
    const td = window.__td;
    td.place('cannon', -5, 8);
    td.place('gatling', -4, -4);
    td.place('mortar', 6, -5);
    td.place('frost', 2, 7);
  });
  await page.click('#btn-speed'); // 2x
  for (let w = 1; w <= 3; w++) {
    await page.evaluate(() => window.__td.startWave());
    // wait until wave cleared (enemies 0 and queue 0) or timeout
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      const s = await page.evaluate(() => {
        const t = window.__td.info();
        return { wave: t.wave, enemies: t.enemies, queue: t.queue, lives: t.lives, gold: t.gold };
      });
      if (s.enemies === 0 && s.queue === 0) break;
    }
    const s = await page.evaluate(() => window.__td.info());
    console.log(`wave ${w} done:`, JSON.stringify(s));
    if (s.lives <= 0) throw new Error('died early');
  }
  // wave 4 has rollers mid-pack; catch them on the bridge
  await page.evaluate(() => window.__td.startWave());
  for (let i = 0; i < 60; i++) {
    await sleep(1500);
    const has = await page.evaluate(() => {
      const t = window.__td.info();
      return t.foes.some((f) => f.kind === 'roller' && f.x > -14 && f.x < 12 && f.z > -2 && f.z < 6);
    });
    if (has) break;
  }
  const info = await page.evaluate(() => window.__td.info());
  console.log('foes:', JSON.stringify(info.foes));
  await page.screenshot({ path: 'cover/debug-roller.png' });
  console.log('shot saved');
} finally {
  await browser.close();
}
