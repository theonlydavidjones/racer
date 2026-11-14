/*
 * Every line drawn on her (sheets, halyards, control lines, the vang, the backstay…) checked against her solid surfaces:
 * the hull and deck, the cabin, the cockpit coamings and the mast. Each line is sampled every centimetre in her own frame
 * (heel and all taken out) and any stretch that's inside one of them is reported: which line, how deep, and where (z
 * aft of amidships, x to starboard). On both tacks, close-hauled, reaching and running, from the showroom, so it catches
 * lines from either side and from either tack, and can be run again whenever the hull's geometry changes.
 *
 * The surfaces are the hull's own (render/hull.ts: deckY, cabinTopAt, cabinHalf, cockpitHalf, COAMING_H), imported from
 * the dev server, so this follows the geometry wherever it goes. The cockpit well is taken as open (lines run into it);
 * the mast as an ellipse of its section from the deck to 2.5 m up (above that it bends, and the lines leave it).
 *
 *   npm run dev &  node scripts/check/line-clash.cjs [port] [--all]
 * Prints each clash (the deepest point of each stretch), and every loose end: a line whose end meets nothing (no fitting,
 * sail, deck, mast or the cockpit well, where tails fall); exits 1 if there are any. --all lists every
 * stretch rather than the worst per line.
 */
const { chromium } = require('playwright');
(async () => {
  const port = +(process.argv.find(a => /^\d+$/.test(a)) ?? 5173), all = process.argv.includes('--all');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${port}/`); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="fleet"]').click()); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('.fcard').click()); await p.waitForTimeout(1500);
  const found = [], looseAll = new Map();
  for (const twa of [45, -45, 100, -100, 160, -160]) {
    await p.evaluate(a => window.__twa(a), twa); await p.waitForTimeout(3500);
    const r = await p.evaluate(async () => {
      const H = await import('/src/render/hull.ts'), M = await import('/src/render/boatMesh.ts');
      const m = window.__view.boatMeshes[0], g = m.grp; g.updateMatrixWorld(true);
      // (the mast's foot to 2.5 m up, where the lines run along it: above that the drawn mast bends aft, which a straight
      // section would misplace)
      const R = M.RIG ?? {}, mast = { z: R.MAST_Z, ath: (R.MAST_ATH ?? 0.11) / 2, fa: (R.MAST_FA ?? 0.133) / 2, top: (R.DECK_AT_MAST ?? 0.7) + 2.5 };
      const deckAtMast = H.deckY(H.uAtZ(mast.z ?? 0), 0);
      // how far (m) a point in her frame is inside a solid surface, or 0
      const inMast = q => mast.z != null && q.y > deckAtMast && q.y < mast.top && (q.x / mast.ath) ** 2 + ((q.z - mast.z) / mast.fa) ** 2 < 1;
      const depth = (x, y, z) => {
        const u = H.uAtZ(z), ax = Math.abs(x);
        if (u < 0.002 || u > 0.998 || ax > H.halfBeam(u)) return 0;
        if (mast.z != null && y > deckAtMast && y < mast.top && (x / mast.ath) ** 2 + ((z - mast.z) / mast.fa) ** 2 < 1) return Math.min(mast.ath - ax, mast.fa - Math.abs(z - mast.z));
        let top;
        if (u > H.CABIN.u0 && u < H.CABIN.u1 && ax < H.cabinHalf(u)) top = H.cabinTopAt(u, x);
        else if (u > H.COCKPIT.u0 && u < H.COCKPIT.u1 && ax < H.cockpitHalf(u)) return 0; // (the cockpit well: open)
        else if (u > H.COCKPIT.u0 && u < H.COCKPIT.u1 && ax < H.cockpitHalf(u) + H.COAMING_T) top = H.deckY(u, ax) + H.COAMING_H(z);
        else top = H.deckY(u, ax);
        return Math.max(0, top - y);
      };
      const out = [], loose = [], V = g.position.constructor, a = new V(), c = new V(), q = new V();
      let n = 0;
      // (what a line's end may meet: a fitting, a small mesh such as a block, cleat, car or winch, or the sails (a clew),
      // their vertices in her frame; the deck, cabin top or coaming under it; the mast; or the cockpit well, where tails fall)
      const fit = [];
      g.traverse(o => {
        if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
        o.geometry.computeBoundingSphere?.(); const r = o.geometry.boundingSphere?.radius ?? 9, sail = o === m.main?.mesh || o === m.jib?.mesh;
        if (r > 0.6 && !sail && !o.userData.fittings) return; // (boatMesh bakes her still fittings into one mesh per material)
        const pa = o.geometry.attributes.position, w = new V();
        for (let i = 0; i < pa.count; i++) { w.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); g.worldToLocal(w); fit.push(w.x, w.y, w.z); }
      });
      // (and every line's segments, in her frame: a line may end on another, as a Cunningham's on the stay)
      const segsAll = [];
      g.traverse(o => {
        if (!o.isLine || !o.visible) return;
        const pa = o.geometry.attributes.position, w = []; for (let i = 0; i < pa.count; i++) { const v = new V().fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); g.worldToLocal(v); w.push(v); }
        for (let i = 0; i + 1 < w.length; i += o.isLineSegments ? 2 : 1) segsAll.push([w[i], w[i + 1], o]);
      });
      const nearLine = (p, self) => segsAll.some(([s0, s1, o]) => {
        if (o === self) return false;
        const d = s1.clone().sub(s0), t = Math.max(0, Math.min(1, p.clone().sub(s0).dot(d) / (d.lengthSq() || 1)));
        return s0.clone().addScaledVector(d, t).distanceTo(p) < 0.04;
      });
      const meets = (p, self) => {
        if (nearLine(p, self)) return 'line';
        for (let i = 0; i < fit.length; i += 3) if ((fit[i] - p.x) ** 2 + (fit[i + 1] - p.y) ** 2 + (fit[i + 2] - p.z) ** 2 < 0.05 * 0.05) return 'fitting';
        const u = H.uAtZ(p.z), ax = Math.abs(p.x);
        if (mast.z != null && p.y > deckAtMast && Math.abs(p.z - mast.z) < (p.y < mast.top ? mast.fa + 0.04 : 0.3) && ax < (p.y < mast.top ? mast.ath + 0.04 : 0.15)) return 'mast';
        if (u > H.COCKPIT.u0 && u < H.COCKPIT.u1 + 0.02 && ax < H.cockpitHalf(u) + 0.03) return 'cockpit';
        if (u > 0 && u < 1 && ax < H.halfBeam(u) + 0.02) {
          const top = u > H.CABIN.u0 && u < H.CABIN.u1 && ax < H.cabinHalf(u) ? H.cabinTopAt(u, p.x) : H.deckY(u, ax);
          if (p.y > top - 0.1 && p.y < top + 0.08) return 'deck';
        }
        return null;
      };
      g.traverse(o => {
        if (!o.isLine || !o.visible) return;
        let vis = true; for (let pa = o.parent; pa && pa !== g; pa = pa.parent) if (!pa.visible) vis = false;
        if (!vis) return;
        const pos = o.geometry.attributes.position, name = (o.userData.inside ? '(inside by design) ' : '') + (o.userData.key ?? `${o.parent === g ? 'boat' : o.parent.name || o.parent.type}#${o.id}`);
        const segs = o.isLineSegments ? 2 : 1;
        n++;
        // each end (or each piece's ends, for line segments) must meet something
        for (let i = 0; i < pos.count; i++) {
          if (!o.isLineSegments && i > 0 && i < pos.count - 1) continue;
          q.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); g.worldToLocal(q);
          if (o.userData.inside && depth(q.x, q.y, q.z) > 0) continue; // (a line run inside her by design ends at a fitting below the deck, not drawn)
          if (!meets(q, o)) loose.push({ name, at: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)] });
        }
        let run = null;
        // (a line's end made fast at its fitting, on the mast or the deck: its last few centimetres inside are the fitting, not a clash)
        const close = () => { if (run) { if (!(run.end && run.len < 0.08)) out.push(run); run = null; } };
        for (let i = 0; i + 1 < pos.count; i += segs) {
          a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); g.worldToLocal(a);
          c.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld); g.worldToLocal(c);
          const L = a.distanceTo(c), k = Math.max(1, Math.ceil(L / 0.01));
          for (let j = 0; j <= k; j++) {
            q.copy(a).lerp(c, j / k);
            const d = depth(q.x, q.y, q.z);
            if (d > 0.006) { if (!run) run = { name, d: 0, at: null, from: q.z, to: q.z, len: 0, end: false, mast: inMast(q) }; else run.len += L / k; run.to = q.z; if ((i === 0 && j === 0) || (i + 2 >= pos.count && j === k)) run.end = true; if (d > run.d) { run.d = d; run.at = [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]; } }
            else close();
          }
          if (segs === 2) close();
        }
        close();
      });
      return { lines: n, out, loose };
    });
    for (const c of r.out) found.push({ twa, ...c });
    for (const l of r.loose) looseAll.set(`${l.name}@${l.at.join(',')}`, { twa, ...l });
    console.log(`twa ${twa}: ${r.lines} lines checked, ${r.out.length} stretches inside`);
  }
  // the worst stretch of each line (or every one with --all)
  const worst = new Map();
  for (const f of found) { const k = f.name; if (all || !worst.has(k) || worst.get(k).d < f.d) worst.set(all ? `${k}@${f.twa}@${f.from}` : k, f); }
  for (const f of [...worst.values()].sort((x, y) => y.d - x.d))
    console.log(`${f.name.padEnd(16)} ${(f.d * 100).toFixed(1).padStart(5)} cm inside at x ${f.at[0]} y ${f.at[1]} z ${f.at[2]} (z ${f.from.toFixed(2)}…${f.to.toFixed(2)}, twa ${f.twa})`);
  // loose ends: a line stopping in mid-air (the owner's "false shrouds" ending above the deck)
  for (const l of looseAll.values()) console.log(`loose end: ${l.name} at x ${l.at[0]} y ${l.at[1]} z ${l.at[2]} (twa ${l.twa})`);
  if (errs.length) console.log('page errors:', errs);
  await b.close();
  // (lines drawn to run inside her on purpose are listed, not failed)
  process.exit(found.some(f => !f.name.startsWith('(inside')) || looseAll.size ? 1 : 0);
})();
