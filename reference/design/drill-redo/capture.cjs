// MOCK-UP stills for the drill redo (design/drill-redo): the tack drill and the rounding drill, by race clock.
// node redo.cjs <out> [tack|round] [yaw pitch dist]
const { chromium } = require('playwright');
const [out, which = 'tack,round', yaw = '0.5', pitch = '0.32', dist = '38'] = process.argv.slice(2);
const steps = (page, s) => page.evaluate(async s => { const w = window.sim(); const aim = () => { const P = window.__path; if (!P) return; const u = w.user; if (window.__pk == null || window.__pkP !== P) { window.__pk = 0; window.__pkP = P; } let k = window.__pk, bd = Infinity; for (let i = window.__pk; i < Math.min(P.length, window.__pk + 6); i++) { const d = Math.hypot(P[i].x - u.x, P[i].y - u.y); if (d < bd) { bd = d; k = i; } } window.__pk = k; let j = Math.min(P.length - 1, k + 1); while (j < P.length - 1 && Math.hypot(P[j].x - u.x, P[j].y - u.y) < 14) j++; const q = P[j]; window.__helm = (Math.atan2(q.x - u.x, q.y - u.y) * 180 / Math.PI + 360) % 360; };
  const helm = () => { if (window.__helm == null) return; const u = w.user, e = ((window.__helm - u.h + 540) % 360) - 180; u.tiller = Math.max(-0.8, Math.min(0.8, -e * 0.04)); };
  for (let c = 0; c < s; c++) { for (let i = 0; i < 60; i++) { if (i % 10 === 0) aim(); helm(); w.step(1 / 60); } window.__trk?.push({ x: w.user.x, y: w.user.y, h: Math.round(w.user.h) }); await new Promise(r => setTimeout(r, 0)); } }, s);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const kind of which.split(',')) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { const k = 'fbsim-settings-v2', s = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(s, { windKt: 12, windKind: 'west', current: 'slack', sea: 'flat', traffic: 0, aids: true }); localStorage.setItem(k, JSON.stringify(s)); } catch {} });
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://localhost:5183/?inproc'); await page.waitForTimeout(3000);
    await page.click('[data-home="race"]'); await page.waitForTimeout(400); await page.click('[data-home="create"]'); await page.waitForTimeout(1500);
    await page.click(kind === 'tack' ? '#bManoeuvres' : '#bRoundings'); await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '#tpDrill{display:none!important}' }); // (the mock: the Coach card's words move to the boat and the Pause list)
    await page.click('#bView'); await page.waitForTimeout(800); // (the chase view: the boat and the water round her)
    await page.evaluate(([y, p, d]) => window.__look(y, p, d), [+yaw, +pitch, +dist]);
    const look = (y, p, d) => page.evaluate(([y, p, d]) => window.__look(y, p, d), [y, p, d]);
    const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${kind}-${name}.png` }); console.log(kind, name, await page.evaluate(() => Math.round(window.sim().t))); };
    if (kind === 'tack') {
      // her on port tack, close-hauled, and the rep's set course from the sim's own beat angle and the sim crew's turn
      const G = await page.evaluate(() => {
        const w = window.sim(), u = w.user, D = window.__dg, from = u.ww.from, kt = u.ww.kt ?? 12, beat = D.beat(kt), c = D.crew('tack', kt), low = D.low(kt);
        const hP = (from + beat + 360) % 360, hS = (from - beat - low + 360) % 360;
        u.h = hP; w.pilot.mode = 'off'; window.__helm = hP;
        return { from, kt, beat, hP, hS, rate: c.rate, minSpeed: c.minSpeed, lostM: c.lostM };
      });
      await steps(page, 15); await page.evaluate(() => { const u = window.sim().user; window.__p0 = { x: u.x, y: u.y }; }); await steps(page, 10);
      const geo = await page.evaluate(G => {
        const w = window.sim(), u = w.user, d = h => ({ x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) });
        const P = window.__p0, nn = Math.hypot(u.x - P.x, u.y - P.y), a = { x: (u.x - P.x) / nn, y: (u.y - P.y) / nn }; G.cog = Math.atan2(a.x, a.y) * 180 / Math.PI; const S = { x: u.x - a.x * 25, y: u.y - a.y * 25 }, T = { x: u.x + a.x * 70, y: u.y + a.y * 70 };
        // the good crew's turn from T: her heading swung at the sim crew's rate, her speed down to its minimum mid-turn and back
        const v0 = u.v, ideal = [T]; let h = G.hP, p = { ...T }; const turn = ((G.hP - G.hS + 540) % 360) - 180, n = Math.abs(turn) / G.rate;
        for (let t = 0; t <= n + 0.01; t += 0.25) { const f = t / n, v = v0 * (1 - (1 - G.minSpeed) * Math.sin(Math.PI * f)); h = G.hP - Math.sign(turn) * G.rate * t; const q = d(h); p = { x: p.x + q.x * v * 0.25, y: p.y + q.y * v * 0.25 }; ideal.push(p); }
        const b = d(G.hS), E = p, N = { x: E.x + b.x * 140, y: E.y + b.y * 140 };
        return { S, T, E, N, ideal, v0 };
      }, G);
      const base = { lane: [{ pts: [geo.S, geo.T], half: 7 }, { pts: [geo.E, geo.N], half: 7 }], gate: { p: geo.T, h: G.hP, half: 9 }, target: { p: { x: geo.E.x + (geo.N.x - geo.E.x) * 0.08, y: geo.E.y + (geo.N.y - geo.E.y) * 0.08 }, h: G.hS } };
      const D = (s) => page.evaluate(s => window.__dg.set(s), s);
      await D({ ...base, cue: { word: 'Build speed', sub: 'Rep 3 of 8' } }); await shot('1-approach'); if (process.env.ONE) { await ctx.close(); continue; }
      // on to the bar
      await page.evaluate(() => { window.__trk = []; });
      const toBar = await page.evaluate(g => { const u = window.sim().user; return Math.hypot(g.T.x - u.x, g.T.y - u.y) / Math.max(1, u.v); }, geo);
      await steps(page, Math.max(1, Math.round(toBar) - 4));
      await D({ ...base, cue: { word: 'Hold', sub: 'Tack at the bar' } }); await shot('2-hold');
      await steps(page, 2);
      await D({ ...base, cue: { word: 'Tack now', tone: 'go' } }); await shot('3-tack-now');
      await page.evaluate(G => { window.__helm = G.hS; }, G);
      await steps(page, 6); await look(2.4, 0.75, 60);
      await D({ ...base, ideal: geo.ideal, wake: await page.evaluate(() => window.__trk), cue: { word: 'Ease', sub: 'jib eased to build speed' } }); await shot('4-ease');
      await steps(page, 30);
      const s = await page.evaluate(() => { const l = window.sim().drill?.list ?? []; const s = l[l.length - 1]; return s ? { lost: Math.max(0, Math.round(s.lostM)), good: Math.round(s.goodM), scored: s.scored } : null; });
      const lost = s?.scored ? s.lost : null, good = s?.good ?? Math.round(G.lostM);
      await D({ ...base, ideal: geo.ideal, wake: await page.evaluate(() => window.__trk), cue: { word: lost == null ? 'not scored' : `${lost} m lost`, sub: `Rep 3 · a good crew ${good} m`, tone: 'done' } }); await shot('5-score');
    } else {
      const G = await page.evaluate(() => {
        const w = window.sim(), u = w.user, D = window.__dg, from = u.ww.from, kt = u.ww.kt ?? 12, beat = D.beat(kt);
        const M = w.rounding.marks[0].p, L2 = w.rounding.marks[1].p, d = h => ({ x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) });
        const hS = (from - beat + 360) % 360, hE = (from - 150 + 360) % 360, LOA = 7.64; void L2; // (a broad reach off the mark, 150° off the wind: a dead run gybes her by accident)
        const a = d(hS), ra = d(hS + 90), e = d(hE), re = d(hE + 90);
        // wide in: her approach on the starboard layline 2½ lengths outside the mark; close out: the exit a length off it
        const P0 = { x: M.x + ra.x * 2.5 * LOA - a.x * 3 * LOA, y: M.y + ra.y * 2.5 * LOA - a.y * 3 * LOA };
        const P3 = { x: M.x + re.x * 1 * LOA + e.x * 18, y: M.y + re.y * 1 * LOA + e.y * 18 };
        const P1 = { x: P0.x + a.x * 16, y: P0.y + a.y * 16 }, P2 = { x: P3.x - e.x * 16, y: P3.y - e.y * 16 };
        const path = []; for (let i = 0; i <= 30; i++) { const t = i / 30, m = 1 - t; path.push({ x: m * m * m * P0.x + 3 * m * m * t * P1.x + 3 * m * t * t * P2.x + t * t * t * P3.x, y: m * m * m * P0.y + 3 * m * m * t * P1.y + 3 * m * t * t * P2.y + t * t * t * P3.y }); }
        const S = { x: P0.x - a.x * 160, y: P0.y - a.y * 160 };
        u.x = S.x; u.y = S.y; u.h = hS; w.pilot.mode = 'off'; window.__helm = hS;
        return { M, P0, P3, path, S, hS, hE };
      });
      await page.evaluate(() => { const u = window.sim().user; window.__p0 = { x: u.x, y: u.y }; }); await steps(page, 12);
      Object.assign(G, await page.evaluate(G => { const u = window.sim().user, P = window.__p0, n = Math.hypot(u.x - P.x, u.y - P.y), c = { x: (u.x - P.x) / n, y: (u.y - P.y) / n };
        u.x = G.P0.x - c.x * 150; u.y = G.P0.y - c.y * 150; return { S: { x: G.P0.x - c.x * 170, y: G.P0.y - c.y * 170 } }; }, G)); // (her track over the ground, leeway and all, runs to P0)
      await steps(page, 3);
      const base = { lane: [{ pts: [G.S, G.P0], half: 7 }], zone: G.M, ideal: G.path, exit: { p: G.P3, h: G.hE, len: 90 } };
      const D = (s) => page.evaluate(s => window.__dg.set(s), s);
      await D({ ...base, cue: { word: 'Hold', sub: 'Rounding 2 of 6 · on the layline' } }); await shot('1-approach'); if (process.env.ONE) { await ctx.close(); continue; }
      await page.evaluate(() => { window.__trk = []; });
      const toZ = await page.evaluate(g => { const u = window.sim().user; return Math.hypot(g.P0.x - u.x, g.P0.y - u.y) / Math.max(1, u.v); }, G);
      await steps(page, Math.max(1, Math.round(toZ) - 6));
      await D({ ...base, cue: { word: 'Wide in', sub: 'the zone: 3 lengths' } }); await shot('2-wide-in');
      await steps(page, 6);
      await page.evaluate(G => { const e = { x: Math.sin(G.hE * Math.PI / 180), y: Math.cos(G.hE * Math.PI / 180) }; window.__path = [...G.path, { x: G.P3.x + e.x * 400, y: G.P3.y + e.y * 400 }]; }, G);
      await D({ ...base, cue: { word: 'Bear away', tone: 'go', sub: 'ease the main' } }); await shot('3-bear-away');
            await steps(page, 14); await look(2.4, 0.75, 60);
      await D({ ...base, wake: await page.evaluate(() => window.__trk), cue: { word: 'Close out', sub: 'mark right by you' } }); await shot('4-close-out');
      await steps(page, 45);
      const s = await page.evaluate(() => { const l = window.sim().rounding?.list ?? []; const s = l[l.length - 1]; return s ? { lost: Math.max(0, Math.round(s.lostM)), good: Math.round(s.goodM), scored: s.scored } : null; });
      await D({ ...base, wake: await page.evaluate(() => window.__trk), cue: { word: s?.scored ? `${s.lost} m lost` : 'Rounding 2', sub: s?.scored ? `a good crew ${s.good} m` : `scored 100 m past the mark`, tone: 'done' } }); await shot('5-score');
    }
    console.log(kind, 'ERR', errs.join('|') || 'none'); await ctx.close();
  }
  await browser.close();
})();
