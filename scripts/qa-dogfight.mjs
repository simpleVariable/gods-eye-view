/**
 * Dogfight smoke test: two browser pilots join the same arena, one holds fire,
 * and both pages must stay error-free and show the other aircraft.
 *
 * Requires a running dev or preview server (default http://localhost:5173).
 *   node scripts/qa-dogfight.mjs [--url http://localhost:5173] [--shots dir]
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv;
const arg = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
const base = arg('--url', 'http://localhost:5173');
const shots = arg('--shots', '');
if (shots) mkdirSync(shots, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,800', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});

async function pilot(name, plane) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/dogfight`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#enter:not(:disabled)', { timeout: 60_000 });
  await page.$eval('#callsign', (el) => { el.value = ''; });
  await page.type('#callsign', name);
  await page.click('#planes .plane:nth-child(' + plane + ')');
  await page.click('#enter');
  await page.waitForFunction(() => document.getElementById('menu').hidden, { timeout: 15_000 });
  return { page, errors };
}

try {
  const a = await pilot('QA_Alpha', 2);
  const b = await pilot('QA_Bravo', 3);
  await sleep(3000);

  for (const [label, p] of [['alpha', a], ['bravo', b]]) {
    const board = await p.page.$$eval('#board-list li', (n) => n.map((x) => x.textContent));
    check(`${label} sees both pilots on the scoreboard`, board.length === 2, board);
    const speed = await p.page.$eval('#v-spd', (n) => Number(n.textContent));
    check(`${label} has airspeed`, speed > 100, speed);
  }

  const hidden = (p, id) => p.page.$eval(id, (n) => n.hidden);
  check('controls hint is shown after spawn', !(await hidden(b, '#controls')));
  await a.page.bringToFront();
  await a.page.keyboard.down('Tab');
  await sleep(300);
  check('Tab shows the scoreboard', !(await hidden(a, '#scoreboard')));
  await a.page.keyboard.up('Tab');
  await sleep(300);
  check('releasing Tab hides the scoreboard', await hidden(a, '#scoreboard'));

  await a.page.keyboard.down('Space');
  await sleep(1500);
  await a.page.keyboard.up('Space');
  if (shots) {
    await a.page.bringToFront();
    await sleep(500);
    await a.page.screenshot({ path: path.join(shots, 'alpha.png') });
    await b.page.bringToFront();
    await sleep(500);
    await b.page.screenshot({ path: path.join(shots, 'bravo.png') });
  }

  const radarDots = await b.page.evaluate(() => document.getElementById('radar') !== null);
  check('radar present', radarDots);
  check('no page errors', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 5));
} finally {
  await browser.close();
}

process.exit(results.every(Boolean) ? 0 : 1);
