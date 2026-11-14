/**
 * The practice drills: the tack and gybe drill and the mark-rounding drill (their lines in the Coach card and the Pause screen), and the start practice's debrief (its panel, the run of attempts, its buttons).
 * (A part of src/app.ts, as it was there: it reaches the app's own state through `app`, app.ts's ctx.)
 */
import { type ReplayClip } from '../replay/replayView';
import { saveSettings } from '../settings';
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
  const s = list[list.length - 1], best = app.S.practiceBest?.[drillKey(s)];
  el.hidden = false;
  if (!s.scored) { el.innerHTML = '<span class="tp-dcoach"></span>'; el.querySelector('.tp-dcoach')!.textContent = s.coach; return; }
  el.innerHTML = `<b>${drillName(s.kind)} ${list.filter(x => x.kind === s.kind && x.scored).length}</b> · lost <b>${Math.max(0, Math.round(s.lostM))} m</b> (a good crew ${Math.round(s.goodM)} m)${best ? ` · best ${Math.max(0, Math.round(best.lostM))} m` : ''}<br><span class="tp-dcoach"></span>`;
  el.querySelector('.tp-dcoach')!.textContent = s.coach;
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
  const s = list[list.length - 1], best = app.S.practiceBest?.[roundingKey(s)];
  el.hidden = false;
  if (!s.scored) { el.innerHTML = '<span class="tp-dcoach"></span>'; el.querySelector('.tp-dcoach')!.textContent = s.coach; return; }
  el.innerHTML = `<b>${roundName(s.kind)} ${list.filter(x => x.kind === s.kind && x.scored).length}</b> · lost <b>${Math.max(0, Math.round(s.lostM))} m</b>${s.provisional ? ' (provisional: first lap)' : ''} (a good crew ${Math.round(s.goodM)} m)${best ? ` · best ${Math.max(0, Math.round(best.lostM))} m` : ''}<br><span class="tp-dcoach"></span>`;
  el.querySelector('.tp-dcoach')!.textContent = s.coach;
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
    + `<p class="drillhow"><span title="Lost: what you gave away along the wind against a twin sailing on at your own pace, from 100 m before the mark to 100 m past it, through the water. Good crew: the sim's own crew, the same way. * provisional: your pace on the new leg not measured yet.">How it's scored</span></p>`
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
    + `<p class="drillhow"><span title="Lost: what you gave away along the wind against a twin sailing on at your own pace, until you were back to 90% speed (98% after a jibe). Good crew: the sim's own crew, the same way. Only a tack from close-hauled and a jibe from a run are scored.">How it's scored</span></p>`
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
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // one line to act on, the top tip; what happened, and the other tips, folded away (the owner: no paragraphs on the screen)
  const more = [...d.facts, ...d.tips.slice(1)];
  $('dTips').innerHTML = d.tips.length ? `<li>${esc(d.tips[0])}</li>` : '';
  $('dFacts').innerHTML = more.length ? `<li class="dmore"><details class="thow"><summary>What happened</summary>${more.map(f => `<p>${esc(f)}</p>`).join('')}</details></li>` : '';
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
    + `<div class="seg" data-dopt="solo"><button type="button" data-v="1" aria-pressed="${solo}">Alone</button><button type="button" data-v="0" aria-pressed="${!solo}">With the fleet</button></div>`;
}
$('dOpts').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]'), g = b?.closest<HTMLElement>('[data-dopt]')?.dataset.dopt; if (!b || !g) return;
  if (g === 'from') app.S.drillFrom = +b.dataset.v!; else app.S.drillSolo = b.dataset.v === '1';
  saveSettings(app.S); drillOptions();
});
/** The run of attempts this session: each start's numbers, the best marked, to see the trend. */
function drillTable(): void {
  if (app.drillRuns.length < 2) { $('dRuns').innerHTML = ''; return; }
  // (a start is as good as it is on time and at speed: each 10% of speed short counts as about 5 s late, the time it
  // takes a Folkboat to build that speed back)
  const score = (r: typeof app.drillRuns[number]) => r.grade === 'ocs' ? Infinity : Math.abs(r.lateS) + (100 - r.pct) / 2;
  const best = app.drillRuns.reduce((a, r) => score(r) < score(a) ? r : a);
  const endW = (e: string) => e === 'pin' ? app.w.C.pinLabel : e === 'committee' ? app.w.C.committeeLabel : 'middle';
  const rows = app.drillRuns.slice(-10).map(r => `<tr${r === best ? ' class="best"' : ''}><td>${r.n}</td><td>${r.grade === 'ocs' ? `over, ${Math.round(-r.behindM)} m` : r.behindM < 0 ? `past, ${Math.round(-r.behindM)} m` : `${Math.round(r.behindM)} m · ${Math.round(r.lateS)} s`}</td><td>${r.pct}%</td><td>${app.esc(endW(r.end))}${r.fav ? (r.onFav ? ' ✓' : '') : ''}</td><td>${r.grade}</td></tr>`).join('');
  const last = app.drillRuns.slice(-3), avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const clean = last.filter(r => r.grade !== 'ocs'), trend = app.drillRuns.length >= 4 && clean.length ? ` Your last three averaged ${Math.round(avg(clean.map(r => r.lateS)))} s late at ${Math.round(avg(last.map(r => r.pct)))}% speed${clean.length < last.length ? ` (${last.length - clean.length} over early)` : ''}.` : '';
  $('dRuns').innerHTML = `<p class="lede">Your starts this session (the best highlighted; ✓ started at the favored end).${trend}</p><table class="res attempts"><thead><tr><th>#</th><th>At the gun</th><th>Speed</th><th>End</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table>`;
}
$('bDReplay').onclick = () => { if (drillClip) app.drillView.play(app.w, drillClip); };
$('bDAgain').onclick = () => { closeDrill(); app.beginRace(app.w.seed); };
$('bDNew').onclick = () => { closeDrill(); app.beginRace(); };
$('bDKeep').onclick = () => { closeDrill(); app.send({ k: 'pause', on: false }); };
$('bDSetup').onclick = () => { closeDrill(); app.openSetup(); };

return { drillHtml, drillTick, roundHtml, roundTick, showDrill };
}
