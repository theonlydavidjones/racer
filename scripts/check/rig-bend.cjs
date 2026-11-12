#!/usr/bin/env node
/**
 * The rig as drawn against the rig as tuned (render/boatMesh.ts syncRig, boat/rigTune.ts rigDrawn): on both tacks, the
 * backstay off and full on, a soft tune (North Sails' light setting) in the showroom's breeze. Reads the meshes from the
 * scene (dev build): the forestay's sag at mid-stay, how far the jib's luff lies off the stay (should be under ~1 cm),
 * the mast's drawn bow, and how evenly the main's luff keeps to the bent mast (the spread of its distance from the mast's
 * centreline, should be a few mm). The sag a few centimetres can't be judged by eye at any useful camera distance.
 * Needs the dev server (npm run dev) on :5173.   node scripts/check/rig-bend.cjs
 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="fleet"]').click()); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('.fcard').click()); await p.waitForTimeout(1500);
  const res = [];
  for (const twa of [55, -55]) for (const bs of [0, 1]) {
    await p.evaluate(a => window.__twa(a), twa); await p.waitForTimeout(1200);
    await p.evaluate(bs => { const u = window.sim().user; u.tune = { forestayMark: 1.31, footAft: 22, shroudTurns: 0, jumperTurns: 0 }; u.rigMain = undefined; u.ctl.backstay = bs; u.ctlCmd = {}; }, bs);
    await p.waitForTimeout(200);
    res.push(await p.evaluate(() => {
      const m = window.__view.boatMeshes[0], V = m.grp.position.constructor, u = window.sim().user;
      m.grp.updateMatrixWorld(true);
      const pts = (obj, idx) => { const a = obj.geometry.attributes.position, out = []; for (const i of idx) out.push(new V(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(obj.matrixWorld)); return out; };
      const fs = m.rigDrawn.forestay, stay = pts(fs, [...Array(fs.geometry.attributes.position.count).keys()]);
      const distToPoly = (q, poly) => { let best = 1e9; for (let i = 0; i < poly.length - 1; i++) { const a = poly[i], d = poly[i + 1].clone().sub(a), t = Math.max(0, Math.min(1, q.clone().sub(a).dot(d) / d.lengthSq())); best = Math.min(best, a.clone().addScaledVector(d, t).distanceTo(q)); } return best; };
      const C = m.jib.sVals.length, jl = pts(m.jib.mesh, m.jib.tVals.map((_, i) => i * C));
      const jibGap = Math.max(...jl.slice(1, -1).map(q => distToPoly(q, stay)));
      const straight = [stay[0], stay[stay.length - 1]], stayMid = distToPoly(stay[(stay.length - 1) / 2], straight);
      // mast centreline: rings of the cylinder
      const mg = m.rigDrawn.mast.geometry.attributes.position, rings = new Map();
      for (let i = 0; i < mg.count; i++) { const y = Math.round(mg.getY(i) * 1000); const r = rings.get(y) ?? { x: 0, y: mg.getY(i), z: 0, n: 0 }; r.x += mg.getX(i); r.z += mg.getZ(i); r.n++; rings.set(y, r); }
      const axis = [...rings.values()].sort((a, b) => a.y - b.y).map(r => new V(r.x / r.n, r.y, r.z / r.n).applyMatrix4(m.rigDrawn.mast.matrixWorld));
      const Cm = m.main.sVals.length, ml = pts(m.main.mesh, m.main.tVals.map((_, i) => i * Cm));
      const md = ml.map(q => distToPoly(q, axis)), mainSpread = Math.max(...md) - Math.min(...md);
      const axisStraight = [axis[0], axis[axis.length - 1]], bowDrawn = Math.max(...axis.map(q => distToPoly(q, axisStraight)));
      return { tack: u.tack, bs: u.ctl.backstay, aws: +u.aws.toFixed(2), sagModel: +m.rigDrawn.forestay.geometry.attributes.position.getX(6).toFixed(3), stayMid: +stayMid.toFixed(3), jibGap: +jibGap.toFixed(4), bow: m.rigDrawn.bow, topAft: m.rigDrawn.topAft, bowDrawn: +bowDrawn.toFixed(3), mainLuffSpread: +mainSpread.toFixed(4) };
    }));
  }
  console.log(JSON.stringify(res, null, 1), errs);
  await b.close();
})();
