#!/usr/bin/env node
/**
 * Close-ups of the crew's joints in the crew lab's poses (for the skinning: the seated hip, the shoulder with the arm
 * raised, the hands, the feet on the deck, the head turned in a hood): each figure's hips, shoulders and feet from the
 * front, behind and both sides (the boat hidden), in light air (sitting low), a breeze (on the side deck), hiking, and on the cockpit sole.
 * Needs the dev server (npm run dev) on :5173.
 *   node scripts/check/crew-joints.cjs <out-dir> [case]   → out-dir/joint_<case>_<who>_<part>_<view>.png
 */
const { chromium } = require('playwright');
const CASES = [['light', { windKt: 4 }], ['breeze', { windKt: 12 }], ['hike', { windKt: 20 }], ['mid', { windKt: 8, place: { across: 'mid', fore: null } }], ['lee', { windKt: 8, place: { across: 'lee', fore: null } }]];
(async () => {
  const out = process.argv[2] || '.', only = process.argv[3], b = await chromium.launch(), p = await b.newPage({ viewport: { width: 640, height: 480 } });
  let errors = 0; p.on('pageerror', e => { errors++; console.log('page error:', e.message); });
  await p.goto('http://localhost:5173/scripts/check/crewlab/'); await p.waitForFunction(() => window.lab, null, { timeout: 60000 });
  await p.addStyleTag({ content: '#i{display:none}' });
  for (const [name, setup] of CASES) {
    if (only && name !== only) continue;
    await p.evaluate(s => { lab.setup(s); lab.sail(25); lab.fov(35);
      // (the boat hidden, the crew kept: the joints seen from anywhere, nothing in front of them)
      const m = lab.mesh(), keep = new Set(); m.crew.group.traverse(o => keep.add(o)); m.grp.traverse(o => { if (o.isMesh && !keep.has(o)) o.visible = false; }); }, { ...setup, tack: 'S' });
    // (each figure's hips, shoulders and feet in the boat's frame)
    const who = await p.evaluate(() => { const c = lab.mesh().crew, m = lab.mesh().grp; m.updateMatrixWorld(true);
      const inBoat = (o, y = 0) => { const v = o.localToWorld(new o.position.constructor(0, y, 0)); return m.worldToLocal(v).toArray(); };
      return [['helm', c.helm], ...c.crew.map((f, i) => [`crew${i + 1}`, f])].map(([n, f]) => ({ n, hip: inBoat(f.root), sh: inBoat(f.arm[1].root), foot: inBoat(f.leg[1].mid, -0.43), yaw: f.root.rotation.y })); });
    for (const w of who) for (const [part, at, dist] of [['hip', w.hip, 1.3], ['shoulder', w.sh, 1.1], ['foot', w.foot, 1.0]]) {
      for (const [view, dyaw, pitch] of [['right', 90, 12], ['back', 0, 15], ['front', 180, 10], ['left', -90, 12]]) {
        const yaw = (w.yaw * 180 / Math.PI) + dyaw;
        await p.evaluate(([y, pi, d, a]) => lab.cam(y, pi, d, a), [yaw, pitch, dist, at]);
        await p.screenshot({ path: `${out}/joint_${name}_${w.n}_${part}_${view}.png` });
      }
    }
  }
  await b.close(); if (errors) process.exit(1);
})();
