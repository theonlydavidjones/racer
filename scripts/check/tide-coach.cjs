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
  await page.click('text=Create a race'); await page.waitForTimeout(800);
  await page.click('#bGo'); await page.waitForTimeout(3000);
  const info = await page.evaluate(() => { const w = sim(); return { course: w.C.id ?? null, marks: w.C.marks.map((m, i) => `${i}:${m.name}`), leg: w.user.leg, date: w.raceDate, n: w.boats.length }; });
  console.log('race:', JSON.stringify(info));
  const X = await page.evaluate(() => { const w = sim(); const m = w.C.marks.find(m => /^X/.test(m.name)) || w.C.marks[0]; return { x: m.p.x, y: m.p.y }; });
  // put her on the leg whose next mark is Fort Mason (6), starting from X, then sail a minute of the race's time
  const run = async (fromName, legMatch) => page.evaluate(({ fromName, legMatch }) => {
    const w = sim(), u = w.user, msgs0 = document.getElementById('msgRecent')?.children.length ?? 0;
    const find = n => w.C.marks.find(m => m.name === n);
    const a = find(fromName), idx = w.C.marks.findIndex(m => m.name === legMatch);
    u.x = a.p.x; u.y = a.p.y; u.v = 0; u.leg = idx; w.t = Math.max(w.t, 30);
    w.paused = false; return { idx, a: [a.p.x, a.p.y] };
  }, { fromName, legMatch });
  console.log('run:', JSON.stringify(await run('X', 'Fort Mason')));
  await page.waitForTimeout(12000);
  const log = () => page.evaluate(() => [...document.querySelectorAll('#msgLog li, #msgRecent li')].map(l => l.textContent));
  const l1 = await log(); console.log('log after the run setup:', JSON.stringify(l1.slice(-4)));
  const heard = l1.filter(t => /Foul tide/.test(t)).length;
  if (heard < 1) fail('no foul-tide line on the X→Fort Mason run into the ebb');
  await page.screenshot({ path: out + '/tide-coach.png' });
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
