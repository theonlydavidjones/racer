// Mock-up for the owner (not built): the tack and jibe drill made a real drill (ROADMAP "3."). The owner: "the coach info
// is too far away from the boat … too much copy to read in the moment. I need contextual cues to help me know when to
// tack, when to wait, etc. maybe even some on-water tracks … this doesn't feel different from regular cruise mode."
// Drawn over the real page, from the sim's own numbers: her position, heading, the wind, and the tack's target heading
// (physics.ts tackTarget: her close-hauled course on the other tack). The cue sits beside the boat, a word or two; the
// guides are on the water; the score comes after each rep, by the boat, and a best-of at the end.
window.__mock = (() => {
  const css = document.createElement('style');
  css.textContent = `
    #mkGuide{position:fixed;inset:0;pointer-events:none;z-index:5}
    .mk-cue{position:fixed;transform:translate(calc(-100% - 90px),-50%);pointer-events:none;z-index:6;display:flex;flex-direction:column;align-items:center;gap:4px}
    .mk-cue b{font:800 22px/1 var(--f-inst);letter-spacing:.08em;text-transform:uppercase;color:#13202b;background:#ffb627;padding:8px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35)}
    .mk-cue b.go{background:#3fd197}
    .mk-cue b.hold{background:#e9f2f5}
    .mk-cue small{font:700 11px/1 var(--f-inst);letter-spacing:.14em;text-transform:uppercase;color:#fff;background:rgba(9,22,33,.7);padding:4px 8px;border-radius:6px}
    .mk-rep{position:fixed;transform:translate(90px,-50%);pointer-events:none;z-index:6;background:rgba(9,22,33,.88);border:1px solid var(--rule);border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:repeat(4,auto);gap:6px 16px;align-items:end}
    .mk-rep .h{grid-column:1/-1;font:700 11px/1 var(--f-inst);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
    .mk-rep div{display:flex;flex-direction:column;gap:3px}
    .mk-rep div b{font:700 22px/1 var(--f-inst);color:#fff}
    .mk-rep div b.ok{color:#3fd197} .mk-rep div b.meh{color:#ffb627}
    .mk-rep div small{font:600 10.5px/1.2 var(--f-inst);letter-spacing:.06em;color:var(--muted);white-space:nowrap}
    .mk-rep .tip{grid-column:1/-1;font:600 13px/1.3 var(--f-inst);color:#fff;border-top:1px solid var(--rule);padding-top:8px}
    #mkBest{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;background:var(--pod-solid);border:1px solid var(--rule);border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;gap:14px;min-width:620px}
    #mkBest h2{margin:0;font:700 22px/1.1 var(--f-inst)}
    #mkBest .reps{display:grid;grid-template-columns:repeat(10,1fr);gap:6px}
    #mkBest .rp{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;border-radius:8px;background:var(--ink);border:1px solid var(--rule)}
    #mkBest .rp b{font:700 16px/1 var(--f-inst)} #mkBest .rp small{font:600 10px/1 var(--f-inst);color:var(--muted);letter-spacing:.08em}
    #mkBest .rp.best{border-color:#3fd197} #mkBest .rp.best b{color:#3fd197}
    #mkBest .bars{display:flex;align-items:flex-end;gap:6px;height:70px}
    #mkBest .bars i{flex:1;border-radius:3px 3px 0 0;background:#5f7a8c} #mkBest .bars i.best{background:#3fd197} #mkBest .bars i.good{background:transparent;border-top:2px dashed #ffb627;height:0!important;position:absolute}
    #mkBest .row{display:flex;gap:10px} #mkBest .row button{flex:1}
  `;
  document.head.appendChild(css);
  let P3, raf = 0, guide = null, track = [];
  const ready = (async () => { P3 = (await import('/src/render/coords.ts')).P3; })();
  const cv = document.createElement('canvas'); cv.id = 'mkGuide'; document.body.appendChild(cv);
  const R = Math.PI / 180;
  const at = (x, y, z = 0) => { const v = P3(x, y, z).project(window.__view.camera); return v.z > 1 ? null : [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
  const along = (p, hdg, d) => ({ x: p.x + Math.sin(hdg * R) * d, y: p.y + Math.cos(hdg * R) * d });
  // the plan for this rep, set where she is now: hold this course to the turn point, then the new course
  function plan(turnIn) {
    const u = window.sim().user, from = u.ww.from, rel = ((u.h - from + 540) % 360) - 180;
    const newH = (from - Math.sign(rel) * Math.abs(rel) + 360) % 360; // her course mirrored across the wind: close-hauled on the other tack
    const turnAt = along(u, u.h, turnIn);
    guide = { start: { x: u.x, y: u.y }, h: u.h, turnAt, newH, end: along(turnAt, newH, 160) };
  }
  function draw() {
    cancelAnimationFrame(raf);
    const ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight; ctx.clearRect(0, 0, cv.width, cv.height);
    if (guide) {
      const line = (pts, col, w, dash = []) => { const s = pts.map(p => at(p.x, p.y)); if (s.some(q => !q)) return; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); s.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); ctx.setLineDash([]); };
      // the lane to the turn: two edges, 6 m apart
      const off = (p, d) => along(p, guide.h + 90, d);
      line([off(guide.start, 3), off(guide.turnAt, 3)], 'rgba(255,255,255,.55)', 2, [10, 8]);
      line([off(guide.start, -3), off(guide.turnAt, -3)], 'rgba(255,255,255,.55)', 2, [10, 8]);
      // the turn point: a bar across the lane
      line([off(guide.turnAt, 6), off(guide.turnAt, -6)], '#ffb627', 5);
      // the new course after the turn, to a target mark
      line([guide.turnAt, guide.end], '#3fd197', 3, [14, 10]);
      const m = at(guide.end.x, guide.end.y, 0), mt = at(guide.end.x, guide.end.y, 4);
      if (m && mt) { ctx.strokeStyle = '#3fd197'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.lineTo(mt[0], mt[1]); ctx.stroke(); ctx.fillStyle = '#3fd197'; ctx.beginPath(); ctx.moveTo(mt[0], mt[1]); ctx.lineTo(mt[0] + 16, mt[1] + 6); ctx.lineTo(mt[0], mt[1] + 12); ctx.fill(); }
      // after a rep: the ideal turn (dashed green arc) against her own track (white)
      if (guide.ideal) line(guide.ideal, '#3fd197', 4, [6, 6]);
      if (track.length > 1) line(track, '#ffffff', 3);
    }
    raf = requestAnimationFrame(draw);
  }
  const cueEl = document.createElement('div'); cueEl.className = 'mk-cue'; cueEl.hidden = true; document.body.appendChild(cueEl);
  const repEl = document.createElement('div'); repEl.className = 'mk-rep'; repEl.hidden = true; document.body.appendChild(repEl);
  function pin() { const u = window.sim().user, q = at(u.x, u.y, 1.2); if (q) { cueEl.style.left = q[0] + 'px'; cueEl.style.top = q[1] + 'px'; repEl.style.left = q[0] + 'px'; repEl.style.top = q[1] + 'px'; } requestAnimationFrame(pin); }
  return {
    ready,
    /** The approach: the lane, the turn point, the new course; the cue by the boat. */
    async approach(word, cls, rep, turnIn = 45) { await ready; plan(turnIn); track = []; draw(); pin(); cueEl.innerHTML = `<b class="${cls || ''}">${word}</b><small>${rep}</small>`; cueEl.hidden = false; repEl.hidden = true; },
    cue(word, cls, rep) { cueEl.innerHTML = `<b class="${cls || ''}">${word}</b><small>${rep}</small>`; cueEl.hidden = false; },
    /** After the rep: her track against the ideal turn, and the score by the boat. */
    async score(s) {
      await ready;
      // the ideal: a turn of the good crew's radius from the turn point onto the new course; hers: a little wider and late
      const g = guide, r = 7, arc = (rad, late) => { const pts = [], c0 = along(g.turnAt, g.h, late); const dir = Math.sign(((g.newH - g.h + 540) % 360) - 180);
        for (let a = 0; a <= 1.0001; a += 0.1) { const hh = g.h + dir * a * Math.abs(((g.newH - g.h + 540) % 360) - 180); pts.push(along(c0, hh, rad * a * 1.6)); }
        return pts.concat([along(pts[pts.length - 1], g.newH, 60)]); };
      g.ideal = arc(r, 0); track = [g.start, ...arc(r * 1.6, 9)];
      // (after the rep she's at the end of her track, on the new course: everything drawn moves so it ends at her)
      const u = window.sim().user, e = track[track.length - 1], dx = u.x - e.x, dy = u.y - e.y, mv = q => ({ x: q.x + dx, y: q.y + dy });
      track = track.map(mv); g.ideal = g.ideal.map(mv); g.start = mv(g.start); g.turnAt = mv(g.turnAt); g.end = mv(g.end);
      cueEl.hidden = true;
      repEl.innerHTML = `<span class="h">${s.title}</span>
        <div><b class="${s.lost <= s.good ? 'ok' : 'meh'}">${s.lost} m</b><small>lost · good crew ${s.good} m</small></div>
        <div><b>${s.turn} s</b><small>to turn</small></div>
        <div><b class="${s.min >= 70 ? 'ok' : 'meh'}">${s.min}%</b><small>slowest</small></div>
        <div><b>${s.back} s</b><small>back to speed</small></div>
        <span class="tip">${s.tip}</span>`;
      repEl.hidden = false;
    },
    /** The end: every rep, the best, against the good crew. */
    best(reps, good) {
      cueEl.hidden = true; repEl.hidden = true; guide = null; track = [];
      const max = Math.max(...reps, good), bi = reps.indexOf(Math.min(...reps));
      const el = document.createElement('div'); el.id = 'mkBest';
      el.innerHTML = `<h2>Tacks · 10 reps</h2><small style="color:var(--muted);font:600 12px var(--f-inst);letter-spacing:.04em;margin-top:-8px">Meters lost each tack · - - - a good crew</small>
        <div class="bars" style="position:relative">${reps.map((m, i) => `<i class="${i === bi ? 'best' : ''}" style="height:${Math.round(m / max * 100)}%" title="Tack ${i + 1}: ${m} m"></i>`).join('')}<i class="good" style="bottom:${Math.round(good / max * 70)}px;left:0;right:0"></i></div>
        <div class="reps">${reps.map((m, i) => `<div class="rp${i === bi ? ' best' : ''}"><b>${m}</b><small>${i + 1}</small></div>`).join('')}</div>
        <div class="row"><button class="cta" type="button">Ten more</button><button class="ghost" type="button">Jibes</button><button class="ghost" type="button">Back to Drill</button></div>`;
      document.body.appendChild(el);
    }
  };
})();
