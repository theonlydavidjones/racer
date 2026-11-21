// The crew audit's stills: a recorded moment (zz-audit's replay, served under the dev server's root) drawn in the crew
// lab's boat as the game draws it (syncCrew with each frame's places, poses, heel, windward side, tacking), stopped at its
// worst frame, as it happened and in a mirror (the other tack), from both sides, the camera on the figure named.
// node audstill.cjs <out> <base> <url of the replay> <tag> <who: helm|crew1|crew2> [t to stop at] [dist] [pitch]
const { chromium } = require('playwright');
const [out, base, url, tag, who = 'crew1', tStop, dist = '2.4', pitch = '35'] = process.argv.slice(2);
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(`${base}/scripts/check/crewlab/`); await pg.waitForFunction(() => window.lab, null, { timeout: 120000 });
  await pg.addStyleTag({ content: '#i{display:none}' });
  for (const mirror of [false, true]) {
    const info = await pg.evaluate(async ([url, mirror, who, tStop]) => {
      const [crew, phys, rec] = await Promise.all([import('/src/render/crew.ts'), import('/src/boat/crewPhys.ts'), fetch(url).then(r => r.json())]);
      if (mirror) rec.frames = rec.frames.map(r => ({ ...r, w: -r.w, heel: -r.heel, people: r.people.map(p => ({ ...p, x: -p.x, ...(p.goal ? { goal: { x: -p.goal.x, z: p.goal.z } } : {}) })) }));
      const stop = tStop ? +tStop : rec.tMax, tack = rec.frames[0].w > 0 ? 'S' : 'P';
      lab.setup({ windKt: 12, tack, n: rec.spec.crew.length }); lab.sail(3);
      const m = lab.mesh(); if (window.__cr) window.__cr.group.removeFromParent();
      const c = phys.newCrew(rec.spec, tack), cr = window.__cr = crew.buildCrew(rec.spec.helm, rec.spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
      m.crew.group.parent.add(cr.group); m.crew.group.visible = false;
      let prev = rec.frames[0].t, last;
      for (const r of rec.frames) {
        if (r.t > stop + 1e-6) break;
        c.clock = r.clock; c.roll = r.roll;
        r.people.forEach((p, i) => Object.assign(c.people[i], { goal: undefined, job: null, ready: false, outUntil: 0, lean: 0 }, p));
        crew.syncCrew(cr, r.w, c, Math.max(1e-3, r.t - prev), false, undefined, r.heel, !!r.tacking); prev = r.t; last = r;
      }
      lab.boat().heel = last.heel;
      const f = who === 'helm' ? cr.helm : cr.crew[+who.slice(4) - 1], hp = f.cur.hip;
      return { t: last.t, heel: last.heel, at: [hp.x, hp.y + 0.1, hp.z], tack };
    }, [url, mirror, who, tStop]);
    const tn = info.tack === 'S' ? 'stbdtack' : 'porttack';
    for (const [side, yaw] of [['port', -55], ['stbd', 55]]) {
      await pg.evaluate(([yaw, at, d, p]) => lab.cam(yaw, p, d, at), [yaw, info.at, +dist, +pitch]);
      await pg.screenshot({ path: `${out}/${tag}_${tn}_from-${side}.png` });
    }
    console.log(tag, tn, 'at', info.t.toFixed(2), 's, heel', info.heel.toFixed(0));
  }
  console.log('ERRORS:', errs.join(' | ') || 'none'); await br.close();
})();
