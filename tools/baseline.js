// Behavior baseline for the plays. Drives every control with a seeded Math.random
// and records model state after each step, so a wrapped/restyled play can be
// diffed against the original.
//   NODE_PATH="$(npm root -g)" node tools/baseline.js <dir> <label> [viewport WxH]
// e.g. node tools/baseline.js source-plays orig   then   node tools/baseline.js plays new
// Writes tools/out/<label>/<play>.json. Requires a static server on :8765 at playbook/.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [dir, label, vp = '1180x820'] = process.argv.slice(2);
if (!dir || !label) { console.error('usage: baseline.js <dir> <label> [WxH]'); process.exit(2); }
const [vw, vh] = vp.split('x').map(Number);
const BASE = 'http://localhost:8765/';
const OUT = path.join(__dirname, 'out', label);
fs.mkdirSync(OUT, { recursive: true });

// mulberry32 seeded Math.random, installed before any page script runs
const SEED = `(()=>{let a=12345;Math.random=function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();`;

async function newPage(browser, initScripts = []) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true });
  for (const s of [SEED, ...initScripts]) await ctx.addInitScript(s);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors };
}

// ---------- offense plays (Inbound Stack, GGP) ----------
async function offState(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll('.wrap button')].map(b => ({
      id: b.id || ('ob' + b.dataset.n), text: b.textContent, disabled: b.disabled,
      opacity: b.style.opacity, bg: b.style.background, pressed: b.getAttribute('aria-pressed'),
    }));
    return {
      svg: document.getElementById('ct').innerHTML,
      cap: document.getElementById('cap').textContent,
      mirror, curState, btns,
    };
  });
}
async function idle(page) {
  await page.waitForFunction(() => curState !== 'busy', null, { timeout: 15000, polling: 50 });
  await page.waitForTimeout(80);
}
async function runOffense(browser, file, steps, cycle) {
  const { ctx, page, errors } = await newPage(browser);
  await page.goto(BASE + dir + '/' + file);
  const log = [{ step: 'init', ...(await offState(page)) }];
  for (const sel of steps) {
    const b = page.locator(sel);
    if (await b.isDisabled()) { log.push({ step: sel, skipped: 'disabled' }); continue; }
    await b.click();
    await idle(page);
    log.push({ step: sel, ...(await offState(page)) });
  }
  // Cycle: record the sequence of headings the loop shows over two full loops
  const heads = await page.evaluate(() => {
    window.__heads = [];
    new MutationObserver(() => {
      const t = document.getElementById('head').textContent;
      if (t && window.__heads[window.__heads.length - 1] !== t) window.__heads.push(t);
    }).observe(document.getElementById('head'), { childList: true, characterData: true, subtree: true });
    return true;
  });
  for (const sel of cycle) { await page.locator(sel).click(); await idle(page); }
  await page.waitForFunction(() => window.__heads.length >= 9, null, { timeout: 60000, polling: 100 });
  await page.locator('#bCycle').click();
  await page.waitForFunction(() => !loopRunning && curState !== 'busy', null, { timeout: 20000, polling: 50 });
  const cyc = await page.evaluate(() => window.__heads.slice(0, 9));
  log.push({ step: 'cycle-heads', heads: cyc, ...(await offState(page)) });
  await ctx.close();
  return { log, errors, heads };
}

const INB_STEPS = ['#bStack', '.ob[data-n="1"]', '.ob[data-n="2"]', '#bStack', '.ob[data-n="2"]', '.ob[data-n="3"]',
  '#bReset', '#bStack', '.ob[data-n="3"]', '#bSwitch', '.ob[data-n="1"]', '#bStack', '.ob[data-n="1"]',
  '.ob[data-n="2"]', '.ob[data-n="3"]', '#bReset', '#bStack', '#bSwitch', '#bSnd', '#bSnd'];
const GGP_STEPS = ['.ob[data-n="1"]', '#bP1', '.ob[data-n="1"]', '.ob[data-n="2"]', '.ob[data-n="3"]', '#bP3',
  '.ob[data-n="1"]', '.ob[data-n="2"]', '.ob[data-n="3"]', '#bReset', '#bSwitch', '#bP1', '.ob[data-n="2"]',
  '#bP3', '.ob[data-n="3"]', '#bReset', '#bSwitch', '#bSnd', '#bSnd'];

// ---------- Zone Shift Studio ----------
async function zoneState(page) {
  return page.evaluate(() => {
    const tf = g => g.getAttribute('transform');
    return {
      players: [...document.querySelectorAll('#pls .pl-g')].map(g => ({ t: tf(g), cls: g.getAttribute('class') })),
      ball: tf(document.querySelector('#ballLayer .ball-g')),
      stns: [...document.querySelectorAll('#stns .stn-g')].map(g => g.getAttribute('class')),
      chips: [...document.querySelectorAll('.chip')].map(b => b.className),
      status: document.getElementById('status').textContent,
      strat: document.getElementById('strat').value,
      tight: document.getElementById('tight').value,
      tour: document.getElementById('tour').textContent, tour2: document.getElementById('tour2').textContent,
      mirrorDis: document.getElementById('mirror').disabled, resetSpotDis: document.getElementById('resetSpot').disabled,
      json: document.getElementById('json').value,
    };
  });
}
// wait until player + ball transforms stop changing
async function settle(page, ms = 400) {
  await page.evaluate(ms => new Promise(res => {
    const snap = () => [...document.querySelectorAll('#pls .pl-g,#ballLayer .ball-g')].map(g => g.getAttribute('transform')).join('|');
    let last = snap(), since = performance.now();
    (function f() { const s = snap(); if (s !== last) { last = s; since = performance.now(); }
      if (performance.now() - since >= ms) res(); else requestAnimationFrame(f); })();
  }), ms);
}
// svg-space point -> client point
async function svgToClient(page, x, y) {
  return page.evaluate(([x, y]) => {
    const svg = document.getElementById('court'); const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const r = pt.matrixTransform(svg.getScreenCTM()); return { x: r.x, y: r.y };
  }, [x, y]);
}
async function drag(page, from, to) {
  const a = await svgToClient(page, from[0], from[1]), b = await svgToClient(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12);
  await page.mouse.up();
}
const chip = name => `.chip:text-is("${name}")`;

async function runZone(browser, file, preload) {
  const init = preload ? [`try{localStorage.setItem('zoneShiftStudio.v1',${JSON.stringify(preload)})}catch(e){}`] : [];
  const { ctx, page, errors } = await newPage(browser, init);
  await page.goto(BASE + dir + '/' + file);
  await settle(page);
  const log = [{ step: 'init', ...(await zoneState(page)) }];
  const rec = async step => { await settle(page); log.push({ step, ...(await zoneState(page)) }); };
  const click = async (sel, step) => { await page.locator(sel).first().click(); await rec(step || sel); await flashClear(); };
  // status flash messages clear on a 3.2s timer; wait them out so later steps are deterministic
  const flashClear = () => page.waitForFunction(() => !/^(Mirrored|All |Layouts loaded|Drop the ball|Couldn)/.test(document.getElementById('status').textContent), null, { timeout: 8000, polling: 100 });
  // stop a tour exactly when the ball is holding at a named station
  const stopTourAt = async (btn, name) => {
    await page.waitForFunction(n => document.getElementById('status').textContent.startsWith('Ball at ' + n + ' '), name, { timeout: 30000, polling: 'raf' });
    await page.locator(btn).click();
  };

  if (!preload) { // import the coach's exported layouts through the UI
    const exp = fs.readFileSync(path.join(__dirname, '..', 'exported layouts', '2-3 Zone.txt'), 'utf8').trim();
    await page.evaluate(() => { document.querySelector('details').open = true; });
    await page.locator('#json').fill(exp);
    await click('#imp', 'import');
  }
  for (const n of ['Left corner', 'Right wing', 'Top of the key', 'Nail', 'Left elbow', 'Right low block', 'Start (below the top)'])
    await click(chip(n), 'chip ' + n);
  for (const s of ['3-2', '1-3-1', '2-1-2', '2-3']) {
    await page.locator('#strat').selectOption(s); await rec('strat ' + s);
    await click(chip('Right slot'), s + ' chip RS');
  }
  for (const t of ['1', '6', '4.5', '3']) {
    await page.locator('#tight').fill(t);
    await drag(page, [470, 118], [400, 300]); // ball from RC to a between-spots point
    await rec('tight ' + t + ' between');
    await click(chip('Right corner'), 'tight ' + t + ' back RC');
  }
  // ball drag snapping to a station
  await drag(page, [470, 118], [255, 210]); await rec('drag ball to nail');
  // defender drag on the snapped spot, then mirror it
  await page.locator('#strat').selectOption('3-2'); await rec('strat 3-2 for edit');
  await click(chip('Left wing'), 'chip LW');
  const p0 = await page.evaluate(() => document.querySelector('#pls .pl-g').getAttribute('transform').match(/[-\d.]+/g).map(Number));
  await drag(page, p0, [p0[0] + 40, p0[1] - 30]); await rec('drag defender 0');
  await click('#mirror', 'mirror LW->RW');
  await click(chip('Right wing'), 'chip RW after mirror');
  await click('#resetSpot', 'reset RW');
  await page.evaluate(() => { document.querySelector('details').open = true; });
  await click('#exp', 'export');
  await click('#resetAll', 'reset all 3-2');
  await page.locator('#strat').selectOption('2-3'); await rec('back to 2-3');
  // tours: watch a few segments, then stop
  await page.locator('#tour').click(); await page.waitForTimeout(300);
  log.push({ step: 'arc tour running', tour: await page.locator('#tour').textContent() });
  await stopTourAt('#tour', 'Right corner'); await rec('arc tour stopped');
  await page.locator('#tour2').click();
  await stopTourAt('#tour2', 'Right low block'); await rec('paint tour stopped');
  // spotlight via double tap
  const p1 = await page.evaluate(() => document.querySelectorAll('#pls .pl-g')[1].getAttribute('transform').match(/[-\d.]+/g).map(Number));
  const c1 = await svgToClient(page, p1[0], p1[1]);
  await page.mouse.click(c1.x, c1.y); await page.mouse.click(c1.x, c1.y); await rec('spotlight 1');
  await page.locator('#snd').uncheck(); await rec('sound off');
  const stored = await page.evaluate(() => localStorage.getItem('zoneShiftStudio.v1'));
  log.push({ step: 'stored', stored });
  await page.reload(); await rec('after reload');
  await ctx.close();
  return { log, errors };
}

(async () => {
  const browser = await chromium.launch();
  const results = {
    'inbound-stack': await runOffense(browser, 'inbound-stack.html', INB_STEPS, ['#bCycle', '#bSwitch', '#bStack', '.ob[data-n="2"]']),
    'give-go-post': await runOffense(browser, 'give-go-post.html', GGP_STEPS, ['#bCycle', '#bSwitch', '#bP3', '.ob[data-n="1"]']),
    'zone-imported': await runZone(browser, 'zone-shift-studio.html', null),
    'zone-autogen': await runZone(browser, 'zone-shift-studio.html', JSON.stringify({ strat: '2-3', tight: 3, L: {}, E: {} })),
  };
  for (const [k, v] of Object.entries(results)) {
    fs.writeFileSync(path.join(OUT, k + '.json'), JSON.stringify(v, null, 1));
    console.log(k.padEnd(14), 'steps', v.log.length, 'errors', v.errors.length, v.errors.slice(0, 3).join(' | '));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
