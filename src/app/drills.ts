/**
 * The practice drills: the tack and gybe drill and the mark-rounding drill (their lines in the Coach card and the Pause screen), and the start practice's debrief (its panel, the run of attempts, its buttons).
 * (A part of src/app.ts, as it was there: it reaches the app's own state through `app`, app.ts's ctx.)
 */
import { fleetChoiceHtml } from '../ui/tiles';
import { type ReplayClip } from '../replay/replayView';
import { MAX_OPPONENTS, drillFleetSize, saveSettings } from '../settings';
import { windBand, type ManoeuvreScore } from '../sim/drill';
import { roundingKey, type RoundingScore } from '../sim/roundings';
import { startDebrief } from '../sim/startDebrief';
import { $ } from '../ui/dom';
import type { AppCtx } from '../app';

export function mountDrills(app: AppCtx) {
/* The tack and gybe drill (sim/drill.ts): each manoeuvre scored in the race, shown here in the Coach card as it's
 * scored, the whole list (and your bests, kept by manoeuvre and wind band) on the Pause screen. */
let drillSeen = 0;
const drillName = (k: 'tack' | 'gybe') => (k === 'tack' ? 'Tack' : 'Jibe');
const drillKey = (s: ManoeuvreScore) => `${s.kind}-${windBand(s.tws)}`;
function drillTick(): void {
  const el = $('tpDrill'), list = app.w.drill?.list;
  if (!list) { if (app.w.rounding) return; if (!el.hidden) { el.hidden = true; drillSeen = 0; } return; } // (the rounding drill shares the card)
  if (list.length < drillSeen) drillSeen = 0; // (a restart: a new, empty list)
  if (list.length === drillSeen) { if (!list.length) el.hidden = true; return; }
  for (let i = drillSeen; i < list.length; i++) { // (your bests: the fewest metres lost, by manoeuvre and wind band)
    const s = list[i], k = drillKey(s), b = app.S.practiceBest?.[k];
    if (!s.scored || s.lostM < 0) continue; // (a turn noted, not scored, is no best; nor a reading below nothing, the measure's own wander)
    if (!b || Math.max(0, s.lostM) < b.lostM) { app.S.practiceBest = { ...(app.S.practiceBest ?? {}), [k]: { lostM: Math.max(0, s.lostM), goodM: s.goodM } }; saveSettings(app.S); }
  }
  drillSeen = list.length;
  // (the rep's short score is by the boat now, app/drillCoach.ts; the full advice in the Pause list: not in this card)
  el.hidden = true;
}
/* ---- the mark-rounding drill (sim/roundings.ts): the same Coach card and Pause slot, one drill at a time ---- */
const roundName = (k: 'windward' | 'leeward') => (k === 'windward' ? 'Windward mark' : 'Leeward mark');
let roundSeen = 0;
function roundTick(): void {
  const el = $('tpDrill'), list = app.w.rounding?.list;
  if (!list) { if (app.w.drill) return; if (!el.hidden) { el.hidden = true; roundSeen = 0; } return; }
  if (list.length < roundSeen) roundSeen = 0; // (a restart: a new, empty list)
  if (list.length === roundSeen) { if (!list.length) el.hidden = true; return; }
  for (let i = roundSeen; i < list.length; i++) { // (your bests: the fewest metres lost, by mark and wind band)
    const s = list[i], k = roundingKey(s), b = app.S.practiceBest?.[k];
    if (!s.scored || s.lostM < 0 || s.provisional) continue; // (a provisional score is no best)
    if (!b || Math.max(0, s.lostM) < b.lostM) { app.S.practiceBest = { ...(app.S.practiceBest ?? {}), [k]: { lostM: Math.max(0, s.lostM), goodM: s.goodM } }; saveSettings(app.S); }
  }
  roundSeen = list.length;
  // (the rounding's short score is by the boat now, app/drillCoach.ts; the full advice in the Pause list)
  el.hidden = true;
}
/** The Pause screen's list for the rounding drill: every rounding, its numbers, and your bests. */
function roundHtml(): string {
  const list = app.w.rounding?.list ?? [], f = (v: number | null, d = 0) => (v == null ? '—' : v.toFixed(d));
  const bestOf = (k: 'windward' | 'leeward') => list.reduce((bi, x, i) => (x.kind === k && x.scored && !x.provisional && x.lostM >= 0 && (bi < 0 || x.lostM < list[bi].lostM) ? i : bi), -1);
  const lit = new Set([bestOf('windward'), bestOf('leeward')]);
  const row = (s: RoundingScore, i: number) => {
    const head = `<td>${i + 1}. ${roundName(s.kind)}</td><td>${Math.round(s.tws)} kt</td>`;
    if (!s.scored) return `<tr class="noscore">${head}<td colspan="5">not scored</td></tr><tr class="dcoach"><td colspan="7">${s.coach.replace(/</g, '&lt;')}</td></tr>`;
    // approach: the tacks inside the zone (windward) or the pole down before the mark (leeward); exit: how close onto the new course
    const approach = s.kind === 'windward' ? `${s.tacks} tack${s.tacks === 1 ? '' : 's'}${s.pinchS > 2 ? `, pinched ${f(s.pinchS)} s` : s.freeS > 2 ? `, free ${f(s.freeS)} s` : ''}` : `in ${Math.round(s.entryD)} m`;
    const pole = s.kind === 'windward' ? (s.poleS == null ? 'no pole' : `+${f(s.poleS)} s`) : (s.dropS == null ? '—' : `−${f(Math.max(0, s.dropS))} s`);
    return `<tr${lit.has(i) ? ' class="best"' : ''}>${head}<td><b>${Math.max(0, Math.round(s.lostM))} m</b>${s.provisional ? '*' : ''}</td><td>${Math.round(s.goodM)} m</td><td>${approach}</td><td>${pole}</td><td>${Math.round(s.exitD)} m</td></tr><tr class="dcoach"><td colspan="7">${s.coach.replace(/</g, '&lt;')}</td></tr>`;
  };
  const rows = list.map(row).join('');
  const bests = Object.entries(app.S.practiceBest ?? {}).filter(([k]) => /^(wmark|lmark)-/.test(k)).map(([k, b]) => { const [kind, band] = k.split('-'); return `${kind === 'wmark' ? 'Windward' : 'Leeward'} mark, ${band} wind: ${Math.max(0, Math.round(b.lostM))} m (a good crew ${Math.round(b.goodM)} m)`; }).join(' · ');
  return `<h3>Mark roundings</h3>${list.length ? `<table class="attempts"><thead><tr><th></th><th>Wind</th><th>Lost</th><th>Good crew</th><th>Approach</th><th>Pole</th><th>Exit</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No roundings yet: beat up to the windward mark, round it to port and set the pole for the run down to the pin; round the pin to port and beat up again.</p>'}`
    + `<div class="drillhow"><details class="more"><summary><u>How it's scored ▸</u></summary><p>Lost: what you gave away along the wind against a twin sailing on at your own pace, from 100 m before the mark to 100 m past it, through the water. Good crew: the sim's own crew, the same way. * provisional: your pace on the new leg not measured yet.</p></details></div>`
    + (bests ? `<p><b>Your bests</b>: ${bests}</p>` : '');
}
/** The Pause screen's list: every manoeuvre so far, with its numbers, and your bests. */
function drillHtml(): string {
  const list = app.w.drill?.list ?? [], f = (v: number | null, d = 0) => (v == null ? '—' : v.toFixed(d));
  // (the best of each kind this run, the fewest metres lost: lit, as the start-line drill lights its best)
  const bestOf = (k: 'tack' | 'gybe') => list.reduce((bi, x, i) => (x.kind === k && x.scored && x.lostM >= 0 && (bi < 0 || x.lostM < list[bi].lostM) ? i : bi), -1);
  const lit = new Set([bestOf('tack'), bestOf('gybe')]);
  const rows = list.map((s, i) => !s.scored ? `<tr class="noscore"><td>${i + 1}. ${drillName(s.kind)}</td><td>${Math.round(s.tws)} kt</td><td colspan="7">not scored</td></tr><tr class="dcoach"><td colspan="9">${s.coach.replace(/</g, '&lt;')}</td></tr>` : `<tr${lit.has(i) ? ' class="best"' : ''}><td>${i + 1}. ${drillName(s.kind)}</td><td>${Math.round(s.tws)} kt</td><td><b>${Math.max(0, Math.round(s.lostM))} m</b></td><td>${Math.round(s.goodM)} m</td><td>${f(s.rate)}°/s</td><td>${s.kind === 'tack' ? f(s.deadS, 1) + ' s' : '—'}</td><td>${f(s.overshoot)}°</td><td>${s.acrossS == null ? '—' : (s.acrossS >= 0 ? '+' : '') + s.acrossS.toFixed(1) + ' s'}</td><td>${f(s.backS)} s</td></tr><tr class="dcoach"><td colspan="9">${s.coach.replace(/</g, '&lt;')}</td></tr>`).join('');
  const bests = Object.entries(app.S.practiceBest ?? {}).filter(([k]) => /^(tack|gybe)-/.test(k)).map(([k, b]) => { const [kind, band] = k.split('-'); return `${kind === 'tack' ? 'Tack' : 'Jibe'}, ${band} wind: ${Math.max(0, Math.round(b.lostM))} m (a good crew ${Math.round(b.goodM)} m)`; }).join(' · ');
  return `<h3>Tacks and jibes</h3>${list.length ? `<table class="attempts"><thead><tr><th></th><th>Wind</th><th>Lost</th><th>Good crew</th><th>Turn</th><th>Head to wind</th><th>Past course</th><th>Jib / boom across</th><th>Back to speed</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No tacks or jibes yet: tack when you\'re ready, or bear away to a run, settle, and jibe.</p>'}`
    + `<div class="drillhow"><details class="more"><summary><u>How it's scored ▸</u></summary><p>Lost: what you gave away along the wind against a twin sailing on at your own pace, until you were back to 90% speed (98% after a jibe). Good crew: the sim's own crew, the same way. Only a tack from close-hauled and a jibe from a run are scored.</p></details></div>`
    + (bests ? `<p><b>Your bests</b>: ${bests}</p>` : '');
}

/* ---------------- start practice debrief ---------------- */
let drillClip: ReplayClip | null = null;
function showDrill(): void {
  app.drillShown = true; app.send({ k: 'pause', on: true }); app.setControlsIdle();
  const d = startDebrief(app.w);
  if (d.stats) app.drillRuns.push({ ...d.stats, n: app.drillRuns.length + 1, from: app.w.startAt, solo: app.w.boats.length === 1 });
  drillOptions(); drillTable();
  $('dTitle').textContent = d.title;
  takeaways(d);
  $('dVerdict').className = 'verdict' + (d.grade === 'great' || d.grade === 'good' ? ' ok' : '');
  $('drill').hidden = false;
  drillClip = { frames: app.w.rec.slice(), focus: [app.w.user.id], wind: app.w.gun?.windFrom ?? app.w.wind.from, kind: 'start' };
  app.drillView.play(app.w, drillClip);
}
const closeDrill = () => { $('drill').hidden = true; app.drillView.stop(); };
/** The drill's two choices (inside its panel): how long before the gun each attempt starts, and alone or with the fleet. */
function drillOptions(): void {
  const from = app.S.drillFrom ?? app.DRILL_FROM, solo = app.S.drillSolo ?? true;
  $('dOpts').innerHTML = `<span class="dlabel">Next attempt</span><div class="seg" data-dopt="from">${[60, 120, 180].map(s => `<button type="button" data-v="${s}" aria-pressed="${s === from}">${s / 60} min</button>`).join('')}</div>`
    + `<div class="seg" data-dopt="solo"><button type="button" data-v="1" aria-pressed="${solo}">${fleetChoiceHtml(false, 0)}</button><button type="button" data-v="0" aria-pressed="${!solo}">${fleetChoiceHtml(true, drillFleetSize(app.S))}</button>`
    + (solo ? '' : '<button type="button" class="dfn" data-fn="-1" aria-label="One boat fewer">−</button><button type="button" class="dfn" data-fn="1" aria-label="One boat more">+</button>') + '</div>';
}
$('dOpts').addEventListener('click', e => {
  const n = (e.target as HTMLElement).closest<HTMLElement>('button[data-fn]');
  if (n) { app.S.drillFleetN = Math.max(1, Math.min(MAX_OPPONENTS, drillFleetSize(app.S) + +n.dataset.fn!)); saveSettings(app.S); drillOptions(); return; }
  const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]'), g = b?.closest<HTMLElement>('[data-dopt]')?.dataset.dopt; if (!b || !g) return;
  if (g === 'from') app.S.drillFrom = +b.dataset.v!; else app.S.drillSolo = b.dataset.v === '1';
  saveSettings(app.S); drillOptions();
});
/** What cost the most, as 2–3 short lines, biggest loss first, each with its fix (the owner, 15 Nov 2026: "short, sharp
 *  takeaways", not a copy block); a bar for the seconds each one cost. Everything else the debrief says: behind one ⓘ. */
function takeaways(d: ReturnType<typeof startDebrief>): void {
  const st = d.stats, rows: { s: number; html: string }[] = [], esc = app.esc;
  if (st) {
    // (the seconds each one cost: being late is its own; each 10% of speed short at the gun about 5 s, the time a
    // Folkboat takes to build it back, the same rule as the table's best; the wrong end is ranked last, its cost not timed)
    if (st.grade === 'ocs') rows.push({ s: 99, html: `<b>Over by ${Math.round(-st.behindM)} m</b> → a length back at 10 s to go, then sheet in` });
    else if (st.lateS >= 2) rows.push({ s: st.lateS, html: st.lateS > 60 ? '<b>Over a minute late</b> → start your run in from closer' : `<b>${Math.round(st.lateS)} s late</b> → turn for the line ${Math.round(st.lateS)} s sooner` });
    if (st.grade !== 'ocs' && st.pct < 90) rows.push({ s: (100 - st.pct) / 2, html: `<b>${st.pct}% speed</b> → sheet in 12 s before the gun` });
    if (st.fav && !st.onFav && st.grade !== 'ocs') rows.push({ s: 0, html: `<b>Wrong end</b> → start in the ${esc(st.fav === 'pin' ? app.w.C.pinLabel : app.w.C.committeeLabel)} third` });
  }
  rows.sort((a, b) => b.s - a.s);
  if (!rows.length) rows.push({ s: 0, html: '<b>On the line at full speed</b> → the same again' });
  const more = [...d.facts, ...d.tips].join('\n\n');
  const info = more ? ` <span class="dtk-i" tabindex="0" title="${esc(more).replace(/"/g, '&quot;')}">ⓘ</span>` : '';
  const top = rows.slice(0, 3);
  $('dTips').innerHTML = callLine(st) + top.map((r, i) => `<li class="dtk"><i class="dtk-bar" style="--s:${Math.min(1, r.s / 30).toFixed(2)}"></i><span>${r.html}${i === top.length - 1 ? info : ''}</span></li>`).join('');
  $('dFacts').innerHTML = '';
}
/** The favored-end call (8za), first in the debrief: yours against the line at the gun (the debrief's own read:
 *  startDebrief's stats.fav, the end nearer the wind at the gun, from 2° of bias), with a small picture of why (the
 *  line, its square dashed, the wind leaning toward the favored end), and how many more starts the read's drawn on the
 *  water for. The call's counted here, once a start. */
function callLine(st: ReturnType<typeof startDebrief>['stats']): string {
  if (!st) return '';
  const w = app.w, call = app.favCall, C = w.C, name = (e: 'pin' | 'committee') => app.esc((e === 'pin' ? C.pinLabel : C.committeeLabel).replace(/^(the )?/i, ''));
  if (call) { app.S.favCalls = (app.S.favCalls ?? 0) + 1; saveSettings(app.S); }
  const left = Math.max(0, 3 - (app.S.favCalls ?? 0));
  // the bias at the gun, as the debrief reads it (sim/startDebrief.ts)
  const gw = (w.gun?.windFrom ?? w.wind.from) * Math.PI / 180, k = ((w.pin.x - w.committee.x) * Math.sin(gw) + (w.pin.y - w.committee.y) * Math.cos(gw)) / w.lineLen;
  const bias = Math.round(Math.asin(Math.min(1, Math.abs(k))) * 180 / Math.PI);
  const fav = st.fav, ok = call && fav ? call === fav : null;
  // the picture, seen from below the line as the card's sketch is: the end on the left first
  const pinLeft = ((w.pin.x - w.center.x) * -w.N.y + (w.pin.y - w.center.y) * w.N.x) > 0, favLeft = fav ? (fav === 'pin') === pinLeft : null;
  const lean = (favLeft == null ? 0 : favLeft ? -1 : 1) * Math.max(4, Math.min(30, bias)) * Math.PI / 180, wx = 22 + Math.sin(lean) * 16, wy = 22 - Math.cos(lean) * 16;
  const pic = `<svg class="dcall-pic" viewBox="0 0 44 26" width="66" height="39" aria-hidden="true"><line x1="5" y1="22" x2="39" y2="22"/><circle cx="5" cy="22" r="2.4"/><rect x="36.5" y="19.5" width="5" height="5"/>`
    + `<line class="sq" x1="22" y1="22" x2="22" y2="4"/><line class="wd" x1="22" y1="22" x2="${wx.toFixed(1)}" y2="${wy.toFixed(1)}"/></svg>`;
  const what = fav ? `${name(fav)} favored ${bias}°` : 'a square line: neither end';
  const head = call ? `Your call: <b class="${ok === false ? 'bad' : 'ok'}">${name(call)} ${ok === false ? '✗' : '✓'}</b> · ${what}` : `No call · ${what}`;
  const dots = call || left < 3 ? `<span class="dcall-dots" title="The read's drawn on the water for ${left} more start${left === 1 ? '' : 's'}">${'●'.repeat(left)}${'○'.repeat(3 - left)}</span>` : '';
  return `<li class="dcall">${pic}<span>${head}</span>${dots}</li>`;
}
/** The attempts this session, with units in the headings, the latest and the best marked, where on the line as an icon. */
function drillTable(): void {
  if (app.drillRuns.length < 2) { $('dRuns').innerHTML = ''; return; }
  // (a start is as good as it is on time and at speed: each 10% of speed short counts as about 5 s late, the time it
  // takes a Folkboat to build that speed back)
  const score = (r: typeof app.drillRuns[number]) => r.grade === 'ocs' ? Infinity : Math.abs(r.lateS) + (100 - r.pct) / 2;
  const best = app.drillRuns.reduce((a, r) => score(r) < score(a) ? r : a), latest = app.drillRuns[app.drillRuns.length - 1];
  // where on the line: the line, the pin (a ring) at the left, the committee boat (a block) at the right, her spot a dot,
  // green when it was the favored end's third
  const endIcon = (r: typeof best) => { const x = r.end === 'pin' ? 6 : r.end === 'committee' ? 26 : 16, ok = r.fav && r.onFav;
    return `<svg class="dend" viewBox="0 0 32 12" width="44" height="16" aria-label="${r.end}${ok ? ', favored end' : ''}"><line x1="3" y1="6" x2="29" y2="6"/><circle class="pin" cx="3" cy="6" r="2"/><rect class="rc" x="27" y="3.5" width="4" height="5"/><circle class="me${ok ? ' fav' : ''}" cx="${x}" cy="6" r="3"/></svg>`; };
  const cells = (r: typeof best) => r.grade === 'ocs' ? `<td class="ocs">over ${Math.round(-r.behindM)}</td><td>—</td>`
    : r.behindM < 0 ? `<td>past ${Math.round(-r.behindM)}</td><td>0</td>` : `<td>${Math.round(r.behindM)}</td><td>${r.lateS > 60 ? '60+' : Math.round(r.lateS)}</td>`;
  const rows = app.drillRuns.slice(-10).map(r => `<tr class="${r === best ? 'best' : ''}${r === latest ? ' latest' : ''}"><td>${r.n}${r === best ? ' ★' : ''}</td>${cells(r)}<td>${r.pct}</td><td>${endIcon(r)}</td><td>${r.grade}</td></tr>`).join('');
  $('dRuns').innerHTML = `<table class="res attempts dstarts"><thead><tr><th>#</th><th>Behind m</th><th>Late s</th><th>Speed %</th><th>End</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="dlegend"><span class="b">★ best</span><span><svg class="dend" viewBox="0 0 12 12" width="12" height="12"><circle class="me fav" cx="6" cy="6" r="3"/></svg> favored end</span></div>`;
}
$('bDReplay').onclick = () => { if (drillClip) app.drillView.play(app.w, drillClip); };
$('bDAgain').onclick = () => { closeDrill(); app.beginRace(app.w.seed); };
$('bDNew').onclick = () => { closeDrill(); app.beginRace(); };
$('bDKeep').onclick = () => { closeDrill(); app.send({ k: 'pause', on: false }); };
$('bDSetup').onclick = () => { closeDrill(); app.toSetup(); };

return { drillHtml, drillTick, roundHtml, roundTick, showDrill };
}
