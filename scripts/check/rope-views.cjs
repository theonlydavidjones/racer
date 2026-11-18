#!/usr/bin/env node
/**
 * Her lines drawn in their chosen colorways (8i: "real rope patterns"), checked on the 3D boat from both sides on both
 * tacks. In the crew lab (scripts/check/crewlab), she's given a white jib sheet with two red tracers and a white mainsheet
 * with a green fleck; then, close-hauled on each tack, each line is looked at from port and from starboard, close enough
 * that the 8 mm rope is about 20 pixels across, and the pixels where it crosses the middle of the picture are counted:
 * there must be the rope's white and its other color both (a plain line in the band's color, the way the lines were drawn
 * before, has none of the white). Every piece of each line must also carry its colorway's layer.
 * Needs the dev server (npm run dev) on :5173 (or pass its url).
 *
 *   node scripts/check/rope-views.cjs <out-dir> [url]   → out-dir/rope_{jibsheet,mainsheet}_{S,P}_{port,stbd}.png
 */
const { chromium } = require('playwright'); const path = require('path');
const out = process.argv[2] || '.', base = process.argv[3] || 'http://localhost:5173';
const ROPES = { jibsheet: 'red-tracers', mainsheet: 'green-fleck' };
// the rope's other color, lit or in her shade: red (the tracers) or green (the fleck), well clear of the deck, sea and sky
const MARK = { jibsheet: (r, g, b) => r > 110 && r > 1.9 * g && r > 1.9 * b, mainsheet: (r, g, b) => g > 45 && g > 1.35 * r && g > 1.05 * b };
const WHITE = (r, g, b) => Math.min(r, g, b) > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage({ viewport: { width: 900, height: 640 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(`${base}/scripts/check/crewlab/`); await pg.waitForFunction(() => window.lab, null, { timeout: 120000 });
  const fails = [];
  for (const tack of ['S', 'P']) {
    await pg.evaluate(([tack, lineRopes]) => { lab.setup({ windKt: 12, tack, n: 2, spec: { lineRopes } }); lab.sail(12); }, [tack, ROPES]);
    // each line's pieces carry its colorway's layer (and are drawn untinted: the layer has the colors)
    const layers = await pg.evaluate(keys => { const m = lab.mesh(), { lines, look } = m.ropes, res = {}; let k = 0;
      for (const { l } of lines) { const n = l.geometry.attributes.position.count - 1, key = l.userData.key;
        if (keys.includes(key)) { const r = (res[key] ??= { id: l.userData.ropeId, want: l.userData.ropeLayer, layers: new Set() }); for (let i = 0; i < n; i++) r.layers.add(look ? look.getZ(k + i) : -1); }
        k += n; }
      return Object.fromEntries(Object.entries(res).map(([a, r]) => [a, { ...r, layers: [...r.layers] }])); }, Object.keys(ROPES));
    // the points to look at: the jib sheet's run along the side deck to its winch on each side, the
    // mainsheet's span from the boom down to its block
    const at = await pg.evaluate(() => { const m = lab.mesh(); m.grp.updateMatrixWorld(true); const res = {};
      const V = m.grp.position.constructor, up = new V(0, 1, 0);
      // (in the frame the lab's camera aims in: hers turned with her heading, but not heeled)
      const local = (l, i) => { const P = l.geometry.attributes.position, v = new V(P.getX(i), P.getY(i), P.getZ(i)); l.localToWorld(v); return v.sub(m.grp.position).applyAxisAngle(up, -m.grp.rotation.y); };
      for (const { l } of m.ropes.lines) { const k = l.userData.key, n = l.geometry.attributes.position.count;
        if (k === 'jibsheet' && !res.jibsheet) res.jibsheet = { port: local(l, 3).add(local(l, 4)).multiplyScalar(0.5).toArray(), stbd: local(l, n - 4).add(local(l, n - 5)).multiplyScalar(0.5).toArray() };
        if (k === 'mainsheet' && !res.mainsheet && n === 7) { const p = local(l, 0).lerp(local(l, 1), 0.6).toArray(); res.mainsheet = { port: p, stbd: p }; } }
      return res; });
    for (const key of Object.keys(ROPES)) {
      const L = layers[key];
      if (!L || L.id !== ROPES[key] || !(L.want > 0) || L.layers.length !== 1 || L.layers[0] !== L.want) fails.push(`${tack} ${key}: drawn as ${JSON.stringify(L)}, not in ${ROPES[key]}`);
      for (const [side, yaw] of [['port', -75], ['stbd', 75]]) {
        const p = at[key]?.[side]; if (!p) { fails.push(`${tack} ${key}: no point to look at`); continue; }
        await pg.evaluate(([yaw, p]) => lab.cam(yaw, 25, 0.3, p), [yaw, p]);
        const f = path.join(out, `rope_${key}_${tack}_${side}.png`), png = await pg.screenshot({ path: f });
        // the middle of the picture: the rope crosses it
        const px = await pg.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
          return Array.from(x.getImageData(im.width / 2 - 70, im.height / 2 - 70, 140, 140).data); }, png.toString('base64'));
        let mark = 0, white = 0;
        for (let i = 0; i < px.length; i += 4) { if (MARK[key](px[i], px[i + 1], px[i + 2])) mark++; else if (WHITE(px[i], px[i + 1], px[i + 2])) white++; }
        const ok = mark >= 4 && white >= 60;
        console.log(`${tack} ${key} from ${side}: ${white} px of the rope's white, ${mark} of its ${key === 'jibsheet' ? 'red tracers' : 'green fleck'} ${ok ? 'ok' : 'FAIL'}  ${f}`);
        if (!ok) fails.push(`${tack} ${key} from ${side}: white ${white}, mark ${mark}`);
      }
    }
  }
  if (errs.length) { console.log('page errors:', errs.slice(0, 3)); fails.push('page errors'); }
  for (const f of fails) console.log('FAIL:', f);
  await br.close(); process.exit(fails.length ? 1 : 0);
})();
