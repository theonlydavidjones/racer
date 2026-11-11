#!/usr/bin/env node
/**
 * The crew from both sides on both tacks, in light air, Mid, a breeze, hiking, downwind and through a tack and a gybe,
 * in the crew lab (scripts/check/crewlab: one boat sailing in the real physics, the camera anywhere around her). Needs
 * the dev server (npm run dev) on :5173.
 *
 *   node scripts/check/crew.cjs <out-dir>   → out-dir/crew_<case>_<S|P>_<side>.png, and tack_/gybe_ sequences
 */
const { chromium } = require('playwright');
const CASES = [
  ['light', { windKt: 4 }], ['mid', { windKt: 8, place: { across: 'mid', fore: null } }], ['lee', { windKt: 8, place: { across: 'lee', fore: null } }],
  ['breeze', { windKt: 12 }], ['hike', { windKt: 20 }], ['downwind', { windKt: 8, twa: 165 }]
];
(async () => {
  const out = process.argv[2] || '.', b = await chromium.launch(), p = await b.newPage({ viewport: { width: 900, height: 640 } });
  let errors = 0; p.on('pageerror', e => { errors++; console.log('page error:', e.message); });
  await p.goto('http://localhost:5173/scripts/check/crewlab/'); await p.waitForFunction(() => window.lab, null, { timeout: 60000 });
  for (const [name, setup] of CASES) for (const tack of ['S', 'P']) {
    await p.evaluate(s => { lab.setup(s); lab.sail(30); }, { ...setup, tack });
    // the windward side (the wind over starboard on starboard tack) and the leeward side, and from above astern
    const w = tack === 'S' ? 1 : -1;
    for (const [side, yaw, pitch] of [['windward', 80 * w, 15], ['leeward', -80 * w, 22], ['above', 0, 40]]) {
      await p.evaluate(([y, pi]) => lab.cam(y, pi, 4.3, [0, 0.65, 1.9]), [yaw, pitch]);
      await p.screenshot({ path: `${out}/crew_${name}_${tack}_${side}.png` });
    }
    console.log(name, tack, (await p.evaluate(() => lab.info())).replace(/\n/g, ' | '));
  }
  for (const [name, setup] of [['tack', { windKt: 10 }], ['gybe', { windKt: 12, twa: 160 }]]) {
    await p.evaluate(s => { lab.setup(s); lab.sail(25); lab.tack(); }, setup);
    for (let i = 0; i < 12; i++) {
      await p.evaluate(() => { lab.frames(0.6); lab.cam(-15, 35, 4.4, [0, 0.6, 1.9]); });
      await p.screenshot({ path: `${out}/${name}_${String(i).padStart(2, '0')}.png` });
    }
  }
  await b.close();
  if (errors) process.exit(1);
})();
