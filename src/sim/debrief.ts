import { D2R, V, clamp, cross, dist, dot, sub, unit, wrap } from '../core/math';
import type { Boat } from '../boat/boat';
import { beatAngle, polar, runAngle } from '../boat/polar';
import { heelFactor } from '../boat/balance';
import { trimDrive } from '../boat/trim';
import type { World } from './world';

/**
 * The tactics debrief: a log of your race as you sail it, and afterwards what cost you time, ranked, with what to do.
 *
 * Each item is an estimate of seconds lost, from the sim's own physics and the standard racing arithmetic:
 * - **Shifts:** sailing on a header of θ° when the other tack is lifted by θ°, your speed toward the windward mark is
 *   cos(β+θ)/cos(β−θ) of what it would be on the other tack (β the close-hauled angle): about 15% less at 5°. A tack
 *   costs a few seconds, so only headers held for more than ~15 s count.
 * - **Laylines:** past the layline by D metres, you sail roughly 0.6·D/v seconds extra (you reach back down to the mark).
 * - **Tacks and gybes:** the speed you lose against your target speed through each one, for 20 s.
 * - **Dirty air and the lee of the land:** boat speed goes roughly as the wind^0.7 in the Folkboat's range.
 * - **Downwind angles and the pole:** your speed made good downwind against the best angle; wing-on-wing against jib alone.
 * - **Heel, trim, penalties, wide roundings, the start.**
 */

export interface Finding { key: string; title: string; lost: number; detail: string; tip: string }
interface MarkLog { name: string; leg: 'beat' | 'reach' | 'run'; overM: number; overT: number; wide: number | null; place: number | null; t: number | null }

export class RaceLog {
  private gun: { d: number; kt: number; favored: string; favDeg: number; frac: number } | null = null;
  startDelay: number | null = null;
  dirty = { t: 0, lost: 0, by: new Map<string, number>() };
  lee = { t: 0, lost: 0 };
  header = { t: 0, lost: 0, streak: 0, worst: 0, liftTacks: 0 };
  tacks = { n: 0, gybes: 0, lost: 0, gybeLost: 0 };
  private turn: { t0: number; gybe: boolean } | null = null;
  private lastTack = -999;
  private liftedAtTack = 0;
  down = { t: 0, lost: 0 };
  pole = { t: 0, lost: 0 };
  heel = { t: 0, lost: 0 };
  trim = { lost: 0 };
  pen = { n: 0, t: 0 };
  private inPen = false;
  marks: MarkLog[] = [];
  private arrivals: number[] = []; // boats that have reached each mark (for places)

  constructor(w: World) {
    this.marks = w.C.marks.map(m => ({ name: m.name, leg: m.leg, overM: 0, overT: 0, wide: null, place: null, t: null }));
    this.arrivals = w.C.marks.map(() => 0);
  }

  /** Any boat reaching a mark (for the places), and yours (how wide you went round). */
  onAdvance(w: World, b: Boat, idx: number): void {
    this.arrivals[idx]++;
    if (!b.isUser) return;
    const m = w.C.marks[idx], L = this.marks[idx];
    L.place = this.arrivals[idx]; L.t = w.t;
    if (m.type === 'round' && !m.reach) L.wide = dist(b, m.p);
  }

  /** One step of your race (only while you're racing). */
  step(w: World, dt: number): void {
    const u = w.user, ww = u.ww;
    if (w.t >= 0 && !this.gun) {
      // the gun: where you were, how fast, and which end was favored
      const k = dot(sub(w.pin, w.committee), V(ww.from)) / w.lineLen, deg = Math.asin(clamp(Math.abs(k), 0, 1)) / D2R;
      this.gun = { d: w.lineD(u), kt: u.v / 0.5144, favored: k > 0 ? w.C.pinLabel : w.C.committeeLabel, favDeg: deg, frac: (w.lineA(u) + w.lineLen / 2) / w.lineLen };
    }
    if (u.started && this.startDelay == null && w.startTimes[u.id] != null) this.startDelay = w.startTimes[u.id]!;
    if (!u.started || u.finished || w.t < 0) return;
    const m = w.nextMark(u), leg = m?.leg ?? 'beat', beat = beatAngle(ww.kt);
    // penalties
    if (u.penalty > 0) { if (!this.inPen) { this.pen.n++; this.inPen = true; } this.pen.t += dt; return; }
    this.inPen = false;
    // tacks and gybes: the speed lost against your target through each, for 20 s
    if (u.lastTackT !== this.lastTack && u.lastTackT > 0) {
      this.lastTack = u.lastTackT;
      const gybe = u.twa > 90;
      if (gybe) this.tacks.gybes++; else { this.tacks.n++; if (this.liftedAtTack > 4) this.header.liftTacks++; }
      this.turn = { t0: w.t, gybe };
    }
    if (this.turn) {
      const tgt = polar(ww.kt, this.turn.gybe ? Math.max(120, u.twa) : beat), loss = tgt > 0.3 ? clamp((tgt - u.v) / tgt, 0, 1) * dt : 0;
      if (this.turn.gybe) this.tacks.gybeLost += loss; else this.tacks.lost += loss;
      if (w.t - this.turn.t0 > 20) this.turn = null;
    }
    // dirty air (other boats' and ships' wakes) and the lee of the land
    const lee = u.leeK ?? 1, dirtyK = (u.shadowK ?? 1) / lee;
    if (dirtyK < 0.97) {
      this.dirty.t += dt; this.dirty.lost += dt * (1 - dirtyK ** 0.7);
      let best: Boat | null = null, bd = 150; const up = V(ww.from);
      for (const o of w.boats) if (o !== u) { const r = sub(o, u), d = Math.hypot(r.x, r.y); if (d < bd && dot(r, up) > 0) { bd = d; best = o; } }
      const who = best ? best.name : 'a ship or the committee boat';
      this.dirty.by.set(who, (this.dirty.by.get(who) ?? 0) + dt);
    }
    if (lee < 0.97) { this.lee.t += dt; this.lee.lost += dt * (1 - lee ** 0.7); }
    // heel past her best, and your own trim
    this.heel.lost += dt * (1 - heelFactor(u.heelMag ?? 0)); if ((u.heelMag ?? 0) > 22) this.heel.t += dt;
    if (u.manualTrim && !u.luff) this.trim.lost += dt * (1 - Math.sqrt(clamp(trimDrive(u.trim.main, u.trim.jib) * u.shape.eff, 0, 1)));
    // shifts, on a beat: on a header (against the mean wind), the other tack would be lifted
    const dev = wrap(ww.from - w.avgFrom), headed = u.tack === 'S' ? -dev : dev; // + headed
    this.liftedAtTack = -headed;
    if (leg === 'beat' && u.twa < 65 && !u.tacking) {
      if (headed > 4) {
        this.header.streak += dt;
        if (this.header.streak > 15) {
          const f = 1 - Math.cos((beat + headed) * D2R) / Math.cos((beat - headed) * D2R);
          this.header.t += dt; this.header.lost += dt * clamp(f, 0, 0.5); this.header.worst = Math.max(this.header.worst, headed);
        }
      } else this.header.streak = 0;
      // laylines: past the layline for the other tack (she'd lay the mark with room to spare if she tacked now)
      if (m && m.type === 'round') {
        const other = u.tack === 'S' ? 'P' : 'S', h = other === 'S' ? ww.from - beat : ww.from + beat;
        const g = unit({ x: V(h).x * Math.max(1, u.v) + u.cur.x, y: V(h).y * Math.max(1, u.v) + u.cur.y }), d = sub(m.p, u), lat = cross(g, d);
        const fetches = dot(g, d) > 0 && (other === 'S' ? lat > 0 : lat < 0), over = Math.abs(lat) - 10;
        if (fetches && over > 5) { const L = this.marks[u.leg]; L.overM = Math.max(L.overM, over); L.overT += dt; }
      }
    } else this.header.streak = 0;
    // downwind: your angle against the best, and the pole
    if (leg === 'run' && u.twa > 120 && !u.luff) {
      const best = runAngle(ww.kt), vmg = (a: number) => polar(ww.kt, a) * -Math.cos(a * D2R), r = vmg(best) > 0 ? vmg(u.twa) / vmg(best) : 1;
      if (r < 0.97) { this.down.t += dt; this.down.lost += dt * clamp(1 - r, 0, 0.5); }
      if (u.twa > 156 && u.pole !== 'set') {
        const jib = polar(ww.kt, u.twa, 'jib'), wing = polar(ww.kt, u.twa, 'wing');
        if (wing > jib * 1.02) { this.pole.t += dt; this.pole.lost += dt * (1 - jib / wing); }
      }
    }
  }

  /** Seconds lost on the laylines, mark by mark. */
  private overstands(w: World): { lost: number; worst: MarkLog | null } {
    let lost = 0, worst: MarkLog | null = null;
    const vBeat = Math.max(1, polar(w.wind.kt, beatAngle(w.wind.kt)));
    for (const L of this.marks) if (L.overM > 0) { lost += 0.6 * L.overM / vBeat; if (!worst || L.overM > worst.overM) worst = L; }
    return { lost, worst };
  }

  /** What cost you time, most first: only what cost a couple of seconds or more. */
  findings(w: World): Finding[] {
    const out: Finding[] = [], mmss = (x: number) => x < 60 ? `${Math.round(x)} s` : `${Math.floor(x / 60)} min ${Math.round(x % 60)} s`;
    const bl = (m: number) => `${Math.round(m / 7.6)} boat length${Math.round(m / 7.6) === 1 ? '' : 's'}`;
    // the start
    if (this.gun) {
      const late = Math.max(0, (this.startDelay ?? 60) - 2), g = this.gun;
      const atFav = (g.favored === w.C.pinLabel ? g.frac < 0.33 : g.frac > 0.67);
      out.push({ key: 'start', title: 'The start', lost: late,
        detail: this.startDelay == null ? 'No clean start.' : `You crossed ${this.startDelay.toFixed(1)} s after the gun${g.d < -1 ? `, ${Math.round(-g.d)} m back from the line at the gun` : ''}, going ${g.kt.toFixed(1)} kt at the gun.${g.favDeg >= 3 ? ` The ${g.favored} end was favored by ${Math.round(g.favDeg)}°${atFav ? ', and you started there.' : '; you started away from it.'}` : ' The line was about square.'}`,
        tip: late > 6 ? 'Time your run in: know how long it takes to reach the line from your spot, and leave with a few seconds to spare, building speed. Be on the line at full speed at the gun.' : g.favDeg >= 3 && !atFav ? `Start nearer the favored end: ${Math.round(g.favDeg)}° of bias is worth a boat length or more in a short line.` : 'A good start.' });
    }
    if (this.header.lost > 0.5 || this.header.liftTacks > 0) out.push({ key: 'shifts', title: 'Wind shifts', lost: this.header.lost + this.header.liftTacks * 3,
      detail: `${mmss(this.header.t)} on headers you held for more than 15 s (up to ${Math.round(this.header.worst)}°)${this.header.liftTacks ? `; ${this.header.liftTacks} tack${this.header.liftTacks > 1 ? 's' : ''} onto a header (you tacked when you were lifted)` : ''}.`,
      tip: 'On a beat, watch your heading (the compass says "headed"): when the wind heads you a few degrees for more than a few seconds, tack onto the lift. Don\'t tack on a lift.' });
    const ov = this.overstands(w);
    if (ov.lost > 1 && ov.worst) out.push({ key: 'laylines', title: 'Laylines', lost: ov.lost,
      detail: `You sailed past the layline before tacking for the mark: by up to ${bl(ov.worst.overM)} at ${ov.worst.name}.`,
      tip: 'Tack when the mark is just abaft your beam on the other tack\'s side (or on the laylines drawn on the water, or the transit): every length past it is sailed twice.' });
    if (this.tacks.n + this.tacks.gybes > 0) {
      const per = this.tacks.n ? this.tacks.lost / this.tacks.n : 0;
      out.push({ key: 'tacks', title: 'Tacks and gybes', lost: this.tacks.lost + this.tacks.gybeLost,
        detail: `${this.tacks.n} tack${this.tacks.n === 1 ? '' : 's'}${this.tacks.n ? `, each costing about ${per.toFixed(1)} s` : ''}; ${this.tacks.gybes} gybe${this.tacks.gybes === 1 ? '' : 's'}.`,
        tip: per > 6 ? 'Smooth tacks: turn steadily (not too fast in a chop), let the jib come across as you pass head to wind, and bear off a few degrees to build speed before pointing.' : 'Tack only when it pays (a header, a layline, clear air): each one costs a few seconds.' });
    }
    if (this.dirty.lost > 0.5) {
      const top = [...this.dirty.by].sort((a, b) => b[1] - a[1])[0];
      out.push({ key: 'dirty', title: 'Dirty air', lost: this.dirty.lost,
        detail: `${mmss(this.dirty.t)} in other boats' wind shadows${top ? `, mostly ${top[0]}'s` : ''}.`,
        tip: 'Get out of another boat\'s shadow fast: it lies along her apparent wind (look at her masthead fly). Tack away, or foot off to leeward to clear it; don\'t sit behind and to leeward of a boat on a beat.' });
    }
    if (this.lee.lost > 0.5) out.push({ key: 'lee', title: 'The lee of the land', lost: this.lee.lost,
      detail: `${mmss(this.lee.t)} in the wind shadow of an island or headland.`,
      tip: 'Keep out of the lee of Angel Island, Alcatraz and the Marin hills when you can: the wind there is a fraction of the breeze outside it.' });
    if (this.down.lost + this.pole.lost > 0.5) out.push({ key: 'downwind', title: 'Downwind', lost: this.down.lost + this.pole.lost,
      detail: `${mmss(this.down.t)} sailing too high or too low for the best speed downwind${this.pole.t > 1 ? `; ${mmss(this.pole.t)} sailing deep without the pole set` : ''}.`,
      tip: 'Downwind, sail the best angle for the wind (the downwind laylines show it): heat up a little in the lulls, sail lower in the puffs. Running deep, pole the jib out to windward.' });
    if (this.heel.lost > 0.5) out.push({ key: 'heel', title: 'Heel', lost: this.heel.lost,
      detail: `${mmss(this.heel.t)} heeled past about 22°.`,
      tip: 'In the puffs, depower before she lays over: backstay on, traveller down, ease the main a little. A Folkboat is fastest at about 15–20° of heel.' });
    if (this.trim.lost > 1) out.push({ key: 'trim', title: 'Sail trim', lost: this.trim.lost,
      detail: 'Your sheets and controls, against the best trim for the conditions.',
      tip: 'Watch the telltales, and open the Trim coach for what to change.' });
    if (this.pen.n) out.push({ key: 'penalty', title: 'Penalties', lost: this.pen.t,
      detail: `${this.pen.n} penalt${this.pen.n === 1 ? 'y' : 'ies'}: ${mmss(this.pen.t)} doing turns.`,
      tip: 'Know who has right of way before you get close: port gives way to starboard, windward to leeward, and give room at marks. The replay of each foul shows the rule.' });
    const wide = this.marks.filter(L => L.wide != null && L.wide > 22);
    if (wide.length) {
      const v = Math.max(1, polar(w.wind.kt, 90)), lost = wide.reduce((a, L) => a + 2 * (L.wide! - 12) / v, 0);
      out.push({ key: 'roundings', title: 'Mark roundings', lost,
        detail: `Wide round ${wide.map(L => `${L.name} (${bl(L.wide!)} off)`).join(', ')}.`,
        tip: 'Come in wide and go out tight: start the turn early so you leave the mark close aboard on your new course.' });
    }
    return out.filter(f => f.key === 'start' || f.lost >= 2).sort((a, b) => b.lost - a.lost).map(f => ({ ...f, title: f.title, detail: f.detail, tip: f.tip, lost: Math.round(f.lost) }));
  }

  /** Your place as you reached each mark. */
  places(): { name: string; place: number | null; t: number | null }[] { return this.marks.map(L => ({ name: L.name, place: L.place, t: L.t })); }
}
