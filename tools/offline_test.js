// Offline + update-flow test.
//   NODE_PATH="$(npm root -g)" node tools/offline_test.js [--update]
// 1. Load home online, wait for "Offline ready".  2. Go offline; reload home and open every
// play from plays.json, exercise one control, check for errors and that nothing hit the network.
// --update: also bump the version on disk, confirm "Update ready" -> Update -> new version shown,
// then restore the files.
const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://localhost:8765/';
const ROOT = path.join(__dirname, '..');
const doUpdate = process.argv.includes('--update');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let fail = 0;
  const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

  await page.goto(BASE + 'index.html');
  await page.waitForFunction(() => document.getElementById('status').textContent === 'Offline ready', null, { timeout: 20000 });
  ok(true, 'online: status shows "Offline ready"');
  const ver = await page.textContent('#ver');
  const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).map(r => new URL(r.url).pathname));
  console.log('     cached', cached.length, 'files');

  await ctx.setOffline(true);
  ctx.on('requestfailed', r => errors.push('request failed: ' + r.url()));
  await page.reload();
  await page.waitForSelector('.card');
  const plays = await page.evaluate(() => [...document.querySelectorAll('.card')].map(a => a.getAttribute('href')));
  ok(plays.length >= 3, `offline: home lists ${plays.length} plays`);
  for (const href of plays) {
    await page.goto(BASE + href);
    const title = (await page.$('.bb-title')) ? await page.textContent('.bb-title') : '(no shell) ' + await page.title();
    let acted = '';
    if (await page.$('#bStack')) { await page.click('#bStack'); acted = 'Form the stack'; }
    else if (await page.$('#bP1')) { await page.click('#bP1'); acted = 'GGP-1'; }
    else if (await page.$('#tour')) { await page.click('#tour'); acted = 'arc tour'; }
    await page.waitForTimeout(1500);
    ok(!!title, `offline: ${href} opened ("${title}"), ran ${acted || 'nothing'}`);
    if (await page.$('.bb-back')) await page.click('.bb-back'); else await page.goto(BASE + 'index.html');
    await page.waitForSelector('.card');
  }
  ok(errors.length === 0, 'offline: no console errors' + (errors.length ? ' -> ' + errors.slice(0, 4).join(' | ') : ''));
  await ctx.setOffline(false);

  if (doUpdate) {
    const saved = ['sw.js', 'shared/version.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f))]);
    const out = execSync('python tools/bump.py', { cwd: ROOT }).toString().trim();
    console.log('     ' + out);
    try {
      await page.goto(BASE + 'index.html');
      await page.waitForFunction(() => !document.getElementById('update').hidden, null, { timeout: 20000 });
      ok(true, 'update: "Update ready" offered after deploy');
      ok((await page.textContent('#ver')) === ver, 'update: old version still shown until applied (' + ver + ')');
      await Promise.all([page.waitForEvent('load'), page.click('#update')]);
      await page.waitForFunction(() => document.getElementById('status').textContent === 'Offline ready', null, { timeout: 20000 });
      const nv = await page.textContent('#ver');
      ok(nv !== ver, `update: version now ${nv}`);
      const keys = await page.evaluate(() => caches.keys());
      ok(keys.length === 1, 'update: old cache deleted (' + keys.join(', ') + ')');
    } finally {
      for (const [f, buf] of saved) fs.writeFileSync(path.join(ROOT, f), buf);
      console.log('     restored version files');
    }
  }
  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
