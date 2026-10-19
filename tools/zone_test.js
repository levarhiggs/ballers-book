// Feature test for the Baller's Book additions (not covered by the behavior baseline).
//   NODE_PATH="$(npm root -g)" node tools/zone_test.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8765/';
const Z = BASE + 'plays/zone-shift-studio.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, acceptDownloads: true });
  let fail = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let dialogAnswer = true;
  page.on('dialog', d => (dialogAnswer ? d.accept() : d.dismiss()));
  const settle = () => page.waitForTimeout(900);
  const tf = i => page.evaluate(i => document.querySelectorAll('#pls .pl-g')[i].getAttribute('transform'), i);
  const toClient = (x, y) => page.evaluate(([x, y]) => { const s = document.getElementById('court'); const p = s.createSVGPoint(); p.x = x; p.y = y; const r = p.matrixTransform(s.getScreenCTM()); return { x: r.x, y: r.y }; }, [x, y]);
  const xy = t => t.match(/[-\d.]+/g).map(Number);

  // --- first run: coach's defaults
  await page.goto(Z); await settle();
  const edited = await page.evaluate(() => document.querySelectorAll('.chip.edited').length);
  ok(edited === 15, `first run loads coach's 2-3 defaults (${edited}/15 spots edited)`);
  ok((await tf(3)) === 'translate(252.83 133.72)', 'center defender at coach\'s saved Start spot');
  ok(await page.evaluate(() => [...document.querySelectorAll('.pl-i')].map(t => t.textContent).join('')) === '13254', 'no names: defenders show numbers');
  ok(await page.evaluate(() => document.querySelectorAll('.pl-b').length === 0 && [...document.querySelectorAll('.pl-n')].every(t => !t.textContent)), 'no names: no badges or name labels');

  // --- Reset all: dismissing the confirm keeps everything
  dialogAnswer = false; await page.click('#resetAll'); dialogAnswer = true; await settle();
  ok(await page.evaluate(() => document.querySelectorAll('.chip.edited').length) === 15, 'Reset all: cancel keeps layouts');

  // --- touch drag of a defender (real touch events through CDP), page must not scroll
  await page.click('.chip:text-is("Left wing")');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Ball at Left wing')); await settle();
  const before = xy(await tf(0));
  const a = await toClient(before[0], before[1]), b = await toClient(before[0] + 50, before[1] + 25);
  const cdp = await ctx.newCDPSession(page);
  const scroll0 = await page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  const after = xy(await tf(0));
  ok(Math.abs(after[0] - before[0] - 50) < 2 && Math.abs(after[1] - before[1] - 25) < 2, `touch drag moves defender (${before.map(n => n.toFixed(0))} -> ${after.map(n => n.toFixed(0))})`);
  ok((await page.evaluate(() => scrollY)) === scroll0, 'touch drag does not scroll the page');

  // --- backup (download fallback in desktop Chromium) and restore from that file
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#backup')]);
  ok(!!dl, 'Back up layouts produces a file' + (dl ? ` (${dl.suggestedFilename()})` : ''));
  let backupText = '';
  if (dl) { const p = path.join(__dirname, 'out', dl.suggestedFilename()); await dl.saveAs(p); backupText = fs.readFileSync(p, 'utf8'); }
  ok(/"layouts"/.test(backupText) && !/zoneNames/.test(backupText), 'backup has layouts and no names');
  dialogAnswer = true; await page.click('#resetAll'); await settle();
  ok(await page.evaluate(() => document.querySelectorAll('.chip.edited').length) === 0, 'Reset all: confirm clears this zone');
  if (dl) {
    await page.setInputFiles('#impFileIn', path.join(__dirname, 'out', dl.suggestedFilename()));
    await settle();
    ok(await page.evaluate(() => document.querySelectorAll('.chip.edited').length) === 15, 'Restore from file brings the layouts back');
  }

  // --- presentation lock
  await page.click('#bbLock');
  ok(await page.evaluate(() => ['#resetAll', '#resetSpot', '#mirror', '#backup'].every(s => getComputedStyle(document.querySelector(s)).display === 'none' || !document.querySelector(s).offsetParent)), 'lock hides edit controls');
  await page.click('.chip:text-is("Left wing")');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Ball at Left wing')); await settle();
  const l0 = xy(await tf(0)); const c0 = await toClient(l0[0], l0[1]);
  await page.mouse.move(c0.x, c0.y); await page.mouse.down(); await page.mouse.move(c0.x + 60, c0.y + 40, { steps: 8 }); await page.mouse.up(); await settle();
  ok((await tf(0)) === `translate(${l0[0].toFixed(2)} ${l0[1].toFixed(2)})`, 'locked: defender cannot be dragged');
  await page.waitForTimeout(400);
  await page.mouse.click(c0.x, c0.y); await page.mouse.click(c0.x, c0.y);
  ok(await page.evaluate(() => document.querySelectorAll('#pls .pl-g')[0].classList.contains('hl')), 'locked: double-tap spotlight still works');
  const ball = await page.evaluate(() => document.querySelector('.ball-g').getAttribute('transform'));
  const bxy = xy(ball); const bc = await toClient(bxy[0], bxy[1]); const nail = await toClient(250, 207);
  await page.mouse.move(bc.x, bc.y); await page.mouse.down(); await page.mouse.move(nail.x, nail.y, { steps: 10 }); await page.mouse.up(); await settle();
  ok((await page.textContent('#status')).startsWith('Ball at Nail'), 'locked: ball can still be dragged to a spot');
  await page.reload(); await settle();
  ok(await page.evaluate(() => document.body.classList.contains('bb-locked')), 'lock survives reload');
  await page.click('#bbLock');

  // --- local player names
  await page.evaluate(() => { document.querySelectorAll('details')[1].open = true; });
  const ins = page.locator('#names input');
  for (const [i, n] of ['Alpha', 'Bravo', '', 'Delta', 'Echo'].entries()) await ins.nth(i).fill(n);
  await Promise.all([page.waitForEvent('load'), page.click('#namesSave')]); await settle();
  ok(await page.evaluate(() => [...document.querySelectorAll('.pl-i')].map(t => t.textContent).join('')) === 'AB2DE', 'names: initials shown, blank stays a number');
  ok(await page.evaluate(() => document.querySelectorAll('.pl-b').length) === 4, 'names: number badges only on named defenders');
  await page.evaluate(() => { document.querySelectorAll('details')[1].open = true; });
  for (let i = 0; i < 5; i++) await ins.nth(i).fill('');
  await Promise.all([page.waitForEvent('load'), page.click('#namesSave')]); await settle();
  ok(await page.evaluate(() => localStorage.getItem('ballersBook.zoneNames')) === null, 'names: clearing all removes them from storage');

  // --- global sound setting across plays
  await page.goto(BASE + 'plays/inbound-stack.html');
  await page.click('#bSnd');
  ok((await page.textContent('#bSnd')) === 'Sound off', 'sound off in Inbound Stack');
  await page.goto(BASE + 'plays/give-go-post.html');
  ok((await page.textContent('#bSnd')) === 'Sound off', 'sound off carried to Give Go Post');
  await page.goto(Z);
  ok(!(await page.isChecked('#snd')), 'sound off carried to Zone Shift Studio');
  await page.check('#snd');
  await page.goto(BASE + 'plays/inbound-stack.html');
  ok((await page.textContent('#bSnd')) === 'Sound on', 'sound back on carried to Inbound Stack');

  // --- wake lock toggle persists (lock itself may be refused headless)
  const awake = page.locator('#bbAwake');
  if (await awake.isVisible()) {
    const v0 = await awake.getAttribute('aria-pressed');
    await awake.click(); await page.reload();
    ok((await awake.getAttribute('aria-pressed')) !== v0, 'Keep awake toggle persists across reload');
    await awake.click();
  }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
