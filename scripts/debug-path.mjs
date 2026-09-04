// Pathing probe: no towers, wave 1, sample foe positions/wp over time.
const URL = process.env.DEBUG_URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { default: puppeteer } = await import('puppeteer-core');
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
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => window.__td.startWave());
  for (let t = 0; t <= 60; t += 4) {
    await new Promise((r) => setTimeout(r, 4000));
    const info = await page.evaluate(() => window.__td.info());
    const foes = info.foes.map((f) => `${f.kind}@(${f.x},${f.y},${f.z})wp${f.wp}`).join(' ');
    console.log(`t=${t + 4}s lives=${info.lives} enemies=${info.enemies} q=${info.queue}: ${foes}`);
    if (info.enemies === 0 && info.queue === 0) break;
  }
} finally {
  await browser.close();
}
