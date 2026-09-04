// Renders CrazyGames cover images from cover/cover.html using system Chrome.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = [
  { size: 'landscape', w: 1920, h: 1080, out: 'cover/cover-landscape.png' },
  { size: 'portrait', w: 800, h: 1200, out: 'cover/cover-portrait.png' },
  { size: 'square', w: 800, h: 800, out: 'cover/cover-square.png' },
];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
});
try {
  for (const s of shots) {
    const page = await browser.newPage();
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
    await page.goto(`file://${root}/cover/cover.html?size=${s.size}`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(root, s.out) });
    console.log('wrote', s.out);
    await page.close();
  }
} finally {
  await browser.close();
}
