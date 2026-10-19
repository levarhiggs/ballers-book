// Screenshots of the home screen and every play at iPad/phone sizes, light + dark.
//   NODE_PATH="$(npm root -g)" node tools/shots.js [label] [page-filter]
// Writes tools/out/shots-<label>/<page>-<size>-<scheme>.png. Needs the :8765 server.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const label = process.argv[2] || 'now';
const filter = process.argv[3] || '';
const OUT = path.join(__dirname, 'out', 'shots-' + label);
fs.mkdirSync(OUT, { recursive: true });
const PAGES = { home: 'index.html', inbound: 'plays/inbound-stack.html', ggp: 'plays/give-go-post.html', zone: 'plays/zone-shift-studio.html' };
const SIZES = { land: [1180, 820], port: [820, 1180], phone: [390, 844] };

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    for (const [sz, [w, h]] of Object.entries(SIZES)) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: true });
      for (const [name, url] of Object.entries(PAGES)) {
        if (filter && !filter.split(',').includes(name)) continue;
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
        await page.goto('http://localhost:8765/' + url);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, `${name}-${sz}-${scheme}.png`) });
        const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (errs.length || over) console.log(name, sz, scheme, over ? 'HORIZONTAL OVERFLOW' : '', errs.join(' | '));
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log('shots in', OUT);
})();
