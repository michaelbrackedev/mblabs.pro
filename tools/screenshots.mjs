// Playwright validation: full-page screenshots of every viewport.
// Usage: node tools/screenshots.mjs [baseURL]   (default http://localhost:4321)
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'wide-1920', width: 1920, height: 1080 },
];

// Use the environment's preinstalled chromium if the matching managed build is absent.
const fallback = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOpts = { args: ['--no-sandbox'] };
if (existsSync(fallback)) launchOpts.executablePath = process.env.PW_CHROME || fallback;
const browser = await chromium.launch(launchOpts);
let worstOverflow = 0;
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800); // let first reveals + canvas settle (fonts may be sandbox-blocked)
  // horizontal overflow check
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return Math.max(0, de.scrollWidth - de.clientWidth);
  });
  worstOverflow = Math.max(worstOverflow, overflow);
  const sectionCount = await page.evaluate(() => document.querySelectorAll('#mb-root section, #mb-root header, #mb-root footer').length);
  await page.screenshot({ path: resolve(OUT, `${vp.name}.png`), fullPage: true });
  console.log(`✓ ${vp.name.padEnd(13)} overflow=${overflow}px  sections=${sectionCount}`);
  await page.close();
}
await browser.close();
console.log(worstOverflow === 0 ? '\nPASS: no horizontal overflow at any viewport.' : `\nWARN: max horizontal overflow ${worstOverflow}px — investigate.`);
