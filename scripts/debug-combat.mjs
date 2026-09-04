// Combat visual probe: towers near bridge, screenshot mid-fight + foe dump.
const URL = process.env.DEBUG_URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { default: puppeteer } = await import('puppeteer-core');
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
  await new Promise((r) => setTimeout(r, 500));
  const placed = await page.evaluate(() => {
    const td = window.__td;
    return [td.place('cannon', -5, 8), td.place('gatling', -4, -4), td.place('mortar', 6, -5)];
  });
  console.log('placed:', JSON.stringify(placed));
  await page.evaluate(() => window.__td.startWave());
  await new Promise((r) => setTimeout(r, 22000));
  const info = await page.evaluate(() => window.__td.info());
  console.log('foes:', JSON.stringify(info.foes), 'lives:', info.lives, 'gold:', info.gold);
  await page.screenshot({ path: 'cover/debug-combat.png' });
  console.log('shot saved');
} finally {
  await browser.close();
}
