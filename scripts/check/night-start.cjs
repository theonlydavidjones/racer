#!/usr/bin/env node
/**
 * The scene drawn after sunset (the night-look bug, 18 Nov 2026): a cruise started with the sun setting (20:30, 11 July)
 * or down (22:00) drew neither the water nor the boat, the sun's shadow map never drawn so every lit material's shadow
 * sampler met a texture it couldn't sample ("GL_INVALID_OPERATION ... Mismatch between texture format and sampler type"),
 * and what showed was the sky dome behind them: a flat salmon plane. Fails (exit 1) on that error, or a page error, at
 * either time, and at noon as a control. The water's mean and spread are printed, for the eye (a sunset sky's gradient
 * gives a spread too, so it's not a test). Needs the dev server (default :5173). (scripts/check/night.cjs is another: the
 * bridge and the city at night.)
 *
 *   node scripts/check/night-start.cjs [<url>] [<out-dir>]   → noon.png, sunset.png, night.png in <out-dir> when given
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173/', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const bad = [];
  for (const [name, time] of [['noon', '12:00'], ['sunset', '20:30'], ['night', '22:00']]) {
    const p = await b.newPage({ viewport: { width: 1200, height: 740 } }), gl = [], errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/GL_INVALID_OPERATION/.test(m.text())) gl.push(m.text().slice(0, 160)); });
    await p.addInitScript(t => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'cityfront', sailTo: 'crissy', windKind: 'west', windKt: 10, tideDate: '2026-07-11', tideTime: t }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); }, time);
    await p.goto(URL); await p.waitForTimeout(5000);
    await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2000);
    await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(8000);
    // (the water to the left of her, under the horizon: its pixels' spread, from the screenshot, as WebGL keeps no buffer)
    const png = await p.screenshot(OUT ? { path: `${OUT}/${name}.png` } : {});
    const spread = await p.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(Math.floor(img.width * 0.05), Math.floor(img.height * 0.55), Math.floor(img.width * 0.25), Math.floor(img.height * 0.2)).data;
      let n = 0, s = 0, s2 = 0; for (let i = 0; i < d.length; i += 12) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; s += v; s2 += v * v; n++; }
      const m = s / n; return { mean: Math.round(m), sd: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1) };
    }, png.toString('base64'));
    const ok = !gl.length && !errs.length;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${time}): water mean ${spread.mean}, spread ${spread.sd}; GL errors ${gl.length}${gl[0] ? ` (${gl[0]})` : ''}; page errors ${errs.length}`);
    if (!ok) bad.push(name);
    await p.close();
  }
  await b.close(); process.exit(bad.length ? 1 : 0);
})();
