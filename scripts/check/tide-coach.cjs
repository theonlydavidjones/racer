/**
 * The foul-tide coach line in the page (ui/tideLine.ts), on the owner's Course 2 race (7 Nov 2026, 13:35, a 2.4 kt
 * ebb; seed 2434542977): the user boat put at X on the run to Fort Mason (mark 6) into the ebb, the line shows once;
 * put at mark 6 on the beat back west with the ebb under her, it doesn't.
 *   npm run dev -- --port 5199 &  node scripts/check/tide-coach.cjs <out-dir>   (about a minute; exits 1 on a failure)
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(120000);
  const errs = [], fail = m => { console.log('FAIL:', m); errs.push(m); };
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { if (!localStorage.getItem('tc-seeded')) { localStorage.setItem('tc-seeded', '1');
    localStorage.setItem('fbsim-settings-v2', JSON.stringify({ mode: 'race', course: 'ss2', tideDate: '2026-11-07', tideTime: '13:35', windKind: 'west', windKt: 7, current: 'real', traffic: 0, opponents: [], fleet: 0, raceFrom: 'water' })); } });
  await page.goto('http://localhost:5199/?inproc'); await page.waitForTimeout(3000);
  await page.click('[data-home="race"]'); await page.waitForTimeout(600);
  await page.click('[data-home="create"]'); await page.waitForTimeout(800);
  await page.click('#bGo'); await page.waitForTimeout(3000);
  const info = await page.evaluate(() => { const w = sim(); return { course: w.C.id ?? null, marks: w.C.marks.map((m, i) => `${i}:${m.name}`), leg: w.user.leg, date: w.raceDate, n: w.boats.length }; });
  console.log('race:', JSON.stringify(info));
  // put her on the leg whose next mark is Fort Mason (6), starting from X, then sail a minute of the race's time
  // (the course's marks in order: 0 A, 1 X, 2 Fort Mason, 3 X, 4 A, 5 X, 6 Fort Mason; a boat's leg is the mark she's bound for)
  const put = async (fromIdx, toIdx) => page.evaluate(({ fromIdx, toIdx }) => {
    const w = sim(), u = w.user, a = w.C.marks[fromIdx];
    u.x = a.p.x; u.y = a.p.y; u.v = 0; u.leg = toIdx; w.t = Math.max(w.t, 30); w.paused = false; return { from: a.name, to: w.C.marks[toIdx].name };
  }, { fromIdx, toIdx });
  // (the page draws a frame a second or so in headless Chromium: let the coach see the new leg, step the race 20 s on, let it look again)
  const settle = async () => { await page.waitForTimeout(4000); await page.evaluate(() => { const w = sim(); w.paused = true; for (let i = 0; i < 1200; i++) w.step(1 / 60); w.paused = false; }); await page.waitForTimeout(6000); };
  console.log('run X → Fort Mason:', JSON.stringify(await put(1, 2)));
  await settle();
  const log = () => page.evaluate(() => [...document.querySelectorAll('#msgLog li, #msgRecent li')].map(l => l.textContent));
  const l1 = await log(); console.log('log after the run setup:', JSON.stringify(l1.slice(-4)));
  const heard = l1.filter(t => /Foul tide/.test(t)).length;
  if (heard < 1) fail('no foul-tide line on the X→Fort Mason run into the ebb');
  await page.screenshot({ path: out + '/tide-coach.png' });
  // the beat back west, Fort Mason → X, the ebb under her: no line (the run's one stays the only one)
  console.log('beat Fort Mason → X:', JSON.stringify(await put(2, 3)));
  await settle();
  const l2 = await log(); if (l2.filter(t => /Foul tide/.test(t)).length !== heard) fail('a foul-tide line on the beat with the tide fair, or the run\'s was said twice');
  if (heard !== 1) fail('the line should show once on the run, saw ' + heard);
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
