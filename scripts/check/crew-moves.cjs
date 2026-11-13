#!/usr/bin/env node
/**
 * The crew as the game shows them, for judging their poses and moves: stills of the main jobs (seated on the windward
 * side deck, hiking, kneeling at the mast and on the foredeck with the pole) from about the chase camera's angle but
 * close enough to read, and frame sequences of real moves (a tack, a hiking tack, setting the whisker pole), in the crew
 * lab (one boat sailing the real physics). Needs the dev server (npm run dev) on :5173.
 *   node scripts/check/crew-moves.cjs <out-dir>   → out-dir/still_<name>.png, out-dir/<move>/<nn>.png
 */
const { chromium } = require('playwright');
// (each still drawn after 8 s frame by frame: the figures walk to their places only in drawn frames)
// (yaw 0: from dead astern, + toward starboard; the chase camera sits astern and a little to one side, about 20° up)
const STILLS = [
  ['seated-windward', { windKt: 12 }, 35, 22, 5.5, [0, 0.8, 1.6]],
  ['hiking', { windKt: 20 }, 40, 20, 6, [0.3, 0.8, 1.8]],
  ['seated-leeward', { windKt: 4 }, -35, 22, 5.5, [0, 0.8, 1.6]],
  ['on-the-sole', { windKt: 8, place: { across: 'mid', fore: null } }, -30, 28, 5.5, [0, 0.6, 1.6]],
  ['at-the-mast', { windKt: 8, twa: 165 }, 70, 18, 4.5, [0.2, 0.9, -0.9]],
  ['pole-on-the-foredeck', { windKt: 7, twa: 172, pole: true }, 60, 18, 5, [0.1, 0.8, -1.9]]
];
const MOVES = [
  ['tack', { windKt: 10 }, () => lab.tack(), 0.3, 40, [-25, 26, 6.5, [0, 0.8, 1.4]]],
  ['tack-hiking', { windKt: 20 }, () => lab.tack(), 0.25, 48, [-25, 26, 6.5, [0, 0.8, 1.4]]],
  ['pole-set', { windKt: 7, twa: 172 }, () => { lab.boat().poleWant = true; }, 0.5, 48, [50, 22, 7.5, [0, 1.0, -0.4]]]
];
(async () => {
  const fs = require('fs'), out = process.argv[2] || '.', b = await chromium.launch(), p = await b.newPage({ viewport: { width: 960, height: 600 } });
  let errors = 0; p.on('pageerror', e => { errors++; console.log('page error:', e.message); });
  await p.goto('http://localhost:5173/scripts/check/crewlab/'); await p.waitForFunction(() => window.lab, null, { timeout: 60000 });
  await p.addStyleTag({ content: '#i{display:none}' });
  for (const [name, s, yaw, pitch, dist, at] of STILLS) {
    await p.evaluate(([s, y, pi, d, a]) => { lab.setup({ ...s, tack: 'S' }); lab.sail(s.pole ? 50 : 30); lab.frames(8); lab.fov(40); lab.cam(y, pi, d, a); }, [s, yaw, pitch, dist, at]);
    await p.screenshot({ path: `${out}/still_${name}.png` });
  }
  for (const [name, s, start, step, n, [yaw, pitch, dist, at]] of MOVES) {
    fs.mkdirSync(`${out}/${name}`, { recursive: true });
    await p.evaluate(([s, y, pi, d, a]) => { lab.setup({ ...s, tack: 'S' }); lab.sail(25); lab.frames(1); lab.fov(40); lab.cam(y, pi, d, a); }, [s, yaw, pitch, dist, at]);
    await p.evaluate(`(${start.toString()})()`);
    for (let i = 0; i < n; i++) {
      await p.evaluate(([st, y, pi, d, a]) => { lab.frames(st); lab.cam(y, pi, d, a); }, [step, yaw, pitch, dist, at]);
      await p.screenshot({ path: `${out}/${name}/${String(i).padStart(2, '0')}.png` });
    }
  }
  await b.close(); if (errors) process.exit(1);
})();
